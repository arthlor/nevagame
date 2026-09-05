import { describe, expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { ASSET_BY_ID, type AssetId } from "../../src/render/assets/AssetCatalog";
import { STATIC_FARM_PROP_ASSETS, STATIC_LANDMARK_ASSETS } from "../../src/render/assets/RuntimeAssetOwners";
import { CAMERA_TUNING, GameCamera } from "../../src/render/camera/GameCamera";
import { Simulation } from "../../src/simulation/Simulation";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { STARTER_FARM_LAYOUT, farmLocalToWorld, starterStructureAnchor } from "../../src/world/FarmLayout";
import { getProcessingStationRuntimeRotationY } from "../../src/world/ProcessingStationApproach";
import { WORLD_SPAWN } from "../../src/world/WorldAnchors";
import { createWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

let trailStaticProxies: StaticCollisionProxy[] | undefined;

function authoredTrailCollision(): StaticCollisionProxy[] {
  if (trailStaticProxies) return trailStaticProxies;
  const proxies: StaticCollisionProxy[] = [];
  const place = (id: string, assetId: AssetId, x: number, z: number, rotationY: number,
    scale: readonly [number, number, number] = [1, 1, 1], y = WorldLayout.terrainHeight(x, z)) => {
    const root = new Object3D();
    root.position.set(x, y, z);
    root.rotation.y = rotationY;
    root.scale.set(...scale);
    proxies.push(...projectAssetCollision(assetId, root, id));
  };
  for (const [id, assetId] of [
    ["struct.workbench", STATIC_LANDMARK_ASSETS.workbench],
    ["struct.starter_compost", STATIC_LANDMARK_ASSETS.compost]
  ] as const) {
    const anchor = starterStructureAnchor(id)!;
    place(id, assetId, anchor.x, anchor.z, getProcessingStationRuntimeRotationY(id));
  }
  for (const anchor of STARTER_FARM_LAYOUT.fenceAnchors) {
    const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
    place(anchor.id, STATIC_LANDMARK_ASSETS.fence, world.x, world.z, anchor.rotationY);
  }
  for (const anchor of STARTER_FARM_LAYOUT.propAnchors) {
    const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor);
    place(anchor.id, STATIC_FARM_PROP_ASSETS[anchor.type], world.x, world.z, anchor.rotationY,
      [anchor.scale, anchor.scale, anchor.scale]);
  }
  for (const landmarkId of ["farmhouse", "well"] as const) {
    const layout = WorldLayout.landmark(landmarkId);
    place(landmarkId, STATIC_LANDMARK_ASSETS[landmarkId], layout.x, layout.z, layout.rotationY,
      [layout.scale, layout.scale, layout.scale], WorldLayout.terrainHeight(layout.x, layout.z) + layout.yOffset);
  }
  for (const placement of createWorldEnvironmentLayout(42).staticPlacements) {
    const assetId = placement.assetId as AssetId;
    if (ASSET_BY_ID.get(assetId)?.collision === "none") continue;
    place(placement.id, assetId, placement.x, placement.z, placement.rotationY, placement.scale, placement.y);
  }
  return trailStaticProxies = proxies;
}

describe("starter island mountain trails", () => {
  for (const routeId of ["farm-headwater-trail", "western-overlook-trail"]) {
    for (const reverse of [false, true]) {
      it(`walks the complete ${routeId} ${reverse ? "downhill" : "uphill"} with grounded support and a clear orbiting camera`, async () => {
        const route = WorldLayout.compiledRouteNetwork().find((candidate) => candidate.route.id === routeId);
        expect(route, routeId).toBeDefined();
        const points = route!.samples.map((sample) => sample.point);
        if (routeId === "farm-headwater-trail") {
          const workRoute = WorldLayout.compiledRouteNetwork().find((candidate) => candidate.route.id === "farm-work-zone")!;
          const junctionIndex = workRoute.samples.findIndex((sample) =>
            sample.point.x === points[0].x && sample.point.z === points[0].z);
          expect(junctionIndex).toBeGreaterThan(0);
          expect(junctionIndex).toBeLessThan(workRoute.samples.length - 1);
          // Include the real farm gate and the work-trail prefix, without
          // entering its separate workbench interaction spur.
          points.unshift(WORLD_SPAWN.playerPosition, ...workRoute.samples.slice(0, junctionIndex).map((sample) => sample.point));
        }
        if (reverse) points.reverse();
        const physics = await PhysicsWorld.create(authoredTrailCollision());
        const camera = new GameCamera();
        const cameraTarget = new Vector3();
        const sim = new Simulation();
        Object.assign(sim.state.player, {
          x: points[0].x,
          z: points[0].z,
          y: WorldLayout.traversalSurfaceHeight(points[0].x, points[0].z) + 0.5,
          activeBoatId: null,
          activeMountId: null
        });
        sim.state.player.traversal.isGrounded = true;
        let ticks = 0;
        let consecutiveBlocked = 0;
        let maximumBlocked = 0;
        let maximumSupportError = 0;
        let minimumCameraClearance = Infinity;
        try {
          for (const target of points.slice(1)) {
            const startDistance = Math.hypot(target.x - sim.state.player.x, target.z - sim.state.player.z);
            const allowedTicks = Math.ceil((startDistance + 1) / PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond * 60 * 3);
            let reached = false;
            for (let tick = 0; tick < allowedTicks; tick++) {
              const dx = target.x - sim.state.player.x;
              const dz = target.z - sim.state.player.z;
              const distance = Math.hypot(dx, dz);
              if (distance < 0.25) { reached = true; break; }
              const result = physics.step(sim.state, { x: dx / distance, z: dz / distance, sprint: false }, "on-foot", 1 / 60, ticks++ / 60);
              if (!sim.commitPhysicsFrame(result.frame).success) throw new Error(`${routeId}: rejected physics frame`);
              const player = sim.state.player;
              // Slow manual orbit keeps the normal follow damping and real
              // Rapier camera sweep active on both sides of each slope.
              camera.update(cameraTarget.set(player.x, player.y, player.z), "on-foot", 1 / 60, {
                orbitDeltaX: reverse ? -0.5 : 0.5,
                orbitDeltaY: 0,
                zoomDelta: 0,
                isOrbiting: true
              }, physics, { player: result.playerMotion });
              const framing = camera.framingState();
              const cameraPosition = camera.camera.position;
              const cameraValues = [
                ...cameraPosition.toArray(),
                ...camera.camera.quaternion.toArray(),
                ...camera.camera.projectionMatrix.elements,
                ...Object.values(framing).filter((value): value is number => typeof value === "number")
              ];
              if (!cameraValues.every(Number.isFinite)) throw new Error(`${routeId}: nonfinite camera framing at tick ${ticks}`);
              const clearance = cameraPosition.y - WorldLayout.traversalSurfaceHeight(cameraPosition.x, cameraPosition.z);
              minimumCameraClearance = Math.min(minimumCameraClearance, clearance);
              if (clearance < CAMERA_TUNING.collisionRadiusMeters - 0.08) {
                throw new Error(`${routeId}: camera clearance ${clearance} at ${cameraPosition.x},${cameraPosition.y},${cameraPosition.z}; player ${player.x},${player.y},${player.z}; tick ${ticks}`);
              }
              if (WorldLayout.isWater(player.x, player.z)) throw new Error(`${routeId}: entered water at ${player.x},${player.z}`);
              if (!result.playerMotion.isGrounded) throw new Error(`${routeId}: lost contact at ${player.x},${player.z}`);
              maximumSupportError = Math.max(maximumSupportError, Math.abs(player.y - WorldLayout.traversalSurfaceHeight(player.x, player.z) - 0.5));
              consecutiveBlocked = result.playerMotion.isCollisionBlocked ? consecutiveBlocked + 1 : 0;
              maximumBlocked = Math.max(maximumBlocked, consecutiveBlocked);
            }
            expect(reached, `${routeId}: stalled at ${sim.state.player.x},${sim.state.player.z}; target ${target.x},${target.z}`).toBe(true);
          }
          expect(maximumBlocked).toBeLessThan(45);
          expect(maximumSupportError).toBeLessThan(0.03);
          expect(minimumCameraClearance).toBeGreaterThanOrEqual(CAMERA_TUNING.collisionRadiusMeters - 0.08);
          expect(Math.hypot(sim.state.player.x - points.at(-1)!.x, sim.state.player.z - points.at(-1)!.z)).toBeLessThan(0.3);
        } finally {
          physics.dispose();
        }
      }, 120_000);
    }
  }
});

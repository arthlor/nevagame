import { beforeAll, describe, expect, it } from "vitest";
import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { staticPoseIsClear, type StaticCollisionProxy } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { AMBIENT_TOWNSFOLK_ROUTES, sampleAmbientTownsfolkPose } from "../../src/render/scene/ambientTownsfolk";
import { AMBIENT_BOAT_ROUTES, sampleAmbientBoatPose } from "../../src/render/scene/ambientBoats";
import { HARBOR_WORKING_PIERS, HARBOR_WORKING_WALKS, WORKING_PIER, harborDistrictPlacements, harborPierWorldPoint } from "../../src/world/HarborDistrictLayout";
import { createWorldStaticPlacements, isPlacementFootprintStable } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { BOAT_MOORINGS } from "../../src/world/WorldMoorings";
import { Simulation } from "../../src/simulation/Simulation";

const district = harborDistrictPlacements((x, z) => WorldLayout.terrainHeight(x, z));
const project = (placements: typeof district) => placements.flatMap(p => {
  const root = new Object3D();
  root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x, p.z), p.z);
  root.rotation.y = p.rotationY; root.scale.set(...p.scale);
  return projectAssetCollision(p.assetId as AssetId, root, p.id);
});
let collision: StaticCollisionProxy[];
beforeAll(() => {
  collision = project([...createWorldStaticPlacements(42)]).filter(p =>
    (p.center.x > 12 && p.center.x < 167 && p.center.z > 0 && p.center.z < 135)
    || (p.center.x > 1108 && p.center.x < 1230 && p.center.z > -10 && p.center.z < 135));
}, 300_000);

describe("working harbor districts", () => {
  it("grounds complete footprints and keeps the registered boat approaches open", () => {
    for (const p of district.filter(p => p.grounding)) expect(isPlacementFootprintStable(p), p.id).toBe(true);
    for (const berth of BOAT_MOORINGS.filter(b => b.marketId === "market.harbor" || b.marketId === "market.sunreach_cove")) {
      const p = berth.playerPosition;
      expect(staticPoseIsClear(project(district), p, WorldLayout.traversalSurfaceHeight(p.x, p.z), .45), berth.id).toBe(true);
      expect(WorldLayout.isSailable(berth.boatPosition.x, berth.boatPosition.z), berth.id).toBe(true);
    }
  });

  it("keeps full old and new harbor resident loops clear of the final published obstacles", () => {
    for (const route of AMBIENT_TOWNSFOLK_ROUTES) {
      const p = route.stations.day;
      if (!((p.x >= 32 && p.x <= 147 && p.z >= 28 && p.z <= 110)
        || (p.x >= 1128 && p.x <= 1210 && p.z >= 14 && p.z <= 110))) continue;
      for (const timeOfDay of ["dawn", "day", "dusk", "night"] as const) for (let step = 0; step < 64; step++) {
        const pose = sampleAmbientTownsfolkPose(route, { timeOfDay }, step / 64 * route.loopSeconds);
        expect(staticPoseIsClear(collision, pose, WorldLayout.traversalSurfaceHeight(pose.x, pose.z), .4), `${route.id}/${timeOfDay}`).toBe(true);
      }
    }
  });

  it("leaves continuous walking lanes between the existing market and new work areas", () => {
    for (const walk of HARBOR_WORKING_WALKS) for (let i = 1; i < walk.points.length; i++) {
      const a = walk.points[i - 1], b = walk.points[i];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2);
      for (let j = 0; j <= steps; j++) {
        const p = { x: a.x + (b.x - a.x) * j / steps, z: a.z + (b.z - a.z) * j / steps };
        const label = `${walk.harbor} walk at ${p.x.toFixed(2)},${p.z.toFixed(2)}`;
        expect(WorldLayout.isWalkable(p.x, p.z), label).toBe(true);
        expect(staticPoseIsClear(collision, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), .45), label).toBe(true);
      }
    }
  });

  it("gives every added jetty a dry entrance, walkable deck and nearby castable water", () => {
    for (const pier of HARBOR_WORKING_PIERS) {
      const entry = harborPierWorldPoint(pier, WORKING_PIER.approachX);
      expect(WorldLayout.isWater(entry.x, entry.z), pier.id).toBe(false);
      expect(WorldLayout.isWalkable(pier.x, pier.z), pier.id).toBe(true);
      const access = WorldLayout.fishingAccessAt(pier.x, pier.z);
      expect(access.accessible, pier.id).toBe(true);
      expect(WorldLayout.isWater(access.target!.x, access.target!.z), pier.id).toBe(true);
      expect(Math.hypot(access.target!.x - pier.x, access.target!.z - pier.z), pier.id).toBeLessThanOrEqual(4.5);
    }
  });

  it("matches real Rapier deck and stair contacts for all four orientations and shore heights", async () => {
    const { default: RAPIER } = await import("@dimforge/rapier3d-compat"); await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      for (const p of project(district.filter(p => p.assetId === "dock_harbor_coastal_a"))) {
        world.createCollider(RAPIER.ColliderDesc.cuboid(p.halfExtents.x, p.halfExtents.y, p.halfExtents.z)
          .setTranslation(p.center.x, p.center.y, p.center.z).setRotation(p.rotation));
      }
      world.step();
      for (const pier of HARBOR_WORKING_PIERS) for (const localX of [-6.8, -3, 0, 3, 6.8, ...WORKING_PIER.stairCenters]) {
        const p = harborPierWorldPoint(pier, localX);
        const hit = world.castRay(new RAPIER.Ray({ ...p, y: 20 }, { x: 0, y: -1, z: 0 }), 40, true);
        expect(hit, `${pier.id}/${localX}`).not.toBeNull();
        expect(Math.abs(20 - hit!.timeOfImpact - WorldLayout.traversalSurfaceHeight(p.x, p.z)), `${pier.id}/${localX}`).toBeLessThan(.02);
      }
    } finally { world.free(); }
  });

  it("walks up and down every working pier through the real character controller", async () => {
    const physics = await PhysicsWorld.create(collision);
    try {
      for (const pier of HARBOR_WORKING_PIERS) {
        const sim = new Simulation();
        const shore = harborPierWorldPoint(pier, WORKING_PIER.approachX + .4);
        const deck = harborPierWorldPoint(pier, -3);
        Object.assign(sim.state.player, { ...shore, y: WorldLayout.traversalSurfaceHeight(shore.x, shore.z) + .5 });
        sim.state.player.traversal.isGrounded = true;
        for (const destination of [deck, shore]) {
          for (let frame = 0; frame < 900; frame++) {
            const dx = destination.x - sim.state.player.x, dz = destination.z - sim.state.player.z;
            const distance = Math.hypot(dx, dz);
            if (distance < .3) break;
            const result = physics.step(sim.state, { x: dx / distance, z: dz / distance, sprint: false }, "on-foot", 1 / 60, frame / 60);
            expect(sim.commitPhysicsFrame(result.frame).success, pier.id).toBe(true);
          }
          expect(Math.hypot(sim.state.player.x - destination.x, sim.state.player.z - destination.z), pier.id).toBeLessThan(.3);
        }
      }
    } finally { physics.dispose(); }
  });

  it("keeps new inshore traffic in water and outside player slips", () => {
    for (const route of AMBIENT_BOAT_ROUTES.filter(r => r.x === 49 || r.x === 1125)) for (let step = 0; step < 128; step++) {
      const p = sampleAmbientBoatPose(route, step / 128 * Math.PI * 2 / route.speed);
      expect(WorldLayout.isSailable(p.x, p.z)).toBe(true);
      for (const pier of HARBOR_WORKING_PIERS) expect(Math.hypot(p.x - pier.x, p.z - pier.z)).toBeGreaterThan(10);
      for (const berth of BOAT_MOORINGS) expect(Math.hypot(p.x - berth.boatPosition.x, p.z - berth.boatPosition.z)).toBeGreaterThan(8);
    }
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { Object3D } from "three";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { CARRIAGE_TUNING, STARTER_CARRIAGE_ID, carriageFootprint, carriagePoseIsClear } from "../../src/simulation/mounts/Carriage";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

let collision: StaticCollisionProxy[];
beforeAll(() => {
  collision = createWorldStaticPlacements(42).flatMap(placement => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
}, 60_000);

describe("mainland physical routes", () => {
  for (const road of MAINLAND_ROUTES) {
    it(`walks ${road.id} in both directions across actual terrain and scenery collision`, async () => {
      const compiled = WorldLayout.compiledRouteNetwork().find(route => route.route.id === road.id)!;
      const physics = await PhysicsWorld.create(collision);
      const dt = 1 / 30;
      try {
        for (const reverse of [false, true]) {
          const points = compiled.samples.map(sample => sample.point);
          if (reverse) points.reverse();
          const sim = new Simulation(createInitialGameState(42));
          Object.assign(sim.state.player, points[0], {
            y: WorldLayout.traversalSurfaceHeight(points[0].x, points[0].z) + 0.5,
            activeBoatId: null, activeMountId: null
          });
          sim.state.player.traversal.isGrounded = true;
          let ticks = 0, airborne = 0, maximumAirborne = 0, maximumSupportError = 0;
          for (const target of points.slice(1)) {
            const distance = Math.hypot(target.x - sim.state.player.x, target.z - sim.state.player.z);
            const limit = Math.ceil((distance + 1) / PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond / dt * 2.5);
            let reached = false;
            for (let n = 0; n < limit; n++) {
              const dx = target.x - sim.state.player.x, dz = target.z - sim.state.player.z;
              const remaining = Math.hypot(dx, dz);
              if (remaining < 0.22) { reached = true; break; }
              // Ease the stick inside the final metre; constant full input can
              // orbit a small waypoint because the real gait has inertia.
              const inputScale = Math.max(1, remaining);
              const result = physics.step(sim.state, { x: dx / inputScale, z: dz / inputScale, sprint: false }, "on-foot", dt, ticks++ * dt);
              const commit = sim.commitPhysicsFrame(result.frame);
              physics.onCommitResult(commit.success);
              if (!commit.success) throw new Error(`${road.id}: ${commit.reason}`);
              const p = sim.state.player;
              if (WorldLayout.isWater(p.x, p.z)) throw new Error(`${road.id}: walked into water at ${p.x},${p.z}`);
              airborne = result.playerMotion.isGrounded ? 0 : airborne + 1;
              maximumAirborne = Math.max(maximumAirborne, airborne);
              if (result.playerMotion.isGrounded) maximumSupportError = Math.max(maximumSupportError,
                Math.abs(p.y - WorldLayout.traversalSurfaceHeight(p.x, p.z) - 0.5));
            }
            expect(reached, `${road.id} ${reverse ? "return" : "outbound"}: stalled at ${sim.state.player.x},${sim.state.player.z}; target ${target.x},${target.z}`).toBe(true);
          }
          expect(maximumSupportError, road.id).toBeLessThan(0.03);
          expect(maximumAirborne, road.id).toBeLessThanOrEqual(Math.ceil(PLAYER_TRAVERSAL_TUNING.coyoteTimeSeconds / dt));
          expect(Math.hypot(sim.state.player.x - points.at(-1)!.x, sim.state.player.z - points.at(-1)!.z)).toBeLessThan(0.25);
        }
      } finally { physics.dispose(); }
    }, 120_000);
  }

  for (const road of MAINLAND_ROUTES.filter(route => route.kind === "arterial")) {
    it(`drives the full horse and carriage along ${road.id}, including its turns and village arrival`, async () => {
      const physics = await PhysicsWorld.create(collision);
      const sim = new Simulation(createInitialGameState(42));
      const cart = sim.state.mounts[STARTER_CARRIAGE_ID];
      const start = road.points[0], next = road.points[1];
      Object.assign(cart, start, { y: WorldLayout.traversalSurfaceHeight(start.x, start.z),
        rotationY: Math.atan2(next.x - start.x, next.z - start.z) });
      Object.assign(sim.state.player, start, { y: cart.y + 0.5, rotationY: cart.rotationY,
        activeBoatId: null, activeMountId: STARTER_CARRIAGE_ID });
      sim.state.player.traversal.isGrounded = true;
      const dt = 0.05;
      let ticks = 0;
      try {
        for (const target of road.points.slice(1)) {
          const initialDistance = Math.hypot(target.x - cart.x, target.z - cart.z);
          const limit = Math.ceil((initialDistance + 10) / CARRIAGE_TUNING.walkSpeed / dt * 2);
          let reached = false, stalled = 0;
          for (let n = 0; n < limit; n++) {
            const distance = Math.hypot(target.x - cart.x, target.z - cart.z);
            if (distance < 2) { reached = true; break; }
            const desired = Math.atan2(target.x - cart.x, target.z - cart.z);
            const error = Math.atan2(Math.sin(desired - cart.rotationY), Math.cos(desired - cart.rotationY));
            const result = physics.step(sim.state, {
              x: -Math.max(-1, Math.min(1, error * 2)),
              z: Math.abs(error) > 0.6 ? -0.4 : -1, sprint: false
            }, "mounted", dt, ticks++ * dt);
            const commit = sim.commitPhysicsFrame(result.frame);
            physics.onCommitResult(commit.success);
            if (!commit.success) throw new Error(`${road.id}: ${commit.reason}`);
            stalled = result.playerMotion.isCollisionBlocked ? stalled + 1 : 0;
            if (stalled > 20) throw new Error(`${road.id}: horse or carriage blocked at ${cart.x},${cart.z}; heading ${cart.rotationY}; target ${target.x},${target.z}`);
            if (n % 20 === 0) {
              expect(carriagePoseIsClear(cart, collision), `${road.id}: full horse/shaft/bed footprint`).toBe(true);
              for (const contact of carriageFootprint(cart)) {
                expect(WorldLayout.traversalSurfaceSample(contact.x, contact.z).normal.y).toBeGreaterThanOrEqual(CARRIAGE_TUNING.maximumSlopeNormalY);
              }
            }
          }
          expect(reached, `${road.id}: carriage at ${cart.x},${cart.z}; target ${target.x},${target.z}`).toBe(true);
        }
        expect(Math.hypot(cart.x - road.points.at(-1)!.x, cart.z - road.points.at(-1)!.z)).toBeLessThan(2);
        expect(sim.canDismountMount()).toBe(true);
        expect(sim.execute({ type: "mount.dismount" }).success).toBe(true);
      } finally { physics.dispose(); }
    }, 120_000);
  }

  it("keeps physical ground continuous where trade roads cross terrain patch seams", async () => {
    const physics = await PhysicsWorld.create();
    const { default: RAPIER } = await import("@dimforge/rapier3d-compat");
    const internal = physics as unknown as { world: InstanceType<typeof RAPIER.World>; playerBody: InstanceType<typeof RAPIER.RigidBody> };
    let crossings = 0;
    try {
      for (const road of MAINLAND_ROUTES) for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        for (const axis of ["x", "z"] as const) for (const seam of [-300, 300]) {
          const fraction = (seam - a[axis]) / (b[axis] - a[axis]);
          if (!(fraction > 0 && fraction <= 1)) continue;
          crossings++;
          for (const offset of [-0.1, -0.01, 0.01, 0.1]) {
            const point = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
            point[axis] += offset;
            const ray = new RAPIER.Ray({ ...point, y: 180 }, { x: 0, y: -1, z: 0 });
            const hit = internal.world.castRay(ray, 240, true, undefined, undefined, undefined, internal.playerBody);
            expect(hit, `${road.id}: seam ${axis}=${seam}`).not.toBeNull();
            expect(Math.abs(180 - hit!.timeOfImpact - WorldLayout.traversalSurfaceHeight(point.x, point.z)),
              `${road.id}: seam contact ${point.x},${point.z}`).toBeLessThan(0.03);
          }
        }
      }
      expect(crossings).toBeGreaterThanOrEqual(5);
    } finally { physics.dispose(); }
  }, 120_000);
});

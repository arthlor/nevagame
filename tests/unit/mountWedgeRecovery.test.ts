import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { isMountableTraversalPoint, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { WorldLayout } from "../../src/world/WorldLayout";

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071],
  [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]
];

/** A flat mountable spawn point on retained ground, independent of layout edits. */
function mountablePoint(): { x: number; z: number } {
  const spawn = createInitialGameState(42).player;
  for (let radius = 0; radius <= 40; radius += 2) {
    for (let angle = 0; angle < 8; angle++) {
      const x = spawn.x + Math.sin((angle / 8) * Math.PI * 2) * radius;
      const z = spawn.z + Math.cos((angle / 8) * Math.PI * 2) * radius;
      if (isMountableTraversalPoint(x, z)) return { x, z };
    }
  }
  throw new Error("No mountable ground near spawn");
}

/**
 * The mount ground snap can carry the taller capsule into a static prop's
 * collision volume as the terrain drops ahead of it. Rapier's character
 * controller does not depenetrate, so before `mountedDepenetrationEscape` the
 * rider could press every direction and stay at the contact point forever.
 * The box here mirrors the observed shape of that overlap: a prop collider
 * covering the mounted capsule's center.
 */
describe("mounted wedge recovery", () => {
  it("walks a rider out of a static-prop overlap", async () => {
    const spot = mountablePoint();
    const ground = WorldLayout.traversalSurfaceHeight(spot.x, spot.z);
    const capsuleCenterY =
      ground + 0.5 + (0.58 + 0.62 - 0.5);
    const blockingBox: StaticCollisionProxy = {
      kind: "box",
      id: "test.wedge-box",
      center: { x: spot.x, y: capsuleCenterY, z: spot.z },
      halfExtents: { x: 0.35, y: 0.9, z: 0.35 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    };
    const physics = await PhysicsWorld.create([blockingBox]);
    const dt = 1 / 30;
    try {
      expect(isMountableTraversalPoint(spot.x, spot.z)).toBe(true);
      for (const [dx, dz] of DIRECTIONS) {
        const sim = new Simulation(createInitialGameState(42));
        const mount = sim.state.mounts[STARTER_DONKEY_ID]!;
        Object.assign(sim.state.player, {
          x: spot.x, y: ground + 0.5, z: spot.z,
          activeBoatId: null, activeMountId: STARTER_DONKEY_ID
        });
        sim.state.player.traversal.isGrounded = true;
        Object.assign(mount, { x: spot.x, y: ground, z: spot.z, rotationY: 0 });
        let ticks = 0;
        for (let step = 0; step < 120; step++) {
          const result = physics.step(
            sim.state,
            { x: dx, z: dz, sprint: false },
            "mounted",
            dt,
            ticks++ * dt
          );
          const commit = sim.commitPhysicsFrame(result.frame);
          physics.onCommitResult(commit.success);
          expect(commit.success, `${dx},${dz}: ${commit.reason}`).toBe(true);
          expect(isMountableTraversalPoint(sim.state.player.x, sim.state.player.z),
            `${dx},${dz} left mountable ground`).toBe(true);
        }
        const travel = Math.hypot(
          sim.state.player.x - spot.x,
          sim.state.player.z - spot.z
        );
        expect(travel, `direction ${dx},${dz}`).toBeGreaterThan(1.2);
      }
    } finally {
      physics.dispose();
    }
  }, 120_000);
});

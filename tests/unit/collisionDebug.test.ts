import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import type { StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { Simulation } from "../../src/simulation/Simulation";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("walking collision inspection", () => {
  it("reports actual blocking contacts and updated collider identities without mutating gameplay", async () => {
    const sim = new Simulation();
    const p = sim.state.player;
    const wall: StaticCollisionProxy = {
      kind: "box", id: "debug-test:invisible-wall",
      center: { x: p.x, y: WorldLayout.traversalSurfaceHeight(p.x, p.z) + 1.5, z: p.z + 1.5 },
      halfExtents: { x: 2, y: 1.5, z: 0.2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    };
    const physics = await PhysicsWorld.create([wall]);
    try {
      let blocked = false;
      for (let i = 0; i < 180; i++) {
        const result = physics.step(sim.state, { x: 0, z: 1, sprint: false }, "on-foot", 1 / 60, i / 60);
        sim.commitPhysicsFrame(result.frame);
        const before = JSON.stringify(sim.state);
        const snapshot = physics.collisionDebugSnapshot(p);
        expect(JSON.stringify(sim.state)).toBe(before);
        if (!snapshot.blocked) continue;
        blocked = true;
        expect(snapshot.walking).toBe(true);
        expect(snapshot.contacts.some((c) => c.id === wall.id && c.lateral)).toBe(true);
        const shape = snapshot.colliders.find((c) => c.id === wall.id)?.shape;
        expect(shape?.kind).toBe("box");
        if (shape?.kind === "box") {
          expect(shape.halfExtents.x).toBeCloseTo(wall.halfExtents.x, 6);
          expect(shape.halfExtents.y).toBeCloseTo(wall.halfExtents.y, 6);
          expect(shape.halfExtents.z).toBeCloseTo(wall.halfExtents.z, 6);
        }
        expect(snapshot.colliders.some((c) => c.id === "player:capsule" && c.shape.kind === "capsule")).toBe(true);
        break;
      }
      expect(blocked).toBe(true);
      const replacement = { ...wall, id: "debug-test:moved-wall", center: { ...wall.center, x: wall.center.x + 10 } };
      physics.replaceStaticCollision([replacement]);
      const updated = physics.collisionDebugSnapshot(p);
      expect(updated.colliders.some((c) => c.id === wall.id)).toBe(false);
      const moved = updated.colliders.find((c) => c.id === replacement.id)!;
      expect(moved.position.x).toBeCloseTo(replacement.center.x, 4);
      expect(moved.position.y).toBeCloseTo(replacement.center.y, 4);
      expect(moved.position.z).toBeCloseTo(replacement.center.z, 4);
      expect(physics.collisionDebugSnapshot(p, 1).colliders.some((c) => c.id === replacement.id)).toBe(false);

      physics.step(sim.state, { x: 0, z: 0, sprint: false }, "sport-fishing", 1 / 60, 5);
      const inactive = physics.collisionDebugSnapshot(p);
      expect(inactive.walking).toBe(false);
      expect(inactive.blocked).toBe(false);
      expect(inactive.contacts).toEqual([]);
    } finally {
      physics.dispose();
    }
  });
});

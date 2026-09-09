import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { WORLD_DISCOVERIES } from "../../src/content/discoveries";
import { WorldLayout } from "../../src/world/WorldLayout";
import { AMBIENT_BOAT_ROUTES, sampleAmbientBoatPose } from "../../src/render/scene/ambientBoats";

describe("world arrivals", () => {
  it("commits each discovery once and retains it when the simulation is restored", () => {
    const sim = new Simulation();
    const found: string[] = [];
    sim.events.on("PlaceDiscovered", ({ knowledgeId }) => found.push(knowledgeId));
    const entry = WORLD_DISCOVERIES[0];
    const player = { ...sim.state.player, ...entry.position,
      y: WorldLayout.traversalSurfaceHeight(entry.position.x, entry.position.z) + 0.5 };
    expect(sim.commitPhysicsFrame({ player: { ...player, x: NaN }, boats: {} }).success).toBe(false);
    expect(found).toEqual([]);
    expect(sim.commitPhysicsFrame({ player, boats: {} }).success).toBe(true);
    expect(sim.commitPhysicsFrame({ player, boats: {} }).success).toBe(true);
    expect(found).toEqual([entry.id]);
    expect(sim.state.journal.unlockedKnowledge).toContain(entry.id);
    const restored = new Simulation(structuredClone(sim.state));
    restored.events.on("PlaceDiscovered", ({ knowledgeId }) => found.push(knowledgeId));
    restored.commitPhysicsFrame({ player, boats: {} });
    expect(found).toEqual([entry.id]);
    restored.questDomain.dispose();
    sim.questDomain.dispose();
  });

  it("keeps all scenic boat orbits in sailable water", () => {
    for (const route of AMBIENT_BOAT_ROUTES) {
      for (let step = 0; step < 120; step++) {
        const pose = sampleAmbientBoatPose(route, step / 120 * Math.PI * 2 / route.speed);
        expect(WorldLayout.isSailable(pose.x, pose.z), `${pose.x}, ${pose.z}`).toBe(true);
      }
    }
  });
});

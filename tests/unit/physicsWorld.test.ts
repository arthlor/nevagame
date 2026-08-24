import { describe, expect, it } from "vitest";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("PhysicsWorld", () => {
  it("moves a grounded player while preserving the shoreline boundary", async () => {
    const physics = await PhysicsWorld.create();
    const state = createInitialGameState();
    state.player.y = WorldLayout.terrainHeight(state.player.x, state.player.z) + 0.5;
    for (let index = 0; index < 30; index++) {
      const frame = physics.step(state, { x: 0, z: 1, sprint: false }, "on-foot", 1 / 60, index / 60);
      Object.assign(state.player, frame.player);
    }
    expect(state.player.z).toBeGreaterThan(0.2);
    expect(state.player.y).toBeGreaterThanOrEqual(WorldLayout.terrainHeight(state.player.x, state.player.z) + 0.49);
  });

  it("keeps authoritative player position attached to the actively driven boat", async () => {
    const physics = await PhysicsWorld.create();
    const state = createInitialGameState();
    const boat = state.boats["boat.player_rowboat"];
    const canonicalWaterline = boat.y;
    boat.isDocked = false;
    boat.dockedMarketId = null;
    state.player.activeBoatId = boat.id;
    const initialZ = boat.z;
    for (let index = 0; index < 45; index++) {
      const frame = physics.step(state, { x: 0, z: -1, sprint: false }, "boat-driving", 1 / 60, index / 60);
      Object.assign(state.player, frame.player);
      Object.assign(boat, frame.boats[boat.id]);
    }
    expect(boat.z).toBeGreaterThan(initialZ);
    expect(boat.y).toBe(canonicalWaterline);
    expect(state.player.y).toBe(canonicalWaterline + 0.5);
    expect(state.player.x).toBeCloseTo(boat.x, 5);
    expect(state.player.z).toBeCloseTo(boat.z, 5);
  });
});

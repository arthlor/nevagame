import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import type { GameCommand, GameQuery } from "../../src/simulation/core/contracts";

describe("malformed simulation boundaries", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("ignores negative frame time before school lifecycle or RNG work", () => {
    const sim = new Simulation();
    const mainTrack = Object.values(sim.state.quests.tracks)[0]!;
    mainTrack.activeQuestId = "quest.act5_maiden_voyage" as typeof mainTrack.activeQuestId;
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    const worldBefore = structuredClone(sim.state.world);
    const minuteBefore = sim.state.clock.currentMinute;
    const rngBefore = sim.rng.getState();
    const savedRngBefore = sim.state.metadata.rngState;

    sim.tick(-1);

    expect(sim.state.clock.currentMinute).toBe(minuteBefore);
    expect(sim.state.world).toEqual(worldBefore);
    expect(sim.rng.getState()).toBe(rngBefore);
    expect(sim.state.metadata.rngState).toBe(savedRngBefore);
  });

  it("rejects invalid inventory transfer directions without moving goods", () => {
    const sim = new Simulation();
    const boatId = Object.keys(sim.state.boats)[0]!;
    const boat = sim.state.boats[boatId];
    sim.state.player.x = boat.x;
    sim.state.player.z = boat.z;
    const satchel = sim.state.inventories[sim.state.player.inventoryId];
    const hold = sim.state.inventories[boat.supplyInventoryId];
    const satchelBefore = structuredClone(satchel);
    const holdBefore = structuredClone(hold);

    const result = sim.execute({
      type: "inventory.transfer",
      itemId: "item.bait_worms",
      quantity: 1,
      boatId,
      direction: "sideways"
    } as unknown as GameCommand);

    expect(result).toMatchObject({ success: false, reasonCode: "invalid-direction" });
    expect(satchel).toEqual(satchelBefore);
    expect(hold).toEqual(holdBefore);
  });

  it("returns structured rejections for null and malformed crop placement payloads", () => {
    const sim = new Simulation();
    const stateBefore = structuredClone(sim.state);
    const requests: unknown[] = [
      null,
      undefined,
      { farmId: "farm.starter_garden", cropId: "crop.wheat", x: Number.NaN, z: 0 },
      { farmId: "farm.starter_garden", cropId: "crop.wheat", x: 0, z: 0, space: "screen" }
    ];

    for (const request of requests) {
      const action = sim.execute({ type: "crop.plant", request } as unknown as GameCommand);
      expect(action).toMatchObject({ success: false, reasonCode: expect.any(String) });

      const query = sim.query({ type: "crop.validate-placement", request } as unknown as GameQuery);
      expect(query).toMatchObject({ valid: false, reason: expect.any(String) });
    }

    expect(sim.state).toEqual(stateBefore);
  });

  it("returns structured rejections for null and malformed physics commits", () => {
    const sim = new Simulation();
    const stateBefore = structuredClone(sim.state);
    const traversal = structuredClone(sim.state.player.traversal);
    const validPose = {
      x: sim.state.player.x,
      y: sim.state.player.y,
      z: sim.state.player.z,
      rotationY: sim.state.player.rotationY,
      traversal
    };
    const frames: unknown[] = [
      null,
      {},
      { player: null, boats: {} },
      { player: { ...validPose, traversal: null }, boats: {} },
      { player: validPose, boats: { "boat.player_rowboat": null } },
      { player: { ...validPose, money: 999 }, boats: {} }
    ];

    for (const frame of frames) {
      let result: ReturnType<Simulation["execute"]> | undefined;
      expect(() => {
        result = sim.execute({ type: "physics.commit", frame } as unknown as GameCommand);
      }).not.toThrow();
      expect(result).toMatchObject({ success: false, reason: expect.any(String) });
      expect(sim.state).toEqual(stateBefore);
    }
  });

  it("defines results for unknown runtime action and query types", () => {
    const sim = new Simulation();

    expect(sim.execute({ type: "action.unknown" } as unknown as GameCommand))
      .toMatchObject({ success: false, reason: "Unknown action type" });
    expect(sim.execute(null as unknown as GameCommand))
      .toMatchObject({ success: false, reason: "Unknown action type" });
    expect(sim.query({ type: "query.unknown" } as unknown as GameQuery)).toBeNull();
    expect(sim.query(null as unknown as GameQuery)).toBeNull();
  });
});

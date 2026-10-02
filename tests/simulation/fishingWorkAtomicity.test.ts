import { describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";

function caughtAttempt(sim: Simulation): NonNullable<Simulation["state"]["basicFishing"]> {
  sim.state.player.x = -8;
  sim.state.player.z = 0;
  sim.state.player.workCapacity.current = 100;
  expect(sim.castBasicFishing().success).toBe(true);
  const attempt = sim.state.basicFishing!;
  attempt.phase = "caught";
  attempt.isPerfect = true;
  attempt.treasureCaught = false;
  return attempt;
}

function outcomeState(sim: Simulation): object {
  return {
    pending: sim.state.basicFishing,
    work: sim.state.player.workCapacity.current,
    earned: sim.state.player.workCapacity.earnedToday,
    xp: sim.state.player.proficiencies.fishing,
    rngIsPersisted: sim.state.metadata.rngState === sim.rng.getState(),
    saveIsValid: validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: sim.state })
  };
}

describe("basic fishing Work transaction publication", () => {
  it("finishes rewards and clears the catch before a rank listener can retry landing", () => {
    const sim = new Simulation();
    sim.state.player.proficiencies.fishing = 975;
    const attempt = caughtAttempt(sim);
    const itemId = attempt.catchItemId!;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const copiesBefore = InventoryManager.getItemCount(inventory, itemId);
    let observed: unknown;
    let rankEvents = 0;
    sim.events.on("ProficiencyLeveledUp", () => {
      rankEvents += 1;
      observed = outcomeState(sim);
      sim.execute({ type: "fishing.commit-basic" });
    });

    expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
    expect(observed).toEqual({ pending: null, work: 100, earned: 10, xp: 1025, rngIsPersisted: true, saveIsValid: true });
    expect(rankEvents).toBe(1);
    expect(InventoryManager.getItemCount(inventory, itemId)).toBe(copiesBefore + 1);
    expect(sim.state.journal.fishRecords[itemId].catchCount).toBe(1);
    expect(sim.state.player.proficiencies.fishing).toBe(1025);
    expect(sim.state.player.workCapacity.current).toBe(100);
  });

  it("publishes treasure after the combined catch and perfect rebate, preventing another loot roll", () => {
    const sim = new Simulation();
    const attempt = caughtAttempt(sim);
    attempt.treasureCaught = true;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const itemId = attempt.catchItemId!;
    let observed: unknown;
    let treasureEvents = 0;
    const loot = vi.spyOn(BasicFishingMinigame, "generateTreasureLoot").mockReturnValue(["item.basic_fertilizer"]);
    try {
      sim.events.on("BasicFishingTreasureCaught", () => {
        treasureEvents += 1;
        observed = {
          ...outcomeState(sim),
          treasureCount: InventoryManager.getItemCount(inventory, "item.basic_fertilizer")
        };
        sim.execute({ type: "fishing.commit-basic" });
      });
      expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
      expect(observed).toMatchObject({ pending: null, work: 100, earned: 10, xp: 50, treasureCount: 1, rngIsPersisted: true, saveIsValid: true });
      expect(treasureEvents).toBe(1);
      expect(loot).toHaveBeenCalledTimes(1);
      expect(InventoryManager.getItemCount(inventory, itemId)).toBe(1);
      expect(sim.state.player.workCapacity.earnedToday).toBe(10);
    } finally {
      loot.mockRestore();
    }
  });

  it("finishes a physical catch, treasure, XP and Work before Cargo publishes FishLanded", () => {
    const sim = new Simulation();
    const attempt = caughtAttempt(sim);
    attempt.catchItemId = "fish.sea_bream";
    attempt.ecologyId = "ecology.sunreach";
    attempt.habitatId = "coast";
    attempt.treasureCaught = true;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    let observed: unknown;
    let landedEvents = 0;
    const loot = vi.spyOn(BasicFishingMinigame, "generateTreasureLoot").mockReturnValue(["item.basic_fertilizer"]);
    try {
      sim.events.on("FishLanded", () => {
        landedEvents += 1;
        observed = {
          ...outcomeState(sim),
          cargoCount: Object.keys(sim.state.fishCargo).length,
          treasureCount: InventoryManager.getItemCount(inventory, "item.basic_fertilizer")
        };
        sim.execute({ type: "fishing.commit-basic" });
      });
      expect(sim.execute({ type: "fishing.commit-basic" }).success).toBe(true);
      expect(observed).toMatchObject({ pending: null, work: 100, earned: 10, xp: 50, cargoCount: 1, treasureCount: 1, rngIsPersisted: true, saveIsValid: true });
      expect(landedEvents).toBe(1);
      expect(Object.keys(sim.state.fishCargo)).toHaveLength(1);
      expect(InventoryManager.getItemCount(inventory, "fish.sea_bream")).toBe(0);
      expect(sim.state.journal.fishRecords["fish.sea_bream"].catchCount).toBe(1);
      expect(sim.state.player.workCapacity.earnedToday).toBe(10);
    } finally {
      loot.mockRestore();
    }
  });

  it("keeps every reward and the RNG unchanged when physical-catch treasure cannot fit", () => {
    const sim = new Simulation();
    const attempt = caughtAttempt(sim);
    attempt.catchItemId = "fish.sea_bream";
    attempt.ecologyId = "ecology.sunreach";
    attempt.habitatId = "coast";
    attempt.treasureCaught = true;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const filler = ContentRegistry.items.get("item.compost_starter")!;
    inventory.slots = inventory.slots.map(() => ({ itemId: filler.id, quantity: filler.stackLimit }));
    const before = structuredClone(sim.state);
    const rngBefore = sim.rng.getState();
    let outcomes = 0;
    sim.events.on("FishLanded", () => { outcomes += 1; });
    sim.events.on("BasicFishingTreasureCaught", () => { outcomes += 1; });
    sim.events.on("BasicFishingResolved", () => { outcomes += 1; });

    expect(sim.execute({ type: "fishing.commit-basic" })).toMatchObject({ success: false, reasonCode: "inventory-full" });
    expect(sim.state).toEqual(before);
    expect(sim.rng.getState()).toBe(rngBefore);
    expect(outcomes).toBe(0);
  });

  it("clears a discarded perfect catch before its event and preserves a new cast started by that listener", () => {
    const sim = new Simulation();
    caughtAttempt(sim);
    let observed: unknown;
    let newCast: unknown;
    sim.events.on("BasicFishingResolved", event => {
      if (event.reason !== "cancelled") return;
      observed = outcomeState(sim);
      sim.execute({ type: "fishing.commit-basic" });
      newCast = sim.castBasicFishing();
    });

    expect(sim.execute({ type: "fishing.discard-basic-catch" })).toMatchObject({ success: true, reasonCode: "discarded" });
    expect(observed).toMatchObject({ pending: null, work: 90, earned: 0, xp: 0, rngIsPersisted: true });
    expect(newCast).toMatchObject({ success: true });
    expect(sim.state.basicFishing?.phase).toBe("casting");
    expect(sim.state.player.workCapacity.current).toBe(80);
    expect(sim.state.player.proficiencies.fishing).toBe(0);
  });

  it("clears a cancelled cast before its event and preserves a new cast started by that listener", () => {
    const sim = new Simulation();
    caughtAttempt(sim).phase = "casting";
    let observed: unknown;
    let newCast: unknown;
    sim.events.on("BasicFishingResolved", event => {
      if (event.reason !== "cancelled") return;
      observed = outcomeState(sim);
      newCast = sim.castBasicFishing();
    });

    expect(sim.execute({ type: "fishing.cancel-basic" }).success).toBe(true);
    expect(observed).toMatchObject({ pending: null, work: 90, earned: 0, xp: 0, rngIsPersisted: true });
    expect(newCast).toMatchObject({ success: true });
    expect(sim.state.basicFishing?.phase).toBe("casting");
    expect(sim.state.player.workCapacity.current).toBe(80);
  });
});

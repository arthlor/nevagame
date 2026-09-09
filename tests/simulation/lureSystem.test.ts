import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { HARBOR_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { Simulation } from "../../src/simulation/Simulation";
import { SeededRng } from "../../src/simulation/core/Rng";
import type { FishInstance, FishingEncounterState } from "../../src/simulation/core/types";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { FISHING_TUNING } from "../../src/simulation/fishing/FishingTuning";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { buildContextualHotbar } from "../../src/simulation/presentation/WorldHudPresentation";
import { armLureForTest } from "./sportFishingTestUtils";

function prepareTroutSchool(sim: Simulation): string {
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  expect(InventoryManager.addItemsAtomically(inventory, [
    { itemId: "item.chum_bucket", quantity: 1 }
  ])).toBe(true);
  const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
  const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
  sim.state.player.x = lake.x;
  sim.state.player.z = lake.z;
  expect(sim.chumFishSchool(schoolId).success).toBe(true);
  return schoolId;
}

function basicSimulation(seed: number): Simulation {
  const initial = new Simulation().state;
  initial.worldSeed = seed;
  initial.metadata.rngState = undefined;
  const sim = new Simulation(initial);
  sim.state.player.x = -8;
  sim.state.player.z = 0;
  return sim;
}

function encounterPair(behavior: "burst" | "shake"): [FishingEncounter, FishingEncounter] {
  const fish: FishInstance = {
    instanceId: "fish_inst.lure_comparison",
    speciesId: "fish.trout",
    ecologyId: "ecology.neva",
    weightKg: 4,
    quality: "fine",
    caughtAtMinute: 0
  };
  const source = new FishingEncounter(fish, "rod.willow", new SeededRng(811));
  const bareState = structuredClone(source.getState()) as FishingEncounterState;
  bareState.behavior = behavior;
  bareState.behaviorUntilSeconds = 10;
  bareState.lineTension = 55;
  bareState.dynamics!.behaviorDurationSeconds = 10;
  bareState.dynamics!.effort = 0.9;
  if (behavior === "shake") {
    bareState.dynamics!.shakeAmplitude = 1;
    bareState.dynamics!.shakePhase = Math.PI / 2;
  }
  const lureState = structuredClone(bareState);
  lureState.tackleSnapshot.lureItemId = "item.basic_lure";
  return [
    FishingEncounter.fromState(bareState, new SeededRng(12)),
    FishingEncounter.fromState(lureState, new SeededRng(12))
  ];
}

describe("mandatory Woven Lure contract", () => {
  it("rejects an unarmed or stale lure before spending Work or advancing hook RNG", () => {
    const sim = new Simulation();
    const schoolId = prepareTroutSchool(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.basic_lure", quantity: 1 }
    ])).toBe(true);
    const workBefore = sim.state.player.workCapacity.current;
    const rngBefore = sim.rng.getState();

    expect(sim.hookSportFish(schoolId)).toMatchObject({
      success: false,
      reasonCode: "lure-required"
    });
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    expect(sim.rng.getState()).toBe(rngBefore);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);

    expect(sim.execute({ type: "fishing.toggle-lure" })).toMatchObject({ success: true, prepared: true });
    expect(InventoryManager.removeItemsAtomically(inventory, [
      { itemId: "item.basic_lure", quantity: 1 }
    ])).toBe(true);
    expect(sim.hookSportFish(schoolId)).toMatchObject({
      success: false,
      reasonCode: "lure-unavailable"
    });
    expect(sim.state.player.preparedLureItemId).toBe("item.basic_lure");
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    expect(sim.rng.getState()).toBe(rngBefore);
    expect(buildContextualHotbar(sim.state, "angling", null).find((slot) => slot.id === "tool.tackle")?.detail)
      .toContain("out of reach");
  });

  it("puts tackle away without a debit and rejects lure changes during either fishing mode", () => {
    const basic = basicSimulation(44);
    const inventory = basic.state.inventories[basic.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.basic_lure", quantity: 2 }
    ])).toBe(true);
    expect(basic.execute({ type: "fishing.toggle-lure" })).toMatchObject({ success: true, prepared: true });
    expect(basic.execute({ type: "fishing.toggle-lure" })).toMatchObject({ success: true, prepared: false });
    expect(InventoryManager.getItemCount(inventory, "item.basic_lure")).toBe(2);
    expect(basic.execute({ type: "fishing.toggle-lure" })).toMatchObject({ success: true, prepared: true });
    expect(basic.castBasicFishing().success).toBe(true);
    expect(basic.execute({ type: "fishing.toggle-lure" })).toMatchObject({
      success: false,
      reason: "Finish fishing before changing tackle"
    });

    const sport = new Simulation();
    const schoolId = prepareTroutSchool(sport);
    armLureForTest(sport, 2);
    expect(sport.hookSportFish(schoolId).success).toBe(true);
    expect(sport.execute({ type: "fishing.toggle-lure" })).toMatchObject({
      success: false,
      reason: "Finish fishing before changing tackle"
    });
  });

  it("consumes an optional basic-cast lure and applies its reliability bonus", () => {
    let exercised: { bare: Simulation; lured: Simulation } | null = null;
    for (let seed = 1; seed <= 100 && !exercised; seed += 1) {
      const bare = basicSimulation(seed);
      const lured = basicSimulation(seed);
      armLureForTest(lured);
      expect(bare.castBasicFishing().success).toBe(true);
      expect(lured.castBasicFishing().success).toBe(true);
      if (!bare.state.basicFishing!.willCatch && lured.state.basicFishing!.willCatch) {
        exercised = { bare, lured };
      }
    }

    expect(exercised, "expected a deterministic seed inside the bare 15% miss window").not.toBeNull();
    expect(FISHING_TUNING.preparedLureHookReliabilityBonus).toBe(0.18);
    expect(exercised!.bare.state.basicFishing!.willCatch).toBe(false);
    expect(exercised!.lured.state.basicFishing!.willCatch).toBe(true);
    expect(exercised!.lured.state.player.preparedLureItemId).toBeNull();
    expect(InventoryManager.getItemCount(
      exercised!.lured.state.inventories[exercised!.lured.state.player.inventoryId],
      "item.basic_lure"
    )).toBe(0);
  });

  it("applies the snapshotted lure drive and shake-damage forgiveness", () => {
    const [bareBurst, lureBurst] = encounterPair("burst");
    bareBurst.tick(1);
    lureBurst.tick(1);
    expect(lureBurst.getState().dynamics!.radialVelocity)
      .toBeLessThan(bareBurst.getState().dynamics!.radialVelocity);

    const [bareShake, lureShake] = encounterPair("shake");
    bareShake.tick(0.5);
    lureShake.tick(0.5);
    expect(lureShake.getState().lineIntegrity).toBeGreaterThan(bareShake.getState().lineIntegrity);
    expect(FISHING_TUNING.preparedLureDriveMultiplier).toBe(0.9);
    expect(FISHING_TUNING.preparedLureShakeDamageMultiplier).toBe(0.8);
  });

  it("keeps legacy active fights without a lure snapshot playable after load", () => {
    const legacy = new Simulation();
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    expect(legacy.startDebugSportFishing("lake", lake.x, lake.z, "fish.trout")).toBe(true);
    legacy.state.sportFishing!.tackleSnapshot.lureItemId = null;

    const loaded = new Simulation(structuredClone(legacy.state));

    expect(loaded.activeFishingEncounter).not.toBeNull();
    expect(loaded.state.sportFishing?.tackleSnapshot.lureItemId).toBeNull();
    loaded.tick(0.1);
    expect(loaded.state.sportFishing?.result).toBe("active");
  });

  it("provides novice, efficient, starter-reward, and market recovery paths", () => {
    const simple = ContentRegistry.recipes.get("recipe.craft_lure_simple")!;
    const efficient = ContentRegistry.recipes.get("recipe.craft_lure")!;
    expect(simple.inputs).toEqual([
      { itemId: "item.plant_matter", quantity: 2 },
      { itemId: "item.bait_worms", quantity: 2 }
    ]);
    expect(simple.result).toEqual({ kind: "items", stacks: [{ itemId: "item.basic_lure", quantity: 1 }] });
    expect(efficient.inputs).toEqual([
      { itemId: "produce.flax", quantity: 1 },
      { itemId: "item.fish_scraps", quantity: 1 }
    ]);
    expect(efficient.result).toEqual({ kind: "items", stacks: [{ itemId: "item.basic_lure", quantity: 2 }] });
    expect(ContentRegistry.quests.get("quest.act4_restore_rowboat")?.rewards.items)
      .toContainEqual({ itemId: "item.basic_lure", quantity: 2 });
    expect(ContentRegistry.markets.get(HARBOR_MARKET.marketId)?.retail.itemIds).toContain("item.basic_lure");

    const market = new Simulation();
    market.state.player.x = HARBOR_MARKET.position.x;
    market.state.player.z = HARBOR_MARKET.position.z;
    market.state.player.money = 100;
    const inventory = market.state.inventories[market.state.player.inventoryId];
    expect(market.buyItemAtMarket("market.harbor", "item.basic_lure", 1).success).toBe(true);
    expect(InventoryManager.getItemCount(inventory, "item.basic_lure")).toBe(1);
  });
});

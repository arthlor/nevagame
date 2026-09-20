import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { STARTER_EQUIPMENT_IDS, WARDROBE_CAPACITY } from "../../src/content/equipment";
import { Simulation } from "../../src/simulation/Simulation";
import type { EquipmentId, GameState, ProcessingJobState } from "../../src/simulation/core/types";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import legacyRecipeCompatibility from "../fixtures/recipes_v36_compatibility.json";
import { processingWorkForRecipe, processingXpForRecipe } from "../../src/simulation/domains/ProcessingDomain";
import { SIMULATION_ACTION_TIMINGS } from "../../src/simulation/actions/ActionTimeline";
import { ONBOARDING_PACE, effectiveRecipeDurationMinutes } from "../../src/simulation/core/OnboardingPace";
import { PROFICIENCY_RANKS } from "../../src/content/progression";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../../src/simulation/inventory/InventoryLimits";
import {
  annualPlantMatterBonus,
  cropQualityChanceMultiplier,
  snapshotFishingEquipmentEffects
} from "../../src/simulation/equipment/EquipmentEffects";
import { farmLocalToWorld } from "../../src/world/FarmLayout";
import { SeededRng } from "../../src/simulation/core/Rng";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";

function moveToStation(sim: Simulation, stationId = "struct.workbench"): void {
  const station = sim.state.world.structures[stationId];
  const front = station && getProcessingStationFrontPosition(stationId, station);
  if (!front) throw new Error(`Missing station front for ${stationId}`);
  sim.state.player.x = front.x;
  sim.state.player.z = front.z;
}

function own(sim: Simulation, ...ids: EquipmentId[]): void {
  for (const id of ids) {
    if (!sim.state.player.equipment.ownedIds.includes(id)) sim.state.player.equipment.ownedIds.push(id);
  }
}

function matureStarterWheat(sim: Simulation): string {
  const world = farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 });
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
  const planted = sim.plantCrop("farm.starter_garden", "crop.wheat", world.x, world.z);
  expect(planted.success).toBe(true);
  const crop = sim.state.crops[planted.placedCropId!];
  crop.stage = "mature";
  crop.effectiveGrowthMinutes = ContentRegistry.crops.get("crop.wheat")!.baseGrowthMinutes;
  return crop.id;
}

describe("character equipment", () => {
  it("starts with five neutral permanent items, six filled slots, and two clothing-only presets", () => {
    const sim = new Simulation();
    const character = sim.inspectCharacterEquipment();

    expect(sim.state.player.equipment.ownedIds).toEqual([...STARTER_EQUIPMENT_IDS]);
    expect(character.slots.map((slot) => slot.slot)).toEqual([
      "head", "outerwear", "feet", "watering-tool", "harvest-tool", "rod"
    ]);
    expect(character.wardrobe).toEqual({ used: 5, reserved: 0, capacity: WARDROBE_CAPACITY });
    expect(character.presets.map((preset) => preset.id)).toEqual(["field", "sea"]);
    expect(Object.keys(character.presets[0].items).sort()).toEqual(["feet", "head", "outerwear"]);
  });

  it("enforces the rounded 25% actions-per-Work cap against the neutral integer cost", () => {
    const sim = new Simulation();
    own(sim, "equipment.copper_rose_watering_can");
    expect(sim.execute({
      type: "equipment.equip",
      equipmentId: "equipment.copper_rose_watering_can"
    }).success).toBe(true);

    const cases = [
      { base: 2, expected: 2, limit: "rounding" },
      { base: 3, expected: 3, limit: "cap" },
      { base: 4, expected: 4, limit: "cap" },
      { base: 5, expected: 4, limit: "none" }
    ] as const;
    for (const sample of cases) {
      const quote = sim.quoteWorkCost(sample.base, "farming", "farming.water");
      expect(quote.cost, `base ${sample.base}`).toBe(sample.expected);
      expect((quote.neutralCost ?? quote.cost) / quote.cost).toBeLessThanOrEqual(1.25);
      expect(quote.roundingLimited).toBe(sample.limit === "rounding");
      expect(quote.throughputCapLimited).toBe(sample.limit === "cap");
    }

    sim.state.player.proficiencies.farming = 3_000;
    const proficient = sim.quoteWorkCost(6, "farming", "farming.water");
    expect(proficient.neutralCost).toBe(5);
    expect(proficient.cost).toBe(4);
    expect(proficient.neutralCost! / proficient.cost).toBe(1.25);

    for (const rank of PROFICIENCY_RANKS) {
      sim.state.player.proficiencies.farming = rank.xpRequired;
      for (let baseCost = 1; baseCost <= 200; baseCost += 1) {
        const quote = sim.quoteWorkCost(baseCost, "farming", "farming.water");
        expect(Number.isSafeInteger(quote.cost), `${rank.rankName} base ${baseCost} integer`).toBe(true);
        expect(quote.cost, `${rank.rankName} base ${baseCost} floor`)
          .toBeGreaterThanOrEqual(Math.ceil((quote.neutralCost! * 4) / 5));
        expect(quote.neutralCost! / quote.cost, `${rank.rankName} base ${baseCost} throughput`)
          .toBeLessThanOrEqual(1.25);
      }
    }
  });

  it("keeps Field Hat useful without competing with watering or harvest tool savings", () => {
    const sim = new Simulation();
    own(sim, "equipment.field_hat", "equipment.copper_rose_watering_can", "equipment.balanced_sickle");
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" }).success).toBe(true);
    expect(sim.execute({
      type: "equipment.equip",
      equipmentId: "equipment.copper_rose_watering_can"
    }).success).toBe(true);
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.balanced_sickle" }).success).toBe(true);

    expect(sim.quoteWorkCost(20, "farming", "farming.plant").equipmentMultiplier).toBe(0.85);
    expect(sim.quoteWorkCost(20, "farming", "farming.fertilize").equipmentMultiplier).toBe(0.85);
    expect(sim.quoteWorkCost(20, "farming", "farming.water").equipmentMultiplier).toBe(0.8);
    expect(sim.quoteWorkCost(20, "farming", "farming.harvest").equipmentMultiplier).toBe(0.8);

    const farmId = "farm.starter_garden" as const;
    const plantPosition = farmLocalToWorld(farmId, { x: 0, z: 0 });
    sim.state.player.x = plantPosition.x;
    sim.state.player.z = plantPosition.z;
    const workBeforePlanting = sim.state.player.workCapacity.current;
    expect(sim.plantCrop(farmId, "crop.wheat", plantPosition.x, plantPosition.z).success).toBe(true);
    expect(workBeforePlanting - sim.state.player.workCapacity.current).toBe(10);

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const farm = sim.state.farms[farmId];
    farm.soil.fertility = 40;
    expect(InventoryManager.addItemsAtomically(
      inventory,
      [{ itemId: "item.basic_fertilizer", quantity: 1 }]
    )).toBe(true);
    const workBeforeFertilizing = sim.state.player.workCapacity.current;
    expect(sim.applyFertilizer(farmId).success).toBe(true);
    expect(workBeforeFertilizing - sim.state.player.workCapacity.current).toBe(7);
  });

  it("wires every specialist effect to its action and snapshots sea gear for the whole encounter", () => {
    const sim = new Simulation();
    own(
      sim,
      "equipment.tidewatch_cap",
      "equipment.harvest_apron",
      "equipment.broad_sickle",
      "equipment.oilskin_coat",
      "equipment.deck_boots"
    );
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.tidewatch_cap" });
    expect(sim.quoteWorkCost(20, "fishing", "fishing.basic-cast").equipmentMultiplier).toBe(0.9);
    expect(sim.quoteWorkCost(20, "fishing", "fishing.sport-hook").equipmentMultiplier).toBe(0.9);
    expect(sim.quoteWorkCost(20, "farming", "farming.plant").equipmentMultiplier).toBe(1);

    sim.execute({ type: "equipment.equip", equipmentId: "equipment.harvest_apron" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.broad_sickle" });
    expect(cropQualityChanceMultiplier(sim.state)).toBe(1.1);
    expect(annualPlantMatterBonus(sim.state)).toBe(1);

    sim.execute({ type: "equipment.equip", equipmentId: "equipment.oilskin_coat" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.deck_boots" });
    expect(snapshotFishingEquipmentEffects(sim.state)).toEqual({
      lineIntegrityDamageMultiplier: 0.9,
      braceResistanceMultiplier: 1.1
    });
    hookLakeTroutForTest(sim);
    expect(sim.state.sportFishing?.equipmentEffects).toEqual({
      lineIntegrityDamageMultiplier: 0.9,
      braceResistanceMultiplier: 1.1
    });
  });

  it("adds the Broad Sickle byproduct through the real harvest transaction", () => {
    const sim = new Simulation();
    const cropId = matureStarterWheat(sim);
    own(sim, "equipment.broad_sickle");
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.broad_sickle" });
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const before = InventoryManager.getItemCount(inventory, "item.plant_matter");
    expect(sim.harvestCrop(cropId).success).toBe(true);
    expect(InventoryManager.getItemCount(inventory, "item.plant_matter") - before).toBe(2);
  });

  it("lets the Harvest Apron widen rare quality with the same saved RNG draw", () => {
    const source = new Simulation();
    const cropId = matureStarterWheat(source);
    const crop = source.state.crops[cropId];
    crop.moisture = 100;
    crop.averageMoistureAccum = 100;
    crop.moistureSampleCount = 1;
    crop.health = 100;
    source.state.farms[crop.farmId].soil.fertility = 50;
    source.state.player.proficiencies.farming = 100_000;

    let rngState = 1;
    for (; rngState < 100_000; rngState += 1) {
      const probe = new SeededRng(source.rng.getSeed(), rngState).nextFloat();
      if (probe >= 0.78 && probe < 0.8) break;
    }
    expect(rngState).toBeLessThan(100_000);
    source.state.metadata.rngState = rngState;
    const baseline = new Simulation(structuredClone(source.state));
    const geared = new Simulation(structuredClone(source.state));
    own(geared, "equipment.harvest_apron");
    geared.execute({ type: "equipment.equip", equipmentId: "equipment.harvest_apron" });

    const baselineResult = baseline.harvestCrop(cropId);
    const gearedResult = geared.harvestCrop(cropId);
    expect(baselineResult).toMatchObject({ success: true, quality: "exceptional" });
    expect(gearedResult).toMatchObject({ success: true, quality: "prize", yield: baselineResult.yield });
    expect(geared.rng.getState()).toBe(baseline.rng.getState());
  });

  it("uses action-specific reach and never lets information inspection veto watering", () => {
    const sim = new Simulation();
    expect(sim.cropInteractionReachMeters("water")).toBe(2.5);
    expect(sim.cropInteractionReachMeters("harvest")).toBe(2.5);
    expect(sim.cropInteractionReachMeters("unroot")).toBe(2.5);
    expect(sim.cropInteractionReachMeters("inspect")).toBe(2.5);

    own(sim, "equipment.furrow_boots", "equipment.long_spout_watering_can");
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.furrow_boots" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.long_spout_watering_can" });

    expect(sim.cropInteractionReachMeters("water")).toBe(3.25);
    expect(sim.cropInteractionReachMeters("harvest")).toBe(2.75);
    expect(sim.cropInteractionReachMeters("unroot")).toBe(2.75);
    expect(sim.cropInteractionReachMeters("inspect")).toBe(2.75);
  });

  it("applies clothing presets atomically without changing either tool or the rod", () => {
    const sim = new Simulation();
    own(
      sim,
      "equipment.field_hat",
      "equipment.harvest_apron",
      "equipment.furrow_boots",
      "equipment.tidewatch_cap",
      "equipment.oilskin_coat",
      "equipment.deck_boots",
      "equipment.long_spout_watering_can"
    );
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.harvest_apron" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.furrow_boots" });
    expect(sim.execute({ type: "equipment.save-preset", presetId: "field" }).success).toBe(true);

    sim.execute({ type: "equipment.equip", equipmentId: "equipment.tidewatch_cap" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.oilskin_coat" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.deck_boots" });
    sim.execute({ type: "equipment.equip", equipmentId: "equipment.long_spout_watering_can" });
    const toolBefore = sim.state.player.equipment.equipped["watering-tool"];
    const rodBefore = sim.state.player.equippedRodId;
    expect(sim.execute({ type: "equipment.apply-preset", presetId: "field" }).success).toBe(true);

    expect(sim.state.player.equipment.equipped).toMatchObject({
      head: "equipment.field_hat",
      outerwear: "equipment.harvest_apron",
      feet: "equipment.furrow_boots",
      "watering-tool": toolBefore
    });
    expect(sim.state.player.equippedRodId).toBe(rodBefore);

    const beforeInvalid = { ...sim.state.player.equipment.equipped };
    sim.state.player.equipment.presets.sea.head = "equipment.not_owned";
    expect(sim.execute({ type: "equipment.apply-preset", presetId: "sea" }).success).toBe(false);
    expect(sim.state.player.equipment.equipped).toEqual(beforeInvalid);
  });

  it("rejects authoritative changes while hands, movement mode, or the boat are unsafe", () => {
    const sim = new Simulation();
    own(sim, "equipment.field_hat");
    sim.state.player.activeMountId = "mount.player_donkey";
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" }).reason).toContain("Dismount");

    sim.state.player.activeMountId = null;
    sim.state.player.activeBoatId = "boat.player_rowboat";
    sim.state.boats["boat.player_rowboat"].isDocked = false;
    sim.state.boats["boat.player_rowboat"].dockedMarketId = null;
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" }).reason).toContain("Moor");
  });

  it("rejects a direct equipment command while a simulation action timeline is active", () => {
    const sim = new Simulation();
    own(sim, "equipment.field_hat");
    expect(sim.actionTimeline.start(
      "plant",
      { x: 0, y: 0, z: 0 },
      0,
      { type: "player.reset-safe" }
    )).toBe(true);
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" })).toMatchObject({
      success: false,
      reason: "Finish or cancel the current action before changing gear"
    });
    expect(sim.actionTimeline.cancelBeforeCommit(0)).toBe(true);
    expect(sim.execute({ type: "equipment.equip", equipmentId: "equipment.field_hat" }).success).toBe(true);
  });

  it("uses the same safe-state guard for Character and market rod changes", () => {
    const sim = new Simulation();
    const harbor = ContentRegistry.markets.get("market.harbor")!;
    sim.state.player.x = harbor.interactionPosition.x;
    sim.state.player.z = harbor.interactionPosition.z;
    sim.state.player.money = 10_000;
    sim.state.player.proficiencies.fishing = 100_000;
    sim.state.player.carriedFishCargoId = "cargo.test_held";

    const moneyBefore = sim.state.player.money;
    expect(sim.buyRodAtMarket("market.harbor", "rod.river")).toMatchObject({
      success: false,
      reason: "Put down the catch before changing gear"
    });
    expect(sim.state.player.money).toBe(moneyBefore);
    expect(sim.state.player.ownedRodIds).not.toContain("rod.river");

    sim.state.player.ownedRodIds.push("rod.river");
    expect(sim.execute({ type: "equipment.equip-rod", rodId: "rod.river" })).toMatchObject({
      success: false,
      reason: "Put down the catch before changing gear"
    });
    expect(sim.equipRodAtMarket("market.harbor", "rod.river")).toMatchObject({
      success: false,
      reason: "Put down the catch before changing gear"
    });
    expect(sim.state.player.equippedRodId).toBe("rod.willow");

    const riverRow = sim.inspectMarketBoard("market.harbor")?.rodRows.find((row) => row.rodId === "rod.river");
    expect(riverRow).toMatchObject({
      owned: true,
      equipped: false,
      equippable: false,
      blockerReason: "Put down the catch before changing gear"
    });
  });
});

describe("station crafting lifecycle", () => {
  it("lets the simulation own the commit marker and drops only uncommitted timelines on reload", () => {
    const sim = new Simulation();
    moveToStation(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.flax", quantity: 3 }])).toBe(true);

    expect(sim.actionTimeline.start(
      "processing-start",
      { x: sim.state.player.x, y: sim.state.player.y, z: sim.state.player.z },
      0,
      { type: "processing.start", recipeId: "recipe.linen_roll", stationId: "struct.workbench" }
    )).toBe(true);
    expect(Object.keys(sim.state.processingJobs)).toHaveLength(0);

    const beforeCommitReload = new Simulation(structuredClone(sim.state));
    expect(beforeCommitReload.actionTimeline.isActive).toBe(false);
    expect(Object.keys(beforeCommitReload.state.processingJobs)).toHaveLength(0);
    expect(InventoryManager.getItemCount(
      beforeCommitReload.state.inventories[beforeCommitReload.state.player.inventoryId],
      "produce.flax"
    )).toBe(3);

    sim.actionTimeline.update(Math.ceil(SIMULATION_ACTION_TIMINGS["processing-start"].commitMs));
    expect(Object.keys(sim.state.processingJobs)).toHaveLength(1);
    expect(InventoryManager.getItemCount(inventory, "produce.flax")).toBe(0);
    const committedState = structuredClone(sim.state);

    sim.actionTimeline.update(Math.ceil(SIMULATION_ACTION_TIMINGS["processing-start"].durationMs) + 1);
    expect(Object.keys(sim.state.processingJobs)).toHaveLength(1);
    const afterCommitReload = new Simulation(committedState);
    expect(afterCommitReload.actionTimeline.isActive).toBe(false);
    expect(Object.keys(afterCommitReload.state.processingJobs)).toHaveLength(1);
  });

  it("preserves every v36 recipe output, Work cost, XP reward, gate, and effective duration", () => {
    const newGameQuests = new Simulation().state.quests;
    const steadyStateQuests = structuredClone(newGameQuests);
    steadyStateQuests.completedQuestIds.push(ONBOARDING_PACE.gateQuestId);
    expect(Object.keys(legacyRecipeCompatibility)).toHaveLength(15);
    for (const [recipeId, legacy] of Object.entries(legacyRecipeCompatibility)) {
      const recipe = ContentRegistry.recipes.get(recipeId);
      expect(recipe, recipeId).toBeDefined();
      expect(recipe!.result, `${recipeId} output`).toEqual(legacy.result);
      expect(recipe!.durationMinutes, `${recipeId} duration`).toBe(legacy.durationMinutes);
      expect(
        effectiveRecipeDurationMinutes(recipe!, legacy.stationId, newGameQuests),
        `${recipeId} new-game effective duration`
      ).toBe(legacy.newGameEffectiveDurationMinutes);
      expect(
        effectiveRecipeDurationMinutes(recipe!, legacy.stationId, steadyStateQuests),
        `${recipeId} steady-state effective duration`
      ).toBe(legacy.steadyStateEffectiveDurationMinutes);
      expect(recipe!.minimumSkill?.xp ?? null, `${recipeId} authored gate`).toBe(legacy.minimumSkillXp);
      const rankGate = PROFICIENCY_RANKS.find((rank) => rank.processingUnlocks.includes(recipeId))?.xpRequired;
      expect(rankGate, `${recipeId} progression membership`).toBeDefined();
      expect(
        Math.max(rankGate!, recipe!.minimumSkill?.xp ?? 0),
        `${recipeId} effective gate`
      ).toBe(legacy.effectiveGateXp);
      expect(processingWorkForRecipe(recipe!), `${recipeId} Work`).toBe(legacy.workCost);
      expect(processingXpForRecipe(recipe!), `${recipeId} XP`).toBe(legacy.xpReward);
      expect(recipe!.presentationKind, `${recipeId} presentation`).toBe("existing");
    }
  });

  it("executes varied processing routes through the 1,000 and 3,000 gates", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const startingMinute = sim.state.clock.currentMinute;
    let collectionCount = 0;
    let recoveryWaitMinutes = 0;
    const noviceRoute = [
      ["recipe.wheat_to_grain", 6],
      ["recipe.compost_worms", 3],
      ["recipe.perch_to_scraps", 6],
      ["recipe.fish_to_fertilizer", 3],
      ["recipe.craft_lure_simple", 3],
      ["recipe.craft_chum", 3],
      ["recipe.linen_roll", 3],
      ["recipe.field_hat", 1],
      ["recipe.furrow_boots", 1]
    ] as const;
    const apprenticeRoute = [
      ["recipe.wheat_to_grain", 7],
      ["recipe.compost_worms", 6],
      ["recipe.mackerel_to_scraps", 11],
      ["recipe.fish_to_fertilizer", 4],
      ["recipe.craft_lure", 6],
      ["recipe.craft_chum_rich", 5],
      ["recipe.linen_roll", 10],
      ["recipe.oiled_canvas", 2],
      ["recipe.tidewatch_cap", 1],
      ["recipe.harvest_apron", 1],
      ["recipe.copper_rose_can", 1],
      ["recipe.broad_sickle", 1]
    ] as const;

    const runRoute = (steps: ReadonlyArray<readonly [string, number]>): void => {
      const remaining = steps.map(([recipeId, count]) => ({ recipeId, count }));
      while (remaining.some((step) => step.count > 0)) {
        for (const step of remaining) {
          if (step.count <= 0) continue;
          const recipe = ContentRegistry.recipes.get(step.recipeId);
          if (!recipe) throw new Error(`Missing route recipe ${step.recipeId}`);
          const station = Object.values(sim.state.world.structures)
            .find((candidate) => candidate.type === recipe.stationType);
          if (!station) throw new Error(`Missing ${recipe.stationType} for ${recipe.id}`);

          // This integration route isolates the processing cadence. Its inputs
          // stand for the live sources proven by contentReachability; outputs
          // are consumed or sold between jobs so satchel clutter is not the
          // variable under test here.
          for (const slot of inventory.slots) {
            slot.itemId = undefined;
            slot.quantity = undefined;
          }
          expect(InventoryManager.addItemsAtomically(inventory, recipe.inputs), recipe.id).toBe(true);
          moveToStation(sim, station.id);

          // This integration route isolates the processing cadence. Work is a
          // daily earned budget now, so the route tops the pool up rather than
          // waiting for passive regeneration that no longer exists.
          sim.state.player.workCapacity.current = sim.state.player.workCapacity.maximum;
          sim.state.player.workCapacity.earnedToday = 0;
          sim.state.player.workCapacity.earningsDay = Math.floor(sim.state.clock.currentMinute / 1440);
          let quote = sim.inspectProcessingStation(station.id)?.recipes
            .find((candidate) => candidate.recipeId === recipe.id)?.work;
          expect(quote?.affordable, `${recipe.id} Work recovery`).toBe(true);

          const xpBefore = sim.state.player.proficiencies.processing;
          expect(sim.startProcessingJob(recipe.id, station.id), recipe.id).toMatchObject({ success: true });
          const job = Object.values(sim.state.processingJobs)
            .find((candidate) => candidate.stationId === station.id);
          expect(job, `${recipe.id} job`).toBeDefined();
          sim.advanceGameMinutes(job!.effectiveDurationMinutes);
          expect(job!.status, `${recipe.id} ready`).toBe("complete");
          expect(sim.collectProcessingJob(job!.id), recipe.id).toMatchObject({
            success: true,
            xpGained: processingXpForRecipe(recipe)
          });
          expect(sim.state.player.proficiencies.processing - xpBefore).toBe(processingXpForRecipe(recipe));
          collectionCount += 1;
          step.count -= 1;
        }
      }
    };

    moveToStation(sim);
    expect(sim.startProcessingJob("recipe.oiled_canvas", "struct.workbench").success).toBe(false);
    runRoute(noviceRoute);
    expect(sim.state.player.proficiencies.processing).toBe(1_015);
    expect(collectionCount).toBe(29);

    runRoute(apprenticeRoute);
    expect(sim.state.player.proficiencies.processing).toBe(3_010);
    expect(collectionCount).toBe(84);
    expect(sim.state.clock.currentMinute - startingMinute).toBeGreaterThan(recoveryWaitMinutes);
    expect(new Set(noviceRoute.map(([id]) => id)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(apprenticeRoute.map(([id]) => id)).size).toBeGreaterThanOrEqual(10);
    expect(Math.max(...noviceRoute.map(([, count]) => count))).toBeLessThanOrEqual(6);
    expect(Math.max(...apprenticeRoute.map(([, count]) => count))).toBeLessThanOrEqual(11);
  });

  it("allows empty stations and exposes stable quest, craftable, blocked, locked ordering", () => {
    const sim = new Simulation();
    moveToStation(sim);
    expect(sim.state.inventories[sim.state.player.inventoryId].slotCount).toBe(PLAYER_SATCHEL_SLOT_COUNT);
    for (const recipe of ContentRegistry.recipes.values()) {
      if (recipe.result.kind !== "items") continue;
      expect(recipe.result.stacks.length, `${recipe.id} empty-satchel fit`)
        .toBeLessThanOrEqual(PLAYER_SATCHEL_SLOT_COUNT);
      expect(new Set(recipe.result.stacks.map((stack) => stack.itemId)).size, `${recipe.id} unique output stacks`)
        .toBe(recipe.result.stacks.length);
    }
    const station = sim.inspectProcessingStation("struct.workbench")!;
    expect(station.job).toBeNull();
    const order = station.recipes.map((recipe) => recipe.state);
    const rank = { "quest-target": 0, craftable: 1, blocked: 2, locked: 3 } as const;
    expect(order.map((state) => rank[state])).toEqual([...order.map((state) => rank[state])].sort((a, b) => a - b));
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: sim.state
    })).toBe(true);

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.flax", quantity: 3 }])).toBe(true);
    expect(sim.startProcessingJob("recipe.linen_roll", "struct.workbench").success).toBe(true);
    const occupiedEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: structuredClone(sim.state)
    };
    expect(validateSaveEnvelope(occupiedEnvelope)).toBe(true);
    const existingJob = Object.values(occupiedEnvelope.state.processingJobs)[0]!;
    occupiedEnvelope.state.processingJobs.job_duplicate_station = {
      ...structuredClone(existingJob),
      id: "job_duplicate_station"
    };
    expect(validateSaveEnvelope(occupiedEnvelope)).toBe(false);
  });

  it("rejects impossible schema-37 job snapshots before they can grant output or XP", () => {
    const sim = new Simulation();
    moveToStation(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.flax", quantity: 3 }])).toBe(true);
    expect(sim.startProcessingJob("recipe.linen_roll", "struct.workbench").success).toBe(true);

    const validState = structuredClone(sim.state);
    const validEnvelope = (): { schemaVersion: number; savedAtUtcMs: number; state: GameState } => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: structuredClone(validState)
    });
    const rejects = (mutate: (job: ProcessingJobState, state: GameState) => void): void => {
      const envelope = validEnvelope();
      const job = Object.values(envelope.state.processingJobs)[0]!;
      mutate(job, envelope.state);
      expect(validateSaveEnvelope(envelope)).toBe(false);
    };

    expect(validateSaveEnvelope(validEnvelope())).toBe(true);
    rejects((job) => { job.completesAtMinute = job.startedAtMinute - 1; });
    rejects((job, state) => {
      job.startedAtMinute = state.clock.currentMinute + 5;
      job.completesAtMinute = job.startedAtMinute + job.effectiveDurationMinutes;
    });
    rejects((job) => { job.stationId = "struct.starter_mill"; });
    rejects((job) => { job.effectiveDurationMinutes += 1; });
    rejects((job) => { job.status = "complete"; });
    rejects((job, state) => { state.clock.currentMinute = job.completesAtMinute; });
    rejects((job) => { job.baseWork += 35; });
    rejects((job) => { job.xpReward = 1_000_000_000; });
    rejects((job) => { job.recipeName = " "; });
    rejects((job) => {
      job.result = {
        kind: "items",
        stacks: [
          { itemId: "item.linen_roll", quantity: 1 },
          { itemId: "item.linen_roll", quantity: 1 }
        ]
      };
    });
    rejects((job) => {
      job.result = {
        kind: "items",
        stacks: [{
          itemId: "item.linen_roll",
          quantity: ContentRegistry.items.get("item.linen_roll")!.stackLimit + 1
        }]
      };
    });

    const corrupted = new Simulation(structuredClone(validState));
    const corruptJob = Object.values(corrupted.state.processingJobs)[0]!;
    corrupted.state.clock.currentMinute = corruptJob.completesAtMinute;
    corruptJob.status = "complete";
    corruptJob.xpReward = 1_000_000_000;
    const xpBefore = corrupted.state.player.proficiencies.processing;
    expect(corrupted.collectProcessingJob(corruptJob.id)).toMatchObject({
      success: false,
      reason: "The saved job data is invalid"
    });
    expect(corrupted.state.player.proficiencies.processing).toBe(xpBefore);
    expect(corrupted.state.processingJobs[corruptJob.id]).toBeDefined();
  });

  it("snapshots a job, emits ready once, and grants output, XP, and quest event only on collection", () => {
    const sim = new Simulation();
    moveToStation(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.flax", quantity: 3 }])).toBe(true);
    let readyEvents = 0;
    let completedEvents = 0;
    sim.events.on("ProcessingJobReady", () => { readyEvents += 1; });
    sim.events.on("RecipeCompleted", () => { completedEvents += 1; });
    const xpBefore = sim.state.player.proficiencies.processing;

    expect(sim.startProcessingJob("recipe.linen_roll", "struct.workbench").success).toBe(true);
    const job = Object.values(sim.state.processingJobs)[0];
    expect(job).toMatchObject({
      recipeName: "Weave Linen Roll",
      outputLabel: "Linen Roll",
      result: { kind: "items", stacks: [{ itemId: "item.linen_roll", quantity: 1 }] },
      baseWork: 35,
      xpReward: 35,
      status: "active"
    });
    expect(sim.state.player.proficiencies.processing).toBe(xpBefore);

    const recipe = ContentRegistry.recipes.get("recipe.linen_roll")!;
    const originalName = recipe.name;
    const originalResult = recipe.result;
    try {
      recipe.name = "Future Renamed Linen";
      recipe.result = { kind: "items", stacks: [{ itemId: "item.oiled_canvas", quantity: 5 }] };
      sim.advanceGameMinutes(job.effectiveDurationMinutes);
      sim.advanceGameMinutes(10);
      expect(readyEvents).toBe(1);
      expect(completedEvents).toBe(0);
      expect(sim.state.player.proficiencies.processing).toBe(xpBefore);

      expect(sim.collectProcessingJob(job.id).success).toBe(true);
      expect(InventoryManager.getItemCount(inventory, "item.linen_roll")).toBe(1);
      expect(InventoryManager.getItemCount(inventory, "item.oiled_canvas")).toBe(0);
      expect(sim.state.player.proficiencies.processing).toBe(xpBefore + 35);
      expect(completedEvents).toBe(1);
      expect(sim.state.processingJobs[job.id]).toBeUndefined();
    } finally {
      recipe.name = originalName;
      recipe.result = originalResult;
    }
  });

  it("keeps the save envelope valid while an EquipmentCrafted listener runs", () => {
    const sim = new Simulation();
    moveToStation(sim);
    sim.state.player.proficiencies.processing = 1_000;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.linen_roll", quantity: 2 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ])).toBe(true);
    expect(sim.startProcessingJob("recipe.field_hat", "struct.workbench").success).toBe(true);
    const job = Object.values(sim.state.processingJobs)[0];

    let envelopeValid: boolean | null = null;
    sim.events.on("EquipmentCrafted", () => {
      envelopeValid = validateSaveEnvelope({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 1,
        state: sim.state
      });
    });

    sim.advanceGameMinutes(job.effectiveDurationMinutes);
    sim.advanceGameMinutes(10);
    expect(sim.collectProcessingJob(job.id).success).toBe(true);
    expect(sim.state.processingJobs[job.id]).toBeUndefined();
    expect(envelopeValid).toBe(true);
  });

  it("reserves permanent equipment uniqueness and wardrobe space at job start", () => {
    const sim = new Simulation();
    moveToStation(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    sim.state.player.proficiencies.processing = 1_000;
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.linen_roll", quantity: 2 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ])).toBe(true);
    expect(sim.startProcessingJob("recipe.field_hat", "struct.workbench").success).toBe(true);

    const secondStation = "struct.sunreach_workbench";
    moveToStation(sim, secondStation);
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.linen_roll", quantity: 2 },
      { itemId: "item.tanned_leather", quantity: 1 }
    ])).toBe(true);
    expect(sim.startProcessingJob("recipe.field_hat", secondStation)).toMatchObject({
      success: false,
      reason: "That equipment is already being made"
    });
    expect(sim.inspectCharacterEquipment().wardrobe.reserved).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import {
  FARMING_ACTION_COST,
  FARMING_ACTION_XP,
  IRRIGATION_FEATURE_ID,
  irrigationWorkForCropCount
} from "../../src/simulation/domains/FarmingDomain";
import {
  isValidProcessingJobEconomicSnapshot,
  isValidProcessingWorkXpSnapshot
} from "../../src/simulation/domains/ProcessingDomain";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { farmLocalToWorld, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { WorldLayout } from "../../src/world/WorldLayout";

function move(sim: Simulation, position: { x: number; z: number }): void {
  sim.state.player.x = position.x;
  sim.state.player.z = position.z;
  sim.state.player.y = WorldLayout.traversalSurfaceHeight(position.x, position.z) + 0.5;
}

function plant(sim: Simulation, cropId = "crop.wheat", x = 0, z = 0): string {
  const definition = ContentRegistry.crops.get(cropId)!;
  const position = farmLocalToWorld("farm.starter_garden", { x, z });
  move(sim, position);
  expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
    { itemId: definition.seedItemId, quantity: 1 }
  ])).toBe(true);
  const result = sim.plantCrop("farm.starter_garden", cropId, position.x, position.z);
  expect(result.success).toBe(true);
  return result.placedCropId!;
}

describe("production Work retuning", () => {
  it("quotes a five-Work planting refusal with recovery details and commits the old XP reward", () => {
    const sim = new Simulation();
    const position = farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 });
    move(sim, position);
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "seed.wheat", quantity: 1 }
    ]);
    sim.state.player.workCapacity.current = 4.99;
    const before = structuredClone(sim.state);
    const rngBefore = sim.rng.getState();
    expect(sim.execute({ type: "crop.plant", request: { farmId: "farm.starter_garden", cropId: "crop.wheat", x: position.x, z: position.z } }))
      .toMatchObject({ success: false, reasonCode: "insufficient-work", requiredWork: 5, availableWork: 4 });
    expect(sim.state).toEqual(before);
    expect(sim.rng.getState()).toBe(rngBefore);
    sim.state.player.workCapacity.current = 5;
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", position.x, position.z).success).toBe(true);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.player.proficiencies.farming).toBe(12);
  });

  it("waters a thirsty crop for free and cannot award repeat XP on wet soil", () => {
    const sim = new Simulation();
    const id = plant(sim);
    sim.state.player.workCapacity.current = 0;
    const xpBefore = sim.state.player.proficiencies.farming;
    let watered = 0;
    sim.events.on("CropWatered", () => { watered += 1; });
    expect(sim.inspectCrop(id)).toMatchObject({ actions: { canWater: true }, immediateAction: { kind: "water", cost: 0 } });
    expect(sim.waterCrop(id).success).toBe(true);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + 5);
    expect(sim.state.crops[id].moisture).toBe(100);
    const wetState = structuredClone(sim.state);
    expect(sim.waterCrop(id)).toMatchObject({ success: false, reasonCode: "already-wet" });
    expect(sim.state).toEqual(wetState);
    expect(watered).toBe(1);
  });

  it("harvests for ten Work while preserving the quality-adjusted XP and atomic refusal", () => {
    const sim = new Simulation();
    const id = plant(sim);
    const crop = sim.state.crops[id];
    crop.stage = "mature";
    crop.effectiveGrowthMinutes = ContentRegistry.crops.get(crop.cropId)!.baseGrowthMinutes;
    sim.state.player.workCapacity.current = 9.99;
    const before = structuredClone(sim.state);
    const rngBefore = sim.rng.getState();
    expect(sim.harvestCrop(id)).toMatchObject({ success: false, requiredWork: 10, availableWork: 9 });
    expect(sim.state).toEqual(before);
    expect(sim.rng.getState()).toBe(rngBefore);
    sim.state.player.workCapacity.current = 10;
    const xpBefore = sim.state.player.proficiencies.farming;
    const result = sim.harvestCrop(id);
    expect(result.success).toBe(true);
    expect(result.xpGained).toBeGreaterThanOrEqual(30);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + result.xpGained!);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.crops[id]).toBeUndefined();
    expect(sim.harvestCrop(id).success).toBe(false);
  });

  it("uses the same planting base cost for saplings without changing the crop gate", () => {
    const sim = new Simulation();
    sim.state.player.proficiencies.farming = ContentRegistry.crops.get("crop.apple_tree")!.minimumFarmingXp;
    const quote = sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming", "farming.plant");
    sim.state.player.workCapacity.current = quote.cost;
    const xpBefore = sim.state.player.proficiencies.farming;
    const id = plant(sim, "crop.apple_tree");
    expect(quote.baseCost).toBe(5);
    expect(sim.state.crops[id].cropId).toBe("crop.apple_tree");
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + FARMING_ACTION_XP.plant);
  });

  it("keeps living unrooting at ten Work and awards no XP or seed refund", () => {
    const sim = new Simulation();
    const id = plant(sim);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const xpBefore = sim.state.player.proficiencies.farming;
    sim.state.player.workCapacity.current = 9.99;
    expect(sim.unrootCrop(id)).toMatchObject({ success: false, requiredWork: 10 });
    expect(sim.state.crops[id]).toBeDefined();
    sim.state.player.workCapacity.current = 10;
    expect(sim.unrootCrop(id).success).toBe(true);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore);
    expect(InventoryManager.getItemCount(inventory, "seed.wheat")).toBe(0);
    expect(sim.state.crops[id]).toBeUndefined();
  });

  it("fertilizes for five Work, retaining its item cost and eight XP", () => {
    const sim = new Simulation();
    move(sim, farmLocalToWorld("farm.starter_garden", { x: 0, z: 0 }));
    const farm = sim.state.farms["farm.starter_garden"];
    farm.soil.fertility = 50;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.basic_fertilizer", quantity: 1 }]);
    sim.state.player.workCapacity.current = 4.99;
    expect(sim.applyFertilizer(farm.id)).toMatchObject({ success: false, requiredWork: 5 });
    expect(farm.soil.fertility).toBe(50);
    expect(InventoryManager.getItemCount(inventory, "item.basic_fertilizer")).toBe(1);
    sim.state.player.workCapacity.current = 5;
    const xpBefore = sim.state.player.proficiencies.farming;
    expect(sim.applyFertilizer(farm.id).success).toBe(true);
    expect(farm.soil.fertility).toBe(70);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + 8);
    expect(InventoryManager.getItemCount(inventory, "item.basic_fertilizer")).toBe(0);
  });

  it("charges the pump only for thirsty living crops and retains a free wet-field no-op", () => {
    const sim = new Simulation();
    const first = plant(sim);
    const second = plant(sim, "crop.wheat", 2, 0);
    const third = plant(sim, "crop.wheat", -2, 0);
    sim.state.crops[second].stage = "withered";
    sim.state.crops[third].moisture = 100;
    sim.state.quests.unlockedFeatureIds.push(IRRIGATION_FEATURE_ID);
    move(sim, farmWellWorldAnchor("farm.starter_garden")!);
    expect(sim.quoteIrrigationWork("farm.starter_garden")).toMatchObject({ cropCount: 1, baseCost: 6, cost: 6 });
    sim.state.crops[second].stage = "growing";
    expect(sim.quoteIrrigationWork("farm.starter_garden")).toMatchObject({ cropCount: 2, baseCost: 7, cost: 7 });
    sim.state.player.workCapacity.current = 6.99;
    const before = structuredClone(sim.state);
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" }))
      .toMatchObject({ success: false, requiredWork: 7 });
    expect(sim.state).toEqual(before);
    sim.state.player.workCapacity.current = 7;
    const xpBefore = sim.state.player.proficiencies.farming;
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" })).toMatchObject({ success: true, cost: 7 });
    expect(sim.state.crops[first].moisture).toBe(100);
    expect(sim.state.crops[second].moisture).toBe(100);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + 12);
    expect(sim.state.player.workCapacity.current).toBe(0);
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" }))
      .toMatchObject({ success: true, reasonCode: "already-wet" });
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore + 12);
    expect(irrigationWorkForCropCount(0)).toBe(0);
  });

  it.each([
    ["recipe.wheat_to_grain", "struct.starter_mill", 5, 15],
    ["recipe.craft_chum", "struct.workbench", 7, 25],
    ["recipe.linen_roll", "struct.workbench", 10, 35],
    ["recipe.copper_rose_can", "struct.workbench", 20, 70]
  ] as const)("captures the retuned Work and unchanged XP for %s and preserves old paid jobs", (recipeId, stationId, baseWork, xpReward) => {
    const sim = new Simulation();
    sim.state.player.proficiencies.processing = 100_000;
    const recipe = ContentRegistry.recipes.get(recipeId)!;
    const station = sim.state.world.structures[stationId];
    move(sim, getProcessingStationFrontPosition(stationId, station)!);
    expect(InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], recipe.inputs)).toBe(true);
    const quoted = sim.quoteWorkCost(baseWork, "processing", "processing.start");
    const workBefore = sim.state.player.workCapacity.current;
    expect(sim.startProcessingJob(recipeId, stationId)).toMatchObject({ success: true, cost: quoted.cost });
    const job = Object.values(sim.state.processingJobs)[0];
    expect(job).toMatchObject({ baseWork, chargedWork: quoted.cost, xpReward });
    expect(sim.state.player.workCapacity.current).toBe(workBefore - quoted.cost);
    expect(isValidProcessingJobEconomicSnapshot(job)).toBe(true);
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: sim.state })).toBe(true);
    expect(isValidProcessingWorkXpSnapshot(job.workTier, baseWork + 1, xpReward)).toBe(false);
    expect(isValidProcessingWorkXpSnapshot(job.workTier, baseWork, xpReward + 1)).toBe(false);

    // A pre-retune job promised the same XP but captured the former Work cost.
    job.baseWork = xpReward;
    job.chargedWork = xpReward;
    const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const resumed = new Simulation(envelope.state);
    const resumedJob = resumed.state.processingJobs[job.id];
    expect(resumedJob).toEqual(job);
    resumed.advanceGameMinutes(resumedJob.effectiveDurationMinutes);
    const xpBefore = resumed.state.player.proficiencies.processing;
    const resumedWork = resumed.state.player.workCapacity.current;
    expect(resumed.collectProcessingJob(job.id)).toMatchObject({ success: true, xpGained: xpReward });
    expect(resumed.state.player.proficiencies.processing).toBe(xpBefore + xpReward);
    expect(resumed.state.player.workCapacity.current).toBe(resumedWork);
  });
});

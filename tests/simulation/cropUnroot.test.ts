import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { STARTER_FARM_LAYOUT, farmLocalToWorld } from "../../src/world/FarmLayout";
import { FARMING_ACTION_COST } from "../../src/simulation/domains/FarmingDomain";
import type { DomainEvents } from "../../src/simulation/core/EventBus";

type CropUnrootEvent = DomainEvents["CropUnrooted"];

const FARM_ID = "farm.starter_garden";

const movePlayerToCrop = (sim: Simulation, placedCropId: string): void => {
  const crop = sim.state.crops[placedCropId];
  if (!crop) throw new Error("Missing placed crop");
  const world = farmLocalToWorld(crop.farmId, crop);
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
};

describe("crop unroot", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
  });

  it("removes a growing annual for Work with no XP, yield or seed refund", () => {
    const plant = sim.plantCrop(FARM_ID, "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
    expect(plant.success).toBe(true);
    const placedCropId = plant.placedCropId!;
    movePlayerToCrop(sim, placedCropId);

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const seedItemId = "seed.wheat";
    const seedsBefore = InventoryManager.getItemCount(inventory, seedItemId);
    const produceBefore = InventoryManager.getItemCount(inventory, "produce.wheat");
    const xpBefore = sim.state.player.proficiencies.farming;
    const workBefore = sim.state.player.workCapacity.current;
    const quote = sim.quoteWorkCost(FARMING_ACTION_COST.unroot, "farming", "farming.unroot");

    const result = sim.execute({ type: "crop.unroot", placedCropId });

    expect(result.success).toBe(true);
    expect(sim.state.crops[placedCropId]).toBeUndefined();
    expect(sim.state.farms[FARM_ID].placedCropIds).not.toContain(placedCropId);
    expect(sim.state.player.workCapacity.current).toBe(workBefore - quote.cost);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore);
    expect(InventoryManager.getItemCount(inventory, seedItemId)).toBe(seedsBefore);
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(produceBefore);
  });

  it("frees a perennial tree's farm slot and emits CropUnrooted", () => {
    sim.state.player.proficiencies.farming = 10_000;
    InventoryManager.addItemsAtomically(
      sim.state.inventories[sim.state.player.inventoryId],
      [{ itemId: "seed.apple_sapling", quantity: 1 }]
    );
    expect(sim.execute({ type: "crop.plant-near", farmId: FARM_ID, cropId: "crop.apple_tree" }).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    movePlayerToCrop(sim, placedCropId);
    expect(sim.state.farms[FARM_ID].placedCropIds).toContain(placedCropId);

    const events: CropUnrootEvent[] = [];
    sim.events.on("CropUnrooted", (event) => events.push(event));
    const result = sim.unrootCrop(placedCropId);

    expect(result.success).toBe(true);
    expect(sim.state.crops[placedCropId]).toBeUndefined();
    expect(sim.state.farms[FARM_ID].placedCropIds).not.toContain(placedCropId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      placedCropId,
      cropId: "crop.apple_tree",
      farmId: FARM_ID
    });
  });

  it("refuses a withered plot so clearing stays free", () => {
    expect(sim.plantCrop(FARM_ID, "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    movePlayerToCrop(sim, placedCropId);
    sim.state.crops[placedCropId].stage = "withered";
    const workBefore = sim.state.player.workCapacity.current;

    const result = sim.execute({ type: "crop.unroot", placedCropId });

    expect(result.success).toBe(false);
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    expect(sim.state.crops[placedCropId]).toBeDefined();
    expect(sim.harvestCrop(placedCropId).success).toBe(true);
  });

  it("refuses out of reach, mounted and carried-cargo states without spending Work", () => {
    expect(sim.plantCrop(FARM_ID, "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    const crop = sim.state.crops[placedCropId];
    const world = farmLocalToWorld(crop.farmId, crop);
    sim.state.player.x = world.x + 20;
    sim.state.player.z = world.z;
    const workBefore = sim.state.player.workCapacity.current;

    expect(sim.unrootCrop(placedCropId).success).toBe(false);
    expect(sim.state.player.workCapacity.current).toBe(workBefore);

    movePlayerToCrop(sim, placedCropId);
    sim.state.player.activeMountId = "mount.player_donkey";
    expect(sim.inspectCrop(placedCropId)).toBeNull();
    expect(sim.unrootCrop(placedCropId).success).toBe(false);
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    sim.state.player.activeMountId = null;

    sim.state.player.activeBoatId = "boat.player_rowboat";
    const afloat = sim.unrootCrop(placedCropId);
    expect(afloat.success).toBe(false);
    expect(afloat.reason).toContain("ashore");
    expect(sim.inspectCrop(placedCropId)?.actions).toMatchObject({
      canUnroot: false,
      unrootReason: "Step ashore before unrooting"
    });
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    sim.state.player.activeBoatId = null;

    sim.state.player.carriedFishCargoId = "fish_cargo.test";
    expect(sim.unrootCrop(placedCropId).success).toBe(false);
    expect(sim.state.player.workCapacity.current).toBe(workBefore);
    expect(sim.state.crops[placedCropId]).toBeDefined();
  });

  it("refuses insufficient Work and leaves the planting intact", () => {
    expect(sim.plantCrop(FARM_ID, "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    movePlayerToCrop(sim, placedCropId);
    sim.state.player.workCapacity.current = 1;

    const result = sim.unrootCrop(placedCropId);

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe("insufficient-work");
    expect(sim.state.player.workCapacity.current).toBe(1);
    expect(sim.state.crops[placedCropId]).toBeDefined();
  });

  it("exposes the unroot quote and blockers through crop inspection", () => {
    expect(sim.plantCrop(FARM_ID, "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    movePlayerToCrop(sim, placedCropId);

    const inspection = sim.inspectCrop(placedCropId);
    expect(inspection?.unrootWork.cost).toBe(sim.quoteWorkCost(FARMING_ACTION_COST.unroot, "farming", "farming.unroot").cost);
    expect(inspection?.actions.canUnroot).toBe(true);
    expect(inspection?.actions.unrootReason).toBeUndefined();

    sim.state.player.workCapacity.current = 0;
    const short = sim.inspectCrop(placedCropId);
    expect(short?.actions.canUnroot).toBe(false);
    expect(short?.actions.unrootReason).toContain("Need");
  });
});

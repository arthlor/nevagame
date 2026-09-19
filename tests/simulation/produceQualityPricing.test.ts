import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CROP_QUALITY_PRICE_MULTIPLIER } from "../../src/simulation/economy/marketPricing";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import type { CropQuality, ItemId } from "../../src/simulation/core/types";

const WHEAT: ItemId = "produce.wheat";

function atVillage(sim: Simulation): void {
  sim.state.player.x = VILLAGE_MARKET.position.x;
  sim.state.player.z = VILLAGE_MARKET.position.z;
}

/** Centered commodity keeps demand at its deterministic baseline for the run. */
function centerCommodity(sim: Simulation, marketId: "market.village" | "market.harbor", itemId: ItemId): void {
  const commodity = sim.state.markets[marketId].commodities[itemId];
  commodity.localSupply = commodity.targetSupply;
  commodity.seasonalModifier = 1;
}

function seedLot(sim: Simulation, itemId: ItemId, quantity: number, quality?: CropQuality): void {
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  const stack = quality === undefined
    ? { itemId, quantity }
    : { itemId, quantity, quality };
  expect(InventoryManager.addItemsAtomically(inventory, [stack])).toBe(true);
}

function matureCrop(sim: Simulation, cropId: string): string {
  const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: 0, z: 0 });
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
  expect(sim.plantCrop("farm.starter_garden", cropId, world.x, world.z).success).toBe(true);
  const placed = Object.values(sim.state.crops).find((crop) => crop.cropId === cropId)!;
  const definition = ContentRegistry.crops.get(cropId)!;
  placed.effectiveGrowthMinutes = definition.baseGrowthMinutes;
  placed.stage = "mature";
  return placed.id;
}

describe("graded produce lots", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("keeps different grades in separate lots and merges only matching grades", () => {
    const sim = new Simulation();
    seedLot(sim, WHEAT, 3, "common");
    seedLot(sim, WHEAT, 2, "fine");
    seedLot(sim, WHEAT, 1, "common");
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.getItemCount(inventory, WHEAT)).toBe(6);
    expect(InventoryManager.getItemLotCount(inventory, WHEAT, "common")).toBe(4);
    expect(InventoryManager.getItemLotCount(inventory, WHEAT, "fine")).toBe(2);
    expect(InventoryManager.getItemLots(inventory, WHEAT)).toEqual([
      { quality: "common", quantity: 4 },
      { quality: "fine", quantity: 2 }
    ]);
  });

  it("stores the crop's computed grade on the harvested lot", () => {
    const sim = new Simulation();
    const placedCropId = matureCrop(sim, "crop.wheat");
    const crop = sim.state.crops[placedCropId];
    crop.moisture = 100;
    crop.averageMoistureAccum = 100;
    crop.moistureSampleCount = 1;
    crop.health = 100;
    sim.state.farms[crop.farmId].soil.fertility = 100;
    sim.state.player.proficiencies.farming = 100_000;
    sim.state.player.workCapacity.current = 100;

    const result = sim.harvestCrop(placedCropId);
    expect(result.success).toBe(true);
    expect(result.quality).toBe("prize");
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.getItemLotCount(inventory, WHEAT, "prize")).toBe(result.yield);
  });

  it("prices a Prize lot above a Common lot at the same market and hour", () => {
    const common = new Simulation();
    const prize = new Simulation();
    for (const sim of [common, prize]) {
      atVillage(sim);
      centerCommodity(sim, "market.village", WHEAT);
    }
    seedLot(common, WHEAT, 5, "common");
    seedLot(prize, WHEAT, 5, "prize");

    const commonQuote = common.inspectCommodityAtMarket("market.village", WHEAT, "sell", 1);
    const prizeQuote = prize.inspectCommodityAtMarket("market.village", WHEAT, "sell", 1);
    expect(commonQuote.unitPrice).toBe(commonQuote.totalPrice);
    expect(prizeQuote.unitPrice).toBe(prizeQuote.totalPrice);
    expect(prizeQuote.unitPrice!).toBeGreaterThan(commonQuote.unitPrice!);
    expect(prizeQuote.qualityBreakdown).toEqual([
      { quality: "prize", quantity: 1, unitPrice: prizeQuote.unitPrice, subtotal: prizeQuote.unitPrice }
    ]);
  });

  it("quotes a mixed sale as the exact sum of its graded one-unit fills", () => {
    const sim = new Simulation();
    atVillage(sim);
    centerCommodity(sim, "market.village", WHEAT);
    seedLot(sim, WHEAT, 3, "common");
    seedLot(sim, WHEAT, 2, "prize");

    const whole = sim.inspectCommodityAtMarket("market.village", WHEAT, "sell", 5);
    expect(whole.success).toBe(true);
    expect(whole.qualityBreakdown?.map((line) => [line.quality, line.quantity])).toEqual([
      ["prize", 2],
      ["common", 3]
    ]);

    const moneyBefore = sim.state.player.money;
    expect(sim.sellItemAtMarket("market.village", WHEAT, 2, "prize").success).toBe(true);
    expect(sim.sellItemAtMarket("market.village", WHEAT, 3, "common").success).toBe(true);
    expect(sim.state.player.money - moneyBefore).toBe(whole.totalPrice);
  });

  it("pays the quoted total and removes exactly the graded lots it priced", () => {
    const sim = new Simulation();
    atVillage(sim);
    centerCommodity(sim, "market.village", WHEAT);
    seedLot(sim, WHEAT, 4, "common");
    seedLot(sim, WHEAT, 3, "exceptional");
    const inventory = sim.state.inventories[sim.state.player.inventoryId];

    const quote = sim.inspectCommodityAtMarket("market.village", WHEAT, "sell", 7);
    const moneyBefore = sim.state.player.money;
    expect(sim.sellItemAtMarket("market.village", WHEAT, 7).success).toBe(true);
    expect(sim.state.player.money - moneyBefore).toBe(quote.totalPrice);
    expect(InventoryManager.getItemCount(inventory, WHEAT)).toBe(0);
  });

  it("prices bulk produce across grades and matches the committed sale", () => {
    const sim = new Simulation();
    atVillage(sim);
    centerCommodity(sim, "market.village", WHEAT);
    seedLot(sim, WHEAT, 3, "fine");
    seedLot(sim, WHEAT, 2, "common");

    const quote = sim.inspectBulkProduceAtMarket("market.village");
    expect(quote.success).toBe(true);
    expect(quote.quantity).toBe(5);
    expect(quote.lines?.map((line) => [line.quality, line.quantity])).toEqual([
      ["fine", 3],
      ["common", 2]
    ]);
    expect(quote.lines?.reduce((sum, line) => sum + line.revenue, 0)).toBe(quote.revenue);

    const moneyBefore = sim.state.player.money;
    expect(sim.execute({ type: "market.sell-produce-bulk", marketId: "market.village" }).success).toBe(true);
    expect(sim.state.player.money - moneyBefore).toBe(quote.revenue);
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], WHEAT)).toBe(0);
  });

  it("spends the lowest grade first when an ungraded request consumes produce", () => {
    const sim = new Simulation();
    seedLot(sim, WHEAT, 2, "common");
    seedLot(sim, WHEAT, 3, "prize");
    const inventory = sim.state.inventories[sim.state.player.inventoryId];

    expect(InventoryManager.removeItemsAtomically(inventory, [{ itemId: WHEAT, quantity: 2 }])).toBe(true);
    expect(InventoryManager.getItemLotCount(inventory, WHEAT, "prize")).toBe(3);
    expect(InventoryManager.getItemLotCount(inventory, WHEAT, "common")).toBe(0);
  });

  it("keeps the grade ladder monotonic so a higher grade can never quote lower", () => {
    const multipliers = Object.values(CROP_QUALITY_PRICE_MULTIPLIER);
    expect(multipliers[0]).toBe(1);
    for (let index = 1; index < multipliers.length; index += 1) {
      expect(multipliers[index]).toBeGreaterThan(multipliers[index - 1]);
    }
  });
});

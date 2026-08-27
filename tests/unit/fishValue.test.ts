// tests/unit/fishValue.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { calculateFishPrice } from "../../src/simulation/economy/calculateFishValue";
import { calculateCommodityUnitPrice } from "../../src/simulation/economy/calculateCommodityValue";
import { advanceCargoFreshness, calculateFreshnessLoss, getFreshnessPriceMultiplier } from "../../src/simulation/fishing/calculateFreshness";
import { calculateCatchSummaryHarborEstimate } from "../../src/ui/components/CatchInspectionModal";
import { FISH_SPECIES } from "../../src/content/fish";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";

describe("Fish Value & Freshness Calculations", () => {
  beforeEach(() => {
    ContentRegistry.initializeAndValidate();
  });

  const tuna = FISH_SPECIES["fish.tuna"];

  it("decays freshness slower in boat hold with ice", () => {
    const lossOpen = calculateFreshnessLoss(60, tuna.baseDecayRatePerMinute, "player", false, 20);
    const lossHold = calculateFreshnessLoss(60, tuna.baseDecayRatePerMinute, "boat-hold", false, 20);
    const lossIce = calculateFreshnessLoss(60, tuna.baseDecayRatePerMinute, "boat-hold", true, 20);

    expect(lossIce).toBeLessThan(lossHold);
    expect(lossHold).toBeLessThan(lossOpen);
  });

  it("centralizes commodity unit pricing with the same demand and seasonal clamps as market sales", () => {
    expect(
      calculateCommodityUnitPrice({
        itemId: "produce.wheat",
        basePrice: 8,
        demandIndex: 2,
        localSupply: 0,
        targetSupply: 1,
        consumptionRate: 1,
        seasonalModifier: 1.2,
        lastTickMinute: 0,
        recentSalesVolume: 0
      })
    ).toMatchObject({ demandPercent: 160, unitPrice: 15 });
  });

  it("applies freshness price brackets correctly", () => {
    expect(getFreshnessPriceMultiplier(100)).toBe(1.0);
    expect(getFreshnessPriceMultiplier(80)).toBe(0.95);
    expect(getFreshnessPriceMultiplier(60)).toBe(0.8);
    expect(getFreshnessPriceMultiplier(30)).toBe(0.55);
    expect(getFreshnessPriceMultiplier(10)).toBe(0.3);
    expect(getFreshnessPriceMultiplier(0)).toBe(0.0);
  });

  it("calculates detailed price breakdown", () => {
    const breakdown = calculateFishPrice(tuna, 35.0, "fine", 95, 1.15, 1.0);

    expect(breakdown.speciesBasePrice).toBe(tuna.baseMarketValue);
    expect(breakdown.qualityModifier).toBe(1.25);
    expect(breakdown.freshnessModifier).toBe(1.0);
    expect(breakdown.demandPercent).toBe(115);
    expect(breakdown.finalPrice).toBeGreaterThan(tuna.baseMarketValue);
  });

  it("uses harbor demand and season for the landed-catch estimate", () => {
    const state = createInitialGameState();
    const commodity = state.markets["market.harbor"].commodities[tuna.id];
    const cargo = {
      id: "cargo.summary-test",
      speciesId: tuna.id,
      weightKg: 35,
      quality: "fine" as const,
      caughtAtMinute: 0,
      freshness: 95,
      cargoClass: "medium" as const,
      location: { type: "player" as const, containerId: "player" }
    };

    expect(calculateCatchSummaryHarborEstimate(cargo, state.markets["market.harbor"])).toBe(
      calculateFishPrice(
        tuna,
        cargo.weightKg,
        cargo.quality,
        cargo.freshness,
        commodity.demandIndex,
        commodity.seasonalModifier
      ).finalPrice
    );
  });

  it("consumes loose crushed ice after the storage hour it preserves", () => {
    const state = createInitialGameState();
    const inventory = state.inventories[state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.crushed_ice", quantity: 1 }]);
    state.fishCargo["cargo.test"] = {
      id: "cargo.test",
      speciesId: "fish.tuna",
      weightKg: 35,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 100,
      cargoClass: "medium",
      location: { type: "player", containerId: "player" }
    };
    state.player.carriedFishCargoId = "cargo.test";

    advanceCargoFreshness(state, 60, state.clock.currentMinute, 20);
    expect(InventoryManager.getItemCount(inventory, "item.crushed_ice")).toBe(0);
    expect(state.fishCargo["cargo.test"].freshness).toBeCloseTo(
      100 - calculateFreshnessLoss(60, tuna.baseDecayRatePerMinute, "player", true, 20)
    );

    const freshnessAfterIcedHour = state.fishCargo["cargo.test"].freshness;
    advanceCargoFreshness(state, 60, state.clock.currentMinute + 60, 20);
    expect(state.fishCargo["cargo.test"].freshness).toBeLessThan(freshnessAfterIcedHour);
  });
});

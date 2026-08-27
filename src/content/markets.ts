// src/content/markets.ts

import { MarketDefinition } from "./types";
import { VILLAGE_MARKET } from "../world/WorldAnchors";
import { WorldLayout } from "../world/WorldLayout";

export const MARKETS: Record<string, MarketDefinition> = {
  "market.village": {
    id: "market.village",
    name: "Village Produce Market",
    regionId: "region.village",
    description: "The bustling center of agriculture and daily staples. Trades in grain, root vegetables, orchard fruits, and basic crafting materials.",
    interactionPosition: {
      x: VILLAGE_MARKET.position.x,
      z: VILLAGE_MARKET.position.z,
      radiusMeters: VILLAGE_MARKET.radiusMeters
    },
    commodities: [
      { itemId: "produce.wheat", basePrice: 8, targetSupply: 50, consumptionRatePerHour: 4, seasonalFactors: { autumn: 0.9, winter: 1.2 } },
      { itemId: "produce.barley", basePrice: 10, targetSupply: 40, consumptionRatePerHour: 3, seasonalFactors: { autumn: 0.9, winter: 1.2 } },
      { itemId: "produce.corn", basePrice: 14, targetSupply: 30, consumptionRatePerHour: 2.5, seasonalFactors: { summer: 0.85, winter: 1.3 } },
      { itemId: "produce.tomato", basePrice: 12, targetSupply: 35, consumptionRatePerHour: 3, seasonalFactors: { summer: 0.8, winter: 1.4 } },
      { itemId: "produce.potato", basePrice: 11, targetSupply: 60, consumptionRatePerHour: 5, seasonalFactors: { winter: 1.1, spring: 1.15 } },
      { itemId: "produce.carrot", basePrice: 9, targetSupply: 45, consumptionRatePerHour: 4, seasonalFactors: { winter: 1.1, autumn: 0.9 } },
      { itemId: "produce.flax", basePrice: 16, targetSupply: 25, consumptionRatePerHour: 2, seasonalFactors: { spring: 1.1, summer: 1.0 } },
      { itemId: "produce.apple", basePrice: 15, targetSupply: 30, consumptionRatePerHour: 2.5, seasonalFactors: { autumn: 0.8, spring: 1.3 } },
      { itemId: "item.bait_worms", basePrice: 5, targetSupply: 80, consumptionRatePerHour: 6, seasonalFactors: {} },
      { itemId: "item.basic_fertilizer", basePrice: 18, targetSupply: 20, consumptionRatePerHour: 1.5, seasonalFactors: { spring: 1.25 } }
    ]
  },
  "market.harbor": {
    id: "market.harbor",
    name: "Harbor Fish Market & Wholesaler",
    regionId: "region.harbor",
    description: "Where coastal vessels dock to unload their fresh catch. Premium prices paid for high-freshness pelagic and deep-sea game fish.",
    interactionPosition: {
      x: WorldLayout.landmark("fish-market").x,
      z: WorldLayout.landmark("fish-market").z,
      radiusMeters: 7
    },
    commodities: [
      { itemId: "fish.carp", basePrice: 35, targetSupply: 20, consumptionRatePerHour: 1.5, seasonalFactors: { spring: 1.1 } },
      { itemId: "fish.trout", basePrice: 50, targetSupply: 15, consumptionRatePerHour: 1.2, seasonalFactors: { winter: 1.2 } },
      { itemId: "fish.perch", basePrice: 15, targetSupply: 40, consumptionRatePerHour: 3.0, seasonalFactors: {} },
      { itemId: "fish.catfish", basePrice: 75, targetSupply: 10, consumptionRatePerHour: 0.8, seasonalFactors: { summer: 1.15 } },
      { itemId: "fish.pike", basePrice: 90, targetSupply: 8, consumptionRatePerHour: 0.6, seasonalFactors: { autumn: 1.2 } },
      { itemId: "fish.arowana", basePrice: 220, targetSupply: 3, consumptionRatePerHour: 0.2, seasonalFactors: { summer: 1.3 } },
      { itemId: "fish.mackerel", basePrice: 18, targetSupply: 50, consumptionRatePerHour: 4.0, seasonalFactors: { summer: 0.9, winter: 1.25 } },
      { itemId: "fish.tuna", basePrice: 160, targetSupply: 8, consumptionRatePerHour: 0.8, seasonalFactors: { summer: 1.2, autumn: 1.1 } },
      { itemId: "fish.sturgeon", basePrice: 240, targetSupply: 4, consumptionRatePerHour: 0.3, seasonalFactors: { winter: 1.3 } },
      { itemId: "fish.sailfish", basePrice: 280, targetSupply: 3, consumptionRatePerHour: 0.25, seasonalFactors: { summer: 1.25 } },
      { itemId: "fish.swordfish", basePrice: 340, targetSupply: 2, consumptionRatePerHour: 0.15, seasonalFactors: { autumn: 1.3, winter: 1.2 } },
      { itemId: "fish.blue_marlin", basePrice: 480, targetSupply: 1, consumptionRatePerHour: 0.1, seasonalFactors: { summer: 1.35 } },
      { itemId: "item.chum_bucket", basePrice: 25, targetSupply: 30, consumptionRatePerHour: 2.0, seasonalFactors: {} },
      { itemId: "item.crushed_ice", basePrice: 15, targetSupply: 50, consumptionRatePerHour: 3.5, seasonalFactors: { summer: 1.3 } },
      { itemId: "item.boat_fuel", basePrice: 30, targetSupply: 40, consumptionRatePerHour: 2.5, seasonalFactors: {} },
      { itemId: "item.bait_worms", basePrice: 5, targetSupply: 80, consumptionRatePerHour: 4.0, seasonalFactors: {} }
    ]
  }
};

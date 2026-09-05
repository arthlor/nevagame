// src/content/markets.ts

import { MarketDefinition } from "./types";
import { VILLAGE_MARKET } from "../world/WorldAnchors";
import { WorldLayout } from "../world/WorldLayout";
import { WORLD_MARKET_LOCATIONS } from "../world/WorldGameplayLocations";

/**
 * Every crop the village stall stocks. Access is paced by each crop's own
 * `minimumFarmingXp`, which `MarketDomain.buySeed` already enforces — this list
 * only decides what exists in the shop at all. Corn and the apple sapling were
 * previously absent here and had no other source, so `crop.corn` and
 * `crop.apple_tree` (the game's only orchard/perennial loop) were unplantable.
 */
export const VILLAGE_SEED_CROP_IDS = [
  "crop.wheat",
  "crop.tomato",
  "crop.potato",
  "crop.barley",
  "crop.carrot",
  "crop.corn",
  "crop.flax",
  "crop.apple_tree"
] as const;

export function isVillageSeedCrop(cropId: string): boolean {
  return (VILLAGE_SEED_CROP_IDS as readonly string[]).includes(cropId);
}

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
    retail: {
      seedCropIds: [...VILLAGE_SEED_CROP_IDS],
      itemIds: ["item.basic_fertilizer", "item.compost_starter"]
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
      { itemId: "produce.olive", basePrice: 22, targetSupply: 18, consumptionRatePerHour: 1.6, seasonalFactors: { winter: 1.2, spring: 1.1 } },
      { itemId: "item.bait_worms", basePrice: 5, targetSupply: 80, consumptionRatePerHour: 6, seasonalFactors: {} },
      { itemId: "item.basic_fertilizer", basePrice: 18, targetSupply: 20, consumptionRatePerHour: 1.5, seasonalFactors: { spring: 1.25 } },
      { itemId: "item.compost_starter", basePrice: 10, targetSupply: 30, consumptionRatePerHour: 2.0, seasonalFactors: {} },
      // Milled grain and cut plant matter had no sell venue anywhere, so
      // every surplus one was dead weight. The village mills and composts.
      { itemId: "item.ground_grain", basePrice: 12, targetSupply: 45, consumptionRatePerHour: 3.0, seasonalFactors: { autumn: 0.9, winter: 1.2 } },
      { itemId: "item.plant_matter", basePrice: 2, targetSupply: 90, consumptionRatePerHour: 6.0, seasonalFactors: { spring: 1.1 } },
      // The Sunreach route pays here: cured fish keeps, so distance stops
      // being a freshness problem and starts being a trade.
      { itemId: "item.salt_cured_fish", basePrice: 34, targetSupply: 20, consumptionRatePerHour: 2.2, seasonalFactors: { winter: 1.25, summer: 0.9 } }
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
    retail: {
      itemIds: ["item.crushed_ice", "item.chum_bucket", "item.boat_fuel", "item.bait_worms"],
      rodIds: ["rod.river", "rod.heavy_sport", "rod.offshore", "rod.master"]
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
      // Specialty chums are workbench craft, but a surplus still sells where chum is used.
      { itemId: "item.chum_rich", basePrice: 40, targetSupply: 15, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      { itemId: "item.chum_deep", basePrice: 45, targetSupply: 12, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      { itemId: "item.crushed_ice", basePrice: 15, targetSupply: 50, consumptionRatePerHour: 3.5, seasonalFactors: { summer: 1.3 } },
      { itemId: "item.boat_fuel", basePrice: 30, targetSupply: 40, consumptionRatePerHour: 2.5, seasonalFactors: {} },
      { itemId: "item.bait_worms", basePrice: 5, targetSupply: 80, consumptionRatePerHour: 4.0, seasonalFactors: {} },
      // Scraps and crafted lures were likewise unsellable; the harbor is
      // where both are actually used.
      { itemId: "item.fish_scraps", basePrice: 4, targetSupply: 70, consumptionRatePerHour: 5.0, seasonalFactors: {} },
      { itemId: "item.basic_lure", basePrice: 20, targetSupply: 25, consumptionRatePerHour: 1.5, seasonalFactors: { summer: 1.1 } }
    ]
  },
  "market.sunreach_cove": {
    id: "market.sunreach_cove",
    name: "Sunreach Cove Market",
    regionId: "region.sunreach_cove",
    description: "A compact cove market trading terrace harvests, reef catch, and voyage supplies.",
    interactionPosition: {
      x: WORLD_MARKET_LOCATIONS["market.sunreach_cove"].position.x,
      z: WORLD_MARKET_LOCATIONS["market.sunreach_cove"].position.z,
      radiusMeters: WORLD_MARKET_LOCATIONS["market.sunreach_cove"].radiusMeters
    },
    retail: {
      seedCropIds: ["crop.sunflower", "crop.olive_tree"],
      itemIds: ["item.bait_worms", "item.crushed_ice", "item.boat_fuel"]
    },
    commodities: [
      { itemId: "seed.sunflower", basePrice: 7, targetSupply: 40, consumptionRatePerHour: 2.5, seasonalFactors: { spring: 1.05 } },
      { itemId: "seed.olive_sapling", basePrice: 55, targetSupply: 12, consumptionRatePerHour: 0.5, seasonalFactors: { autumn: 0.95 } },
      { itemId: "produce.sunflower_seed", basePrice: 13, targetSupply: 35, consumptionRatePerHour: 2.5, seasonalFactors: { summer: 0.9, winter: 1.25 } },
      { itemId: "produce.olive", basePrice: 22, targetSupply: 28, consumptionRatePerHour: 2.0, seasonalFactors: { autumn: 0.9, spring: 1.15 } },
      { itemId: "produce.tomato", basePrice: 12, targetSupply: 28, consumptionRatePerHour: 2.2, seasonalFactors: { summer: 0.8, winter: 1.4 } },
      { itemId: "produce.corn", basePrice: 14, targetSupply: 24, consumptionRatePerHour: 1.8, seasonalFactors: { summer: 0.85, winter: 1.3 } },
      { itemId: "fish.sardine", basePrice: 12, targetSupply: 60, consumptionRatePerHour: 5.0, seasonalFactors: {} },
      { itemId: "fish.sea_bream", basePrice: 55, targetSupply: 20, consumptionRatePerHour: 1.5, seasonalFactors: { summer: 1.05 } },
      { itemId: "fish.amberjack", basePrice: 175, targetSupply: 6, consumptionRatePerHour: 0.45, seasonalFactors: { summer: 1.2, autumn: 1.1 } },
      { itemId: "item.bait_worms", basePrice: 5, targetSupply: 80, consumptionRatePerHour: 4.0, seasonalFactors: {} },
      { itemId: "item.crushed_ice", basePrice: 15, targetSupply: 55, consumptionRatePerHour: 3.5, seasonalFactors: { summer: 1.3 } },
      { itemId: "item.boat_fuel", basePrice: 30, targetSupply: 55, consumptionRatePerHour: 2.5, seasonalFactors: {} },
      // Warm-water pelagics now range into Sunreach, so the cove scales buy them.
      { itemId: "fish.tuna", basePrice: 160, targetSupply: 7, consumptionRatePerHour: 0.7, seasonalFactors: { summer: 1.2, autumn: 1.1 } },
      { itemId: "fish.sailfish", basePrice: 280, targetSupply: 3, consumptionRatePerHour: 0.25, seasonalFactors: { summer: 1.25 } },
      // Same base price as the village by the cross-market rule; the cove is
      // simply a thinner, better-supplied market for it, so carrying cured
      // fish across the channel is what pays rather than a price gap.
      { itemId: "item.salt_cured_fish", basePrice: 34, targetSupply: 34, consumptionRatePerHour: 0.9, seasonalFactors: {} }
    ]
  }
};

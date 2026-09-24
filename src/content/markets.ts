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

/**
 * Stable starter trade center for onboarding and legacy callers. Market sale
 * capability is owned by each definition's acceptsFishTradePacks flag.
 */
export const FISH_TRADE_CENTER_MARKET_ID = "market.village" as const;

/** One content capability shared by market commands and their callers. */
export function marketAcceptsFishTradePacks(marketId: string | null): boolean {
  return marketId !== null && MARKETS[marketId]?.acceptsFishTradePacks === true;
}

export const MARKETS: Record<string, MarketDefinition> = {
  "market.village": {
    id: "market.village",
    name: "Village Produce Market",
    acceptsFishTradePacks: true,
    regionId: "region.village",
    description: "The bustling trade center for agriculture and daily staples. It also buys hand-carried fish trade packs brought inland from the boats.",
    interactionPosition: {
      x: VILLAGE_MARKET.position.x,
      z: VILLAGE_MARKET.position.z,
      radiusMeters: VILLAGE_MARKET.radiusMeters
    },
    retail: {
      seedCropIds: [...VILLAGE_SEED_CROP_IDS],
      itemIds: [
        "item.basic_fertilizer",
        "item.compost_starter",
        "produce.flax",
        "item.hardwood_blank",
        "item.tanned_leather",
        "item.tool_steel",
        "item.linen_roll"
      ],
      workshopSupplyItemIds: ["produce.flax", "item.linen_roll"]
    },
    commodities: [
      { itemId: "seed.wheat", basePrice: 4, targetSupply: 60, consumptionRatePerHour: 6, seasonalFactors: {} },
      { itemId: "seed.barley", basePrice: 6, targetSupply: 45, consumptionRatePerHour: 4, seasonalFactors: {} },
      { itemId: "seed.corn", basePrice: 8, targetSupply: 35, consumptionRatePerHour: 3, seasonalFactors: {} },
      { itemId: "seed.tomato", basePrice: 8, targetSupply: 45, consumptionRatePerHour: 4, seasonalFactors: {} },
      { itemId: "seed.potato", basePrice: 6, targetSupply: 55, consumptionRatePerHour: 5, seasonalFactors: {} },
      { itemId: "seed.carrot", basePrice: 5, targetSupply: 45, consumptionRatePerHour: 4, seasonalFactors: {} },
      { itemId: "seed.flax", basePrice: 10, targetSupply: 30, consumptionRatePerHour: 3, seasonalFactors: {} },
      { itemId: "seed.apple_sapling", basePrice: 45, targetSupply: 12, consumptionRatePerHour: 1, seasonalFactors: {} },
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
      { itemId: "item.hardwood_blank", basePrice: 24, targetSupply: 30, consumptionRatePerHour: 2.0, seasonalFactors: {} },
      { itemId: "item.tanned_leather", basePrice: 32, targetSupply: 24, consumptionRatePerHour: 1.5, seasonalFactors: {} },
      { itemId: "item.tool_steel", basePrice: 45, targetSupply: 18, consumptionRatePerHour: 0.8, seasonalFactors: {} },
      { itemId: "item.linen_roll", basePrice: 55, targetSupply: 18, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      // The Sunreach route pays here: cured fish keeps, so distance stops
      // being a freshness problem and starts being a trade.
      { itemId: "item.salt_cured_fish", basePrice: 34, targetSupply: 20, consumptionRatePerHour: 2.2, seasonalFactors: { winter: 1.25, summer: 0.9 } },
      // Cooked provisions. They restore Work when eaten and can be sold as a
      // fallback, so a surplus is never dead weight in a finite satchel.
      { itemId: "item.meal_harvest_bowl", basePrice: 28, targetSupply: 12, consumptionRatePerHour: 1.2, seasonalFactors: {} },
      { itemId: "item.meal_fish_stew", basePrice: 42, targetSupply: 10, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      { itemId: "item.meal_orchard_tart", basePrice: 36, targetSupply: 10, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      // Physical sport/basic catches use the manual trade-pack lane here and
      // at the regional village counters; the harbor keeps its supply role.
      { itemId: "fish.trout", basePrice: 50, targetSupply: 15, consumptionRatePerHour: 1.2, seasonalFactors: { winter: 1.2 } },
      { itemId: "fish.catfish", basePrice: 75, targetSupply: 10, consumptionRatePerHour: 0.8, seasonalFactors: { summer: 1.15 } },
      { itemId: "fish.pike", basePrice: 90, targetSupply: 8, consumptionRatePerHour: 0.6, seasonalFactors: { autumn: 1.2 } },
      { itemId: "fish.arowana", basePrice: 220, targetSupply: 3, consumptionRatePerHour: 0.2, seasonalFactors: { summer: 1.3 } },
      { itemId: "fish.tuna", basePrice: 160, targetSupply: 8, consumptionRatePerHour: 0.8, seasonalFactors: { summer: 1.2, autumn: 1.1 } },
      { itemId: "fish.sturgeon", basePrice: 240, targetSupply: 4, consumptionRatePerHour: 0.3, seasonalFactors: { winter: 1.3 } },
      { itemId: "fish.sailfish", basePrice: 280, targetSupply: 3, consumptionRatePerHour: 0.25, seasonalFactors: { summer: 1.25 } },
      { itemId: "fish.swordfish", basePrice: 340, targetSupply: 2, consumptionRatePerHour: 0.15, seasonalFactors: { autumn: 1.3, winter: 1.2 } },
      { itemId: "fish.blue_marlin", basePrice: 480, targetSupply: 1, consumptionRatePerHour: 0.1, seasonalFactors: { summer: 1.35 } },
      { itemId: "fish.sea_bream", basePrice: 55, targetSupply: 20, consumptionRatePerHour: 1.5, seasonalFactors: { summer: 1.05 } },
      { itemId: "fish.amberjack", basePrice: 175, targetSupply: 6, consumptionRatePerHour: 0.45, seasonalFactors: { summer: 1.2, autumn: 1.1 } }
    ]
  },
  "market.harbor": {
    id: "market.harbor",
    name: "Harbor Fish Market & Wholesaler",
    regionId: "region.harbor",
    description: "A wharf-side stall for tackle, supplies, and ordinary fish goods. Carry physical catches to Neva Village, Pinewatch, Reedhaven or Highridge to sell them as trade packs.",
    interactionPosition: {
      x: WorldLayout.landmark("fish-market").x,
      z: WorldLayout.landmark("fish-market").z,
      radiusMeters: 7
    },
    retail: {
      itemIds: [
        "item.crushed_ice",
        "item.chum_bucket",
        "item.basic_lure",
        "item.boat_fuel",
        "item.bait_worms",
        "item.fish_scraps",
        "item.copper_sheet",
        "item.brass_fittings",
        "item.oiled_canvas"
      ],
      workshopSupplyItemIds: ["item.fish_scraps"],
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
      { itemId: "item.basic_lure", basePrice: 20, targetSupply: 25, consumptionRatePerHour: 1.5, seasonalFactors: { summer: 1.1 } },
      { itemId: "item.copper_sheet", basePrice: 38, targetSupply: 24, consumptionRatePerHour: 1.2, seasonalFactors: {} },
      { itemId: "item.brass_fittings", basePrice: 40, targetSupply: 20, consumptionRatePerHour: 1.0, seasonalFactors: {} },
      { itemId: "item.oiled_canvas", basePrice: 75, targetSupply: 10, consumptionRatePerHour: 0.5, seasonalFactors: {} }
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
      itemIds: ["item.bait_worms", "item.crushed_ice", "item.boat_fuel"],
      // Act 8 sends the player after reef amberjack, which need heavy tackle.
      // It used to be sold only at the Neva harbor, so the quest silently
      // demanded a return crossing nobody mentioned.
      rodIds: ["rod.heavy_sport"]
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

/** Regional stalls share base values; their stock, throughput and seasons differ. */
function regionalCommodity(
  itemId: string,
  targetSupply: number,
  consumptionRatePerHour: number,
  seasonalFactors?: MarketDefinition["commodities"][number]["seasonalFactors"]
): MarketDefinition["commodities"][number] {
  const source = Object.values(MARKETS).flatMap((market) => market.commodities)
    .find((commodity) => commodity.itemId === itemId);
  if (!source) throw new Error(`Mainland market references unpriced commodity '${itemId}'`);
  return { ...source, targetSupply, consumptionRatePerHour, seasonalFactors: seasonalFactors ?? source.seasonalFactors };
}

function mainlandMarketPosition(marketId: string): MarketDefinition["interactionPosition"] {
  const location = WORLD_MARKET_LOCATIONS[marketId];
  return { ...location.position, radiusMeters: location.radiusMeters };
}

Object.assign(MARKETS, {
  "market.pinewatch": {
    id: "market.pinewatch",
    name: "Pinewatch Timber & Trade",
    routeHint: "Woodland road or sheltered cove",
    regionId: "region.pinewatch",
    description: "The forest village supplies timber and cloth. Its kitchens need field produce and fresh fish; the cove landing offers a shorter return than the woodland road.",
    acceptsFishTradePacks: true,
    interactionPosition: mainlandMarketPosition("market.pinewatch"),
    retail: {
      seedCropIds: ["crop.flax", "crop.apple_tree"],
      itemIds: ["item.hardwood_blank", "item.linen_roll", "produce.flax", "item.basic_lure", "item.boat_fuel"],
      workshopSupplyItemIds: ["produce.flax", "item.linen_roll"]
    },
    commodities: [
      regionalCommodity("seed.flax", 40, 4),
      regionalCommodity("seed.apple_sapling", 15, 1),
      regionalCommodity("item.hardwood_blank", 55, 4),
      regionalCommodity("item.linen_roll", 28, 1.8),
      regionalCommodity("produce.flax", 45, 3),
      regionalCommodity("item.basic_lure", 20, 1.5),
      regionalCommodity("item.boat_fuel", 24, 2),
      regionalCommodity("produce.wheat", 30, 4.5, { spring: 1.12, summer: 1.15, autumn: 1, winter: 1.25 }),
      regionalCommodity("produce.potato", 25, 4, { spring: 1.1, summer: 1.1, autumn: 1.05, winter: 1.25 }),
      regionalCommodity("produce.tomato", 20, 3, { spring: 1.15, summer: 1.1, autumn: 1.2, winter: 1.4 }),
      regionalCommodity("produce.apple", 40, 2.5),
      regionalCommodity("item.salt_cured_fish", 15, 2.5, { spring: 1.15, summer: 1.1, autumn: 1.15, winter: 1.3 }),
      ...MARKETS["market.village"].commodities.filter((entry) => entry.itemId.startsWith("fish.")).map((entry) =>
        regionalCommodity(entry.itemId, Math.max(3, entry.targetSupply), Math.max(0.5, entry.consumptionRatePerHour),
          { spring: 1.1, summer: 1.15, autumn: 1.15, winter: 1.2 }))
    ]
  },
  "market.reedhaven": {
    id: "market.reedhaven",
    name: "Reedhaven Marsh Exchange",
    routeHint: "Raised marsh road or cove landing",
    regionId: "region.reedhaven",
    description: "Reedhaven keeps the marsh landing supplied with bait and ice. Grain, orchard fruit and seafish find buyers among its reed beds and fishing cottages.",
    acceptsFishTradePacks: true,
    interactionPosition: mainlandMarketPosition("market.reedhaven"),
    retail: {
      seedCropIds: ["crop.barley", "crop.carrot", "crop.flax"],
      itemIds: ["item.bait_worms", "item.compost_starter", "item.crushed_ice", "item.boat_fuel", "item.fish_scraps"],
      workshopSupplyItemIds: ["item.fish_scraps"],
      rodIds: ["rod.river", "rod.heavy_sport"]
    },
    commodities: [
      regionalCommodity("seed.barley", 50, 5),
      regionalCommodity("seed.carrot", 50, 5),
      regionalCommodity("seed.flax", 35, 3.5),
      regionalCommodity("item.bait_worms", 100, 7),
      regionalCommodity("item.compost_starter", 35, 2.5),
      regionalCommodity("item.crushed_ice", 45, 4),
      regionalCommodity("item.boat_fuel", 25, 2),
      regionalCommodity("item.fish_scraps", 90, 6),
      regionalCommodity("produce.wheat", 25, 4, { spring: 1.15, summer: 1.2, autumn: 1.1, winter: 1.25 }),
      regionalCommodity("produce.barley", 40, 3),
      regionalCommodity("produce.carrot", 40, 3),
      regionalCommodity("produce.flax", 35, 3),
      regionalCommodity("produce.apple", 20, 3, { spring: 1.3, summer: 1.2, autumn: 1.05, winter: 1.25 }),
      regionalCommodity("fish.carp", 30, 2),
      regionalCommodity("fish.perch", 45, 3),
      ...MARKETS["market.village"].commodities.filter((entry) => entry.itemId.startsWith("fish.")).map((entry) =>
        regionalCommodity(entry.itemId, Math.max(4, entry.targetSupply), Math.max(0.7, entry.consumptionRatePerHour),
          ["fish.trout", "fish.catfish", "fish.pike", "fish.arowana", "fish.sturgeon"].includes(entry.itemId)
            ? { spring: 0.95, summer: 1, autumn: 0.95, winter: 1.05 }
            : { spring: 1.15, summer: 1.2, autumn: 1.2, winter: 1.25 }))
    ]
  },
  "market.highridge": {
    id: "market.highridge",
    name: "Highridge Provisions",
    routeHint: "Mountain road; no boat landing",
    regionId: "region.highridge",
    description: "Above the cove, the mountain village trades root crops and workshop supplies. Fresh seafood earns its place after the climb; the road is the only way to this counter.",
    acceptsFishTradePacks: true,
    interactionPosition: mainlandMarketPosition("market.highridge"),
    retail: {
      seedCropIds: ["crop.potato", "crop.carrot", "crop.barley"],
      itemIds: ["item.tool_steel", "item.tanned_leather", "item.copper_sheet", "item.brass_fittings", "item.crushed_ice"]
    },
    commodities: [
      regionalCommodity("seed.potato", 60, 6),
      regionalCommodity("seed.carrot", 50, 5),
      regionalCommodity("seed.barley", 40, 4),
      regionalCommodity("item.tool_steel", 28, 1.5),
      regionalCommodity("item.tanned_leather", 32, 2),
      regionalCommodity("item.copper_sheet", 30, 2),
      regionalCommodity("item.brass_fittings", 28, 1.8),
      regionalCommodity("item.crushed_ice", 20, 2),
      regionalCommodity("produce.potato", 70, 5),
      regionalCommodity("produce.carrot", 60, 4),
      regionalCommodity("produce.barley", 50, 4),
      regionalCommodity("produce.tomato", 18, 3, { spring: 1.2, summer: 1.15, autumn: 1.3, winter: 1.4 }),
      regionalCommodity("produce.corn", 25, 3, { spring: 1.2, summer: 1.15, autumn: 1.25, winter: 1.35 }),
      regionalCommodity("produce.olive", 15, 2, { spring: 1.2, summer: 1.25, autumn: 1.2, winter: 1.3 }),
      regionalCommodity("item.salt_cured_fish", 18, 3, { spring: 1.2, summer: 1.15, autumn: 1.25, winter: 1.35 }),
      ...MARKETS["market.village"].commodities.filter((entry) => entry.itemId.startsWith("fish.")).map((entry) =>
        regionalCommodity(entry.itemId, Math.max(4, entry.targetSupply), Math.max(0.7, entry.consumptionRatePerHour),
          { spring: 1.2, summer: 1.25, autumn: 1.3, winter: 1.35 }))
    ]
  }
} satisfies Record<string, MarketDefinition>);

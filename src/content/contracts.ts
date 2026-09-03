// src/content/contracts.ts

import { ContractTemplateDefinition } from "./types";

/** Delivery endpoints for the contracts that exist in the P12 slice. */
export function contractDeliveryMarketId(
  definition: Pick<ContractTemplateDefinition, "deliveryMarketId">
): string {
  return definition.deliveryMarketId;
}

export const CONTRACT_TEMPLATES: ContractTemplateDefinition[] = [
  {
    id: "contract.wheat_supply",
    type: "produce",
    requesterName: "Village Baker",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.wheat"],
    quantityRange: [6, 12],
    durationMinutes: 720, // 12 hours
    rewardBaseMultiplier: 1.35,
    rewardSkill: "farming"
  },
  {
    id: "contract.summer_tomatoes",
    type: "produce",
    requesterName: "Harbor Tavern Master",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.tomato"],
    quantityRange: [5, 10],
    durationMinutes: 960,
    rewardBaseMultiplier: 1.5,
    rewardSkill: "farming",
    requiredXp: 1000
  },
  {
    id: "contract.fresh_trout_order",
    type: "fresh-fish",
    requesterName: "Harbor Innkeeper",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.trout"],
    quantityRange: [2, 4],
    minFreshness: 80,
    durationMinutes: 480,
    rewardBaseMultiplier: 1.6,
    rewardSkill: "fishing"
  },
  {
    id: "contract.tuna_expedition",
    type: "fresh-fish",
    requesterName: "Wholesale Fish Buyer",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.tuna"],
    quantityRange: [2, 3],
    minQuality: "fine",
    minFreshness: 75,
    durationMinutes: 1440, // 24 hours
    rewardBaseMultiplier: 1.75,
    rewardSkill: "trading",
    requiredXp: 3000
  },
  {
    id: "contract.blue_marlin_trophy",
    type: "quality-target",
    requesterName: "Harbor Records Keeper",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.blue_marlin"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minWeightKgRange: [120, 250],
    minFreshness: 70,
    durationMinutes: 2880, // 48 hours
    rewardBaseMultiplier: 2.5,
    rewardSkill: "fishing",
    requiredXp: 15000
  },
  // --- Village produce, laddered by the crop's own Farming XP gate ---
  {
    id: "contract.potato_cellar",
    type: "produce",
    requesterName: "Village Cellarer",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.potato"],
    quantityRange: [8, 14],
    durationMinutes: 720,
    rewardBaseMultiplier: 1.3,
    rewardSkill: "farming"
  },
  {
    id: "contract.carrot_crates",
    type: "produce",
    requesterName: "Market Greengrocer",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.carrot"],
    quantityRange: [6, 10],
    durationMinutes: 720,
    rewardBaseMultiplier: 1.4,
    rewardSkill: "farming",
    requiredXp: 200
  },
  {
    id: "contract.barley_run",
    type: "produce",
    requesterName: "Village Brewer",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.barley"],
    quantityRange: [6, 12],
    durationMinutes: 960,
    rewardBaseMultiplier: 1.4,
    rewardSkill: "farming",
    requiredXp: 500
  },
  {
    id: "contract.corn_delivery",
    type: "produce",
    requesterName: "Harbor Provisioner",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.corn"],
    quantityRange: [5, 9],
    durationMinutes: 960,
    rewardBaseMultiplier: 1.5,
    rewardSkill: "farming",
    requiredXp: 1000
  },
  {
    id: "contract.flax_bolts",
    type: "produce",
    requesterName: "Sailmaker",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.flax"],
    quantityRange: [4, 8],
    durationMinutes: 1440,
    rewardBaseMultiplier: 1.6,
    rewardSkill: "farming",
    requiredXp: 3000
  },
  {
    id: "contract.orchard_apples",
    type: "produce",
    requesterName: "Village Baker",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.apple"],
    quantityRange: [5, 9],
    durationMinutes: 1440,
    rewardBaseMultiplier: 1.6,
    rewardSkill: "farming",
    requiredXp: 7500
  },

  // --- Bulk orders: the item lane at a volume that changes how you farm ---
  {
    id: "contract.bulk_grain_order",
    type: "bulk-order",
    requesterName: "Neva Granary",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.wheat"],
    quantityRange: [20, 30],
    durationMinutes: 2880,
    rewardBaseMultiplier: 1.55,
    rewardSkill: "trading",
    requiredXp: 1000
  },
  {
    id: "contract.bulk_root_order",
    type: "bulk-order",
    requesterName: "Winter Stores Keeper",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.potato"],
    quantityRange: [18, 26],
    durationMinutes: 2880,
    rewardBaseMultiplier: 1.5,
    rewardSkill: "trading",
    requiredXp: 1000
  },
  {
    id: "contract.bulk_cove_greens",
    type: "bulk-order",
    requesterName: "Sunreach Cove Kitchen",
    deliveryMarketId: "market.sunreach_cove",
    itemOrSpeciesPool: ["produce.tomato"],
    quantityRange: [16, 24],
    durationMinutes: 2880,
    rewardBaseMultiplier: 1.7,
    rewardSkill: "trading",
    requiredXp: 3000
  },

  // --- Harbor sport-fish orders, laddered by rod and cargo class ---
  {
    id: "contract.catfish_night_order",
    type: "fresh-fish",
    requesterName: "Harbor Smokehouse",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.catfish"],
    quantityRange: [2, 4],
    minFreshness: 75,
    durationMinutes: 720,
    rewardBaseMultiplier: 1.6,
    rewardSkill: "fishing",
    requiredXp: 1000
  },
  {
    id: "contract.pike_autumn_order",
    type: "fresh-fish",
    requesterName: "Lakeside Innkeeper",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.pike"],
    quantityRange: [2, 3],
    minFreshness: 75,
    durationMinutes: 960,
    rewardBaseMultiplier: 1.65,
    rewardSkill: "fishing",
    requiredXp: 1500
  },
  {
    id: "contract.arowana_commission",
    type: "quality-target",
    requesterName: "Collector's Agent",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.arowana"],
    quantityRange: [1, 2],
    minQuality: "fine",
    minFreshness: 80,
    durationMinutes: 1440,
    rewardBaseMultiplier: 1.9,
    rewardSkill: "fishing",
    requiredXp: 3000
  },
  {
    id: "contract.sturgeon_reserve",
    type: "quality-target",
    requesterName: "Cold Storage Buyer",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.sturgeon"],
    quantityRange: [1, 2],
    minQuality: "fine",
    minFreshness: 70,
    durationMinutes: 1440,
    rewardBaseMultiplier: 1.95,
    rewardSkill: "fishing",
    requiredXp: 7500
  },
  {
    id: "contract.sailfish_charter",
    type: "quality-target",
    requesterName: "Charter Records Keeper",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.sailfish"],
    quantityRange: [1, 2],
    minQuality: "fine",
    minFreshness: 70,
    durationMinutes: 2880,
    rewardBaseMultiplier: 2.1,
    rewardSkill: "fishing",
    requiredXp: 15000
  },
  {
    id: "contract.swordfish_winter_order",
    type: "fresh-fish",
    requesterName: "Wholesale Fish Buyer",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.swordfish"],
    quantityRange: [1, 2],
    minFreshness: 70,
    durationMinutes: 2880,
    rewardBaseMultiplier: 2.0,
    rewardSkill: "trading",
    requiredXp: 15000
  },

  // --- Cove orders for the pelagics that now range into Sunreach ---
  {
    id: "contract.cove_tuna_run",
    type: "fresh-fish",
    requesterName: "Tomas",
    deliveryMarketId: "market.sunreach_cove",
    itemOrSpeciesPool: ["fish.tuna"],
    quantityRange: [1, 2],
    minFreshness: 80,
    durationMinutes: 960,
    rewardBaseMultiplier: 1.8,
    rewardSkill: "fishing",
    requiredXp: 6000
  },
  {
    id: "contract.cove_sailfish_prize",
    type: "quality-target",
    requesterName: "Sunreach Reef Warden",
    deliveryMarketId: "market.sunreach_cove",
    itemOrSpeciesPool: ["fish.sailfish"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minFreshness: 70,
    durationMinutes: 2880,
    rewardBaseMultiplier: 2.4,
    rewardSkill: "fishing",
    requiredXp: 30000
  },
  {
    id: "contract.sunreach_olive_delivery",
    type: "produce",
    requesterName: "Neva Village Preserver",
    deliveryMarketId: "market.village",
    itemOrSpeciesPool: ["produce.olive"],
    quantityRange: [6, 10],
    durationMinutes: 1440,
    rewardBaseMultiplier: 1.75,
    rewardSkill: "trading",
    requiredXp: 3000
  },
  {
    id: "contract.sunreach_reef_fish_order",
    type: "fresh-fish",
    requesterName: "Tomas",
    deliveryMarketId: "market.sunreach_cove",
    itemOrSpeciesPool: ["fish.sea_bream", "fish.amberjack"],
    quantityRange: [1, 2],
    minFreshness: 80,
    durationMinutes: 960,
    rewardBaseMultiplier: 1.7,
    rewardSkill: "fishing",
    requiredXp: 3000
  }
];

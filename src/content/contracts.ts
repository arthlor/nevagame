// src/content/contracts.ts

import { ContractTemplateDefinition } from "./types";

/** Delivery endpoints for the contracts that exist in the P12 slice. */
export function contractDeliveryMarketId(
  definition: Pick<ContractTemplateDefinition, "deliveryMarketId">
): string {
  return definition.deliveryMarketId;
}

/**
 * The authored contract types. A quest may target one of these instead of a
 * specific template id: the board rolls a handful of slots out of two dozen
 * templates, so "complete this exact contract" would leave the player
 * rerolling and waiting, while "complete any bulk order" is a goal they can
 * actually pursue.
 */
export const CONTRACT_TYPES: ReadonlySet<string> = new Set([
  "produce",
  "fresh-fish",
  "quality-target",
  "bulk-order"
]);

/** A quest targets a tagged kind of order as `tag:<tag>`. */
export const CONTRACT_TAG_PREFIX = "tag:";

/**
 * Every quest target a completed contract of this template satisfies: its own
 * id, its type, and each of its tags. `QuestDomain` dispatches these and the
 * board matches quest requests against them, so the two cannot disagree.
 */
export function contractObjectiveTargets(
  template: Pick<ContractTemplateDefinition, "id" | "type" | "tags">
): string[] {
  return [template.id, template.type, ...(template.tags ?? []).map((tag) => `${CONTRACT_TAG_PREFIX}${tag}`)];
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
    requesterName: "Barnaby",
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
    requesterName: "Ines",
    deliveryMarketId: "market.sunreach_cove",
    itemOrSpeciesPool: ["produce.tomato"],
    quantityRange: [16, 24],
    durationMinutes: 2880,
    rewardBaseMultiplier: 1.7,
    rewardSkill: "trading",
    requiredXp: 3000,
    // Neva's garden tomatoes carried to the terraces that cannot keep them.
    tags: ["cross-channel"]
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
    requiredXp: 3000,
    // Olive saplings are sold only at the cove; the fruit is wanted on Neva's side.
    tags: ["cross-channel"]
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
  },

  // --- Trophy, seasonal and courier orders: the quality/weight/freshness axes ---
  {
    id: "contract.pike_trophy_order",
    type: "quality-target",
    requesterName: "Lakeside Taxidermist",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.pike"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minWeightKgRange: [12, 16],
    minFreshness: 70,
    durationMinutes: 1440,
    rewardBaseMultiplier: 2.0,
    rewardSkill: "fishing",
    requiredXp: 3000
  },
  {
    id: "contract.swordfish_trophy",
    type: "quality-target",
    requesterName: "Offshore Smokehouse",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.swordfish"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minFreshness: 75,
    durationMinutes: 2880,
    rewardBaseMultiplier: 2.3,
    rewardSkill: "fishing",
    requiredXp: 30000
  },
  {
    id: "contract.arowana_summer_prize",
    type: "quality-target",
    requesterName: "Collector's Agent",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.arowana"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minFreshness: 75,
    durationMinutes: 2880,
    rewardBaseMultiplier: 2.2,
    rewardSkill: "fishing",
    requiredXp: 7500
  },
  {
    id: "contract.trout_first_light",
    type: "fresh-fish",
    requesterName: "Harbor Innkeeper",
    deliveryMarketId: "market.harbor",
    itemOrSpeciesPool: ["fish.trout"],
    quantityRange: [2, 3],
    minFreshness: 90,
    durationMinutes: 480,
    rewardBaseMultiplier: 1.8,
    rewardSkill: "fishing",
    requiredXp: 1000
  },
  {
    id: "contract.pinewatch_grain", type: "produce", requesterName: "Rowan",
    deliveryMarketId: "market.pinewatch", itemOrSpeciesPool: ["produce.wheat"],
    quantityRange: [10, 16], durationMinutes: 1440, rewardBaseMultiplier: 1.6,
    rewardSkill: "trading", requiredXp: 500, tags: ["mainland", "pinewatch"]
  },
  {
    id: "contract.pinewatch_fish", type: "fresh-fish", requesterName: "Pinewatch Bakehouse",
    deliveryMarketId: "market.pinewatch", itemOrSpeciesPool: ["fish.trout", "fish.tuna"],
    quantityRange: [1, 2], minFreshness: 75, durationMinutes: 960, rewardBaseMultiplier: 1.75,
    rewardSkill: "fishing", requiredXp: 1000, tags: ["mainland", "pinewatch"]
  },
  {
    id: "contract.reedhaven_grain", type: "produce", requesterName: "Mara",
    deliveryMarketId: "market.reedhaven", itemOrSpeciesPool: ["produce.wheat"],
    quantityRange: [10, 16], durationMinutes: 1440, rewardBaseMultiplier: 1.7,
    rewardSkill: "trading", requiredXp: 500, tags: ["mainland", "reedhaven"]
  },
  {
    id: "contract.reedhaven_orchard", type: "produce", requesterName: "Reedhaven Preserver",
    deliveryMarketId: "market.reedhaven", itemOrSpeciesPool: ["produce.apple"],
    quantityRange: [6, 10], durationMinutes: 1920, rewardBaseMultiplier: 1.8,
    rewardSkill: "farming", requiredXp: 7500, tags: ["mainland", "reedhaven"]
  },
  {
    id: "contract.highridge_greens", type: "produce", requesterName: "Ada",
    deliveryMarketId: "market.highridge", itemOrSpeciesPool: ["produce.tomato", "produce.corn"],
    quantityRange: [8, 14], durationMinutes: 1920, rewardBaseMultiplier: 1.85,
    rewardSkill: "farming", requiredXp: 1000, tags: ["mainland", "highridge"]
  },
  {
    id: "contract.highridge_fresh_fish", type: "fresh-fish", requesterName: "Highridge Innkeeper",
    deliveryMarketId: "market.highridge", itemOrSpeciesPool: ["fish.trout", "fish.tuna", "fish.sea_bream"],
    quantityRange: [1, 2], minFreshness: 75, durationMinutes: 1440, rewardBaseMultiplier: 1.9,
    rewardSkill: "fishing", requiredXp: 3000, tags: ["mainland", "highridge"]
  }
];

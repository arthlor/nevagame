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

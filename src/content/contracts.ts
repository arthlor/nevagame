// src/content/contracts.ts

import { ContractTemplateDefinition } from "./types";

export const CONTRACT_TEMPLATES: ContractTemplateDefinition[] = [
  {
    id: "contract.wheat_supply",
    type: "produce",
    requesterName: "Village Baker",
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
    requesterName: "Maritime Guild Officer",
    itemOrSpeciesPool: ["fish.blue_marlin"],
    quantityRange: [1, 1],
    minQuality: "exceptional",
    minWeightKgRange: [120, 250],
    minFreshness: 70,
    durationMinutes: 2880, // 48 hours
    rewardBaseMultiplier: 2.5,
    rewardSkill: "fishing",
    requiredXp: 15000
  }
];

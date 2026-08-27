// src/content/progression.ts

import { ProficiencyRankDefinition } from "./types";

export const PROFICIENCY_RANKS: ProficiencyRankDefinition[] = [
  {
    rankIndex: 0,
    rankName: "Novice",
    xpRequired: 0,
    farmingUnlocks: ["crop.wheat", "crop.potato", "crop.tomato"],
    fishingUnlocks: ["rod.willow", "habitat.river"],
    tradingUnlocks: ["market.village", "market.harbor"],
    processingUnlocks: [
      "recipe.wheat_to_grain",
      "recipe.barley_to_grain",
      "recipe.craft_chum",
      "recipe.compost_worms",
      "recipe.perch_to_scraps",
      "recipe.mackerel_to_scraps",
      "recipe.carp_to_scraps"
    ]
  },
  {
    rankIndex: 1,
    rankName: "Apprentice",
    xpRequired: 1000,
    farmingUnlocks: ["crop.carrot", "crop.corn", "crop.barley", "feature.quality_preview"],
    fishingUnlocks: ["rod.river", "habitat.lake", "feature.lake_sport_fishing"],
    tradingUnlocks: ["feature.price_breakdown"],
    processingUnlocks: ["recipe.fish_to_fertilizer"]
  },
  {
    rankIndex: 2,
    rankName: "Skilled",
    xpRequired: 3000,
    farmingUnlocks: ["crop.flax", "feature.fast_composting"],
    fishingUnlocks: ["rod.heavy_sport", "feature.coastal_pelagics"],
    tradingUnlocks: ["feature.price_history"],
    processingUnlocks: ["recipe.craft_lure"]
  },
  {
    rankIndex: 3,
    rankName: "Expert",
    xpRequired: 7500,
    farmingUnlocks: ["crop.apple_tree", "feature.seed_bundles"],
    fishingUnlocks: ["feature.chum_frenzy_boost"],
    tradingUnlocks: ["feature.expedition_planner", "feature.contract_tier2"],
    processingUnlocks: []
  },
  {
    rankIndex: 4,
    rankName: "Master",
    xpRequired: 15000,
    farmingUnlocks: ["feature.irrigation_zone"],
    fishingUnlocks: ["rod.offshore", "boat.skiff", "feature.offshore_expeditions"],
    tradingUnlocks: ["feature.market_forecast", "feature.contract_tier3"],
    processingUnlocks: ["feature.batch_milling"]
  },
  {
    rankIndex: 5,
    rankName: "Artisan",
    xpRequired: 30000,
    farmingUnlocks: ["feature.orchard_specialization"],
    fishingUnlocks: ["feature.sonar_fish_finder"],
    tradingUnlocks: ["feature.export_buyers"],
    processingUnlocks: ["feature.artisan_preservation"]
  },
  {
    rankIndex: 6,
    rankName: "Famed",
    xpRequired: 60000,
    farmingUnlocks: ["feature.premium_seed_selection"],
    fishingUnlocks: ["rod.master", "feature.deep_trench_schools"],
    tradingUnlocks: ["feature.standing_buyer_contracts"],
    processingUnlocks: ["feature.instant_processing"]
  },
  {
    rankIndex: 7,
    rankName: "Legendary",
    xpRequired: 100000,
    farmingUnlocks: ["feature.master_crop_strains"],
    fishingUnlocks: ["feature.legendary_marlin_encounters"],
    tradingUnlocks: ["feature.maritime_guild_charter"],
    processingUnlocks: ["feature.master_preservation"]
  }
];

export function getRankForXp(xp: number): ProficiencyRankDefinition {
  for (let i = PROFICIENCY_RANKS.length - 1; i >= 0; i--) {
    if (xp >= PROFICIENCY_RANKS[i].xpRequired) {
      return PROFICIENCY_RANKS[i];
    }
  }
  return PROFICIENCY_RANKS[0];
}

export function getNextRank(xp: number): ProficiencyRankDefinition | null {
  for (let i = 0; i < PROFICIENCY_RANKS.length; i++) {
    if (xp < PROFICIENCY_RANKS[i].xpRequired) {
      return PROFICIENCY_RANKS[i];
    }
  }
  return null;
}

function unlocksThroughRank(
  xp: number,
  key: "farmingUnlocks" | "fishingUnlocks" | "tradingUnlocks" | "processingUnlocks"
): Set<string> {
  const unlocked = new Set<string>();
  for (const rank of PROFICIENCY_RANKS) {
    if (xp < rank.xpRequired) break;
    for (const id of rank[key]) unlocked.add(id);
  }
  return unlocked;
}

export function isProcessingRecipeUnlocked(processingXp: number, recipeId: string): boolean {
  const listed = PROFICIENCY_RANKS.some((rank) => rank.processingUnlocks.includes(recipeId));
  if (!listed) return true;
  return unlocksThroughRank(processingXp, "processingUnlocks").has(recipeId);
}

// src/content/progression.ts

import { ProficiencyRankDefinition } from "./types";

export const PROFICIENCY_RANKS: ProficiencyRankDefinition[] = [
  {
    rankIndex: 0,
    rankName: "Novice",
    xpRequired: 0,
    farmingUnlocks: ["crop.wheat", "crop.potato"],
    fishingUnlocks: ["rod.willow", "habitat.river"],
    tradingUnlocks: ["market.village"],
    processingUnlocks: ["recipe.wheat_to_grain"]
  },
  {
    rankIndex: 1,
    rankName: "Apprentice",
    xpRequired: 1000,
    farmingUnlocks: ["crop.tomato", "crop.carrot", "crop.corn", "crop.barley", "feature.quality_preview"],
    fishingUnlocks: ["rod.river", "habitat.lake", "feature.lake_sport_fishing"],
    tradingUnlocks: ["market.harbor", "feature.price_breakdown"],
    processingUnlocks: ["recipe.craft_chum", "recipe.barley_to_grain"]
  },
  {
    rankIndex: 2,
    rankName: "Skilled",
    xpRequired: 3000,
    farmingUnlocks: ["crop.flax", "feature.fast_composting"],
    fishingUnlocks: ["rod.heavy_sport", "feature.coastal_pelagics"],
    tradingUnlocks: ["feature.price_history"],
    processingUnlocks: ["recipe.craft_lure", "recipe.fish_to_fertilizer"]
  },
  {
    rankIndex: 3,
    rankName: "Expert",
    xpRequired: 7500,
    farmingUnlocks: ["crop.apple_tree", "feature.seed_bundles"],
    fishingUnlocks: ["feature.chum_frenzy_boost"],
    tradingUnlocks: ["feature.expedition_planner", "contract.tier2"],
    processingUnlocks: ["recipe.compost_worms"]
  },
  {
    rankIndex: 4,
    rankName: "Master",
    xpRequired: 15000,
    farmingUnlocks: ["feature.irrigation_zone"],
    fishingUnlocks: ["rod.offshore", "boat.skiff", "feature.offshore_expeditions"],
    tradingUnlocks: ["feature.market_forecast", "contract.tier3"],
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

// src/content/progression.ts

import { ProficiencyRankDefinition } from "./types";

/**
 * Feature ids the simulation actually reads.
 *
 * A rank may only advertise a `feature.*` id that appears here, and every id
 * here must have a real consumer in `src/` — both halves are enforced, at
 * startup by `ContentRegistry.validateProgressionAndEquipment` and in
 * `tests/simulation/rankUnlocks.test.ts` respectively. The rank tables used to
 * list 25 feature ids of which 23 had no implementation at all, and the other
 * two are granted by quests rather than by XP, so the ladder promised
 * capabilities that never arrived.
 *
 * Both live features are quest-granted, which is why neither appears in a rank
 * below: `feature.expedition_planner` comes from `quest.act5_maiden_voyage` and
 * `feature.irrigation_zone` from `quest.act6_field_pump`. One owner each.
 */
export const LIVE_FEATURE_IDS: ReadonlySet<string> = new Set([
  "feature.expedition_planner",
  "feature.irrigation_zone",
  "feature.maritime_guild_charter"
]);

/**
 * What each proficiency band actually opens.
 *
 * This table is an advertisement, not a gate. The real gates live with the
 * content: `crop.minimumFarmingXp`, `recipe.minimumSkill`,
 * `boat.requiredSkillXp`, and — the one entry the table genuinely owns —
 * `rodFishingXpRequirement`, which reads a rod's rank back out of
 * `fishingUnlocks`. `validateProgressionAndEquipment` asserts every listed id
 * becomes available in the band it is listed under, so the advertisement
 * cannot drift from the gate.
 *
 * Ranks 4-7 are deliberately sparse. That is the honest state of the game:
 * beyond the offshore rod and the skiff, high proficiency currently unlocks
 * nothing. Filling those bands is content work, not a table edit.
 */
export const PROFICIENCY_RANKS: ProficiencyRankDefinition[] = [
  {
    rankIndex: 0,
    rankName: "Novice",
    xpRequired: 0,
    farmingUnlocks: ["crop.wheat", "crop.tomato", "crop.potato"],
    fishingUnlocks: ["rod.willow"],
    tradingUnlocks: ["market.village", "market.harbor"],
    processingUnlocks: [
      "recipe.wheat_to_grain",
      "recipe.barley_to_grain",
      "recipe.sunflower_to_grain",
      "recipe.craft_chum",
      "recipe.compost_worms",
      "recipe.fish_to_fertilizer",
      "recipe.perch_to_scraps",
      "recipe.mackerel_to_scraps",
      "recipe.carp_to_scraps",
      "recipe.sardine_to_scraps"
    ]
  },
  {
    rankIndex: 1,
    rankName: "Apprentice",
    xpRequired: 1000,
    farmingUnlocks: ["crop.carrot", "crop.barley", "crop.corn", "crop.sunflower"],
    fishingUnlocks: ["rod.river"],
    tradingUnlocks: [],
    processingUnlocks: ["recipe.craft_lure", "recipe.cure_sardine"]
  },
  {
    rankIndex: 2,
    rankName: "Skilled",
    xpRequired: 3000,
    farmingUnlocks: ["crop.flax"],
    fishingUnlocks: ["rod.heavy_sport"],
    tradingUnlocks: [],
    processingUnlocks: []
  },
  {
    rankIndex: 3,
    rankName: "Expert",
    xpRequired: 7500,
    farmingUnlocks: ["crop.apple_tree", "crop.olive_tree"],
    fishingUnlocks: ["boat.skiff"],
    tradingUnlocks: [],
    processingUnlocks: []
  },
  {
    rankIndex: 4,
    rankName: "Master",
    xpRequired: 15000,
    farmingUnlocks: [],
    fishingUnlocks: ["rod.offshore"],
    tradingUnlocks: [],
    processingUnlocks: []
  },
  {
    rankIndex: 5,
    rankName: "Artisan",
    xpRequired: 30000,
    farmingUnlocks: [],
    fishingUnlocks: [],
    tradingUnlocks: [],
    processingUnlocks: []
  },
  {
    rankIndex: 6,
    rankName: "Famed",
    xpRequired: 60000,
    farmingUnlocks: [],
    fishingUnlocks: ["rod.master"],
    tradingUnlocks: [],
    processingUnlocks: []
  },
  {
    rankIndex: 7,
    rankName: "Legendary",
    xpRequired: 100000,
    farmingUnlocks: [],
    fishingUnlocks: [],
    tradingUnlocks: [],
    processingUnlocks: []
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

export type RankUnlockKey =
  | "farmingUnlocks"
  | "fishingUnlocks"
  | "tradingUnlocks"
  | "processingUnlocks";

/** Every id advertised at or below `xp` for one skill column. */
export function unlocksThroughRank(xp: number, key: RankUnlockKey): Set<string> {
  const unlocked = new Set<string>();
  for (const rank of PROFICIENCY_RANKS) {
    if (xp < rank.xpRequired) break;
    for (const id of rank[key]) unlocked.add(id);
  }
  return unlocked;
}

/**
 * Whether a recipe's Processing rank has been reached.
 *
 * This makes `processingUnlocks` a live gate rather than only an
 * advertisement. It is safe to run alongside `recipe.minimumSkill` because
 * `validateProgressionAndEquipment` asserts every recipe is advertised in
 * exactly the band its own `minimumSkill` implies — the two gates cannot
 * disagree, so the pair is redundant rather than contradictory. A recipe no
 * rank lists is treated as unlocked, and the same validator guarantees none.
 */
export function isProcessingRecipeUnlocked(processingXp: number, recipeId: string): boolean {
  const listed = PROFICIENCY_RANKS.some((rank) => rank.processingUnlocks.includes(recipeId));
  if (!listed) return true;
  return hasRankUnlock(processingXp, "processingUnlocks", recipeId);
}

/** Whether `xp` has reached the band that advertises `id` in that column. */
export function hasRankUnlock(xp: number, key: RankUnlockKey, id: string): boolean {
  return unlocksThroughRank(xp, key).has(id);
}

/**
 * The XP band a gate of `requiredXp` falls into: the first rank whose
 * threshold reaches it. Used by the validator to keep the advertisement and
 * the live gate on the same row.
 */
export function rankIndexForRequirement(requiredXp: number): number {
  for (const rank of PROFICIENCY_RANKS) {
    if (requiredXp <= rank.xpRequired) return rank.rankIndex;
  }
  return PROFICIENCY_RANKS[PROFICIENCY_RANKS.length - 1].rankIndex;
}

/**
 * How many contracts the board offers at once, by Trading rank.
 *
 * This is the scale axis the deleted `feature.contract_tier2` /
 * `contract_tier3` flags were gesturing at, expressed as something the player
 * can feel: a wider board means a real choice between orders rather than
 * taking whatever the two slots happened to roll.
 */
export function contractSlotsForRank(tradingRankIndex: number, hasGuildCharter = false): number {
  const base = tradingRankIndex >= 5 ? 4 : tradingRankIndex >= 3 ? 3 : 2;
  // The charter is the story's capstone, so it pays in the same currency the
  // rest of the trading ladder does: one more promise you can carry at once.
  return base + (hasGuildCharter ? 1 : 0);
}

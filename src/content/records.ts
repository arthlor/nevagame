// src/content/records.ts

/**
 * Tuning for the Records Board.
 *
 * The board is derived, not authored row by row: its milestones come from the
 * content that already exists, so a new species or crop brings its own record
 * with it rather than needing a table edit. What is authored here is the
 * *shape* of each rule — how heavy a specimen has to be, how many harvests
 * read as mastery, and which tier a milestone belongs to.
 *
 * It reads `state.journal`, which already persists discovery, catch counts,
 * largest weight and best grade for fish, and harvest counts and best grade
 * for crops. Nothing here adds state.
 */
export const RECORD_TUNING = Object.freeze({
  /**
   * How far from a species' average toward its maximum a specimen must be to
   * count as a weight record. Half-way is reachable without being routine —
   * the roll has to go your way and the fight has to be won.
   */
  weightRecordFraction: 0.5,
  /** Harvests of a single crop that read as having mastered it. */
  cropMasteryHarvests: 20,
  /** Fish grade that counts as a trophy specimen. */
  trophyFishQuality: "exceptional" as const,
  /** Crop grade that counts as a show-quality harvest. */
  prizeCropQuality: "prize" as const,
  /** Habitats a complete angler has fished. */
  sweepHabitats: Object.freeze(["river", "lake", "coast", "offshore"] as const)
});

export type RecordTier = "field" | "harbor" | "deep" | "legend";

/** Display order and label for each tier of the board. */
export const RECORD_TIERS: ReadonlyArray<{ id: RecordTier; title: string }> = Object.freeze([
  { id: "field", title: "The Field" },
  { id: "harbor", title: "The Harbor" },
  { id: "deep", title: "The Deep" },
  { id: "legend", title: "Standing Records" }
]);

/**
 * Which tier a species' records belong to, taken from the rod it needs. The
 * rod ladder is already the game's difficulty axis for fishing, so the board
 * inherits it instead of inventing a second one.
 */
export function recordTierForRodClass(rodClass: string): RecordTier {
  if (rodClass === "willow" || rodClass === "river") return "harbor";
  if (rodClass === "heavy-sport") return "deep";
  return "legend";
}

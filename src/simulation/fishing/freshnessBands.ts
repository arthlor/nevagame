/**
 * The one reading of catch freshness that every surface shares: the satchel's
 * word, the inspect card's bar and the catch/hold cargo tone. Four tables once
 * disagreed (85/60/35, 60/35, 70/30 and 65/35), so the same fish could read
 * "Good" in the satchel and "medium" in the hold. Surfaces may name the tones
 * in their own vocabulary but must take the band from here.
 */
export const FRESHNESS_BAND_PERCENT = {
  /** At or above: the word reads "Fresh". */
  fresh: 85,
  /** At or above: the tone is "fresh" and the word at least "Good". */
  good: 60,
  /** At or above: the tone is "medium" and the word "Turning". */
  turning: 35
} as const;

export type FreshnessTone = "fresh" | "medium" | "stale";
export type FreshnessWord = "Fresh" | "Good" | "Turning" | "Poor" | "Spoiled";

export function freshnessTone(percent: number): FreshnessTone {
  if (percent >= FRESHNESS_BAND_PERCENT.good) return "fresh";
  if (percent >= FRESHNESS_BAND_PERCENT.turning) return "medium";
  return "stale";
}

export function freshnessWord(percent: number): FreshnessWord {
  if (percent >= FRESHNESS_BAND_PERCENT.fresh) return "Fresh";
  if (percent >= FRESHNESS_BAND_PERCENT.good) return "Good";
  if (percent >= FRESHNESS_BAND_PERCENT.turning) return "Turning";
  if (percent > 0) return "Poor";
  return "Spoiled";
}

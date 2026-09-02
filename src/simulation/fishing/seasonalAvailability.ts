// src/simulation/fishing/seasonalAvailability.ts

import { SEASONS } from "../core/GameClock";
import type { SeasonId } from "../core/types";
import type { FishSpeciesDefinition } from "../../content/types";

/**
 * Weight applied to a species' presence for the current season.
 *
 * Season is a rate, not a permission. A species is densest in its authored
 * seasons, thin in the shoulder seasons on either side, and absent opposite
 * them. This keeps "go out in the right season" as the reason to plan a trip
 * while guaranteeing every habitat has something in it year-round.
 *
 * Without the shoulder band, `offshore` was empty in spring for every species
 * in the catalog, so no offshore school could ever spawn.
 */
export const PEAK_SEASON_WEIGHT = 1;
export const SHOULDER_SEASON_WEIGHT = 0.2;

/** Cyclic distance between two seasons on the four-season ring (0, 1 or 2). */
function seasonRingDistance(a: SeasonId, b: SeasonId): number {
  const indexA = SEASONS.indexOf(a);
  const indexB = SEASONS.indexOf(b);
  if (indexA < 0 || indexB < 0) return Number.POSITIVE_INFINITY;
  const forward = Math.abs(indexA - indexB);
  return Math.min(forward, SEASONS.length - forward);
}

/**
 * 1.0 in an authored season, 0.2 in a season adjacent to one, 0 otherwise.
 * The single owner of "is this fish available now, and how likely".
 */
export function speciesSeasonWeight(fish: FishSpeciesDefinition, season: SeasonId): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const authored of fish.seasons) {
    nearest = Math.min(nearest, seasonRingDistance(authored, season));
    if (nearest === 0) return PEAK_SEASON_WEIGHT;
  }
  return nearest === 1 ? SHOULDER_SEASON_WEIGHT : 0;
}

/** Convenience predicate for the many call sites that only need presence. */
export function isSpeciesInSeason(fish: FishSpeciesDefinition, season: SeasonId): boolean {
  return speciesSeasonWeight(fish, season) > 0;
}

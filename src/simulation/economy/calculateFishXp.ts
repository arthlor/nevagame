// src/simulation/economy/calculateFishXp.ts

import { FishQuality } from "../core/types";
import { FishSpeciesDefinition } from "../../content/types";
import { getFishWeightMultiplier, getQualityMultiplier } from "./calculateFishValue";

/**
 * Fishing XP for landing a sport fish.
 *
 * Landings used to award a flat 120 regardless of species, which made the rod
 * ladder a repetition count rather than a curve: `rod.master` at 60,000 XP was
 * ~500 identical landings, and hunting a marlin paid exactly what a trout did.
 *
 * Scaling off `baseMarketValue` reuses the same species ordering the economy
 * already trusts, and the weight and quality multipliers are the ones
 * `calculateFishPrice` uses — so a fish that is worth more to sell is worth
 * more to have caught, without a second balance table to keep in sync.
 */
export const SPORT_LANDING_BASE_XP = 60;
export const SPORT_LANDING_VALUE_XP_RATE = 0.9;

export function sportFishLandingXp(
  species: FishSpeciesDefinition,
  weightKg: number,
  quality: FishQuality
): number {
  const weightModifier = getFishWeightMultiplier(species, weightKg);
  const qualityModifier = getQualityMultiplier(quality);
  return Math.round(
    SPORT_LANDING_BASE_XP +
      species.baseMarketValue * SPORT_LANDING_VALUE_XP_RATE * weightModifier * qualityModifier
  );
}

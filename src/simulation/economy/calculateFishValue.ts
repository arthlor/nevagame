// src/simulation/economy/calculateFishValue.ts

import { FishQuality } from "../core/types";
import { FishSpeciesDefinition } from "../../content/types";
import { getFreshnessPriceMultiplier } from "../fishing/calculateFreshness";

export interface FishPriceBreakdown {
  speciesBasePrice: number;
  weightKg: number;
  weightModifier: number;
  quality: FishQuality;
  qualityModifier: number;
  freshness: number;
  freshnessModifier: number;
  demandPercent: number; // e.g. 115%
  demandModifier: number;
  seasonalModifier: number;
  finalPrice: number;
}

export function getQualityMultiplier(quality: FishQuality): number {
  switch (quality) {
    case "common":
      return 1.0;
    case "fine":
      return 1.25;
    case "exceptional":
      return 1.6;
    case "trophy":
      return 2.2;
    default:
      return 1.0;
  }
}

export function calculateFishPrice(
  species: FishSpeciesDefinition,
  weightKg: number,
  quality: FishQuality,
  freshness: number,
  demandIndex: number = 1.0,
  seasonalModifier: number = 1.0
): FishPriceBreakdown {
  const speciesBasePrice = species.baseMarketValue;

  // Weight modifier: relative to average species weight
  const weightRatio = weightKg / Math.max(0.1, species.weightKg.average);
  // Diminishing returns scaling for extreme weights
  const weightModifier = Math.min(2.5, Math.max(0.6, Math.pow(weightRatio, 0.85)));

  const qualityModifier = getQualityMultiplier(quality);
  const freshnessModifier = getFreshnessPriceMultiplier(freshness);

  // Demand clamped between 0.65x and 1.60x
  const demandModifier = Math.min(1.6, Math.max(0.65, demandIndex));

  const rawPrice =
    speciesBasePrice * weightModifier * qualityModifier * freshnessModifier * demandModifier * seasonalModifier;

  const finalPrice = Math.max(0, Math.round(rawPrice));

  return {
    speciesBasePrice,
    weightKg,
    weightModifier: Number(weightModifier.toFixed(2)),
    quality,
    qualityModifier: Number(qualityModifier.toFixed(2)),
    freshness: Math.round(freshness),
    freshnessModifier: Number(freshnessModifier.toFixed(2)),
    demandPercent: Math.round(demandModifier * 100),
    demandModifier: Number(demandModifier.toFixed(2)),
    seasonalModifier: Number(seasonalModifier.toFixed(2)),
    finalPrice
  };
}

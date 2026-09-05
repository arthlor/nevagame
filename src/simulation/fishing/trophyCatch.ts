// src/simulation/fishing/trophyCatch.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import type { FishCargoState, FishQuality } from "../core/types";
import type { TrophyCatchDto } from "../core/contracts";
import { calculateFishPrice } from "../economy/calculateFishValue";

/**
 * Derives fish length in centimeters using standard ichthyological allometric cubic scaling:
 * L = L_base * (W / W_avg)^(1/3)
 */
export function calculateAllometricLengthCm(
  weightKg: number,
  cargoClass: "small" | "medium" | "large" | "gargantuan" = "medium",
  averageWeightKg: number = 1.5
): number {
  const baseLengthCm: Record<"small" | "medium" | "large" | "gargantuan", number> = {
    small: 24,
    medium: 48,
    large: 82,
    gargantuan: 140
  };
  const baseLength = baseLengthCm[cargoClass] ?? 48;
  const ratio = Math.max(0.05, weightKg) / Math.max(0.05, averageWeightKg);
  const length = baseLength * Math.cbrt(ratio);
  return Math.max(10, Math.min(350, Math.round(length * 10) / 10));
}

/**
 * Maps fish quality tier to 1-4 star rating.
 */
export function qualityToStars(quality: FishQuality): 1 | 2 | 3 | 4 {
  switch (quality) {
    case "trophy":
      return 4;
    case "exceptional":
      return 3;
    case "fine":
      return 2;
    case "common":
    default:
      return 1;
  }
}

/**
 * Pure simulation presenter building a celebratory TrophyCatchDto from a landed fish cargo instance.
 */
export function buildTrophyCatchDto(
  cargo: FishCargoState,
  record?: "first" | "weight" | "quality" | null,
  demandModifier: number = 1.0,
  seasonalModifier: number = 1.0
): TrophyCatchDto {
  const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
  const speciesName = species?.name ?? "Sport Fish";
  const habitats = species?.habitats ?? [];
  const cargoClass = cargo.cargoClass ?? species?.cargoClass ?? "medium";
  const avgWeight = species?.weightKg.average ?? 1.5;
  const lengthCm = calculateAllometricLengthCm(cargo.weightKg, cargoClass, avgWeight);

  const qualityStars = qualityToStars(cargo.quality);
  const freshnessPercent = Math.max(0, Math.min(100, Math.round(cargo.freshness)));
  const freshnessTone: "fresh" | "medium" | "stale" =
    freshnessPercent >= 70 ? "fresh" : freshnessPercent >= 30 ? "medium" : "stale";

  const decayRatePerMin = species?.baseDecayRatePerMinute ?? 0.25;
  const estimatedShelfLifeMinutes = Math.max(0, Math.round(cargo.freshness / Math.max(0.01, decayRatePerMin)));

  let estimatedMarketValue = 10;
  if (species) {
    const breakdown = calculateFishPrice(species, cargo.weightKg, cargo.quality, cargo.freshness, demandModifier, seasonalModifier);
    estimatedMarketValue = breakdown.finalPrice;
  }

  let storageDestination: TrophyCatchDto["storageDestination"] = "player-carry";
  let storageLocationLabel = "Carried by hand";

  if (cargo.location.type === "boat-hold") {
    storageDestination = "boat-hold";
    storageLocationLabel = "Stowed in boat hold";
  } else if (cargo.location.type === "boat-hook") {
    storageDestination = "boat-hook";
    storageLocationLabel = "Hung on transom hook";
  } else if (cargo.location.type === "cold-storage") {
    storageDestination = "cold-storage";
    storageLocationLabel = "Stored in cold room";
  }

  return {
    cargoId: cargo.id,
    speciesId: cargo.speciesId,
    speciesName,
    habitats,
    cargoClass,
    weightKg: Number(cargo.weightKg.toFixed(2)),
    lengthCm,
    quality: cargo.quality,
    qualityStars,
    freshnessPercent,
    freshnessTone,
    estimatedShelfLifeMinutes,
    estimatedMarketValue,
    record: record ?? null,
    storageDestination,
    storageLocationLabel
  };
}

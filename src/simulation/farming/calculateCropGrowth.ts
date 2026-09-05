// src/simulation/farming/calculateCropGrowth.ts

import { ClimateId, CropQuality, CropQualityInputs, CropStage, WeatherTag } from "../core/types";
import { CropDefinition } from "../../content/types";
import { Rng } from "../core/Rng";
import type { FarmEnvironmentSample } from "./FarmEnvironmentSample";

export interface GrowthStepResult {
  newEffectiveMinutes: number;
  newStage: CropStage;
  newMoisture: number;
  newHealth: number;
}

/**
 * Health is damaged by sustained moisture stress, independently of growth
 * progress. Healthy soil does not heal a damaged crop, but it stops further
 * loss; very dry soil applies the full stress rate.
 */
export function calculateCropHealth(
  currentHealth: number,
  currentMoisture: number,
  elapsedMinutes: number
): number {
  const health = Math.min(100, Math.max(0, currentHealth));
  if (elapsedMinutes <= 0) return health;

  const moistureStress = currentMoisture >= 40 ? 0 : currentMoisture >= 15 ? 0.5 : 1;
  const healthLoss = (elapsedMinutes / 60) * 5 * moistureStress;
  return Math.max(0, health - healthLoss);
}

export function calculateEffectiveGrowthDelta(
  elapsedMinutes: number,
  crop: CropDefinition,
  farmClimate: ClimateId,
  currentMoisture: number,
  soilFertility: number, // 0..100
  weatherType: WeatherTag
): number {
  if (elapsedMinutes <= 0) return 0;

  // LIVE 02: preferred 1.20 | neutral 1.00 | poor 0.80.
  const declaredNeutral = crop.neutralClimates;
  let climateMod = 0.8;
  if (crop.preferredClimates.includes(farmClimate)) {
    climateMod = 1.2;
  } else if (declaredNeutral?.includes(farmClimate)) {
    climateMod = 1.0;
  }

  // 2. Moisture modifier
  let moistureMod = 1.0;
  if (currentMoisture >= 40) {
    moistureMod = 1.0;
  } else if (currentMoisture >= 15) {
    moistureMod = 0.85;
  } else {
    moistureMod = 0.6;
  }

  // 3. Fertility modifier (normal baseline = 50)
  let fertilityMod = 1.0;
  if (soilFertility >= 80) {
    fertilityMod = 1.1;
  } else if (soilFertility < 30) {
    fertilityMod = 0.8;
  }

  // 4. Weather modifier
  let weatherMod = 1.0;
  if (weatherType === "light-rain" || weatherType === "heavy-rain" || weatherType === "storm") {
    weatherMod = 1.05;
  }

  const totalMod = Math.min(1.5, Math.max(0.5, climateMod * moistureMod * fertilityMod * weatherMod));
  return elapsedMinutes * totalMod;
}

/** Calendar minutes of mature after time-to-mature is reached. Climate must not shrink this. */
export const POST_MATURE_MATURE_MINUTES = 12 * 60;
/** Calendar minutes after mature before an annual withers. */
export const POST_MATURE_WITHER_MINUTES = 24 * 60;
/** Growth progress (fraction of baseGrowthMinutes) at which a crop reads as "growing". */
export const SEEDED_STAGE_MAX_PROGRESS = 0.1;
export const GROWING_STAGE_MIN_PROGRESS = 0.35;

export function determineCropStage(
  effectiveGrowthMinutes: number,
  baseGrowthMinutes: number,
  regrows: boolean = false
): CropStage {
  if (baseGrowthMinutes <= 0) return "mature";
  if (effectiveGrowthMinutes < baseGrowthMinutes) {
    const progressRatio = effectiveGrowthMinutes / baseGrowthMinutes;
    if (progressRatio < SEEDED_STAGE_MAX_PROGRESS) return "seeded";
    if (progressRatio < GROWING_STAGE_MIN_PROGRESS) return "sprout";
    return "growing";
  }
  const calendarPastMature = effectiveGrowthMinutes - baseGrowthMinutes;
  if (calendarPastMature < POST_MATURE_MATURE_MINUTES) return "mature";
  if (regrows || calendarPastMature < POST_MATURE_WITHER_MINUTES) return "overripe";
  return "withered";
}

export function calculateCropQuality(
  inputs: CropQualityInputs,
  rng: Rng
): { quality: CropQuality; score: number } {
  // Score formula:
  // Climate match: 30%
  // Average moisture: 25%
  // Soil fertility: 20%
  // Farming proficiency: 15%
  // Seeded RNG roll: 10%

  const climateScore = Math.min(1, Math.max(0, inputs.climateMatchScore)) * 30;
  const moistureScore = Math.min(1, Math.max(0, inputs.averageMoisture / 100)) * 25;
  const fertilityScore = Math.min(1, Math.max(0, inputs.soilFertility / 100)) * 20;
  const proficiencyScore = Math.min(1, Math.max(0, inputs.farmingProficiency / 100000)) * 15;
  const roll =
    typeof inputs.rngRoll === "number" && Number.isFinite(inputs.rngRoll)
      ? Math.min(1, Math.max(0, inputs.rngRoll))
      : rng.nextFloat();
  const rareChanceMultiplier = Math.min(1, Math.max(0, inputs.rareChanceMultiplier ?? 1));
  const rngScore = roll * 10 * rareChanceMultiplier;

  const totalScore = climateScore + moistureScore + fertilityScore + proficiencyScore + rngScore;

  let quality: CropQuality = "common";
  if (totalScore >= 88) {
    quality = "prize";
  } else if (totalScore >= 70) {
    quality = "exceptional";
  } else if (totalScore >= 45) {
    quality = "fine";
  }

  return { quality, score: totalScore };
}

export function calculateHarvestYield(
  crop: CropDefinition,
  health: number,
  farmingXp: number,
  rng: Rng
): number {
  const baseQuantity = rng.intInclusive(crop.baseYield.min, crop.baseYield.max);
  const healthModifier = Math.max(0.2, health / 100);
  // Max skill yield boost ~25%
  const skillModifier = 1.0 + Math.min(0.25, (farmingXp / 100000) * 0.25);

  const finalYield = Math.max(1, Math.round(baseQuantity * healthModifier * skillModifier));
  return finalYield;
}

export function moistureChangePerHour(
  waterNeed: number,
  environment: Pick<FarmEnvironmentSample, "weatherType" | "rainfallEffectiveness" | "evaporationMultiplier" | "moistureRetention">
): number {
  const retention = Math.min(1, Math.max(0, environment.moistureRetention));
  // Higher retention slows dry-out only; rain still restores full moisture.
  const dryOutScale = 1 - retention * 0.5;
  let delta = -(waterNeed * 0.4 * dryOutScale * environment.evaporationMultiplier);
  if (environment.weatherType === "light-rain") delta += 15 * environment.rainfallEffectiveness;
  else if (environment.weatherType === "heavy-rain" || environment.weatherType === "storm") {
    delta += 35 * environment.rainfallEffectiveness;
  }
  if (environment.weatherType === "windy") {
    delta -= waterNeed * 0.2 * dryOutScale * environment.evaporationMultiplier;
  }
  return delta;
}

export function applyCropMoistureOverMinutes(
  crop: { moisture: number; averageMoistureAccum: number; moistureSampleCount: number },
  minutes: number,
  waterNeed: number,
  environment: Pick<FarmEnvironmentSample, "weatherType" | "rainfallEffectiveness" | "evaporationMultiplier" | "moistureRetention">
): void {
  const steps = Math.floor(minutes);
  if (steps <= 0) return;
  const perMinute = moistureChangePerHour(waterNeed, environment) / 60;
  const initialMoisture = crop.moisture;
  if (perMinute === 0) {
    crop.averageMoistureAccum += initialMoisture * steps;
  } else if (perMinute > 0) {
    const changingSteps = Math.min(steps, Math.max(0, Math.ceil((100 - initialMoisture) / perMinute)));
    crop.averageMoistureAccum += changingSteps * initialMoisture + (perMinute * changingSteps * (changingSteps + 1)) / 2;
    crop.averageMoistureAccum += (steps - changingSteps) * 100;
  } else {
    const changingSteps = Math.min(steps, Math.max(0, Math.ceil(initialMoisture / -perMinute)));
    crop.averageMoistureAccum += changingSteps * initialMoisture + (perMinute * changingSteps * (changingSteps + 1)) / 2;
  }
  crop.moisture = Math.min(100, Math.max(0, initialMoisture + perMinute * steps));
  crop.moistureSampleCount += steps;
}

function addGrowthMinutes(
  crop: { effectiveGrowthMinutes: number },
  cropDef: CropDefinition,
  farmClimate: ClimateId,
  currentMoisture: number,
  soilFertility: number,
  weatherType: WeatherTag,
  chunk: number
): void {
  const base = cropDef.baseGrowthMinutes;
  const before = crop.effectiveGrowthMinutes;
  if (before >= base) {
    crop.effectiveGrowthMinutes = before + chunk;
    return;
  }
  const delta = calculateEffectiveGrowthDelta(
    chunk,
    cropDef,
    farmClimate,
    currentMoisture,
    soilFertility,
    weatherType
  );
  const after = before + delta;
  if (after < base) {
    crop.effectiveGrowthMinutes = after;
    return;
  }
  const needed = base - before;
  const fraction = delta > 0 ? Math.min(1, needed / delta) : 1;
  crop.effectiveGrowthMinutes = base + Math.max(0, chunk * (1 - fraction));
}

export function advancePlacedCropGrowth(
  crop: {
    effectiveGrowthMinutes: number;
    moisture: number;
    averageMoistureAccum: number;
    moistureSampleCount: number;
    stage: CropStage;
    health?: number;
  },
  cropDef: CropDefinition,
  environment: FarmEnvironmentSample,
  soilFertility: number,
  elapsedMinutes: number,
): CropStage {
  const alreadyWithered = crop.stage === "withered" && !cropDef.regrows;
  let remaining = Math.floor(elapsedMinutes);
  while (remaining > 0) {
    const perMinute = moistureChangePerHour(cropDef.waterNeed, environment) / 60;
    let chunk = remaining;
    if (perMinute > 0) {
      if (crop.moisture < 15) {
        chunk = Math.min(chunk, Math.max(1, Math.ceil((15 - crop.moisture) / perMinute)));
      } else if (crop.moisture < 40) {
        chunk = Math.min(chunk, Math.max(1, Math.ceil((40 - crop.moisture) / perMinute)));
      }
    } else if (perMinute < 0) {
      if (crop.moisture > 40) {
        chunk = Math.min(chunk, Math.max(1, Math.ceil((crop.moisture - 40) / -perMinute)));
      } else if (crop.moisture > 15) {
        chunk = Math.min(chunk, Math.max(1, Math.ceil((crop.moisture - 15) / -perMinute)));
      }
    }
    if (!alreadyWithered) {
      addGrowthMinutes(crop, cropDef, environment.climateId, crop.moisture, soilFertility, environment.weatherType, chunk);
    }
    if (typeof crop.health === "number") {
      crop.health = calculateCropHealth(crop.health, crop.moisture, chunk);
    }
    applyCropMoistureOverMinutes(crop, chunk, cropDef.waterNeed, environment);
    remaining -= chunk;
  }
  if (alreadyWithered) {
    crop.stage = "withered";
  } else {
    crop.stage = determineCropStage(crop.effectiveGrowthMinutes, cropDef.baseGrowthMinutes, cropDef.regrows);
  }
  if (crop.stage === "withered" && typeof crop.health === "number") crop.health = 0;
  return crop.stage;
}

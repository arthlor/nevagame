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

/**
 * Crop growth rate modifiers. These were bare literals inside the growth
 * function with a comment pointing at `LLM/02` for their meaning, which made
 * the document the de-facto owner of live tuning. Naming them here moves
 * ownership into the code the simulation actually runs; `02` §2 now points at
 * this table instead of restating it, and `tests/unit/docTuningValues.test.ts`
 * fails if the two disagree.
 */
export const CROP_GROWTH_MODIFIERS = {
  climate: { preferred: 1.2, neutral: 1.0, poor: 0.8 },
  /** Moisture is 0..100; below `dryBelow` growth slows, below `veryDryBelow` it stalls. */
  moisture: { healthy: 1.0, dry: 0.85, veryDry: 0.6, dryBelow: 40, veryDryBelow: 15 },
  /** Fertility is 0..100 with a normal baseline of 50. */
  fertility: { excellent: 1.1, normal: 1.0, poor: 0.8, excellentAtOrAbove: 80, poorBelow: 30 },
  /** Rain and storm help a little; no drought weather type is live. */
  weather: { wet: 1.05, other: 1.0 },
  totalClamp: { minimum: 0.5, maximum: 1.5 }
} as const;

export type CropClimateMatch = keyof typeof CROP_GROWTH_MODIFIERS.climate;

/** Classifies a crop's climate once for every consumer of the climate rule. */
export function cropClimateMatch(
  crop: Pick<CropDefinition, "preferredClimates" | "neutralClimates">,
  farmClimate: ClimateId
): CropClimateMatch {
  if (crop.preferredClimates.includes(farmClimate)) return "preferred";
  if (crop.neutralClimates?.includes(farmClimate)) return "neutral";
  return "poor";
}

/** Harvest quality treats preferred and explicitly neutral climates equally. */
export function cropClimateQualityScore(
  crop: Pick<CropDefinition, "preferredClimates" | "neutralClimates">,
  farmClimate: ClimateId
): number {
  return cropClimateMatch(crop, farmClimate) === "poor" ? 0.6 : 1;
}

/** Weather types that count as watering the field. */
const WET_WEATHER_TYPES: ReadonlySet<WeatherTag> = new Set<WeatherTag>([
  "light-rain",
  "heavy-rain",
  "storm"
]);

export function calculateEffectiveGrowthDelta(
  elapsedMinutes: number,
  crop: CropDefinition,
  farmClimate: ClimateId,
  currentMoisture: number,
  soilFertility: number, // 0..100
  weatherType: WeatherTag,
  /**
   * Pacing scalar owned by `OnboardingPace`. Applied *after* `totalClamp`:
   * the clamp bounds how much the environment may help or hurt a crop, and
   * folding a pacing multiplier into it would silently reduce a 5x to ~1.14x.
   */
  growthRateMultiplier: number = 1
): number {
  if (elapsedMinutes <= 0) return 0;

  const { climate, moisture, fertility, weather, totalClamp } = CROP_GROWTH_MODIFIERS;

  const climateMod = climate[cropClimateMatch(crop, farmClimate)];

  let moistureMod: number = moisture.healthy;
  if (currentMoisture < moisture.dryBelow) {
    moistureMod = currentMoisture >= moisture.veryDryBelow ? moisture.dry : moisture.veryDry;
  }

  let fertilityMod: number = fertility.normal;
  if (soilFertility >= fertility.excellentAtOrAbove) {
    fertilityMod = fertility.excellent;
  } else if (soilFertility < fertility.poorBelow) {
    fertilityMod = fertility.poor;
  }

  const weatherMod = WET_WEATHER_TYPES.has(weatherType) ? weather.wet : weather.other;

  const totalMod = Math.min(
    totalClamp.maximum,
    Math.max(totalClamp.minimum, climateMod * moistureMod * fertilityMod * weatherMod)
  );
  return elapsedMinutes * totalMod * growthRateMultiplier;
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
  const rareChanceMultiplier = Math.max(0, inputs.rareChanceMultiplier ?? 1);
  const fixedScore = climateScore + moistureScore + fertilityScore + proficiencyScore;
  const totalScore = fixedScore + roll * 10;
  const chanceAtOrAbove = (threshold: number): number =>
    Math.min(1, Math.max(0, (fixedScore + 10 - threshold) / 10));
  // One saved RNG draw chooses quality. Specialist clothing widens only the
  // exceptional/prize intervals; it cannot turn common produce into fine or
  // consume a second draw that would desynchronise the simulation.
  const prizeChance = Math.min(1, chanceAtOrAbove(88) * rareChanceMultiplier);
  const exceptionalChance = Math.max(
    prizeChance,
    Math.min(1, chanceAtOrAbove(70) * rareChanceMultiplier)
  );

  let quality: CropQuality = "common";
  if (roll >= 1 - prizeChance) {
    quality = "prize";
  } else if (roll >= 1 - exceptionalChance) {
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
  } else {
    // Integrate the clamped trace exactly. `stepsToBound` is how many steps
    // reach the 0/100 bound from here; before it the trace is linear, at it and
    // after it saturates. Getting this right matters for harvest quality, which
    // reads the average.
    const bound = perMinute > 0 ? 100 : 0;
    const stepsToBound = perMinute > 0
      ? Math.ceil((100 - initialMoisture) / perMinute)
      : Math.ceil(initialMoisture / -perMinute);
    const reachesBound = stepsToBound <= steps;
    const linearSteps = reachesBound ? Math.max(0, stepsToBound - 1) : steps;
    const stepsAtBound = reachesBound ? steps - linearSteps : 0;
    crop.averageMoistureAccum +=
      linearSteps * initialMoisture
      + (perMinute * linearSteps * (linearSteps + 1)) / 2
      + stepsAtBound * bound;
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
  chunk: number,
  growthRateMultiplier: number = 1
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
    weatherType,
    growthRateMultiplier
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
  growthRateMultiplier: number = 1
): CropStage {
  const alreadyWithered = crop.stage === "withered";
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
      // A drying chunk must end strictly below 40/15, or the next chunk would
      // start exactly on the boundary and charge the wrong health-stress band
      // for its whole span.
      if (crop.moisture > 40) {
        chunk = Math.min(chunk, Math.max(1, Math.floor((crop.moisture - 40) / -perMinute) + 1));
      } else if (crop.moisture > 15) {
        chunk = Math.min(chunk, Math.max(1, Math.floor((crop.moisture - 15) / -perMinute) + 1));
      }
    }
    if (!alreadyWithered) {
      addGrowthMinutes(
        crop, cropDef, environment.climateId, crop.moisture, soilFertility,
        environment.weatherType, chunk, growthRateMultiplier
      );
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

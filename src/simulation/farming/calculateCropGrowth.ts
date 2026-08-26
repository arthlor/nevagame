// src/simulation/farming/calculateCropGrowth.ts

import { ClimateId, CropQuality, CropQualityInputs, CropStage, WeatherTag } from "../core/types";
import { CropDefinition } from "../../content/types";
import { Rng } from "../core/Rng";

export interface GrowthStepResult {
  newEffectiveMinutes: number;
  newStage: CropStage;
  newMoisture: number;
  newHealth: number;
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

  // LIVE 02: preferred 1.20 | poor 0.80. Neutral 1.00 only when a crop
  // declares an explicit neutralClimates set (none currently do).
  const declaredNeutral = (crop as CropDefinition & { neutralClimates?: ClimateId[] }).neutralClimates;
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
  if (weatherType === "light-rain" || weatherType === "heavy-rain") {
    weatherMod = 1.05;
  }

  const totalMod = Math.min(1.5, Math.max(0.5, climateMod * moistureMod * fertilityMod * weatherMod));
  return elapsedMinutes * totalMod;
}

export function determineCropStage(
  effectiveGrowthMinutes: number,
  baseGrowthMinutes: number,
  regrows: boolean = false
): CropStage {
  if (baseGrowthMinutes <= 0) return "mature";
  const progressRatio = effectiveGrowthMinutes / baseGrowthMinutes;

  if (progressRatio < 0.1) return "seeded";
  if (progressRatio < 0.35) return "sprout";
  if (progressRatio < 1.0) return "growing";
  if (progressRatio < 1.3) return "mature";
  if (regrows || progressRatio <= 1.6) return "overripe";
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

export function moistureChangePerHour(waterNeed: number, weatherType: WeatherTag): number {
  let delta = -(waterNeed * 0.4);
  if (weatherType === "light-rain") delta += 15;
  else if (weatherType === "heavy-rain") delta += 35;
  if (weatherType === "windy") delta -= waterNeed * 0.2;
  return delta;
}

export function applyCropMoistureOverMinutes(
  crop: { moisture: number; averageMoistureAccum: number; moistureSampleCount: number },
  minutes: number,
  waterNeed: number,
  weatherType: WeatherTag
): void {
  const steps = Math.floor(minutes);
  if (steps <= 0) return;
  const perMinute = moistureChangePerHour(waterNeed, weatherType) / 60;
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

export function advancePlacedCropGrowth(
  crop: {
    effectiveGrowthMinutes: number;
    moisture: number;
    averageMoistureAccum: number;
    moistureSampleCount: number;
    stage: CropStage;
  },
  cropDef: CropDefinition,
  farmClimate: ClimateId,
  soilFertility: number,
  weatherType: WeatherTag,
  elapsedMinutes: number
): CropStage {
  crop.effectiveGrowthMinutes += calculateEffectiveGrowthDelta(
    elapsedMinutes,
    cropDef,
    farmClimate,
    crop.moisture,
    soilFertility,
    weatherType
  );
  applyCropMoistureOverMinutes(crop, elapsedMinutes, cropDef.waterNeed, weatherType);
  crop.stage = determineCropStage(crop.effectiveGrowthMinutes, cropDef.baseGrowthMinutes, cropDef.regrows);
  return crop.stage;
}

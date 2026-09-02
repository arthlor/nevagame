// tests/unit/cropGrowth.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateEffectiveGrowthDelta,
  determineCropStage,
  calculateCropQuality,
  calculateHarvestYield,
  applyCropMoistureOverMinutes,
  advancePlacedCropGrowth,
  calculateCropHealth,
  POST_MATURE_MATURE_MINUTES,
  POST_MATURE_WITHER_MINUTES
} from "../../src/simulation/farming/calculateCropGrowth";
import { CROPS } from "../../src/content/crops";
import { SeededRng } from "../../src/simulation/core/Rng";
import type { FarmEnvironmentSample } from "../../src/simulation/farming/FarmEnvironmentSample";

const environment = (weatherType: "clear" | "storm"): FarmEnvironmentSample => ({
  farmId: "farm.test",
  islandId: "island.neva",
  biomeId: "biome.neva_temperate",
  climateId: "temperate",
  weatherType,
  temperatureC: 20,
  rainfallEffectiveness: 1,
  evaporationMultiplier: 1,
  exposure: 0,
  moistureRetention: 0
});

describe("Crop Growth & Quality Calculations", () => {
  const wheat = CROPS["crop.wheat"];

  it("applies preferred 1.20 and poor 0.80 unless an explicit neutral set exists", () => {
    const deltaPreferred = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 80, "clear");
    const deltaPoorWarm = calculateEffectiveGrowthDelta(60, wheat, "warm", 80, 80, "clear");
    const deltaPoorArid = calculateEffectiveGrowthDelta(60, wheat, "arid", 80, 80, "clear");

    expect(deltaPreferred).toBeGreaterThan(deltaPoorWarm);
    expect(deltaPoorWarm).toBe(deltaPoorArid);
    expect(deltaPreferred / deltaPoorWarm).toBeCloseTo(1.2 / 0.8);

    const withNeutral = { ...wheat, neutralClimates: ["cool" as const] };
    const deltaNeutral = calculateEffectiveGrowthDelta(60, withNeutral, "cool", 80, 80, "clear");
    expect(deltaPreferred / deltaNeutral).toBeCloseTo(1.2);
  });

  it("slows growth when dry", () => {
    const deltaWet = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 80, "clear");
    const deltaDry = calculateEffectiveGrowthDelta(60, wheat, "temperate", 10, 80, "clear");

    expect(deltaWet).toBeGreaterThan(deltaDry);
  });

  it("treats storm like heavy rain for growth and moisture", () => {
    const stormGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "storm");
    const rainGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "heavy-rain");
    const clearGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "clear");
    expect(stormGrowth).toBeCloseTo(rainGrowth);
    expect(stormGrowth).toBeGreaterThan(clearGrowth);

    const crop = { moisture: 40, averageMoistureAccum: 0, moistureSampleCount: 0 };
    applyCropMoistureOverMinutes(crop, 60, wheat.waterNeed, environment("storm"));
    expect(crop.moisture).toBeGreaterThan(40);
  });

  it("determines correct lifecycle stages", () => {
    const base = 60;
    expect(determineCropStage(5, base)).toBe("seeded");
    expect(determineCropStage(15, base)).toBe("sprout");
    expect(determineCropStage(45, base)).toBe("growing");
    expect(determineCropStage(65, base)).toBe("mature");
    expect(determineCropStage(base + POST_MATURE_MATURE_MINUTES - 1, base)).toBe("mature");
    expect(determineCropStage(base + POST_MATURE_MATURE_MINUTES, base)).toBe("overripe");
    expect(determineCropStage(base + POST_MATURE_WITHER_MINUTES - 1, base)).toBe("overripe");
    expect(determineCropStage(base + POST_MATURE_WITHER_MINUTES, base)).toBe("withered");
    expect(determineCropStage(base + POST_MATURE_WITHER_MINUTES, base, false)).toBe("withered");
    const apple = CROPS["crop.apple_tree"];
    expect(
      determineCropStage(
        apple.baseGrowthMinutes + POST_MATURE_MATURE_MINUTES + 10,
        apple.baseGrowthMinutes,
        true
      )
    ).toBe("overripe");
    expect(
      determineCropStage(
        apple.baseGrowthMinutes + POST_MATURE_MATURE_MINUTES + 10,
        apple.baseGrowthMinutes,
        apple.regrows
      )
    ).toBe("overripe");
  });

  it("computes quality deterministically with RNG", () => {
    const rng1 = new SeededRng(42);
    const res1 = calculateCropQuality(
      { climateMatchScore: 1.0, averageMoisture: 80, soilFertility: 90, farmingProficiency: 5000, rngRoll: 0.5 },
      rng1
    );

    const rng2 = new SeededRng(42);
    const res2 = calculateCropQuality(
      { climateMatchScore: 1.0, averageMoisture: 80, soilFertility: 90, farmingProficiency: 5000, rngRoll: 0.5 },
      rng2
    );

    expect(res1).toEqual(res2);
    expect(["common", "fine", "exceptional", "prize"]).toContain(res1.quality);
  });

  it("uses provided rngRoll and does not call rng.nextFloat()", () => {
    const rng = new SeededRng(7);
    const control = new SeededRng(7);
    const first = control.nextFloat();
    const low = calculateCropQuality(
      { climateMatchScore: 1.0, averageMoisture: 80, soilFertility: 90, farmingProficiency: 5000, rngRoll: 0 },
      rng
    );
    expect(rng.nextFloat()).toBe(first);
    const high = calculateCropQuality(
      { climateMatchScore: 1.0, averageMoisture: 80, soilFertility: 90, farmingProficiency: 5000, rngRoll: 1 },
      rng
    );
    expect(high.score - low.score).toBeCloseTo(10);
  });

  it("calculates yield within bounds", () => {
    const rng = new SeededRng(100);
    const yieldAmount = calculateHarvestYield(wheat, 100, 1000, rng);
    expect(yieldAmount).toBeGreaterThanOrEqual(wheat.baseYield.min);
    expect(yieldAmount).toBeLessThanOrEqual(wheat.baseYield.max * 1.5);
  });

  it("advances moisture and its quality samples without minute-by-minute iteration", () => {
    const crop = { moisture: 70, averageMoistureAccum: 70, moistureSampleCount: 1 };
    applyCropMoistureOverMinutes(crop, 72 * 60, wheat.waterNeed, environment("clear"));
    expect(crop.moisture).toBe(0);
    expect(crop.moistureSampleCount).toBe(1 + 72 * 60);
    expect(crop.averageMoistureAccum).toBeGreaterThan(70);
  });

  it("updates crop health from moisture stress and clamps withered crops", () => {
    const dryCrop: Parameters<typeof advancePlacedCropGrowth>[0] = {
      effectiveGrowthMinutes: 0,
      moisture: 0,
      health: 100,
      averageMoistureAccum: 0,
      moistureSampleCount: 0,
      stage: "seeded"
    };
    advancePlacedCropGrowth(dryCrop, wheat, environment("clear"), 50, 60);
    expect(dryCrop.health).toBeLessThan(100);
    expect(dryCrop.health).toBeGreaterThanOrEqual(0);

    const witheredCrop: Parameters<typeof advancePlacedCropGrowth>[0] = {
      ...dryCrop,
      effectiveGrowthMinutes: wheat.baseGrowthMinutes + POST_MATURE_WITHER_MINUTES,
      health: 42,
      stage: "mature"
    };
    advancePlacedCropGrowth(witheredCrop, wheat, environment("clear"), 50, 1);
    expect(witheredCrop.stage).toBe("withered");
    expect(witheredCrop.health).toBe(0);
  });

  it("does not damage health while moisture remains healthy", () => {
    expect(calculateCropHealth(100, 70, 240)).toBe(100);
    expect(calculateCropHealth(100, 20, 60)).toBeCloseTo(97.5);
  });

  it("subdivides long rest intervals when moisture crosses growth bands", () => {
    const crop = {
      effectiveGrowthMinutes: 0,
      moisture: 50,
      averageMoistureAccum: 0,
      moistureSampleCount: 0,
      stage: "seeded" as const
    };
    advancePlacedCropGrowth(crop, wheat, environment("clear"), 50, 600);
    const frozenAtStart = calculateEffectiveGrowthDelta(600, wheat, "temperate", 50, 50, "clear");
    expect(crop.moisture).toBeLessThan(15);
    expect(crop.effectiveGrowthMinutes).toBeLessThan(frozenAtStart);
    expect(crop.effectiveGrowthMinutes).toBeGreaterThan(0);
  });
});

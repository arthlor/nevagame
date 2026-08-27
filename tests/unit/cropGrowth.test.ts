// tests/unit/cropGrowth.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateEffectiveGrowthDelta,
  determineCropStage,
  calculateCropQuality,
  calculateHarvestYield,
  applyCropMoistureOverMinutes,
  advancePlacedCropGrowth,
  calculateCropHealth
} from "../../src/simulation/farming/calculateCropGrowth";
import { CROPS } from "../../src/content/crops";
import { SeededRng } from "../../src/simulation/core/Rng";

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

  it("determines correct lifecycle stages", () => {
    expect(determineCropStage(5, 60)).toBe("seeded");
    expect(determineCropStage(15, 60)).toBe("sprout");
    expect(determineCropStage(45, 60)).toBe("growing");
    expect(determineCropStage(65, 60)).toBe("mature");
    expect(determineCropStage(85, 60)).toBe("overripe");
    expect(determineCropStage(105, 60)).toBe("withered");
    expect(determineCropStage(105, 60, false)).toBe("withered");
    const apple = CROPS["crop.apple_tree"];
    expect(determineCropStage(apple.baseGrowthMinutes * 1.7, apple.baseGrowthMinutes, true)).toBe("overripe");
    expect(determineCropStage(apple.baseGrowthMinutes * 1.7, apple.baseGrowthMinutes, apple.regrows)).toBe("overripe");
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
    applyCropMoistureOverMinutes(crop, 72 * 60, wheat.waterNeed, "clear");
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
    advancePlacedCropGrowth(dryCrop, wheat, "temperate", 50, "clear", 60);
    expect(dryCrop.health).toBeLessThan(100);
    expect(dryCrop.health).toBeGreaterThanOrEqual(0);

    const witheredCrop: Parameters<typeof advancePlacedCropGrowth>[0] = {
      ...dryCrop,
      effectiveGrowthMinutes: wheat.baseGrowthMinutes * 1.7,
      health: 42,
      stage: "mature"
    };
    advancePlacedCropGrowth(witheredCrop, wheat, "temperate", 50, "clear", 1);
    expect(witheredCrop.stage).toBe("withered");
    expect(witheredCrop.health).toBe(0);
  });

  it("does not damage health while moisture remains healthy", () => {
    expect(calculateCropHealth(100, 70, 240)).toBe(100);
    expect(calculateCropHealth(100, 20, 60)).toBeCloseTo(97.5);
  });
});

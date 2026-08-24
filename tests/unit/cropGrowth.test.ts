// tests/unit/cropGrowth.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateEffectiveGrowthDelta,
  determineCropStage,
  calculateCropQuality,
  calculateHarvestYield,
  applyCropMoistureOverMinutes
} from "../../src/simulation/farming/calculateCropGrowth";
import { CROPS } from "../../src/content/crops";
import { SeededRng } from "../../src/simulation/core/Rng";

describe("Crop Growth & Quality Calculations", () => {
  const wheat = CROPS["crop.wheat"];

  it("applies preferred climate bonus", () => {
    const deltaPreferred = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 80, "clear");
    const deltaPoor = calculateEffectiveGrowthDelta(60, wheat, "arid", 80, 80, "clear");

    expect(deltaPreferred).toBeGreaterThan(deltaPoor);
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
    expect(["common", "fine", "exceptional", "trophy"]).toContain(res1.quality);
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
});

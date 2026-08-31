import { describe, expect, it } from "vitest";
import {
  advanceQualityLevel,
  contactTierEffectStrength,
  groundCoverActiveCountAtLevel,
  highTierEffectStrength,
  qualityTierAtLevel,
  qualityValueAtLevel
} from "../../src/render/config/VisualRenderConfig";

describe("graphics quality transitions", () => {
  it("walks through adjacent tiers instead of jumping from low to high", () => {
    const halfwayToMedium = advanceQualityLevel(0, 2, 0.45, 0.9);
    const medium = advanceQualityLevel(halfwayToMedium, 2, 0.45, 0.9);
    const high = advanceQualityLevel(medium, 2, 0.9, 0.9);

    expect(halfwayToMedium).toBeCloseTo(0.5, 6);
    expect(qualityTierAtLevel(halfwayToMedium - 0.01)).toBe("low");
    expect(medium).toBeCloseTo(1, 6);
    expect(qualityTierAtLevel(medium)).toBe("medium");
    expect(high).toBe(2);
    expect(qualityTierAtLevel(high)).toBe("high");
  });

  it("interpolates density, distance, and effect contribution continuously", () => {
    const lowCount = groundCoverActiveCountAtLevel(100, 0);
    const blendedCount = groundCoverActiveCountAtLevel(100, 0.5);
    const mediumCount = groundCoverActiveCountAtLevel(100, 1);
    expect(lowCount).toBeLessThan(blendedCount);
    expect(blendedCount).toBeLessThan(mediumCount);

    const blendedDistance = qualityValueAtLevel(
      0.5,
      (quality) => quality.groundCoverDrawDistanceMeters
    );
    expect(blendedDistance).toBeGreaterThan(55);
    expect(blendedDistance).toBeLessThan(78);

    expect(contactTierEffectStrength(0.5)).toBe(0);
    expect(contactTierEffectStrength(1)).toBe(1);
    expect(contactTierEffectStrength(1.5)).toBe(0);
    expect(highTierEffectStrength(1.5)).toBe(0);
    expect(highTierEffectStrength(1.75)).toBeGreaterThan(0);
    expect(highTierEffectStrength(2)).toBe(1);
  });
});

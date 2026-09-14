import { describe, expect, it } from "vitest";
import {
  advanceQualityLevel,
  CANONICAL_RENDER_CONFIG,
  contactTierEffectStrength,
  groundCoverActiveCountAtLevel,
  highTierEffectStrength,
  qualityTierAtLevel,
  qualityValueAtLevel
} from "../../src/render/config/VisualRenderConfig";
import { meadowFieldLevel } from "../../src/render/vegetation/MeadowField";

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

  it("grows the meadow carpet monotonically with tier while keeping far density a subset", () => {
    const levels = [0, 0.5, 1, 1.5, 2].map((level) => meadowFieldLevel(level));
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].radius).toBeGreaterThanOrEqual(levels[index - 1].radius);
      expect(levels[index].nearBlades).toBeGreaterThanOrEqual(levels[index - 1].nearBlades);
      expect(levels[index].farBlades).toBeGreaterThanOrEqual(levels[index - 1].farBlades);
    }
    for (const level of levels) {
      expect(level.farBlades).toBeLessThanOrEqual(level.nearBlades);
      expect(level.nearRadius).toBeLessThan(level.radius);
    }
    // Shadow receiving is a discrete ownership change staged at tier boundaries.
    expect(meadowFieldLevel(0).receiveShadows).toBe(false);
    expect(meadowFieldLevel(2).receiveShadows).toBe(true);
    // The clear-day far plane hides the terrain edge; the carpet must end well inside it.
    expect(meadowFieldLevel(2).radius).toBeLessThan(CANONICAL_RENDER_CONFIG.fog.far);
  });
});

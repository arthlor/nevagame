import { describe, expect, it } from "vitest";
import { auditWorldCompositionSeed, periodicSpacingEvidence } from "../../src/world/WorldCompositionAudit";

describe("world composition evidence", () => {
  it.each([9, 11, 25, 61, 42891])("reports composition separately from route and fishing safety for seed %s", (seed) => {
    const audit = auditWorldCompositionSeed(seed);
    expect([audit.districtDensityCv, audit.periodic22LowerBound, audit.periodic555LowerBound,
      audit.isolateRatio, ...audit.districtDensities].every(Number.isFinite)).toBe(true);
    expect(audit.fishingAccessClearancePass).toBe(true);
    expect(audit.routeClearanceFailures).toEqual([]);
    expect(audit.routeComposition.length).toBeGreaterThan(0);
    for (const route of audit.routeComposition) {
      expect(route.sampleCount).toBeGreaterThan(0);
      expect(route.openSamples).toBeLessThanOrEqual(route.sampleCount);
      expect(route.framedSamples).toBeLessThanOrEqual(route.sampleCount);
      expect(route.maximumDenseRunMeters).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not call a sparse single-bin excess a repeated spacing pattern", () => {
    const values = [20, 15, 31, 23, 24].flatMap((count, index) => Array(count).fill(4.85 + index * 0.35));
    const evidence = periodicSpacingEvidence(values, 5.55, 0.35);
    expect(evidence.ratio).toBeGreaterThan(1.35);
    expect(evidence.lowerBound).toBeLessThan(1.35);
    expect(periodicSpacingEvidence([], 5.55, 0.35).lowerBound).toBe(0);
  });

  it.each([5.55, 22])("measures an actual %s metre lattice", (spacing) => {
    const positions = Array.from({ length: 24 }, (_, index) => index * spacing);
    const distances = positions.flatMap((left, index) => positions.slice(index + 1).map((right) => right - left));
    expect(periodicSpacingEvidence(distances, spacing, 0.35).lowerBound).toBeGreaterThan(1.35);
  });

  it("measures a well-supported 50 percent spacing excess", () => {
    const values = [1000, 1000, 1500, 1000, 1000].flatMap((count, index) => Array(count).fill(4.85 + index * 0.35));
    expect(periodicSpacingEvidence(values, 5.55, 0.35).lowerBound).toBeGreaterThan(1.35);
  });
});

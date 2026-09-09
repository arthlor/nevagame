import { describe, expect, it } from "vitest";
import { auditWorldCompositionSeed, districtRhythmPass, periodicSpacingEvidence } from "../../src/world/WorldCompositionAudit";

describe("world composition evidence", () => {
  it.each([9, 11, 25, 61])("validates distinct habitats and nonperiodic reeds for seed %s", (seed) => {
    const audit = auditWorldCompositionSeed(seed);
    expect(audit.districtOrderingPass).toBe(true);
    expect(audit.districtDensityCv).toBeGreaterThanOrEqual(0.12);
    expect(audit.periodic22LowerBound).toBeLessThan(1.35);
    expect(audit.periodic555LowerBound).toBeLessThan(1.35);
    expect(audit.fishingAccessClearancePass).toBe(true);
    expect(audit.routePass).toBe(true);
  });
  it("distinguishes village canopy from harbor working-edge density", () => {
    const densities = [
      { tree: 0.01205, bush: 0.02506 }, { tree: 0.03761, bush: 0.05956 },
      { tree: 0.01798, bush: 0.09886 }, { tree: 0.01010, bush: 0.01212 }
    ];
    expect(districtRhythmPass(densities)).toBe(true);
    expect(districtRhythmPass(densities.map(() => densities[0]))).toBe(false);
    expect(districtRhythmPass([densities[0], densities[2], densities[1], densities[3]])).toBe(false);
    expect(districtRhythmPass([densities[0], densities[1], densities[2], densities[1]])).toBe(false);
  });

  it("does not call a sparse single-bin excess a repeated spacing pattern", () => {
    const values = [20, 15, 31, 23, 24].flatMap((count, index) => Array(count).fill(4.85 + index * 0.35));
    const evidence = periodicSpacingEvidence(values, 5.55, 0.35);
    expect(evidence.ratio).toBeGreaterThan(1.35);
    expect(evidence.lowerBound).toBeLessThan(1.35);
    expect(periodicSpacingEvidence([], 5.55, 0.35).lowerBound).toBe(0);
  });

  it.each([5.55, 22])("rejects an actual %s metre lattice", (spacing) => {
    const positions = Array.from({ length: 24 }, (_, index) => index * spacing);
    const distances = positions.flatMap((left, index) => positions.slice(index + 1).map((right) => right - left));
    expect(periodicSpacingEvidence(distances, spacing, 0.35).lowerBound).toBeGreaterThan(1.35);
  });

  it("rejects a well-supported 50 percent spacing excess", () => {
    const values = [1000, 1000, 1500, 1000, 1000].flatMap((count, index) => Array(count).fill(4.85 + index * 0.35));
    expect(periodicSpacingEvidence(values, 5.55, 0.35).lowerBound).toBeGreaterThan(1.35);
  });
});

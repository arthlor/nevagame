import { describe, expect, it } from "vitest";
import { preservationDifferences, placementDifferences } from "../../tools/world/preservation-reference.mjs";
import baseline from "../../tools/world/neva-layout14-preservation.json";

describe("revision-specific world preservation", () => {
  it("requires the mainland sampling domain and rejects envelope or spacing drift", () => {
    const mainland = { ...baseline, layoutRevision: 22,
      terrainSampling: { bounds: { minX: -890, maxX: 210, minZ: -780, maxZ: 710 }, spacingMeters: 6 } };
    expect(preservationDifferences(mainland, structuredClone(mainland))).toEqual([]);
    expect(preservationDifferences({ ...mainland, terrainSampling: undefined }, mainland)).toHaveLength(1);
    expect(preservationDifferences({ ...mainland, terrainSampling: { ...mainland.terrainSampling, spacingMeters: 12 } }, mainland)).toHaveLength(1);
    expect(preservationDifferences({ ...mainland, terrainSampling: { ...mainland.terrainSampling,
      bounds: { ...mainland.terrainSampling.bounds, minX: -220 } } }, mainland)).toHaveLength(1);
  });
  it("accepts the current reference and rejects each changed or missing contract field", () => {
    expect(preservationDifferences(baseline, baseline)).toEqual([]);
    for (const key of ["layoutRevision", "terrainWaterHash", "routeHash", "landmarkHash", "sampleCount"]) {
      expect(preservationDifferences({ ...baseline, [key]: "changed" }, baseline)).toHaveLength(1);
      expect(preservationDifferences({ ...baseline, [key]: undefined }, baseline)).toHaveLength(1);
    }
  });
  it("pins every audited seed and rejects changed or unrecorded placement hashes", () => {
    const seeds = Object.entries(baseline.compositionPlacementHashes).map(([seed, placementHash]) => ({ seed: Number(seed), placementHash }));
    expect(seeds).toHaveLength(64);
    expect(placementDifferences(seeds, baseline)).toEqual([]);
    expect(placementDifferences([{ seed: 42, placementHash: "changed" }], baseline)).toHaveLength(1);
    expect(placementDifferences([{ seed: 64, placementHash: "unknown" }], baseline)).toHaveLength(1);
  });
});

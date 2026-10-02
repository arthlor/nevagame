import { describe, expect, it } from "vitest";
import type { SunreachCompositionSeedAudit, WorldCompositionAuditSummary, WorldCompositionSeedAudit } from "../../src/world/WorldCompositionAudit";
import { compositionFailures, sunreachCompositionFailures } from "../../tools/world/composition-gates.mjs";

const roles = { core: 0, edge: 0, isolate: 0, landmark: 0, riparian: 0, "route-frame": 0 };
const neva: WorldCompositionSeedAudit = {
  seed: 42, placementHash: "retained", periodic22Ratio: 100, periodic555Ratio: 100,
  periodic22LowerBound: 50, periodic555LowerBound: 50, districtCategoryDensities: [],
  districtDensityCv: 0, districtDensities: [0, 0, 0, 0], largeOpenings: [], isolateRatio: 1, roles,
  fishingAccessComponentCount: 3, fishingAccessClearancePass: true, routeClearanceFailures: [],
  routeComposition: [{ routeId: "route.test", sampleCount: 100, openSamples: 0, framedSamples: 0, maximumDenseRunMeters: 500 }]
};
const reference = { compositionPlacementHashes: { "42": "retained" } };
const nevaAudit = (seed: WorldCompositionSeedAudit = neva): WorldCompositionAuditSummary => ({
  seeds: [seed], strongestPeriodicSeed: 42, weakestDistrictContrastSeed: 42,
  repeatedSeed42Hash: ["retained", "retained"]
});
const sunreach: SunreachCompositionSeedAudit = {
  seed: 42, placementHash: "island", placementCount: 1, categoryCounts: { tree: 0, bush: 0, rock: 1 },
  periodic22Ratio: 100, districtDensityCv: 0, districtDensities: [0, 0, 0, 0],
  openings: [{ anchor: "coveMarket", influence: 0 }], islandQualificationPass: true,
  routeClearancePass: true, drainageCouplingPass: true, roles
};
const sunreachAudit = (seed: SunreachCompositionSeedAudit = sunreach) => ({
  seeds: [seed], repeatedSeed42Hash: ["island", "island"] as const
});

describe("world composition technical gates", () => {
  it("accepts composition diagnostics without a prescribed density, spacing, role or opening", () => {
    expect(compositionFailures(nevaAudit(), reference)).toEqual([]);
    expect(sunreachCompositionFailures(sunreachAudit())).toEqual([]);
  });

  it.each([
    { change: { fishingAccessComponentCount: 2 }, reason: "fishing access components" },
    { change: { fishingAccessClearancePass: false }, reason: "fishing access vegetation clearance" },
    { change: { routeClearanceFailures: ["route.test:clearance@5"] }, reason: "route.test:clearance@5" }
  ])("rejects lost access: $reason", ({ change, reason }) => {
    expect(compositionFailures(nevaAudit({ ...neva, ...change }), reference)).toEqual([`seed 42: ${reason}`]);
  });

  it("rejects changed and unrecorded placements without updating preservation references", () => {
    expect(compositionFailures(nevaAudit({ ...neva, placementHash: "changed" }), reference)).toHaveLength(1);
    expect(compositionFailures(nevaAudit(), { compositionPlacementHashes: {} })).toHaveLength(1);
  });

  it.each(["islandQualificationPass", "routeClearancePass", "drainageCouplingPass"] as const)(
    "rejects a Sunreach technical failure: %s", (field) => {
      expect(sunreachCompositionFailures(sunreachAudit({ ...sunreach, [field]: false }))).toHaveLength(1);
    }
  );

  it("rejects nondeterministic or missing repeat evidence on both islands", () => {
    expect(compositionFailures({ ...nevaAudit(), repeatedSeed42Hash: ["one", "two"] }, reference)).toHaveLength(1);
    expect(sunreachCompositionFailures({ ...sunreachAudit(), repeatedSeed42Hash: ["one", "two"] })).toHaveLength(1);
    // A malformed recorded audit must not turn two absent hashes into equality.
    expect(compositionFailures({ ...nevaAudit(), repeatedSeed42Hash: undefined } as unknown as WorldCompositionAuditSummary,
      reference)).toHaveLength(1);
  });
});

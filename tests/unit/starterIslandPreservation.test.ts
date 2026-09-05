import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../../tools/world/neva-layout10-working-preservation.json";
import { captureTerrainPreservation, compareTerrainPreservation } from "../../tools/world/terrain-preservation";

describe("starter island terrain preservation", () => {
  let current: ReturnType<typeof captureTerrainPreservation>;
  beforeAll(() => {
    current = captureTerrainPreservation(baseline.routeIds, baseline.sunreachSampling);
  });

  it.each(Object.keys(baseline) as Array<keyof typeof baseline>)("preserves %s with only the documented harbor approach correction", (field) => {
    expect(compareTerrainPreservation(current, baseline).workingChecks[field]).toBe(true);
  });

  it("still reports the exact historical differences instead of replacing the old baseline", () => {
    const { historicalChecks } = compareTerrainPreservation(current, baseline);
    expect(Object.entries(historicalChecks).filter(([, matches]) => !matches).map(([field]) => field))
      .toEqual(["anchors", "routeHash"]);
  });

  it("rejects any additional route edit or return to the obstructed stall endpoint", () => {
    for (const change of ["interior-point", "width", "endpoint"] as const) {
      const altered = structuredClone(current);
      const route = altered.routes.find((entry) => entry.id === "village-harbor")!;
      const changedRoute = change === "width"
        ? { ...route, widthMeters: route.widthMeters + 0.1 }
        : { ...route, points: route.points.map((point, index) => {
          if (change === "interior-point" && index === 1) return { ...point, x: point.x + 0.1 };
          if (change === "endpoint" && index === route.points.length - 1) return { x: 64, z: 60 };
          return point;
        }) };
      altered.routes = altered.routes.map((entry) => entry.id === route.id ? changedRoute : entry);
      altered.routeHash = createHash("sha256").update(JSON.stringify(altered.routes)).digest("hex");
      expect(compareTerrainPreservation(altered, baseline).workingChecks.routeHash, change).toBe(false);
    }
  });

  it("rejects other anchor changes, including small changes to the corrected foundation", () => {
    for (const id of ["market.harbor", "fish-market", "market.village"]) {
      for (const field of ["x", "height"] as const) {
        const altered = structuredClone(current);
        altered.anchors.find((anchor) => anchor.id === id)![field] += 0.01;
        expect(compareTerrainPreservation(altered, baseline).workingChecks.anchors, `${id}.${field}`).toBe(false);
      }
    }
  });

  it("records the sample domain instead of comparing a changed envelope against an old hash", () => {
    const expanded = captureTerrainPreservation(baseline.routeIds, {
      ...baseline.sunreachSampling,
      bounds: {
        ...baseline.sunreachSampling.bounds,
        minX: baseline.sunreachSampling.bounds.minX - baseline.sunreachSampling.spacingMeters
      }
    });
    expect(current.sunreachSampling).toEqual(baseline.sunreachSampling);
    expect(current.sunreachSampleCount).toBe(baseline.sunreachSampleCount);
    expect(expanded.sunreachSampling.bounds).not.toEqual(baseline.sunreachSampling.bounds);
    expect(expanded.sunreachSampleCount).toBeGreaterThan(current.sunreachSampleCount);
    expect(expanded.sunreachHash).not.toBe(current.sunreachHash);
  });
});

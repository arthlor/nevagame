import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../../tools/world/neva-layout25-working-preservation.json";
import beforeRiver from "../../tools/world/neva-layout24-working-preservation.json";
import beforeValley from "../../tools/world/neva-layout23-working-preservation.json";
import type { WorldRoute } from "../../src/world/WorldLayout";
import previousTrails from "../fixtures/neva_layout23_upland_routes.json";
import beforeOrganic from "../../tools/world/neva-layout22-working-preservation.json";
import beforeMainland from "../../tools/world/neva-layout21-working-preservation.json";
import { captureTerrainPreservation, compareTerrainPreservation } from "../../tools/world/terrain-preservation";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";

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
    // Anchors now match the current revision; only the route hash is recorded in
    // its documented pre-correction (harbor-approach) form.
    expect(Object.entries(historicalChecks).filter(([, matches]) => !matches).map(([field]) => field))
      .toEqual(["routeHash"]);
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

  it("pins every new mainland route while retaining the protected layout21 fields", () => {
    expect(baseline.routeIds).toEqual(expect.arrayContaining(MAINLAND_ROUTES.map((route) => route.id)));
    const historical = captureTerrainPreservation(beforeMainland.routeIds, beforeMainland.sunreachSampling);
    const { workingChecks } = compareTerrainPreservation(historical, beforeMainland);
    for (const field of ["workingGround", "routeIds", "sunreachSampling", "sunreachHash", "sunreachSampleCount"] as const) {
      expect(workingChecks[field], field).toBe(true);
    }
    // Replay only the explicitly redesigned trails; all other route geometry
    // must still match the independently retained layout23 hash.
    const historicalTrails = { ...current, routes: current.routes.map(route =>
      (previousTrails as WorldRoute[]).find(previous => previous.id === route.id) ?? route) };
    historicalTrails.routeHash = createHash("sha256").update(JSON.stringify(historicalTrails.routes)).digest("hex");
    expect(compareTerrainPreservation(historicalTrails, beforeValley).workingChecks.routeHash).toBe(true);
    // The kitchen's documented v48 move predates the mainland. New market
    // anchors are additive; every other historical anchor remains exact.
    for (const anchor of beforeMainland.anchors) {
      if (anchor.id === "struct.kitchen") continue;
      expect(historical.anchors.find((currentAnchor) => currentAnchor.id === anchor.id), anchor.id).toEqual(anchor);
    }
  });

  it("retains bridge and estuary support across the intentional river redesign", () => {
    const protectedStations = (rows: typeof current.lowerRiver) => rows.filter(row =>
      Number(row.z) >= -20 && Number(row.z) <= 14 || Number(row.z) >= 80);
    expect(protectedStations(current.lowerRiver)).toEqual(protectedStations(beforeRiver.lowerRiver));
    expect(current.workingGround).toEqual(beforeRiver.workingGround);
    expect(current.anchors).toEqual(beforeRiver.anchors);
    expect(compareTerrainPreservation(current, beforeRiver).workingChecks.routeHash).toBe(true);
  });

  it("retains layout22 working fields and anchor coordinates across the contour-road rework", () => {
    for (const field of ["workingGround", "routeIds", "sunreachSampling", "sunreachHash", "sunreachSampleCount"] as const) {
      expect(current[field], field).toEqual(beforeOrganic[field]);
    }
    for (const anchor of beforeOrganic.anchors) {
      const actual = current.anchors.find(candidate => candidate.id === anchor.id)!;
      // These three village ground heights include the intentionally reworked
      // road crowns; the current revision snapshot pins their new heights.
      const comparable = ["market.pinewatch", "market.reedhaven", "market.highridge"].includes(anchor.id)
        ? { ...actual, height: anchor.height } : actual;
      expect(comparable, anchor.id).toEqual(anchor);
    }
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../../tools/world/neva-layout38-working-preservation.json";
import beforeMainDock from "../../tools/world/neva-layout33-working-preservation.json";
import beforeCoastalValley from "../../tools/world/neva-layout32-working-preservation.json";
import beforeJunctions from "../../tools/world/neva-layout31-working-preservation.json";
import beforeCove from "../../tools/world/neva-layout29-working-preservation.json";
import layout29MainlandRoutes from "../fixtures/neva_layout29_mainland_routes.json";
import layout28MainlandRoutes from "../fixtures/neva_layout28_mainland_routes.json";
import layout37StarterRoutes from "../fixtures/neva_layout37_starter_routes.json";
import beforeRoad from "../../tools/world/neva-layout25-working-preservation.json";
import previousRoad from "../fixtures/neva_layout25_coastal_road.json";
import beforeRiver from "../../tools/world/neva-layout24-working-preservation.json";
import beforeValley from "../../tools/world/neva-layout23-working-preservation.json";
import { WorldLayout, type WorldRoute } from "../../src/world/WorldLayout";
import previousTrails from "../fixtures/neva_layout23_upland_routes.json";
import previousTrailArms from "../fixtures/neva_layout26_trail_arms.json";
import beforeOrganic from "../../tools/world/neva-layout22-working-preservation.json";
import beforeMainland from "../../tools/world/neva-layout21-working-preservation.json";
import { captureTerrainPreservation, compareTerrainPreservation } from "../../tools/world/terrain-preservation";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";

describe("starter island terrain preservation", () => {
  let current: ReturnType<typeof captureTerrainPreservation>;
  let historicalCurrent: ReturnType<typeof captureTerrainPreservation>;
  // Restore only the explicitly moved dock and earlier compost anchor for historical comparisons.
  const withEarlierCompostAnchor = (snapshot: ReturnType<typeof captureTerrainPreservation>) => ({
    ...snapshot,
    anchors: snapshot.anchors.map(anchor => anchor.id === "struct.starter_compost"
      ? beforeJunctions.anchors.find(previous => previous.id === anchor.id)!
      : anchor.id === "dock" ? beforeMainDock.anchors.find(previous => previous.id === anchor.id)! : anchor)
  });
  const withRoutes = (
    snapshot: ReturnType<typeof captureTerrainPreservation>,
    routes: WorldRoute[]
  ) => ({
    ...snapshot,
    routes,
    routeHash: createHash("sha256").update(JSON.stringify(routes)).digest("hex")
  });
  /**
   * Layout 38 sets every road's width from its class, turns the starter
   * district's shared stretches into forks and re-plans the mainland network.
   * Historical comparisons replay the route set a snapshot recorded: the
   * retained starter and farm definitions, and the layout 29 mainland roads
   * the older restorations below build on.
   */
  const layout37Route = (id: string) => (layout37StarterRoutes as WorldRoute[]).find(route => route.id === id)
    ?? (layout29MainlandRoutes as WorldRoute[]).find(route => route.id === id);
  const withLayout37Routes = (snapshot: ReturnType<typeof captureTerrainPreservation>, routeIds: readonly string[]) =>
    withRoutes({ ...snapshot, routeIds: [...routeIds] }, routeIds.map(layout37Route).filter((route): route is WorldRoute => !!route));
  /**
   * Narrowing the roads re-grades only the ground beside them: working ground
   * and anchors within two metres of a road's packed edge keep the height the
   * snapshot before layout 38 recorded; every coordinate stays exact.
   */
  type Anchor = { id: string; x: number; z: number; height: number };
  const nearRoad = (point: { x: number; z: number }) => {
    const road = WorldLayout.nearestRouteDistance(point.x, point.z);
    return road.distance - road.halfWidth < 2;
  };
  const withRoadGradingFrom = <T extends { workingGround: GroundRow[]; anchors: Anchor[] }>(
    snapshot: T,
    reference: { workingGround: GroundRow[]; anchors: Anchor[] }
  ): T => ({
    ...snapshot,
    workingGround: snapshot.workingGround.map(row => nearRoad(row)
      ? { ...row, height: reference.workingGround.find(entry => entry.id === row.id && entry.x === row.x && entry.z === row.z)?.height ?? row.height }
      : row),
    anchors: snapshot.anchors.map(anchor => nearRoad(anchor)
      ? { ...anchor, height: reference.anchors.find(entry => entry.id === anchor.id)?.height ?? anchor.height }
      : anchor)
  });
  /** Layout 38 narrows Sunreach's roads as well; from then on the live snapshot pins its samples. */
  const withSunreachRoadsFrom = <T extends { sunreachHash: string }>(snapshot: T, reference: { sunreachHash: string }): T =>
    ({ ...snapshot, sunreachHash: reference.sunreachHash });
  /** Later layouts add trade stations and their facing; a snapshot compares the anchors it recorded, as recorded. */
  const withAnchorsOf = <T extends { anchors: Anchor[] }>(snapshot: T, reference: { anchors: Anchor[] }): T => ({
    ...snapshot,
    anchors: reference.anchors.map(anchor => {
      const live = snapshot.anchors.find(entry => entry.id === anchor.id) as Record<string, unknown> | undefined;
      return (live ? Object.fromEntries(Object.keys(anchor).map(key => [key, live[key]])) : undefined) as unknown as Anchor;
    })
  });
  /** Layout 29 routed mainland roads, re-routed in layout 30 over the reshaped cove and valley. */
  const restoreLayout29MainlandRoutes = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    withRoutes(snapshot, snapshot.routes.map(route =>
      (layout29MainlandRoutes as WorldRoute[]).find(previous => previous.id === route.id) ?? route));
  /** Layout 28 hand-knotted mainland roads, replaced in layout 29 by routed legs. */
  const restoreLayout28MainlandRoutes = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    withRoutes(snapshot, snapshot.routes.map(route =>
      (layout28MainlandRoutes as WorldRoute[]).find(previous => previous.id === route.id) ?? route));
  const restoreCoastalRoad = (snapshot: ReturnType<typeof captureTerrainPreservation>) => {
    const layout28 = restoreLayout28MainlandRoutes(snapshot);
    return withRoutes(layout28, layout28.routes.map(route =>
      route.id === previousRoad.id ? previousRoad as WorldRoute : route));
  };
  type GroundRow = { id: string; x: number; z: number; height: number };
  /**
   * Village yard heights move with their mainland ground: layout 22 reworked
   * the road crowns and layout 29 levels Highridge on its natural bench. Their
   * coordinates, and every other anchor, stay exact.
   */
  const MAINLAND_MARKET_IDS = ["market.pinewatch", "market.reedhaven", "market.highridge"];
  const withMarketHeightsFrom = <T extends { anchors: { id: string; height: number }[] }>(
    snapshot: T,
    reference: { anchors: { id: string; height: number }[] }
  ): T => ({
    ...snapshot,
    anchors: snapshot.anchors.map(anchor => MAINLAND_MARKET_IDS.includes(anchor.id)
      ? { ...anchor, height: reference.anchors.find(entry => entry.id === anchor.id)?.height ?? anchor.height }
      : anchor)
  });
  /**
   * Layout 28 levels the Sunreach terrace beds (`TerraceProfile`) and regrades
   * the working settlement around them. From then on the live snapshot pins the
   * terrace ground heights, the two terrace station heights and the Sunreach
   * samples; every coordinate, and all other working ground and anchors, still
   * match each historical snapshot exactly.
   */
  const SUNREACH_TERRACE_GROUND = "farm.sunreach_terraces:";
  const SUNREACH_TERRACE_ANCHOR_IDS = ["struct.sunreach_hand_mill", "struct.sunreach_workbench"];
  const withSunreachTerracesFrom = <T extends { workingGround: GroundRow[]; anchors: { id: string; height: number }[]; sunreachHash: string }>(
    snapshot: T,
    reference: { workingGround: GroundRow[]; anchors: { id: string; height: number }[]; sunreachHash: string }
  ): T => ({
    ...snapshot,
    workingGround: snapshot.workingGround.map(row => row.id.startsWith(SUNREACH_TERRACE_GROUND)
      ? { ...row, height: reference.workingGround.find(entry =>
        entry.id === row.id && entry.x === row.x && entry.z === row.z)?.height ?? row.height }
      : row),
    anchors: snapshot.anchors.map(anchor => SUNREACH_TERRACE_ANCHOR_IDS.includes(anchor.id)
      ? { ...anchor, height: reference.anchors.find(entry => entry.id === anchor.id)?.height ?? anchor.height }
      : anchor),
    sunreachHash: reference.sunreachHash
  });
  /** Layout 23 arm geometry for the independently retained layout23 hash. */
  const restorePreSpringTrails = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    withRoutes(snapshot, snapshot.routes.map(route =>
      (previousTrails as WorldRoute[]).find(previous => previous.id === route.id) ?? route));
  /** Layout 26 arm geometry (pre-layout27) for the layout24/25 route hash. */
  const restoreLayout26Trails = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    withRoutes(snapshot, snapshot.routes.map(route =>
      (previousTrailArms as WorldRoute[]).find(previous => previous.id === route.id) ?? route));
  const restorePreSpringWorld = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    restorePreSpringTrails(restoreCoastalRoad(snapshot));
  const restoreLayout25World = (snapshot: ReturnType<typeof captureTerrainPreservation>) =>
    restoreLayout26Trails(restoreCoastalRoad(snapshot));
  beforeAll(() => {
    current = captureTerrainPreservation(baseline.routeIds, baseline.sunreachSampling);
    historicalCurrent = withEarlierCompostAnchor(withRoadGradingFrom(
      { ...current, lowerRiver: beforeCoastalValley.lowerRiver }, beforeMainDock));
  });

  it("separates the existing starter-compost move from the road revision", () => {
    for (const field of Object.keys(beforeJunctions) as Array<keyof typeof beforeJunctions>) {
      if (field !== "anchors") expect(beforeCoastalValley[field]).toEqual(beforeJunctions[field]);
    }
    expect(beforeCoastalValley.anchors.filter((anchor, index) =>
      JSON.stringify(anchor) !== JSON.stringify(beforeJunctions.anchors[index])).map(anchor => anchor.id))
      .toEqual(["struct.starter_compost"]);
    expect(withAnchorsOf(historicalCurrent, beforeJunctions).anchors).toEqual(beforeJunctions.anchors);
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
    for (const id of ["market.harbor", "fish-market", "market.village", "dock"]) {
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
    const historical = withSunreachTerracesFrom(withEarlierCompostAnchor(withRoadGradingFrom(
      captureTerrainPreservation(beforeMainland.routeIds, beforeMainland.sunreachSampling), beforeMainDock)), beforeMainland);
    const { workingChecks } = compareTerrainPreservation(historical, beforeMainland);
    for (const field of ["workingGround", "routeIds", "sunreachSampling", "sunreachHash", "sunreachSampleCount"] as const) {
      expect(workingChecks[field], field).toBe(true);
    }
    // Replay only the explicitly redesigned roads and trails; all other route
    // geometry must still match the independently retained layout23 hash.
    expect(compareTerrainPreservation(restorePreSpringWorld(withLayout37Routes(historicalCurrent, beforeValley.routeIds)), beforeValley)
      .workingChecks.routeHash).toBe(true);
    // The kitchen's documented v48 move predates the mainland. New market
    // anchors are additive; every other historical anchor remains exact.
    const recorded = withAnchorsOf(historical, beforeMainland).anchors;
    for (const [index, anchor] of beforeMainland.anchors.entries()) {
      if (anchor.id === "struct.kitchen") continue;
      expect(recorded[index], anchor.id).toEqual(anchor);
    }
  });

  it("changes only the re-routed mainland roads and their market crowns across the layout30 cove reshape", () => {
    const restored = withSunreachRoadsFrom(withAnchorsOf(withMarketHeightsFrom(
      restoreLayout29MainlandRoutes(withLayout37Routes(historicalCurrent, beforeCove.routeIds)), beforeCove), beforeCove), beforeCove);
    for (const [field, matches] of Object.entries(compareTerrainPreservation(restored, beforeCove).workingChecks)) {
      expect(matches, field).toBe(true);
    }
  });

  it("changes only the coastal road, the headwater trail arms and the routed mainland roads while preserving river, work sites and other routes", () => {
    const restored = withAnchorsOf(withSunreachTerracesFrom(withMarketHeightsFrom(
      restoreLayout25World(withLayout37Routes(historicalCurrent, beforeRoad.routeIds)), beforeRoad), beforeRoad), beforeRoad);
    for (const [field, matches] of Object.entries(compareTerrainPreservation(restored, beforeRoad).workingChecks)) {
      expect(matches, field).toBe(true);
    }
  });

  it("retains bridge and estuary support across the intentional river redesign", () => {
    const protectedStations = (rows: typeof current.lowerRiver) => rows.filter(row =>
      Number(row.z) >= -20 && Number(row.z) <= 14 || Number(row.z) >= 80);
    expect(protectedStations(historicalCurrent.lowerRiver)).toEqual(protectedStations(beforeRiver.lowerRiver));
    const terraced = withSunreachTerracesFrom(historicalCurrent, beforeRiver);
    expect(terraced.workingGround).toEqual(beforeRiver.workingGround);
    expect(withAnchorsOf(withMarketHeightsFrom(terraced, beforeRiver), beforeRiver).anchors).toEqual(beforeRiver.anchors);
    expect(compareTerrainPreservation(restoreLayout25World(withLayout37Routes(historicalCurrent, beforeRiver.routeIds)), beforeRiver)
      .workingChecks.routeHash).toBe(true);
  });

  it("retains layout22 working fields and anchor coordinates across the contour-road rework", () => {
    const terraced = withSunreachTerracesFrom(withLayout37Routes(historicalCurrent, beforeOrganic.routeIds), beforeOrganic);
    for (const field of ["workingGround", "routeIds", "sunreachSampling", "sunreachHash", "sunreachSampleCount"] as const) {
      expect(terraced[field], field).toEqual(beforeOrganic[field]);
    }
    const recorded = withAnchorsOf(terraced, beforeOrganic).anchors;
    for (const [index, anchor] of beforeOrganic.anchors.entries()) {
      const actual = recorded[index];
      // These three village ground heights include the intentionally reworked
      // road crowns; the current revision snapshot pins their new heights.
      const comparable = MAINLAND_MARKET_IDS.includes(anchor.id) ? { ...actual, height: anchor.height } : actual;
      expect(comparable, anchor.id).toEqual(anchor);
    }
  });
});

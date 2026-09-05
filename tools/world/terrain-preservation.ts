import { createHash } from "node:crypto";
import harborApproachCorrection from "./neva-harbor-approach-preservation.json";
import { WORLD_FARM_DEFINITIONS, WORLD_MARKET_LOCATIONS, WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { WORLD_ISLAND_DEFINITIONS } from "../../src/world/WorldIslands";
import { FARM_ROUTES, WORLD_ROUTES, WorldLayout, type WorldBounds } from "../../src/world/WorldLayout";

const fixed = (value: number): number => Number(value.toFixed(6));
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

interface SunreachSampling {
  bounds: Readonly<WorldBounds>;
  spacingMeters: number;
}

/** Physical working footprints and the other island survive the northern reshape. */
export function captureTerrainPreservation(
  routeIds?: readonly string[],
  sunreachSampling: SunreachSampling = {
    bounds: WORLD_ISLAND_DEFINITIONS["island.sunreach"].authoredBounds,
    spacingMeters: 6
  }
) {
  const workingGround: Array<{ id: string; x: number; z: number; height: number }> = [];
  for (const farm of Object.values(WORLD_FARM_DEFINITIONS)) {
    for (const [index, area] of farm.plantableAreas.entries()) {
      for (let x = area.minX; x <= area.maxX; x += 2) {
        for (let z = area.minZ; z <= area.maxZ; z += 2) {
          const worldX = farm.origin.x + x;
          const worldZ = farm.origin.z + z;
          workingGround.push({ id: `${farm.id}:${index}`, x: fixed(worldX), z: fixed(worldZ), height: fixed(WorldLayout.terrainHeight(worldX, worldZ)) });
        }
      }
    }
  }
  const anchors = [
    ...Object.values(WORLD_STATION_DEFINITIONS).map((station) => ({ id: station.id, ...station.position })),
    ...Object.values(WORLD_MARKET_LOCATIONS).map((market) => ({ id: market.id, ...market.position })),
    ...(["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const)
      .map((id) => WorldLayout.landmark(id))
  ].map((anchor) => ({ ...anchor, height: fixed(WorldLayout.terrainHeight(anchor.x, anchor.z)) }));
  const lowerRiver = [];
  for (let z = -116; z <= 82; z += 2) {
    const section = WorldLayout.riverSectionAt(z);
    lowerRiver.push(Object.fromEntries(Object.entries(section).filter(([key]) => key !== "surfaceElevation")));
  }
  const { bounds, spacingMeters } = sunreachSampling;
  const sunreach = [];
  for (let x = bounds.minX; x <= bounds.maxX; x += spacingMeters) {
    for (let z = bounds.minZ; z <= bounds.maxZ; z += spacingMeters) {
      sunreach.push([x, z, fixed(WorldLayout.terrainHeight(x, z)), fixed(WorldLayout.waterSignedDistance(x, z)), WorldLayout.regionAt(x, z)]);
    }
  }
  const routes = [...WORLD_ROUTES, ...FARM_ROUTES].filter((route) => !routeIds || routeIds.includes(route.id));
  return { sunreachSampling, workingGround, anchors, lowerRiver, routes, routeIds: routes.map((route) => route.id), routeHash: hash(routes), sunreachHash: hash(sunreach), sunreachSampleCount: sunreach.length };
}

type TerrainPreservationSnapshot = ReturnType<typeof captureTerrainPreservation>;
type HistoricalTerrainPreservation = Omit<TerrainPreservationSnapshot, "routes">;

export function compareTerrainPreservation(
  current: TerrainPreservationSnapshot,
  baseline: HistoricalTerrainPreservation
) {
  const fields = Object.keys(baseline) as Array<keyof HistoricalTerrainPreservation>;
  const historicalChecks = Object.fromEntries(fields.map((field) => [field, hash(current[field]) === hash(baseline[field])])) as Record<keyof HistoricalTerrainPreservation, boolean>;
  const workingChecks = { ...historicalChecks };
  let correctedEndpointsMatch = hash(current.routes) === current.routeHash;
  const routesWithHistoricalEndpoints = current.routes.map((route) => {
    if (!harborApproachCorrection.routeIds.includes(route.id)) return route;
    correctedEndpointsMatch &&= hash(route.points.at(-1)) === hash(harborApproachCorrection.correctedEndpoint);
    return { ...route, points: [...route.points.slice(0, -1), harborApproachCorrection.originalEndpoint] };
  });
  workingChecks.routeHash = correctedEndpointsMatch && hash(routesWithHistoricalEndpoints) === baseline.routeHash;

  let correctedHeightsMatch = true;
  const anchorsWithHistoricalHeights = current.anchors.map((anchor) => {
    const correction = harborApproachCorrection.anchors.find((entry) => entry.id === anchor.id);
    if (!correction) return anchor;
    const original = baseline.anchors.find((entry) => entry.id === anchor.id);
    correctedHeightsMatch &&= anchor.height === correction.height
      && anchor.x === harborApproachCorrection.originalEndpoint.x
      && anchor.z === harborApproachCorrection.originalEndpoint.z;
    return { ...anchor, height: original?.height };
  });
  workingChecks.anchors = correctedHeightsMatch && hash(anchorsWithHistoricalHeights) === hash(baseline.anchors);
  return { historicalChecks, workingChecks };
}

if (process.argv.includes("--capture")) process.stdout.write(`${JSON.stringify(captureTerrainPreservation(), null, 2)}\n`);

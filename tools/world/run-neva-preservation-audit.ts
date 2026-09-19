import { createHash } from "node:crypto";
import baseline from "./neva-layout10-working-preservation.json";
import { captureTerrainPreservation, compareTerrainPreservation } from "./terrain-preservation";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { WORLD_ISLAND_DEFINITIONS } from "../../src/world/WorldIslands";
import {
  FARM_ROUTES,
  WORLD_LAYOUT_V5,
  WORLD_ROUTES,
  WorldLayout
} from "../../src/world/WorldLayout";

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function fixed(value: number): number {
  return Number(value.toFixed(6));
}

const terrainWaterSamples = [];
const nevaBounds = WORLD_ISLAND_DEFINITIONS["island.neva"].authoredBounds;
const terrainSampling = { bounds: nevaBounds, spacingMeters: 6 };
for (let x = nevaBounds.minX; x <= nevaBounds.maxX; x += terrainSampling.spacingMeters) {
  for (let z = nevaBounds.minZ; z <= nevaBounds.maxZ; z += terrainSampling.spacingMeters) {
    const surface = WorldLayout.terrainSurfaceSample(x, z);
    terrainWaterSamples.push({
      x,
      z,
      terrain: fixed(WorldLayout.terrainHeight(x, z)),
      water: fixed(WorldLayout.waterSignedDistance(x, z)),
      normalY: fixed(WorldLayout.terrainNormalY(x, z)),
      walkable: WorldLayout.isWalkable(x, z),
      region: WorldLayout.regionAt(x, z),
      weights: Object.fromEntries(
        Object.entries(surface.weights).map(([key, value]) => [key, fixed(value)])
      )
    });
  }
}

const routes = [...WORLD_ROUTES, ...FARM_ROUTES, ...MAINLAND_ROUTES].map((route) => ({
  ...route,
  points: route.points.map((point) => ({ x: fixed(point.x), z: fixed(point.z) }))
}));
const landmarks = Object.fromEntries(
  (["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const)
    .map((id) => [id, WorldLayout.landmark(id)])
);

const working = captureTerrainPreservation(baseline.routeIds, baseline.sunreachSampling);
const { historicalChecks, workingChecks } = compareTerrainPreservation(working, baseline);

process.stdout.write(`${JSON.stringify({
  layoutRevision: WORLD_LAYOUT_V5.revision,
  terrainWaterHash: hash(terrainWaterSamples),
  routeHash: hash(routes),
  landmarkHash: hash(landmarks),
  terrainSampling,
  sampleCount: terrainWaterSamples.length,
  historicalChecks,
  workingChecks
})}\n`);

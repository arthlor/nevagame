import { createHash } from "node:crypto";
import baseline from "./neva-layout10-working-preservation.json";
import { captureTerrainPreservation } from "./terrain-preservation";
import {
  FARM_ROUTES,
  WORLD_BOUNDS,
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
for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 6) {
  for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 6) {
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

const routes = [...WORLD_ROUTES, ...FARM_ROUTES].map((route) => ({
  ...route,
  points: route.points.map((point) => ({ x: fixed(point.x), z: fixed(point.z) }))
}));
const landmarks = Object.fromEntries(
  (["farmhouse", "well", "bridge", "fish-market", "lighthouse", "windmill", "dock"] as const)
    .map((id) => [id, WorldLayout.landmark(id)])
);

const working = captureTerrainPreservation(baseline.routeIds);
const workingChecks = Object.fromEntries(Object.keys(baseline).map((key) => [
  key,
  hash(working[key as keyof typeof working]) === hash(baseline[key as keyof typeof baseline])
]));

process.stdout.write(`${JSON.stringify({
  layoutRevision: WORLD_LAYOUT_V5.revision,
  terrainWaterHash: hash(terrainWaterSamples),
  routeHash: hash(routes),
  landmarkHash: hash(landmarks),
  sampleCount: terrainWaterSamples.length,
  workingChecks
})}\n`);

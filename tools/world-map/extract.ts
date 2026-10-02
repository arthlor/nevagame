/** Source-driven, build-only geography extraction. No save or runtime module is changed. */
import fs from "node:fs";
import path from "node:path";
import config from "./config.json";
import { contours, type Bounds, type Point } from "./contours";
import { WorldLayout, SAILABLE_BOUNDS, WORLD_LAYOUT_V5, COMPILED_WORLD_ROUTES, BRIDGE_WORLD_PROFILE } from "../../src/world/WorldLayout";
import { MAINLAND_RIVER, MAINLAND_LAKE, mainlandWaterSample, mainlandBiomeWeightsAt } from "../../src/world/NevaMainland";
import { MAINLAND_BROOK_COURSES } from "../../src/world/MainlandBrooks.generated";
import { STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";

const outIndex = process.argv.indexOf("--out");
const out = process.argv[outIndex + 1];
if (outIndex < 0 || !out) throw new Error("Usage: vite-node extract.ts -- --out <directory>");
fs.mkdirSync(out, { recursive: true });
const bounds = { ...SAILABLE_BOUNDS };
const pixelsPerWorldUnit = (config.width - 2 * config.paddingPixels) / (bounds.maxX - bounds.minX);
const projection = {
  width: config.width,
  height: Math.round((bounds.maxZ - bounds.minZ) * pixelsPerWorldUnit + 2 * config.paddingPixels),
  paddingPixels: config.paddingPixels,
  pixelsPerWorldUnit,
  bounds
};
const riverSections = [];
// Continue to the authored river mouth and a render-only contour margin. The coast clips its end.
for (let z = NEVA_HEADWATERS.source.z; z <= WORLD_LAYOUT_V5.riverMouth.z + config.waterContourMarginMeters; z += config.waterContourStepMeters) {
  riverSections.push(WorldLayout.riverSectionAt(z));
}
const sourceCap = Array.from({ length: 33 }, (_, i) => {
  const angle = Math.PI + i / 32 * Math.PI;
  return { x: NEVA_HEADWATERS.source.x + Math.cos(angle) * NEVA_HEADWATERS.sourceRadiusMeters,
    z: NEVA_HEADWATERS.source.z + Math.sin(angle) * NEVA_HEADWATERS.sourceRadiusMeters };
});
const riverPolygon = [...sourceCap,
  ...riverSections.map(section => ({ x: section.centerX + section.rightWaterWidth, z: section.z })),
  ...riverSections.slice().reverse().map(section => ({ x: section.centerX - section.leftWaterWidth, z: section.z }))];
// Derive the sampling window from current authored water geometry, never copied coordinates.
const margin = config.waterContourMarginMeters;
const freshwaterBounds: Bounds = {
  minX: Math.min(MAINLAND_LAKE.center.x - MAINLAND_LAKE.radiusX, ...MAINLAND_RIVER.map(point => point.x)) - margin,
  maxX: Math.max(MAINLAND_LAKE.center.x + MAINLAND_LAKE.radiusX, ...MAINLAND_RIVER.map(point => point.x)) + margin,
  minZ: Math.min(MAINLAND_LAKE.center.z - MAINLAND_LAKE.radiusZ, ...MAINLAND_RIVER.map(point => point.z)) - margin,
  maxZ: Math.max(MAINLAND_LAKE.center.z + MAINLAND_LAKE.radiusZ, ...MAINLAND_RIVER.map(point => point.z)) + margin
};
const mainlandWaterPolygons = contours((x, z) => mainlandWaterSample(x, z).signedDistance,
  freshwaterBounds, config.waterContourStepMeters);
const islands = WorldLayout.islands();
const step = config.terrainStepMeters;
const width = Math.round((bounds.maxX - bounds.minX) / step) + 1;
const height = Math.round((bounds.maxZ - bounds.minZ) / step) + 1;
if (Math.abs((width - 1) * step - (bounds.maxX - bounds.minX)) > 1e-8 ||
    Math.abs((height - 1) * step - (bounds.maxZ - bounds.minZ)) > 1e-8) {
  throw new Error("terrainStepMeters must divide the current sailing bounds exactly.");
}
const terrain = new Float32Array(width * height);
const water = new Uint8Array(width * height);
const biomes = new Uint8Array(width * height * 4);
console.info(`Sampling ${width * height} canonical terrain points…`);
for (let j = 0; j < height; j++) {
  const z = bounds.minZ + j * step;
  for (let i = 0; i < width; i++) {
    const x = bounds.minX + i * step, index = j * width + i;
    terrain[index] = WorldLayout.terrainHeight(x, z);
    water[index] = WorldLayout.waterSignedDistance(x, z) > 0 ? 1 : 0;
    if (WorldLayout.islandAt(x, z) === "island.neva") {
      const biome = mainlandBiomeWeightsAt(x, z);
      biomes.set([biome.temperate, biome.pineForest, biome.reedMarsh, biome.highlands].map(weight => Math.round(weight * 255)), index * 4);
    }
  }
  if (j % 100 === 0) console.info(`Terrain rows ${j}/${height}`);
}
// Explicit endian encoding keeps the extraction portable rather than native-endian dependent.
const elevationBytes = Buffer.alloc(terrain.byteLength);
for (let index = 0; index < terrain.length; index++) elevationBytes.writeFloatLE(terrain[index], index * 4);
fs.writeFileSync(path.join(out, "terrain.f32"), elevationBytes);
fs.writeFileSync(path.join(out, "water.u8"), water);
fs.writeFileSync(path.join(out, "biomes.u8"), biomes);
console.info(`Generating canonical static placements for seed ${config.worldSeed}…`);
const placements = createWorldStaticPlacements(config.worldSeed);
const rotated = (center: Point, hx: number, hz: number): Point[] =>
  [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => ({ x: center.x + x, z: center.z + z }));
const data = {
  projection,
  source: { worldSeed: config.worldSeed, layoutRevision: WORLD_LAYOUT_V5.revision },
  bounds,
  islands,
  riverPolygon,
  mainlandWaterPolygons,
  brooks: MAINLAND_BROOK_COURSES,
  routes: COMPILED_WORLD_ROUTES.map(compiled => ({ ...compiled.route, points: compiled.samples.map(sample => sample.point) })),
  farms: [STARTER_FARM_LAYOUT, PLAYER_HOMESTEAD_LAYOUT, SUNREACH_FARM_LAYOUT],
  trees: placements.filter(placement => placement.assetId.startsWith("tree_")),
  staticPlacements: placements.filter(placement => placement.assetId.startsWith("building_") || placement.assetId.startsWith("house_")),
  bridges: [{ polygon: rotated(WORLD_LAYOUT_V5.anchors.bridge, BRIDGE_WORLD_PROFILE.spanLength / 2, BRIDGE_WORLD_PROFILE.deckWidth / 2) }],
  terrain: { file: "terrain.f32", waterFile: "water.u8", biomeFile: "biomes.u8", width, height,
    minX: bounds.minX, minZ: bounds.minZ, step }
};
fs.writeFileSync(path.join(out, "world-data.json"), JSON.stringify(data));
console.info(`Extracted ${islands.length} islands, ${data.routes.length} routes, ${data.trees.length} trees.`);

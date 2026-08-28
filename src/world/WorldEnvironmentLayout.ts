import { WorldLayout, WORLD_BOUNDS, WORLD_LAYOUT_V5, type WorldArchitecturePad } from "./WorldLayout";
import { STARTER_DONKEY_ANCHOR, STARTER_FARM_LAYOUT, farmLocalToWorld, starterStructureAnchor } from "./FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "./FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, HARBOR_SKIFF_MOORING, RIVER_CROSSING, VILLAGE_MARKET } from "./WorldAnchors";

export type EnvironmentQualityTier = "low" | "medium" | "high";
export type EnvironmentPlacementOrigin = "authored" | "layout-derived" | "seeded-fill";
export type GroundCoverCategory = "grass" | "flowers" | "bushes" | "meadowTall" | "pebbles" | "paving" | "driftwood";

export interface EnvironmentAssetPlacement {
  id: string;
  origin: EnvironmentPlacementOrigin;
  assetId: string;
  x: number;
  z: number;
  rotationY: number;
  scale: readonly [number, number, number];
  /** Absolute height for floating vegetation or elevated display props; otherwise terrain-grounded. */
  y?: number;
  /** Unscaled half-extents of the asset's grounding footprint. */
  grounding?: readonly [number, number];
  /** Authored frontage envelope used by world-layout review and placement tooling. */
  clearanceRadiusMeters?: number;
  /** Walkable distance reserved in front of the published +Z doorway. */
  frontApproachMeters?: number;
  practicalLight?: boolean;
}

export interface PlacementOverride {
  x: number;
  z: number;
  rotationY: number;
}

/** DEV layout-editor pins for seeded/layout-derived instances. Empty until an in-game drop writes an id. */
export const PLACEMENT_OVERRIDES: Readonly<Record<string, PlacementOverride>> = {
  "seeded-fill.bushes.homestead.003": { x: -48.2, z: -55.5, rotationY: 3.7574 },
  "seeded-fill.trees.northwest-farm.023": { x: -74.3, z: -71.1, rotationY: 1.0894 },
  "seeded-fill.bushes.homestead.006": { x: -78.1, z: -60.3, rotationY: 3.6746 },
  "seeded-fill.bushes.northwest.001": { x: -62.8, z: -45.4, rotationY: 2.1949 },
  "seeded-fill.bushes.northwest.012": { x: -65.8, z: -43.3, rotationY: 1.5159 },
  "seeded-fill.trees.central-village.001": { x: 33.2, z: -38.4, rotationY: 3.4087 },
  "seeded-fill.trees.northwest-farm.001": { x: -77.7, z: -76.2, rotationY: 1.3619 },
  "seeded-fill.trees.northwest-farm.002": { x: -67, z: -74.1, rotationY: 5.1019 },
  "seeded-fill.trees.northwest-farm.009": { x: -47.5, z: -48.5, rotationY: 3.5326 },
  "seeded-fill.trees.southeast-harbor.007": { x: 106.9, z: 34, rotationY: 4.453 },
  "seeded-fill.trees.southeast-harbor.006": { x: 85.8, z: 49.5, rotationY: 5.3055 },
  "seeded-fill.bushes.uplands.001": { x: 50.7, z: -29.3, rotationY: 6.2832 },
  "seeded-fill.bushes.uplands.014": { x: 30.4, z: -23.8, rotationY: 2.7361 },
  "seeded-fill.bushes.coastal.018": { x: 97.8, z: 58.9, rotationY: 3.7116 },
  "seeded-fill.bushes.coastal.004": { x: 36.9, z: 22.2, rotationY: 2.3684 },
};

/** Seeded/layout-derived instances removed by the DEV layout editor. */
export const PLACEMENT_REMOVED: readonly string[] = [
];

export function applyPlacementOverrides(
  placements: readonly EnvironmentAssetPlacement[]
): EnvironmentAssetPlacement[] {
  return placements.map((placement) => {
    const override = PLACEMENT_OVERRIDES[placement.id];
    return override
      ? { ...placement, x: override.x, z: override.z, rotationY: override.rotationY }
      : placement;
  });
}

export interface GroundCoverPlacement extends EnvironmentAssetPlacement {
  category: GroundCoverCategory;
  origin: "seeded-fill";
}

export interface WorldEnvironmentLayout {
  worldSeed: number;
  staticPlacements: readonly EnvironmentAssetPlacement[];
  groundCoverPlacements: readonly GroundCoverPlacement[];
}

/** @internal Exported so declared cluster failure behavior can be regression-tested. */
export interface EnvironmentClusterDefinition {
  id: string;
  salt: number;
  count: number;
  center: Readonly<{ x: number; z: number }>;
  radiusX: number;
  radiusZ: number;
  assetIds: readonly string[];
  scaleRange: readonly [number, number];
}

interface GroundCoverPatchDistribution {
  patchCount: number;
  radiusRange: readonly [number, number];
  depthScaleRange: readonly [number, number];
  /** Reject patch centers that cannot host cover (water, farm soil, interiors). */
  centerPredicate?: (x: number, z: number) => boolean;
  /** Spread the low meadow layer across land cells before adding accent pockets. */
  stratified?: boolean;
}

export const GROUND_COVER_DENSITY: Readonly<
  Record<EnvironmentQualityTier, Readonly<Record<GroundCoverCategory, number>>>
> = {
  high: { grass: 11400, flowers: 2520, bushes: 180, meadowTall: 960, pebbles: 640, paving: 180, driftwood: 30 },
  medium: { grass: 6080, flowers: 1340, bushes: 96, meadowTall: 520, pebbles: 340, paving: 96, driftwood: 18 },
  low: { grass: 2660, flowers: 560, bushes: 42, meadowTall: 220, pebbles: 150, paving: 42, driftwood: 9 }
};

/** Extra tufts around the starter farm meadow, outside plantable soil. */
export const HOMESTEAD_MEADOW_GRASS_COUNT = 900;

/** Grass and flowers may sit in the overlay feather, not the packed dirt core. */
export const GRASS_MAX_PATH_INFLUENCE = 0.36;

/**
 * Presentation-only silhouette calibration for catalog ground-cover clumps.
 * Flower drifts stay broad but low, while tall meadow assets remain readable
 * accents instead of forming a dark vertical fence at route shoulders.
 */
export const GROUND_COVER_SCALE_PROFILE: Readonly<
  Record<GroundCoverCategory, Readonly<{ horizontal: number; vertical: number }>>
> = {
  grass: { horizontal: 1, vertical: 1 },
  flowers: { horizontal: 1.05, vertical: 0.56 },
  bushes: { horizontal: 1, vertical: 1 },
  meadowTall: { horizontal: 1.02, vertical: 0.78 },
  pebbles: { horizontal: 1, vertical: 1 },
  paving: { horizontal: 1, vertical: 1 },
  driftwood: { horizontal: 1, vertical: 1 }
};

const SEEDED_FILL_CLUSTERS: readonly EnvironmentClusterDefinition[] = [
  { id: "trees.northwest-farm", salt: 811, count: 26, center: { x: -88, z: -64 }, radiusX: 26, radiusZ: 24, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c", "tree_apple_a"], scaleRange: [0.9, 1.12] },
  { id: "trees.northern-river", salt: 823, count: 24, center: { x: -42, z: -104 }, radiusX: 24, radiusZ: 42, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.94, 1.14] },
  { id: "trees.northeast-orchard", salt: 827, count: 30, center: { x: 90, z: -46 }, radiusX: 22, radiusZ: 20, assetIds: ["tree_apple_a", "tree_apple_a", "tree_oak_b"], scaleRange: [0.88, 1.08] },
  { id: "trees.central-village", salt: 829, count: 16, center: { x: 24, z: -30 }, radiusX: 20, radiusZ: 16, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.92, 1.1] },
  { id: "trees.southwest-headland", salt: 839, count: 22, center: { x: -102, z: 45 }, radiusX: 35, radiusZ: 24, assetIds: ["tree_pine_a", "tree_pine_b", "tree_oak_c"], scaleRange: [0.9, 1.12] },
  { id: "trees.southeast-harbor", salt: 853, count: 16, center: { x: 105, z: 43 }, radiusX: 30, radiusZ: 25, assetIds: ["tree_pine_a", "tree_pine_b", "tree_oak_c"], scaleRange: [0.92, 1.14] },
  { id: "trees.eastern-meadow", salt: 857, count: 20, center: { x: 126, z: -48 }, radiusX: 30, radiusZ: 42, assetIds: ["tree_oak_a", "tree_oak_c", "tree_pine_a"], scaleRange: [0.9, 1.1] },
  { id: "trees.farm-west-ridge", salt: 883, count: 16, center: { x: -118, z: -52 }, radiusX: 22, radiusZ: 18, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c", "tree_apple_a"], scaleRange: [0.9, 1.12] },
  { id: "trees.inland-north", salt: 887, count: 18, center: { x: -8, z: -92 }, radiusX: 28, radiusZ: 22, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.92, 1.12] },
  { id: "trees.village-south-slope", salt: 893, count: 14, center: { x: 38, z: -18 }, radiusX: 22, radiusZ: 18, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.9, 1.1] },
  { id: "bushes.northwest", salt: 859, count: 22, center: { x: -77, z: -45 }, radiusX: 47, radiusZ: 42, assetIds: ["foliage_bush_a"], scaleRange: [0.8, 1.12] },
  { id: "bushes.homestead", salt: 881, count: 8, center: { x: -76, z: -68 }, radiusX: 12, radiusZ: 9, assetIds: ["foliage_bush_a"], scaleRange: [0.72, 0.98] },
  { id: "bushes.uplands", salt: 863, count: 18, center: { x: 70, z: -45 }, radiusX: 48, radiusZ: 38, assetIds: ["foliage_bush_a"], scaleRange: [0.8, 1.1] },
  { id: "bushes.coastal", salt: 877, count: 20, center: { x: 0, z: 45 }, radiusX: 145, radiusZ: 28, assetIds: ["foliage_bush_a"], scaleRange: [0.82, 1.12] }
];

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mixSeed(worldSeed: number, salt: number): number {
  let value = (worldSeed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function stablePlacementId(groupId: string, index: number): string {
  return `seeded-fill.${groupId}.${index.toString().padStart(3, "0")}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Low, broad clumps make one meadow carpet instead of isolated dark spikes. */
function grassClumpScale(variant: number): { horizontal: number; vertical: number } {
  if (variant === 2) return { horizontal: 1.02, vertical: 0.84 };
  if (variant === 1) return { horizontal: 1.08, vertical: 0.8 };
  return { horizontal: 1.12, vertical: 0.72 };
}

/** @internal Deterministic world-space bias used to form broad meadow grass pockets. */
export function grassPlacementDensityAt(x: number, z: number): number {
  const meadowWeight = WorldLayout.terrainSurfaceSample(x, z).weights.meadow;
  const roadsideWeight = WorldLayout.pathShoulderInfluence(x, z);
  const broadSignal = 0.5
    + Math.sin(x * 0.041 + z * 0.026 + 0.8) * 0.27
    + Math.cos(x * 0.019 - z * 0.047 - 0.6) * 0.19;
  const pocket = clamp01((broadSignal - 0.28) / 0.5);
  const clusteredPocket = pocket * pocket * (3 - 2 * pocket);
  return clamp01(
    0.34
      + meadowWeight * 0.78
      + roadsideWeight * 0.24
      + clusteredPocket * (0.38 + meadowWeight * 0.42)
  );
}

/** Deterministic warped world-space cells keep grass palette variants in broad patches. */
export function groundCoverPatchVariantIndex(
  x: number,
  z: number,
  worldSeed: number,
  variantCount: number = 3
): number {
  if (!Number.isInteger(variantCount) || variantCount <= 0) {
    throw new Error(`[WorldEnvironmentLayout] Invalid ground-cover variant count ${variantCount}`);
  }
  const phase = ((worldSeed >>> 0) / 0xffffffff) * Math.PI * 2;
  const warpedX = x + Math.sin(z * 0.035 + phase) * 7;
  const warpedZ = z + Math.cos(x * 0.031 - phase) * 7;
  const patchX = Math.floor(warpedX / 24);
  const patchZ = Math.floor(warpedZ / 21);
  const patchSalt = Math.imul(patchX, 0x1f123bb5) ^ Math.imul(patchZ, 0x5f356495);
  return mixSeed(worldSeed, patchSalt) % variantCount;
}

export type FarmPathPaverToken = "stone_warm_01" | "stone_golden_01";

export interface FarmPathPaverSample {
  x: number;
  z: number;
  rotationY: number;
  radius: number;
  depth: number;
  height: number;
  sides: 5 | 6;
  token: FarmPathPaverToken;
}

const FARM_PATH_PAVER_ROUTE_IDS = new Set([
  "farm-home",
  "farm-entry",
  "farm-work-zone",
  "farm-village"
]);

/** Packed-core stepping slabs for the homestead camera. Presentation only. */
export function generateFarmPathPaverSamples(): FarmPathPaverSample[] {
  const farmOrigin = STARTER_FARM_LAYOUT.origin;
  const samples: FarmPathPaverSample[] = [];
  for (const compiled of WorldLayout.compiledRouteNetwork()) {
    if (!FARM_PATH_PAVER_ROUTE_IDS.has(compiled.route.id)) continue;
    const spacing = compiled.route.kind === "arterial" ? 3.2 : 2.15;
    let nextDistance = compiled.route.id === "farm-home" ? 0.45 : 0.9;
    for (const [sampleIndex, sample] of compiled.samples.entries()) {
      if (sample.distanceAlongRoute + 1e-4 < nextDistance) continue;
      if (
        compiled.route.id === "farm-village"
        && distanceTo(sample.point.x, sample.point.z, farmOrigin) > 54
      ) continue;
      nextDistance = sample.distanceAlongRoute + spacing;
      const side = Math.sin(sample.distanceAlongRoute * 0.73 + sampleIndex * 1.17) >= 0 ? 1 : -1;
      const lateral = compiled.halfWidth * (
        0.1 + Math.abs(Math.sin(sample.distanceAlongRoute * 0.41 + sampleIndex)) * 0.32
      );
      const x = sample.point.x + sample.normal.x * side * lateral;
      const z = sample.point.z + sample.normal.z * side * lateral;
      if (WorldLayout.isWater(x, z) || WorldLayout.isBridgeDeck(x, z)) continue;
      const surface = WorldLayout.terrainSurfaceSample(x, z);
      if (surface.farmInfluence > 0.16 || WorldLayout.pathInfluence(x, z) < 0.32) continue;
      samples.push({
        x,
        z,
        rotationY: Math.atan2(sample.tangent.x, sample.tangent.z) + side * 0.18,
        radius: 0.28 + (sampleIndex % 3) * 0.05,
        depth: 0.22 + (sampleIndex % 2) * 0.04,
        height: 0.045 + (sampleIndex % 3) * 0.008,
        sides: sampleIndex % 2 === 0 ? 6 : 5,
        token: sampleIndex % 2 === 0 ? "stone_warm_01" : "stone_golden_01"
      });
    }
  }
  return samples;
}

/**
 * Catalog-backed path slabs sampled from the canonical compiled route curves.
 * These remain render-only ground cover: route topology, height, collision,
 * and map projection continue to come exclusively from WorldLayout.
 */
function generateInstancedPathSlabs(count: number, seed: number): GroundCoverPlacement[] {
  const rng = createRng(seed);
  const placements: GroundCoverPlacement[] = [];
  const appendPlacement = (
    x: number,
    z: number,
    rotationY: number,
    scale: number,
    depthScale: number
  ): boolean => {
    if (
      placements.length >= count
      || WorldLayout.isWater(x, z)
      || WorldLayout.isBridgeDeck(x, z)
      || WorldLayout.isInterior(x, z)
    ) return false;
    if (WorldLayout.terrainSurfaceSample(x, z).farmInfluence >= 0.12) return false;
    const index = placements.length;
    placements.push({
      id: stablePlacementId("ground-cover.path.slabs", index),
      origin: "seeded-fill",
      category: "paving",
      assetId: index % 2 === 0 ? "prop_path_slab_a" : "prop_path_slab_b",
      x,
      z,
      rotationY,
      scale: [scale, scale * (0.92 + rng() * 0.12), scale * depthScale]
    });
    return true;
  };

  // Preserve a readable run through the starter farm before distributing the
  // remaining slabs across the complete route network.
  for (const sample of generateFarmPathPaverSamples()) {
    const scale = 0.86 + rng() * 0.24;
    appendPlacement(sample.x, sample.z, sample.rotationY, scale, 0.86 + rng() * 0.2);
  }

  const candidates = WorldLayout.compiledRouteNetwork().flatMap((compiled, routeIndex) =>
    compiled.samples.slice(2, -2).map((sample, sampleIndex) => ({
      compiled,
      routeIndex,
      sample,
      sampleIndex: sampleIndex + 2
    }))
  );
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }

  for (const candidate of candidates) {
    if (placements.length >= count) break;
    const { compiled, routeIndex, sample, sampleIndex } = candidate;
    const lateral = (rng() - 0.5) * compiled.halfWidth * 0.46;
    const x = sample.point.x + sample.normal.x * lateral;
    const z = sample.point.z + sample.normal.z * lateral;
    const rotationY = Math.atan2(sample.tangent.x, sample.tangent.z)
      + (rng() - 0.5) * 0.34
      + Math.sin(routeIndex * 1.7 + sampleIndex * 0.63) * 0.06;
    const scale = 0.84 + rng() * 0.3;
    appendPlacement(x, z, rotationY, scale, 0.82 + rng() * 0.24);
  }

  if (placements.length !== count) {
    throw new Error(
      `[WorldEnvironmentLayout] Could only place ${placements.length}/${count} instanced path slabs`
    );
  }
  return placements;
}

function distanceTo(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z);
}

const FARM_CLEARANCES = [
  { x: STARTER_FARM_LAYOUT.origin.x, z: STARTER_FARM_LAYOUT.origin.z, radius: 7.5 },
  ...STARTER_FARM_LAYOUT.structureAnchors.map((anchor) => ({
    ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor),
    radius: anchor.clearanceRadius
  })),
  ...STARTER_FARM_LAYOUT.farmsteadAnchors.map((anchor) => ({
    ...farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, anchor),
    radius: anchor.clearanceRadius
  }))
];

const MILL_WORLD = starterStructureAnchor("struct.starter_mill")!;

const CLEARANCES = [
  ...FARM_CLEARANCES,
  { x: VILLAGE_MARKET.position.x, z: VILLAGE_MARKET.position.z, radius: 20 },
  { x: MILL_WORLD.x, z: MILL_WORLD.z, radius: 8.5 },
  { x: 60, z: -60, radius: 9.5 },
  { x: RIVER_CROSSING.x, z: RIVER_CROSSING.z, radius: 5 },
  { x: -14, z: -7, radius: 9 },
  { x: HARBOR_MARKET.position.x, z: HARBOR_MARKET.position.z, radius: 8 },
  { x: -92, z: 74, radius: 7 },
  { x: 77.6, z: 70.2, radius: 10 },
  { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z, radius: 5.5 },
  { x: HARBOR_SKIFF_MOORING.boatPosition.x, z: HARBOR_SKIFF_MOORING.boatPosition.z, radius: 5.5 },
  { x: FARMHOUSE_INTERIOR_ORIGIN.x, z: FARMHOUSE_INTERIOR_ORIGIN.z, radius: 8.5 }
] as const;

function clearsLandmarks(x: number, z: number, margin: number = 0): boolean {
  return CLEARANCES.every((clearance) => distanceTo(x, z, clearance) > clearance.radius + margin)
    && AUTHORED_DETAIL_PLACEMENTS.every((placement) => !placement.clearanceRadiusMeters
      || distanceTo(x, z, placement) > placement.clearanceRadiusMeters + margin);
}

/** @internal Exposes the seeded-fill clearance contract to focused layout tests. */
export function hasGroundCoverClearance(x: number, z: number): boolean {
  return clearsLandmarks(x, z, 0.15);
}

function rotatedOffset(x: number, z: number, rotationY: number): { x: number; z: number } {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return { x: x * cosine - z * sine, z: x * sine + z * cosine };
}

/** Checks the complete grounding footprint, rather than trusting its center point. */
export function isPlacementFootprintStable(
  placement: Pick<EnvironmentAssetPlacement, "x" | "z" | "rotationY" | "grounding">,
  minimumNormalY: number = 0.72,
  maximumHeightDelta: number = 0.78
): boolean {
  const [radiusX, radiusZ] = placement.grounding ?? [0.35, 0.35];
  const offsets = [
    [0, 0],
    [radiusX, 0], [-radiusX, 0], [0, radiusZ], [0, -radiusZ],
    [radiusX, radiusZ], [radiusX, -radiusZ], [-radiusX, radiusZ], [-radiusX, -radiusZ]
  ] as const;
  const heights: number[] = [];
  for (const [localX, localZ] of offsets) {
    const offset = rotatedOffset(localX, localZ, placement.rotationY);
    const x = placement.x + offset.x;
    const z = placement.z + offset.z;
    if (!WorldLayout.isWalkable(x, z) || WorldLayout.isWater(x, z)) return false;
    if (WorldLayout.terrainHeight(x, z) < 0.25 || WorldLayout.waterSignedDistance(x, z) > -0.85) return false;
    if (WorldLayout.terrainNormal(x, z).y < minimumNormalY) return false;
    heights.push(WorldLayout.terrainHeight(x, z));
  }
  return Math.max(...heights) - Math.min(...heights) <= maximumHeightDelta;
}

export function generateEnvironmentClusterPlacements(
  worldSeed: number,
  definition: EnvironmentClusterDefinition
): EnvironmentAssetPlacement[] {
  if (definition.count < 0 || !Number.isInteger(definition.count) || definition.assetIds.length === 0) {
    throw new Error(`[WorldEnvironmentLayout] Invalid seeded-fill cluster ${definition.id}`);
  }
  const rng = createRng(mixSeed(worldSeed, definition.salt));
  const placements: EnvironmentAssetPlacement[] = [];
  for (let attempt = 0; attempt < definition.count * 60 && placements.length < definition.count; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng());
    const x = definition.center.x + Math.cos(angle) * definition.radiusX * radius;
    const z = definition.center.z + Math.sin(angle) * definition.radiusZ * radius;
    const scale = definition.scaleRange[0] + (definition.scaleRange[1] - definition.scaleRange[0]) * rng();
    const rotationY = rng() * Math.PI * 2;
    const grounding = [1.18 * scale, 0.78 * scale] as const;
    if (
      WorldLayout.isInterior(x, z)
      || WorldLayout.pathInfluence(x, z) > 0.12
      || WorldLayout.roadsideInfluence(x, z) > 0.72
      || !clearsLandmarks(x, z, 0.4)
      || !isPlacementFootprintStable({ x, z, rotationY, grounding })
    ) continue;
    const index = placements.length;
    placements.push({
      id: stablePlacementId(definition.id, index),
      origin: "seeded-fill",
      assetId: definition.assetIds[index % definition.assetIds.length],
      x,
      z,
      rotationY,
      scale: [scale, scale * (0.96 + rng() * 0.08), scale],
      grounding
    });
  }
  if (placements.length !== definition.count) {
    throw new Error(
      `[WorldEnvironmentLayout] Could only place ${placements.length}/${definition.count} instances for seeded-fill cluster ${definition.id}`
    );
  }
  return placements;
}

function authoredPlacement(
  id: string,
  placement: Omit<EnvironmentAssetPlacement, "id" | "origin">
): EnvironmentAssetPlacement {
  return { id, origin: "authored", ...placement };
}

/**
 * Village cottages/inn/hall/barn publish their door on runtime +Z after glTF Y-up.
 * Point that face at the plaza center so fronts read into the courtyard.
 */
export function villageDoorFacingPlaza(x: number, z: number): number {
  return Math.atan2(VILLAGE_MARKET.position.x - x, VILLAGE_MARKET.position.z - z);
}

function architecturePad(padId: string): WorldArchitecturePad {
  const pad = WORLD_LAYOUT_V5.architecturePads.find((candidate) => candidate.id === padId);
  if (!pad) throw new Error(`[WorldEnvironmentLayout] Missing authored architecture pad ${padId}`);
  return pad;
}

function authoredArchitecturePlacement(
  id: string,
  assetId: string,
  padId: string,
  scale: readonly [number, number, number] = [1, 1, 1]
): EnvironmentAssetPlacement {
  const pad = architecturePad(padId);
  return authoredPlacement(id, {
    assetId,
    x: pad.center.x,
    z: pad.center.z,
    rotationY: pad.rotationY,
    scale,
    grounding: pad.envelope,
    clearanceRadiusMeters: pad.frontageClearanceMeters,
    frontApproachMeters: pad.frontApproachMeters
  });
}

const AUTHORED_DETAIL_PLACEMENTS: readonly EnvironmentAssetPlacement[] = [
  // Working village frontage and a neighboring orchard homestead. No additional shop/quest owners.
  authoredArchitecturePlacement("authored.village.approach-inn", "building_inn_a", "village.approach-inn"),
  authoredArchitecturePlacement("authored.village.cooperative-hall", "building_village_market_hall_a", "village.cooperative-hall"),
  authoredArchitecturePlacement("authored.orchard.barn", "building_barn_a", "orchard.barn"),
  authoredArchitecturePlacement("authored.orchard.farmhouse", "house_farmhouse_b", "orchard.farmhouse"),
  authoredArchitecturePlacement("authored.orchard.tool-shed", "prop_tool_shed_a", "orchard.tool-shed"),
  authoredArchitecturePlacement("authored.orchard.outhouse", "building_outhouse_a", "orchard.outhouse"),
  authoredArchitecturePlacement("authored.village.roadside-stall", "building_market_stall_a", "village.roadside-stall"),

  // The neighbor's kitchen garden is outside player-owned plantable land.
  authoredPlacement("authored.orchard.garden-bed", { assetId: "prop_vegetable_bed_tile_a", x: 122, z: -34, rotationY: 0, scale: [1, 1, 1], clearanceRadiusMeters: 3 }),
  authoredPlacement("authored.orchard.seed-bed", { assetId: "prop_tilled_soil_tile_a", x: 122, z: -38, rotationY: 0, scale: [1, 1, 1], clearanceRadiusMeters: 0.9 }),
  authoredPlacement("authored.orchard.turnips", { assetId: "crop_turnip_mature", x: 121, z: -34, rotationY: 0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.pumpkins", { assetId: "crop_pumpkin_mature", x: 123, z: -34, rotationY: -0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.watering-can", { assetId: "prop_watering_can_rustic_a", x: 123, z: -38, rotationY: 0.6, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.garden-hoe", { assetId: "prop_garden_hoe_a", x: 124.6, z: -35.5, rotationY: -0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.potting-bench", { assetId: "prop_potting_bench_a", x: 126, z: -38, rotationY: 0.3, scale: [1, 1, 1], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.orchard.garden-fence", { assetId: "prop_fence_section_a", x: 122, z: -31.5, rotationY: 0, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.flower-border", { assetId: "foliage_wildflower_b", x: 120, z: -31, rotationY: 0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.flower-border-low", { assetId: "foliage_wildflower_c", x: 124, z: -31, rotationY: -0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.garden-step-round", { assetId: "prop_path_stone_round_a", x: 125, z: -34, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.orchard.garden-step-slab", { assetId: "prop_path_stone_slab_a", x: 126.2, z: -34, rotationY: 0.4, scale: [1, 1, 1] }),

  // Dry-land repair stock: these spare spans are not a second navigable dock or crossing.
  authoredPlacement("authored.harbor.repair-span", { assetId: "bridge_log_plank_a", x: 91, z: 49, rotationY: 0.25, scale: [1, 1, 1], grounding: [2, 0.86], clearanceRadiusMeters: 3 }),
  authoredPlacement("authored.harbor.repair-platform", { assetId: "prop_dock_platform_a", x: 91, z: 53.5, rotationY: 0.25, scale: [1, 1, 1], clearanceRadiusMeters: 1.6 }),
  authoredPlacement("authored.harbor.spare-gangplank", { assetId: "prop_gangplank_a", x: 94, z: 51.5, rotationY: 0.25, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.spare-railing", { assetId: "prop_pier_railing_a", x: 91, z: 56, rotationY: 0.25, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.anchor-store", { assetId: "prop_anchor_admiralty_a", x: 95, z: 55, rotationY: -0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.drying-rack", { assetId: "prop_fish_drying_rack_a", x: 85, z: 59, rotationY: 0.25, scale: [1, 1, 1], grounding: [1.1, 0.41], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.harbor.mooring-post", { assetId: "prop_mooring_post_a", x: 85, z: 68, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.yard-lantern", { assetId: "prop_dock_lantern_a", x: 88, z: 57.5, rotationY: 0.25, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.village.stall-sign", { assetId: "prop_signboard_hanging_a", x: 46, z: -17, rotationY: 0.66, scale: [1, 1, 1] }),

  // A maintained stopping place on the lighthouse walk; no new fire/camping mechanic.
  authoredPlacement("authored.coast.walk-kiosk", { assetId: "prop_trail_kiosk_a", x: -60, z: 65, rotationY: 2.7, scale: [1, 1, 1], clearanceRadiusMeters: 1.5 }),
  authoredPlacement("authored.coast.rest-fire-pit", { assetId: "prop_fire_pit_a", x: -62, z: 60, rotationY: 0.2, scale: [1, 1, 1], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.woodland.habitat-snag", { assetId: "tree_dead_a", x: -151, z: -118, rotationY: 0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.woodland.boulder", { assetId: "rock_boulder_large_a", x: -145, z: -119, rotationY: -0.3, scale: [1, 1, 1], grounding: [1.1, 0.99], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.coast.headland-spire", { assetId: "rock_spire_a", x: -115, z: 72, rotationY: 0.3, scale: [1, 1, 1], grounding: [0.65, 0.73], clearanceRadiusMeters: 1.4 }),

  // Marine plants are rooted on the bed. Only the buoy and lily leaves use waterline height.
  authoredPlacement("authored.coast.sea-stack", { assetId: "rock_sea_stack_a", x: -151, z: WorldLayout.coastlineZ(-151) + 7, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.navigation-buoy", { assetId: "prop_marker_buoy_a", x: 110, y: -0.12, z: WorldLayout.coastlineZ(110) + 10, rotationY: 0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.river.lily-pocket", { assetId: "foliage_lily_pad_a", x: WorldLayout.riverCenterX(-112) - WorldLayout.riverHalfWidth(-112) + 0.8, y: 0.035, z: -112, rotationY: 0.6, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.seagrass", { assetId: "foliage_seagrass_tuft_a", x: 134, z: WorldLayout.coastlineZ(134) + 2, rotationY: 0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.algae", { assetId: "foliage_algae_frond_a", x: 135.5, z: WorldLayout.coastlineZ(135.5) + 2.5, rotationY: -0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.reef-rock", { assetId: "rock_reef_small_a", x: 137, z: WorldLayout.coastlineZ(137) + 3, rotationY: 0.5, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.coral-pillar", { assetId: "prop_coral_pillar_a", x: 133, z: WorldLayout.coastlineZ(133) + 13, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.coral-staghorn", { assetId: "prop_coral_staghorn_a", x: 135, z: WorldLayout.coastlineZ(135) + 12, rotationY: -0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.coral-table", { assetId: "prop_coral_table_a", x: 136.5, z: WorldLayout.coastlineZ(136.5) + 12.5, rotationY: 0.1, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.pumpkin-patch", { assetId: "prop_pumpkin_patch_a", x: -74.2, z: -53.3, rotationY: -1.5708, scale: [1, 1, 1] }),
  authoredPlacement("authored.tree.apple.orchard-a", { assetId: "tree_apple_a", x: 82, z: -44, rotationY: 0.22, scale: [1, 1, 1], grounding: [1.05, 0.74] }),
  authoredPlacement("authored.tree.apple.orchard-b", { assetId: "tree_apple_a", x: 88, z: -40, rotationY: -0.48, scale: [1, 1, 1], grounding: [1, 0.72] }),
  authoredPlacement("authored.tree.apple.orchard-c", { assetId: "tree_apple_a", x: 86, z: -52, rotationY: 0.84, scale: [1, 1, 1], grounding: [1, 0.7] }),
  authoredPlacement("authored.tree.oak.farm-west", { assetId: "tree_oak_c", x: -82, z: -47, rotationY: 0.35, scale: [1, 1, 1], grounding: [1.18, 0.78] }),
  authoredPlacement("authored.tree.oak.village", { assetId: "tree_oak_a", x: 78, z: -42, rotationY: 0.58, scale: [1, 1, 1], grounding: [1.22, 0.8] }),
  authoredPlacement("authored.tree.pine.headland", { assetId: "tree_pine_b", x: -122, z: 45, rotationY: -0.42, scale: [1, 1, 1], grounding: [1.28, 0.8] }),
  authoredPlacement("authored.foliage.reeds.bridge-south", { assetId: "foliage_reeds_a", x: -8, z: -14.5, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.foliage.reeds.bridge-north", { assetId: "foliage_reeds_a", x: -20, z: 0.5, rotationY: -0.25, scale: [1, 1, 1] }),
  authoredPlacement("authored.rock.headland-a", { assetId: "rock_coastal_a", x: -97.5, z: 71.5, rotationY: 0.24, scale: [1.15, 0.82, 1.1], grounding: [2.25, 1.35] }),
  authoredPlacement("authored.rock.headland-b", { assetId: "rock_coastal_b", x: -88, z: WorldLayout.coastlineZ(-88) - 15, rotationY: -0.36, scale: [0.9, 0.72, 0.86], grounding: [2.05, 1.25] }),
  authoredPlacement("authored.rock.western-shelf", { assetId: "rock_coastal_c", x: -48, z: WorldLayout.coastlineZ(-48) - 10, rotationY: 0.17, scale: [0.82, 0.72, 0.86], grounding: [1.65, 1.18] }),
  authoredPlacement("authored.rock.harbor-shelf-boulder", { assetId: "rock_coastal_boulder_a", x: 108, z: WorldLayout.coastlineZ(108) - 8, rotationY: 0.32, scale: [1, 1, 1], grounding: [0.9, 0.62] }),
  authoredPlacement("authored.rock.eastern-shelf", { assetId: "rock_coastal_d", x: 93.9, z: 65.9, rotationY: -0.22, scale: [1, 0.8, 0.95], grounding: [2.15, 1.42] }),
  authoredPlacement("authored.rock.uplands-boulder", { assetId: "rock_boulder_a", x: 93, z: -31, rotationY: 0.38, scale: [1.2, 1, 1.1], grounding: [1.7, 1.15] }),
  authoredPlacement("authored.rock.village-field", { assetId: "rock_field_a", x: 80, z: -34, rotationY: 0.62, scale: [0.8, 0.65, 0.75], grounding: [0.85, 0.58] }),
  authoredPlacement("authored.rock.harbor-boulder", { assetId: "rock_boulder_a", x: 97.1, z: 54.6, rotationY: -0.18, scale: [1.1, 0.9, 1], grounding: [1.55, 1.05] }),
  authoredPlacement("authored.prop.lamp.village-west", { assetId: "prop_lamp_post_a", x: 43.1, z: -47.5, rotationY: -1.8326, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-east", { assetId: "prop_lamp_post_a", x: 64.4, z: -47.4, rotationY: 2.618, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-mill", { assetId: "prop_lamp_post_a", x: 44.3, z: -64.7, rotationY: 0.12, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.harbor", { assetId: "prop_lamp_post_a", x: 68.8, z: 57.6, rotationY: -4.1888, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.crate.harbor", { assetId: "prop_crate_wood_a", x: 69, z: 65.1, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.barrel.harbor", { assetId: "prop_barrel_wood_a", x: 81.9, z: 66.9, rotationY: 0.1, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.trap.harbor", { assetId: "prop_lobster_trap_a", x: 81.5, z: 66, rotationY: 0.65, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.net-rack.harbor", { assetId: "prop_fishing_net_rack_a", x: 67.5, z: 64.5, rotationY: 0.22, scale: [1, 1, 1] }),
  authoredPlacement("authored.fauna.chicken.farm-a", { assetId: "fauna_chicken_a", x: -63.3, z: -69.6, rotationY: 0.7854, scale: [1.1, 1.1, 1.1] }),
  authoredPlacement("authored.fauna.chicken.farm-b", { assetId: "fauna_chicken_a", x: -61.2, z: -68.1, rotationY: -0.5, scale: [0.92, 0.92, 0.92] }),
  authoredPlacement("authored.prop.wagon.farm-road", { assetId: "prop_wagon_cart_a", x: -50.6, z: -57.4, rotationY: -3.6652, scale: [1, 1, 1], grounding: [1.5, 1.05] }),
  authoredPlacement("authored.fauna.cow.farm-meadow", { assetId: "fauna_cow_a", x: -70.1, z: -68, rotationY: 0.42, scale: [1, 1, 1], grounding: [0.9, 0.62] }),
  authoredPlacement("authored.fauna.donkey.starter", {
    assetId: "fauna_donkey_a",
    x: STARTER_DONKEY_ANCHOR.x,
    z: STARTER_DONKEY_ANCHOR.z,
    rotationY: STARTER_DONKEY_ANCHOR.rotationY,
    scale: [1, 1, 1],
    grounding: STARTER_DONKEY_ANCHOR.grounding,
    clearanceRadiusMeters: STARTER_DONKEY_ANCHOR.clearanceRadius,
    frontApproachMeters: STARTER_DONKEY_ANCHOR.frontApproachDistanceMeters
  }),

  // --- Curated Polyfork Vignettes ---

  // Farmhouse exterior: firewood stacked just outside the southeast wall
  authoredPlacement("authored.farm.firewood", { assetId: "prop_firewood_stack_a", x: -50, z: -54.1, rotationY: 4.7124, scale: [1, 1, 1] }),
  // Wheelbarrow parked beside the farm work-path, facing the crop rows
  authoredPlacement("authored.farm.wheelbarrow", { assetId: "prop_wheelbarrow_a", x: -56.5, z: -61.4, rotationY: -4.1888, scale: [1, 1, 1] }),
  // Beehive in the sunny meadow east of the chicken yard
  authoredPlacement("authored.farm.beehive", { assetId: "prop_beehive_a", x: -56, z: -49, rotationY: -0.2, scale: [1, 1, 1] }),
  // Sunflower row along the northern farm perimeter fence
  authoredPlacement("authored.farm.sunflowers", { assetId: "foliage_sunflower_a", x: -71.5, z: -42.6, rotationY: 1.0472, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.sunflowers.copy.1", { assetId: "foliage_sunflower_a", x: -70.7, z: -43.2, rotationY: 1.0472, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.sunflowers.copy.2", { assetId: "foliage_sunflower_a", x: -71.7, z: -41.9, rotationY: 1.309, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.sunflowers.copy.3", { assetId: "foliage_sunflower_a", x: -71.3, z: -43.4, rotationY: 1.309, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.sunflowers.copy.4", { assetId: "foliage_sunflower_a", x: -71.1, z: -42.5, rotationY: 1.309, scale: [1, 1, 1] }),
  authoredPlacement("authored.farm.sunflowers.copy.5", { assetId: "foliage_sunflower_a", x: -71.2, z: -41.7, rotationY: 1.309, scale: [1, 1, 1] }),
  // Mushroom cluster under the large western oak (shade-dwelling)
  authoredPlacement("authored.farm.mushrooms", { assetId: "foliage_mushroom_cluster_a", x: -80, z: -49, rotationY: 0.2, scale: [0.9, 0.9, 0.9] }),
  authoredPlacement("authored.spawn.bush-left", { assetId: "foliage_bush_a", x: -70.4, z: -63.6, rotationY: 0.55, scale: [1.38, 1.42, 1.38], grounding: [0.9, 0.7] }),
  authoredPlacement("authored.spawn.bush-right", { assetId: "foliage_bush_round_a", x: -59.8, z: -70.9, rotationY: -0.42, scale: [1.32, 1.36, 1.32], grounding: [0.82, 0.64] }),
  authoredPlacement("authored.spawn.rock-foreground", { assetId: "rock_field_a", x: -54.2, z: -73.3, rotationY: 0.38, scale: [1.05, 0.88, 1.02], grounding: [0.9, 0.62] }),
  // Animated rabbit groups beside familiar routes, with small grass clearings
  // for readable silhouettes. Spawn companions stay outside the crop beds.
  authoredPlacement("authored.fauna.rabbit-spawn-east", { assetId: "fauna_rabbit_a", x: -63, z: -63.7, rotationY: -0.4, scale: [1.35, 1.35, 1.35], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-spawn-east-pair", { assetId: "fauna_rabbit_a", x: -61.2, z: -63.2, rotationY: -1.8, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-spawn-west", { assetId: "fauna_rabbit_a", x: -66.8, z: -64.1, rotationY: 0.7, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-spawn-west-pair", { assetId: "fauna_rabbit_a", x: -67.8, z: -65.8, rotationY: 2.2, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-meadow", { assetId: "fauna_rabbit_a", x: -55, z: -43, rotationY: 1.2, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-meadow-east", { assetId: "fauna_rabbit_a", x: -53.5, z: -43.8, rotationY: -0.8, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-meadow-west", { assetId: "fauna_rabbit_a", x: -56.8, z: -41.4, rotationY: 2.6, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-inland-glade", { assetId: "fauna_rabbit_a", x: 23, z: -27, rotationY: -0.7, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-inland-glade-east", { assetId: "fauna_rabbit_a", x: 24.8, z: -28.2, rotationY: -2.1, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-inland-glade-west", { assetId: "fauna_rabbit_a", x: 21.4, z: -25.8, rotationY: 0.5, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-central-meadow", { assetId: "fauna_rabbit_a", x: 42, z: 4, rotationY: 2.35, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-central-meadow-east", { assetId: "fauna_rabbit_a", x: 43.6, z: 2.6, rotationY: -1.1, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-central-meadow-west", { assetId: "fauna_rabbit_a", x: 40.4, z: 2.8, rotationY: 0.3, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-eastern-meadow", { assetId: "fauna_rabbit_a", x: 116, z: -59, rotationY: -2.15, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-eastern-meadow-west", { assetId: "fauna_rabbit_a", x: 114.4, z: -60.2, rotationY: 0.9, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-eastern-meadow-east", { assetId: "fauna_rabbit_a", x: 117.6, z: -57.8, rotationY: -0.4, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-harbor-road-north", { assetId: "fauna_rabbit_a", x: 53, z: 20, rotationY: 1.5, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-harbor-road-north-pair", { assetId: "fauna_rabbit_a", x: 51.4, z: 21.6, rotationY: -0.6, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-harbor-road-south", { assetId: "fauna_rabbit_a", x: 64, z: 39, rotationY: -1.3, scale: [1.3, 1.3, 1.3], clearanceRadiusMeters: 1.4 }),
  authoredPlacement("authored.fauna.rabbit-harbor-road-south-pair", { assetId: "fauna_rabbit_a", x: 65.6, z: 40.3, rotationY: 2.7, scale: [1.25, 1.25, 1.25], clearanceRadiusMeters: 1.4 }),

  // Harbor cargo staging: crate & sack grouped tightly against the Fish Market exterior (x:64, z:60)
  authoredPlacement("authored.harbor.cargo-crate", { assetId: "prop_cargo_crate_large_a", x: 62.5, z: 58, rotationY: -0.08, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.cargo-sack", { assetId: "prop_cargo_sack_a", x: 63.5, z: 57.5, rotationY: 0.35, scale: [1, 1, 1] }),
  // Dock lantern at the pier entrance, aligned with the walkway

  // Mooring post at the dock edge near the rowboat


  // Village plaza: open packed courtyard. Buildings sit on a wide ring with
  // published +Z doors facing the market. The mill pad stays southwest, off-court.
  authoredPlacement("authored.village.bench", { assetId: "prop_bench_wood_a", x: 62.2, z: -45.9, rotationY: -2.18, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.bench.copy.1", { assetId: "prop_bench_wood_a", x: 59.6, z: -69.6, rotationY: 0, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.well", { assetId: "prop_water_well_a", x: 55.1, z: -69.6, rotationY: 0, scale: [1, 1, 1], grounding: [1.1, 0.95] }),
  authoredPlacement("authored.village.signpost", { assetId: "prop_signpost_trail_a", x: 50.3, z: -42.1, rotationY: -1.5708, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.clay-oven", { assetId: "prop_clay_oven_a", x: 43.6, z: -59.2, rotationY: 1.0472, scale: [1, 1, 1] }),
  authoredArchitecturePlacement("authored.village.tool-shed", "prop_tool_shed_b", "village.tool-shed"),
  authoredArchitecturePlacement("authored.village.outhouse", "building_outhouse_b", "village.outhouse"),
  authoredPlacement("authored.village.homestead-gate", { assetId: "prop_farm_gate_a", x: 47, z: -44.9, rotationY: -0.7854, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.fence-a", { assetId: "prop_fence_wood_a", x: 48.6, z: -43.2, rotationY: -1.0472, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.fence-b", { assetId: "prop_fence_wood_a", x: 45.2, z: -46.5, rotationY: -0.7854, scale: [1, 1, 1] }),
  authoredArchitecturePlacement("authored.village.cottage-west", "house_cottage_a", "village.cottage-west"),
  authoredArchitecturePlacement("authored.village.cottage-southwest", "house_cottage_b", "village.cottage-southwest"),
  authoredArchitecturePlacement("authored.village.cottage-garden", "house_cottage_c", "village.cottage-garden", [0.92, 0.92, 0.92]),
  authoredArchitecturePlacement("authored.village.cottage-south", "house_cottage_a", "village.cottage-south"),
  authoredArchitecturePlacement("authored.village.inn", "building_inn_b", "village.inn"),
  authoredArchitecturePlacement("authored.village.market-hall", "building_village_market_hall_b", "village.market-hall"),
  authoredArchitecturePlacement("authored.village.barn", "building_barn_b", "village.barn"),

  // Forest fallen log on the inland meadow slope
  authoredPlacement("authored.forest.fallen-log", { assetId: "prop_fallen_log_a", x: 28.7, z: -22.3, rotationY: 0.6, scale: [1, 1, 1] }),
  // Driftwood log washed up on the beach west of harbor
  authoredPlacement("authored.coast.driftwood-log", { assetId: "prop_driftwood_log_a", x: 30, z: WorldLayout.coastlineZ(30) - 3, rotationY: 0.8, scale: [1, 1, 1] }),
  // Beach grass tuft near the driftwood
  authoredPlacement("authored.coast.beach-grass", { assetId: "foliage_beach_grass_a", x: 32, z: WorldLayout.coastlineZ(32) - 2, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.copy.tree_apple_a.1", { assetId: "tree_apple_a", x: -59.8, z: -75.7, rotationY: 1.0894, scale: [0.92, 0.91, 0.92] }),
  authoredPlacement("authored.copy.tree_oak_c.1", { assetId: "tree_oak_c", x: -47.5, z: -53.8, rotationY: 5.1019, scale: [0.94, 0.95, 0.94] }),
];

function fixedEnvironmentPlacements(): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (let index = 0; index < 40; index++) {
    let z = -145 + index * 5.55;
    if (z >= -12.5 && z <= -1.5) {
      z += z < -7 ? -5.8 : 5.8;
    }
    const side = index % 2 === 0 ? -1 : 1;
    const x = WorldLayout.riverCenterX(z) + side * (WorldLayout.riverHalfWidth(z) + 0.72);
    placements.push({
      id: `layout-derived.reeds.river.${index.toString().padStart(3, "0")}`,
      origin: "layout-derived",
      assetId: "foliage_reeds_a",
      x,
      z,
      rotationY: index * 1.17,
      scale: [0.88, 0.88, 0.88]
    });
  }
  const coastalReedPockets = [-156, -42, 20, 61, 96] as const;
  for (const [pocketIndex, centerX] of coastalReedPockets.entries()) {
    for (let memberIndex = 0; memberIndex < 4; memberIndex++) {
      const index = pocketIndex * 4 + memberIndex;
      const x = centerX + (memberIndex - 1.5) * 1.15 + Math.sin(index * 1.9) * 0.2;
      const z = WorldLayout.coastlineZ(x) - 1.2 - memberIndex * 0.38;
      placements.push({
        id: `layout-derived.reeds.coast.${index.toString().padStart(3, "0")}`,
        origin: "layout-derived",
        assetId: "foliage_reeds_a",
        x,
        z,
        rotationY: index * 0.73,
        scale: [0.78 + memberIndex * 0.05, 0.78 + memberIndex * 0.05, 0.78 + memberIndex * 0.05]
      });
    }
  }
  const kelpPockets = [-156, -42, 20, 61, 96] as const;
  for (const [pocketIndex, centerX] of kelpPockets.entries()) {
    for (let memberIndex = 0; memberIndex < 2; memberIndex++) {
      const index = pocketIndex * 2 + memberIndex;
      const x = centerX + (memberIndex === 0 ? -0.82 : 0.68) + Math.sin(index * 1.6) * 0.16;
      const z = WorldLayout.coastlineZ(x) - 1.75 - memberIndex * 0.34;
      placements.push({
        id: `layout-derived.kelp.coast.${index.toString().padStart(3, "0")}`,
        origin: "layout-derived",
        assetId: "foliage_kelp_a",
        x,
        z,
        rotationY: 0.24 + index * 0.91,
        scale: [0.86 + memberIndex * 0.08, 0.86 + memberIndex * 0.08, 0.86 + memberIndex * 0.08]
      });
    }
  }
  const mouth = WORLD_LAYOUT_V5.riverMouth;
  const estuaryPocketZ = [68.5, 72.2, 75.9, 79.6] as const;
  for (const [rowIndex, z] of estuaryPocketZ.entries()) {
    for (const side of [-1, 1] as const) {
      const index = rowIndex * 2 + (side > 0 ? 1 : 0);
      const center = WorldLayout.riverCenterX(z);
      const bankOffset = WorldLayout.riverHalfWidth(z) + 0.7 + (rowIndex % 2) * 0.32;
      const x = center + side * bankOffset;
      if (WorldLayout.estuaryInfluence(x, z) <= 0 || z >= mouth.z) continue;
      placements.push({
        id: `layout-derived.reeds.estuary.${index.toString().padStart(3, "0")}`,
        origin: "layout-derived",
        assetId: "foliage_reeds_a",
        x,
        z,
        rotationY: 0.38 + index * 0.91,
        scale: [0.82 + rowIndex * 0.025, 0.82 + rowIndex * 0.025, 0.82 + rowIndex * 0.025]
      });
    }
  }
  return placements;
}

/** Fill the spaces between authored districts without moving their existing anchors. */
function generateLandscapeDressing(
  worldSeed: number,
  existing: readonly EnvironmentAssetPlacement[]
): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const occupied = [...existing];
  const radiusOf = (placement: EnvironmentAssetPlacement) => placement.assetId.startsWith("tree_")
    ? 2.8 * placement.scale[0]
    : placement.grounding ? Math.hypot(...placement.grounding) : 0.8;
  const append = (
    id: string, assetId: string, x: number, z: number, rotationY: number,
    scale: number = 1, footprint: readonly [number, number] = [0.65, 0.55]
  ): EnvironmentAssetPlacement | undefined => {
    const placement: EnvironmentAssetPlacement = {
      id: `seeded-fill.landscape.${id}`, origin: "seeded-fill", assetId, x, z, rotationY,
      scale: [scale, scale, scale], grounding: [footprint[0] * scale, footprint[1] * scale]
    };
    // Pinned and deleted dressing must not leave phantom obstacles behind.
    if (PLACEMENT_REMOVED.includes(placement.id)) return undefined;
    const override = PLACEMENT_OVERRIDES[placement.id];
    if (override) Object.assign(placement, override);
    const radius = radiusOf(placement);
    const px = placement.x;
    const pz = placement.z;
    if (!override && (
      px - radius < WORLD_BOUNDS.minX || px + radius > WORLD_BOUNDS.maxX
      || pz - radius < WORLD_BOUNDS.minZ || pz + radius > WORLD_BOUNDS.maxZ
      || WorldLayout.isInterior(px, pz)
      || !clearsLandmarks(px, pz, radius)
      || distanceTo(px, pz, STARTER_DONKEY_ANCHOR) < STARTER_DONKEY_ANCHOR.clearanceRadius + radius
      || WORLD_LAYOUT_V5.architecturePads.some((pad) =>
        distanceTo(px, pz, pad.center) < Math.hypot(...pad.envelope) + pad.frontApproachMeters + radius)
      || occupied.some((other) => distanceTo(px, pz, other) < radius + radiusOf(other) + 0.5)
      || !isPlacementFootprintStable(placement, 0.8, 0.48)
      || ((assetId === "foliage_reeds_a" || assetId === "foliage_cattail_a")
        && WorldLayout.riverDistance(px, pz) - WorldLayout.riverHalfWidth(pz) > 10
        && WorldLayout.terrainSurfaceSample(px, pz).shorelineWetness < 0.14)
      || [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].some(([dx, dz]) =>
        WorldLayout.pathInfluence(px + dx, pz + dz) > 0.08
        || WorldLayout.terrainSurfaceSample(px + dx, pz + dz).farmInfluence > 0.04)
    )) return undefined;
    placements.push(placement);
    occupied.push(placement);
    return placement;
  };

  // A few places to pause belong to existing journeys, never to invented roads.
  const pauses = [
    { id: "farm-lane", route: "farm-village", fraction: 0.18, asset: "prop_bench_wood_a" },
    { id: "river-walk", route: "village-lighthouse", fraction: 0.68, asset: "prop_bench_wood_a" },
    { id: "meadow-picnic", route: "village-harbor", fraction: 0.48, asset: "prop_picnic_table_a" },
    { id: "headland-rest", route: "cliffside-coastal-walk", fraction: 0.12, asset: "prop_bench_wood_a" },
    { id: "harbor-road", route: "village-harbor", fraction: 0.76, asset: "prop_bench_wood_a" }
  ];
  for (const pause of pauses) {
    const route = WorldLayout.compiledRouteNetwork().find((entry) => entry.route.id === pause.route)!;
    const start = Math.floor((route.samples.length - 1) * pause.fraction);
    let placed = false;
    for (let attempt = 0; attempt < 16 && !placed; attempt++) {
      const sample = route.samples[Math.min(route.samples.length - 1, start + Math.floor(attempt / 2))];
      const side = attempt % 2 === 0 ? 1 : -1;
      const offset = route.corridorRadiusMeters + 3.2;
      const x = sample.point.x + sample.normal.x * offset * side;
      const z = sample.point.z + sample.normal.z * offset * side;
      const facing = Math.atan2(-sample.normal.x * side, -sample.normal.z * side);
      const seat = append(`pause.${pause.id}`, pause.asset, x, z, facing, 1, [1.1, 0.85]);
      if (!seat) continue;
      placed = true;
      append(`pause.${pause.id}.shade`, "tree_oak_broadleaf_a",
        x + sample.normal.x * side * 5.4, z + sample.normal.z * side * 5.4, facing, 0.98, [1.2, 0.8]);
      append(`pause.${pause.id}.flowers`, "foliage_wildflower_a",
        x + sample.tangent.x * 2.5, z + sample.tangent.z * 2.5, facing, 1, [0.4, 0.35]);
    }
  }

  // Small working groups extend existing farm/orchard activity without adding interactions.
  const workGroups = [
    { id: "pasture", x: -88, z: -77, members: ["prop_water_trough_a", "prop_milk_churn_a"] },
    { id: "orchard", x: 97, z: -63, members: ["prop_beehive_a", "prop_potting_bench_a", "prop_harvest_basket_a"] },
    { id: "harbor-supplies", x: 86, z: 54, members: ["prop_lobster_trap_a", "prop_cargo_sack_a"] }
  ];
  for (const group of workGroups) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = attempt * 2.39996;
      const x = group.x + Math.cos(angle) * (2 + attempt * 0.65);
      const z = group.z + Math.sin(angle) * (2 + attempt * 0.65);
      const anchor = append(`work.${group.id}.0`, group.members[0], x, z, 0.3, 1, [0.85, 0.65]);
      if (!anchor) continue;
      for (let member = 1; member < group.members.length; member++) {
        append(`work.${group.id}.${member}`, group.members[member],
          anchor.x + member * 2.6, anchor.z + 0.8, -0.25 + member * 0.3, 1, [0.8, 0.5]);
      }
      break;
    }
  }

  // Each land cell gets a small habitat group. Jitter and unequal grove sizes
  // hide the coverage lattice; existing trees suppress duplicates, not whole districts.
  const cellSize = 22;
  let rabbitCount = 0;
  for (let row = 0; row < Math.ceil((WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ) / cellSize); row++) {
    for (let column = 0; column < Math.ceil((WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX) / cellSize); column++) {
      const rng = createRng(mixSeed(worldSeed, 0x61d3 ^ Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663)));
      const cellId = `${row}.${column}`;
      let anchor: EnvironmentAssetPlacement | undefined;
      for (let attempt = 0; attempt < 14 && !anchor; attempt++) {
        const x = WORLD_BOUNDS.minX + (column + 0.18 + rng() * 0.64) * cellSize;
        const z = WORLD_BOUNDS.minZ + (row + 0.18 + rng() * 0.64) * cellSize;
        const coastDistance = WorldLayout.coastlineZ(x) - z;
        const wetBank = WorldLayout.riverDistance(x, z) - WorldLayout.riverHalfWidth(z) < 9;
        const wooded = z < -95 || x < -125 || x > 130;
        const coastal = coastDistance < 26;
        const trees = coastal
          ? ["tree_pine_a", "tree_pine_b", "tree_pine_young_a"]
          : wooded
            ? ["tree_oak_broadleaf_a", "tree_pine_tall_a", "tree_oak_c", "tree_maple_a"]
            : ["tree_oak_a", "tree_oak_b", "tree_oak_broadleaf_a", "tree_maple_a"];
        const hasCanopy = occupied.some((other) => other.assetId.startsWith("tree_") && distanceTo(x, z, other) < 8);
        const assetId = coastDistance < 9 ? "rock_coastal_boulder_a"
          : wetBank ? "foliage_cattail_a" : hasCanopy ? "foliage_bush_round_a" : trees[Math.floor(rng() * trees.length)];
        anchor = append(`habitat.${cellId}.anchor`, assetId, x, z, rng() * Math.PI * 2,
          0.92 + rng() * 0.16, assetId.startsWith("tree_") ? [1.2, 0.8] : [0.9, 0.7]);
        if (!anchor) continue;
        const members = coastal
          ? ["foliage_beach_grass_a", "rock_coastal_boulder_a", "tree_pine_young_a"]
          : wetBank
            ? ["foliage_reeds_a", "foliage_cattail_a", "rock_field_a"]
            : ["foliage_bush_round_a", wooded ? "prop_fallen_log_a" : "rock_field_a", trees[Math.floor(rng() * trees.length)]];
        for (let member = 0; member < members.length; member++) {
          const angle = rng() * Math.PI * 2;
          const radius = 4.5 + rng() * 3.5;
          const memberId = members[member];
          append(`habitat.${cellId}.${member}`, memberId,
            anchor.x + Math.cos(angle) * radius, anchor.z + Math.sin(angle) * radius,
            angle, 0.92 + rng() * 0.16,
            memberId === "prop_fallen_log_a" ? [1.55, 0.4] : memberId.startsWith("tree_") ? [1.2, 0.8] : [0.9, 0.7]);
        }
        if (wooded && !coastal && !wetBank) {
          append(`habitat.${cellId}.mushrooms`, "foliage_mushroom_cluster_a",
            anchor.x + 3.6, anchor.z - 1.2, 0.4, 1.08, [0.18, 0.18]);
        }
        if (!coastal && !wetBank && rabbitCount < 10 && (row * 7 + column) % 13 === 0) {
          if (append(`habitat.${cellId}.rabbit`, "fauna_rabbit_a",
            anchor.x - 4.4, anchor.z + 1.8, rng() * Math.PI * 2, 0.96, [0.65, 0.65])) rabbitCount++;
        }
      }
    }
  }
  return placements;
}

function scatterGroundCover(
  category: GroundCoverCategory,
  assetIds: readonly string[],
  count: number,
  seed: number,
  predicate: (x: number, z: number) => boolean,
  scaleRange: readonly [number, number],
  idGroup: string = `ground-cover.${category}`,
  densityWeight: (x: number, z: number) => number = () => 1,
  patchDistribution?: GroundCoverPatchDistribution
): GroundCoverPlacement[] {
  const rng = createRng(seed);
  const placements: GroundCoverPlacement[] = [];
  const patches: Array<{
    x: number;
    z: number;
    radius: number;
    depthScale: number;
    rotation: number;
  }> = [];
  if (patchDistribution) {
    const centerPredicate = patchDistribution.centerPredicate;
    const width = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 10;
    const depth = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 10;
    const columns = Math.ceil(Math.sqrt(patchDistribution.patchCount * width / depth));
    const rows = Math.ceil(patchDistribution.patchCount / columns);
    for (
      let attempt = 0;
      attempt < patchDistribution.patchCount * 200 && patches.length < patchDistribution.patchCount;
      attempt += 1
    ) {
      const cell = attempt % (columns * rows);
      const x = WORLD_BOUNDS.minX + 5 + (patchDistribution.stratified
        ? (cell % columns + 0.15 + rng() * 0.7) / columns : rng()) * width;
      const z = WORLD_BOUNDS.minZ + 5 + (patchDistribution.stratified
        ? (Math.floor(cell / columns) + 0.15 + rng() * 0.7) / rows : rng()) * depth;
      if (centerPredicate && !centerPredicate(x, z)) continue;
      patches.push({
        x,
        z,
        radius: patchDistribution.radiusRange[0]
          + (patchDistribution.radiusRange[1] - patchDistribution.radiusRange[0]) * rng(),
        depthScale: patchDistribution.depthScaleRange[0]
          + (patchDistribution.depthScaleRange[1] - patchDistribution.depthScaleRange[0]) * rng(),
        rotation: rng() * Math.PI * 2
      });
    }
    if (patches.length !== patchDistribution.patchCount) {
      throw new Error(
        `[WorldEnvironmentLayout] Could only place ${patches.length}/${patchDistribution.patchCount} ${category} patches`
      );
    }
  }
  for (let attempt = 0; attempt < count * 400 && placements.length < count; attempt++) {
    let x: number;
    let z: number;
    if (patches.length > 0) {
      const patch = patches[patchDistribution?.stratified
        ? attempt % patches.length : Math.floor(rng() * patches.length)];
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(rng()) * patch.radius;
      const localX = Math.cos(angle) * radius;
      const localZ = Math.sin(angle) * radius * patch.depthScale;
      const cosine = Math.cos(patch.rotation);
      const sine = Math.sin(patch.rotation);
      x = patch.x + localX * cosine - localZ * sine;
      z = patch.z + localX * sine + localZ * cosine;
    } else {
      x = WORLD_BOUNDS.minX + 5 + rng() * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 10);
      z = WORLD_BOUNDS.minZ + 5 + rng() * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 10);
    }
    if (!predicate(x, z) || !hasGroundCoverClearance(x, z)) continue;
    const density = clamp01(densityWeight(x, z));
    if (density < 1 && rng() > density) continue;
    const scale = scaleRange[0] + (scaleRange[1] - scaleRange[0]) * rng();
    const index = placements.length;
    const grassPatchVariant = groundCoverPatchVariantIndex(x, z, seed, 6);
    const selectedVariant = category === "grass"
      ? grassPatchVariant < 4 ? 0 : grassPatchVariant < 5 ? 1 : 2
      : index % assetIds.length;
    const grassScale = grassClumpScale(selectedVariant);
    const categoryScale = GROUND_COVER_SCALE_PROFILE[category];
    const horizontalScale = category === "grass" ? grassScale.horizontal : categoryScale.horizontal;
    const verticalScale = category === "grass" ? grassScale.vertical : categoryScale.vertical;
    placements.push({
      id: stablePlacementId(idGroup, index),
      origin: "seeded-fill",
      category,
      assetId: assetIds[selectedVariant],
      x,
      z,
      rotationY: rng() * Math.PI * 2,
      scale: [
        scale * horizontalScale * (0.94 + rng() * 0.12),
        scale * verticalScale,
        scale * horizontalScale * (0.94 + rng() * 0.12)
      ]
    });
  }
  if (placements.length !== count) {
    throw new Error(`[WorldEnvironmentLayout] Could only place ${placements.length}/${count} ${category} instances`);
  }
  return placements;
}

function scatterCoastGroundCover(
  category: "pebbles" | "driftwood",
  assetIds: readonly string[],
  count: number,
  seed: number,
  landwardOffsets: readonly [number, number],
  predicate: (x: number, z: number) => boolean,
  scaleRange: readonly [number, number]
): GroundCoverPlacement[] {
  const rng = createRng(seed);
  const placements: GroundCoverPlacement[] = [];
  for (let attempt = 0; attempt < count * 150 && placements.length < count; attempt++) {
    const x = WORLD_BOUNDS.minX + 6 + rng() * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 12);
    const progress = Math.sqrt(rng());
    const landwardOffset = landwardOffsets[0] + (landwardOffsets[1] - landwardOffsets[0]) * progress;
    const z = WorldLayout.coastlineZ(x) - landwardOffset + Math.sin(x * 0.13 + attempt) * 0.12;
    if (!predicate(x, z) || !clearsLandmarks(x, z, 0.15)) continue;
    const scale = scaleRange[0] + (scaleRange[1] - scaleRange[0]) * rng();
    const index = placements.length;
    placements.push({
      id: stablePlacementId(`ground-cover.coast.${category}`, index),
      origin: "seeded-fill",
      category,
      assetId: assetIds[index % assetIds.length],
      x,
      z,
      rotationY: rng() * Math.PI * 2,
      scale: [scale * (0.94 + rng() * 0.12), scale, scale * (0.94 + rng() * 0.12)]
    });
  }
  if (placements.length !== count) {
    throw new Error(`[WorldEnvironmentLayout] Could only place ${placements.length}/${count} coastal ${category} instances`);
  }
  return placements;
}

function isMeadowCoverPatchCenter(x: number, z: number): boolean {
  const surface = WorldLayout.terrainSurfaceSample(x, z);
  return WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && !WorldLayout.isInterior(x, z)
    && WorldLayout.terrainNormal(x, z).y > 0.66
    && surface.farmInfluence < 0.16
    && surface.shorelineWetness < 0.7;
}

function scatterHomesteadMeadowGrass(
  count: number,
  seed: number,
  scaleRange: readonly [number, number]
): GroundCoverPlacement[] {
  const origin = STARTER_FARM_LAYOUT.origin;
  const rng = createRng(seed);
  const placements: GroundCoverPlacement[] = [];
  for (let attempt = 0; attempt < count * 400 && placements.length < count; attempt += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 8 + Math.sqrt(rng()) * 34;
    const x = origin.x + Math.cos(angle) * radius;
    const z = origin.z + Math.sin(angle) * radius * 0.92;
    if (
      !WorldLayout.isWalkable(x, z)
      || WorldLayout.isWater(x, z)
      || WorldLayout.isInterior(x, z)
      || WorldLayout.terrainNormal(x, z).y <= 0.66
      || WorldLayout.pathInfluence(x, z) >= GRASS_MAX_PATH_INFLUENCE
    ) continue;
    const surface = WorldLayout.terrainSurfaceSample(x, z);
    if (surface.farmInfluence >= 0.08 || surface.shorelineWetness >= 0.62 || !hasGroundCoverClearance(x, z)) continue;
    const scale = scaleRange[0] + (scaleRange[1] - scaleRange[0]) * rng();
    const index = placements.length;
    const clump = grassClumpScale(0);
    placements.push({
      id: stablePlacementId("ground-cover.grass.homestead", index),
      origin: "seeded-fill",
      category: "grass",
      assetId: "foliage_grass_a",
      x,
      z,
      rotationY: rng() * Math.PI * 2,
      scale: [
        scale * clump.horizontal * (0.94 + rng() * 0.12),
        scale * clump.vertical,
        scale * clump.horizontal * (0.94 + rng() * 0.12)
      ]
    });
  }
  if (placements.length !== count) {
    throw new Error(
      `[WorldEnvironmentLayout] Could only place ${placements.length}/${count} homestead meadow grass instances`
    );
  }
  return placements;
}

function deriveInstancedBushesFromGrass(
  grassPlacements: readonly GroundCoverPlacement[],
  count: number,
  seed: number
): GroundCoverPlacement[] {
  const rng = createRng(seed);
  const placements: GroundCoverPlacement[] = [];
  const usedGrassIds = new Set<string>();
  for (let attempt = 0; attempt < count * 120 && placements.length < count; attempt += 1) {
    const source = grassPlacements[Math.floor(rng() * grassPlacements.length)];
    if (
      !source
      || usedGrassIds.has(source.id)
      || WorldLayout.pathInfluence(source.x, source.z) >= 0.08
    ) continue;
    if (WorldLayout.terrainSurfaceSample(source.x, source.z).shorelineWetness >= 0.58) continue;
    usedGrassIds.add(source.id);
    const scale = 0.62 + rng() * 0.3;
    const index = placements.length;
    placements.push({
      id: stablePlacementId("ground-cover.bushes", index),
      origin: "seeded-fill",
      category: "bushes",
      assetId: "foliage_bush_a",
      x: source.x,
      z: source.z,
      rotationY: rng() * Math.PI * 2,
      scale: [scale * (0.94 + rng() * 0.12), scale, scale * (0.94 + rng() * 0.12)]
    });
  }
  if (placements.length !== count) {
    throw new Error(
      `[WorldEnvironmentLayout] Could only derive ${placements.length}/${count} instanced bushes`
    );
  }
  return placements;
}

export function generateGroundCoverPlacements(worldSeed: number): GroundCoverPlacement[] {
  const high = GROUND_COVER_DENSITY.high;
  const meadowCoverGround = (
    x: number,
    z: number,
    surface: ReturnType<typeof WorldLayout.terrainSurfaceSample> = WorldLayout.terrainSurfaceSample(x, z)
  ) =>
    WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && !WorldLayout.isInterior(x, z)
    && WorldLayout.terrainNormal(x, z).y > 0.66
    && surface.farmInfluence < 0.08;

  const grass = scatterGroundCover(
    "grass",
    ["foliage_grass_a", "foliage_grass_b", "foliage_grass_c"],
    high.grass,
    mixSeed(worldSeed, 0x1a31),
    (x, z) => {
      const surface = WorldLayout.terrainSurfaceSample(x, z);
      return meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < GRASS_MAX_PATH_INFLUENCE
        && surface.shorelineWetness < 0.62;
    },
    [0.96, 1.22],
    "ground-cover.grass",
    grassPlacementDensityAt,
    {
      patchCount: 1450,
      stratified: true,
      radiusRange: [2.4, 4.6],
      depthScaleRange: [0.55, 0.96],
      centerPredicate: isMeadowCoverPatchCenter
    }
  );
  const homesteadGrass = scatterHomesteadMeadowGrass(
    HOMESTEAD_MEADOW_GRASS_COUNT,
    mixSeed(worldSeed, 0x1a42),
    [0.96, 1.22]
  );
  const flowers = scatterGroundCover(
    "flowers",
    ["foliage_flower_drift_a", "foliage_flower_drift_b", "foliage_flower_drift_c"],
    high.flowers,
    mixSeed(worldSeed, 0x2b47),
    (x, z) => {
      const surface = WorldLayout.terrainSurfaceSample(x, z);
      return meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < GRASS_MAX_PATH_INFLUENCE
        && surface.weights.meadow > 0.08
        && surface.shorelineWetness < 0.45;
    },
    [2.85, 4.15],
    "ground-cover.flowers",
    (x, z) => {
      const farmBias = clamp01(1 - distanceTo(x, z, STARTER_FARM_LAYOUT.origin) / 48);
      const surface = WorldLayout.terrainSurfaceSample(x, z);
      return clamp01(
        0.38
          + surface.weights.meadow * 0.48
          + farmBias * 0.22
          + WorldLayout.pathShoulderInfluence(x, z) * 0.38
      );
    },
    {
      patchCount: 280,
      radiusRange: [0.85, 2.15],
      depthScaleRange: [0.58, 1],
      centerPredicate: isMeadowCoverPatchCenter
    }
  );
  const bushes = deriveInstancedBushesFromGrass(
    [...grass, ...homesteadGrass],
    high.bushes,
    mixSeed(worldSeed, 0x2b91)
  );
  const tallMeadowGround = (x: number, z: number) => {
    const surface = WorldLayout.terrainSurfaceSample(x, z);
    if (!meadowCoverGround(x, z, surface) || WorldLayout.pathInfluence(x, z) >= 0.08) return false;
    const wetness = surface.shorelineWetness;
    const waterDistance = WorldLayout.waterSignedDistance(x, z);
    // Taller growth belongs to unworked meadow pockets and wet banks, not a
    // continuous verge that obscures the road's low, walkable shoulder.
    return (wetness > 0.1 && wetness < 0.72)
      || surface.weights.meadow > 0.26
      || (waterDistance > -8 && waterDistance < -1.4);
  };
  const meadowTall = scatterGroundCover(
    "meadowTall",
    ["foliage_meadow_tall_a", "foliage_meadow_tall_b", "foliage_beach_grass_a"],
    high.meadowTall,
    mixSeed(worldSeed, 0x2c51),
    tallMeadowGround,
    [1, 1.34],
    "ground-cover.meadow-tall",
    (x, z) => {
      const surface = WorldLayout.terrainSurfaceSample(x, z);
      return clamp01(
        0.22
          + surface.shorelineWetness * 0.55
          + surface.weights.meadow * 0.36
      );
    },
    {
      patchCount: 190,
      radiusRange: [1.4, 3.8],
      depthScaleRange: [0.5, 0.94],
      centerPredicate: tallMeadowGround
    }
  ).map((placement, index) => {
    const surface = WorldLayout.terrainSurfaceSample(placement.x, placement.z);
    const wetness = surface.shorelineWetness;
    const waterDistance = WorldLayout.waterSignedDistance(placement.x, placement.z);
    const coast = WorldLayout.coastProfile(placement.x);
    const coastDistance = placement.z - WorldLayout.coastlineZ(placement.x);
    const belongsAtCoastalWetEdge = coastDistance > -8
      && coastDistance < -0.7
      && (wetness > 0.14 || waterDistance > -5.5);
    if (!belongsAtCoastalWetEdge) return placement;
    const belongsInReedPocket = coast.reedPocket > 0.22
      || WorldLayout.estuaryInfluence(placement.x, placement.z) > 0.08;
    return {
      ...placement,
      assetId: belongsInReedPocket
        ? index % 2 === 0 ? "foliage_reeds_a" : "foliage_cattail_a"
        : "foliage_beach_grass_a"
    };
  });
  const coastPebbleCount = Math.round(high.pebbles * 0.42);
  const coastPebbles = scatterCoastGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], coastPebbleCount, mixSeed(worldSeed, 0x3c59), [0.55, 8.4], (x, z) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && WorldLayout.terrainNormal(x, z).y > 0.68 && WorldLayout.pathInfluence(x, z) < 0.08 && WorldLayout.coastProfile(x).beach + WorldLayout.coastProfile(x).rockShelf > 0.42, [0.74, 1.12]);
  const pathPebbleCount = Math.round(high.pebbles * 0.22);
  const shoulderPebbles = scatterGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], high.pebbles - coastPebbles.length - pathPebbleCount, mixSeed(worldSeed, 0x3c5a), (x, z) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && WorldLayout.terrainSurfaceSample(x, z).farmInfluence < 0.12 && WorldLayout.pathShoulderInfluence(x, z) > 0.12 && WorldLayout.pathInfluence(x, z) < 0.2, [0.74, 1.12], "ground-cover.shoulder.pebbles", (x, z) => 0.68 + WorldLayout.pathShoulderInfluence(x, z) * 0.32);
  const pathPebbles = scatterGroundCover(
    "pebbles",
    ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"],
    pathPebbleCount,
    mixSeed(worldSeed, 0x3c5b),
    (x, z) => WorldLayout.isWalkable(x, z)
      && !WorldLayout.isWater(x, z)
      && !WorldLayout.isBridgeDeck(x, z)
      && WorldLayout.terrainNormal(x, z).y > 0.74
      && WorldLayout.terrainSurfaceSample(x, z).farmInfluence < 0.12
      && WorldLayout.pathInfluence(x, z) > 0.28,
    [0.52, 0.86],
    "ground-cover.path.pebbles",
    (x, z) => WorldLayout.pathInfluence(x, z)
  );
  const paving = generateInstancedPathSlabs(high.paving, mixSeed(worldSeed, 0x3c71));
  const driftwood = scatterCoastGroundCover("driftwood", ["prop_driftwood_a", "prop_driftwood_b", "prop_driftwood_c"], high.driftwood, mixSeed(worldSeed, 0x4d6b), [0.65, 5.2], (x, z) => WorldLayout.isWalkable(x, z) && WorldLayout.terrainNormal(x, z).y > 0.72 && WorldLayout.coastProfile(x).beach > 0.28 && WorldLayout.pathInfluence(x, z) < 0.08, [0.78, 1.08]);
  return [
    ...grass,
    ...homesteadGrass,
    ...flowers,
    ...bushes,
    ...meadowTall,
    ...coastPebbles,
    ...shoulderPebbles,
    ...pathPebbles,
    ...paving,
    ...driftwood
  ];
}

const ENVIRONMENT_LAYOUT_CACHE = new Map<number, WorldEnvironmentLayout>();

export function createWorldEnvironmentLayout(worldSeed: number): WorldEnvironmentLayout {
  const cached = ENVIRONMENT_LAYOUT_CACHE.get(worldSeed);
  if (cached) return cached;
  const fixed = fixedEnvironmentPlacements();
  const seededFill = SEEDED_FILL_CLUSTERS.flatMap((definition) =>
    generateEnvironmentClusterPlacements(worldSeed, definition)
  );
  const existing = applyPlacementOverrides([
    ...AUTHORED_DETAIL_PLACEMENTS,
    ...fixed,
    ...seededFill
  ]).filter((placement) => !PLACEMENT_REMOVED.includes(placement.id));
  const staticPlacements = [...existing, ...generateLandscapeDressing(worldSeed, existing)];
  for (const placement of staticPlacements) {
    if (!placement.grounding) continue;
    if (PLACEMENT_OVERRIDES[placement.id]) continue;
    const isCoastalRock = placement.assetId.startsWith("rock_coastal_");
    if (!isPlacementFootprintStable(placement, isCoastalRock ? 0.8 : 0.72, isCoastalRock ? 1.1 : 0.78)) {
      throw new Error(`[WorldEnvironmentLayout] Unstable authored footprint ${placement.id}`);
    }
  }
  const layout = {
    worldSeed,
    staticPlacements,
    groundCoverPlacements: generateGroundCoverPlacements(worldSeed)
  };
  ENVIRONMENT_LAYOUT_CACHE.set(worldSeed, layout);
  return layout;
}

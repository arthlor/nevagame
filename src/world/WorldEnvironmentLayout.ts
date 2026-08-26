import { WorldLayout, WORLD_BOUNDS, WORLD_LAYOUT_V5 } from "./WorldLayout";
import { STARTER_FARM_LAYOUT, farmLocalToWorld, starterStructureAnchor } from "./FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "./FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, HARBOR_SKIFF_MOORING, RIVER_CROSSING, VILLAGE_MARKET } from "./WorldAnchors";

export type EnvironmentQualityTier = "low" | "medium" | "high";
export type EnvironmentPlacementOrigin = "authored" | "layout-derived" | "seeded-fill";
export type GroundCoverCategory = "grass" | "flowers" | "pebbles" | "driftwood";

export interface EnvironmentAssetPlacement {
  id: string;
  origin: EnvironmentPlacementOrigin;
  assetId: string;
  x: number;
  z: number;
  rotationY: number;
  scale: readonly [number, number, number];
  /** Unscaled half-extents of the asset's grounding footprint. */
  grounding?: readonly [number, number];
  practicalLight?: boolean;
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
}

export const GROUND_COVER_DENSITY: Readonly<
  Record<EnvironmentQualityTier, Readonly<Record<GroundCoverCategory, number>>>
> = {
  high: { grass: 7200, flowers: 300, pebbles: 180, driftwood: 30 },
  medium: { grass: 3840, flowers: 165, pebbles: 100, driftwood: 18 },
  low: { grass: 1680, flowers: 70, pebbles: 45, driftwood: 9 }
};

const SEEDED_FILL_CLUSTERS: readonly EnvironmentClusterDefinition[] = [
  { id: "trees.northwest-farm", salt: 811, count: 20, center: { x: -88, z: -64 }, radiusX: 26, radiusZ: 24, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c", "tree_apple_a"], scaleRange: [0.9, 1.12] },
  { id: "trees.northern-river", salt: 823, count: 16, center: { x: -42, z: -104 }, radiusX: 24, radiusZ: 42, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.94, 1.14] },
  { id: "trees.northeast-orchard", salt: 827, count: 24, center: { x: 90, z: -46 }, radiusX: 22, radiusZ: 20, assetIds: ["tree_apple_a", "tree_apple_a", "tree_oak_b"], scaleRange: [0.88, 1.08] },
  { id: "trees.central-village", salt: 829, count: 14, center: { x: 24, z: -30 }, radiusX: 20, radiusZ: 16, assetIds: ["tree_oak_a", "tree_oak_b", "tree_oak_c"], scaleRange: [0.92, 1.1] },
  { id: "trees.southwest-headland", salt: 839, count: 14, center: { x: -102, z: 45 }, radiusX: 35, radiusZ: 24, assetIds: ["tree_pine_a", "tree_pine_b", "tree_oak_c"], scaleRange: [0.9, 1.12] },
  { id: "trees.southeast-harbor", salt: 853, count: 10, center: { x: 105, z: 43 }, radiusX: 30, radiusZ: 25, assetIds: ["tree_pine_a", "tree_pine_b", "tree_oak_c"], scaleRange: [0.92, 1.14] },
  { id: "trees.eastern-meadow", salt: 857, count: 12, center: { x: 126, z: -48 }, radiusX: 30, radiusZ: 42, assetIds: ["tree_oak_a", "tree_oak_c", "tree_pine_a"], scaleRange: [0.9, 1.1] },
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

/** @internal Deterministic world-space bias used to form broad meadow grass pockets. */
export function grassPlacementDensityAt(x: number, z: number): number {
  const meadowWeight = WorldLayout.terrainSurfaceWeights(x, z).meadow;
  const roadsideWeight = WorldLayout.pathShoulderInfluence(x, z);
  const broadSignal = 0.5
    + Math.sin(x * 0.041 + z * 0.026 + 0.8) * 0.27
    + Math.cos(x * 0.019 - z * 0.047 - 0.6) * 0.19;
  const pocket = clamp01((broadSignal - 0.34) / 0.46);
  const clusteredPocket = pocket * pocket * (3 - 2 * pocket);
  return clamp01(
    0.08
      + meadowWeight * 0.92
      + roadsideWeight * 0.06
      + clusteredPocket * 0.76
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
      if (
        WorldLayout.isWater(x, z)
        || WorldLayout.isBridgeDeck(x, z)
        || WorldLayout.farmSoilInfluence(x, z) > 0.16
        || WorldLayout.pathInfluence(x, z) < 0.32
      ) continue;
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
  { x: 78, z: 67, radius: 8 },
  { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z, radius: 5.5 },
  { x: HARBOR_SKIFF_MOORING.boatPosition.x, z: HARBOR_SKIFF_MOORING.boatPosition.z, radius: 5.5 },
  { x: FARMHOUSE_INTERIOR_ORIGIN.x, z: FARMHOUSE_INTERIOR_ORIGIN.z, radius: 8.5 }
] as const;

function clearsLandmarks(x: number, z: number, margin: number = 0): boolean {
  return CLEARANCES.every((clearance) => distanceTo(x, z, clearance) > clearance.radius + margin);
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

const AUTHORED_DETAIL_PLACEMENTS: readonly EnvironmentAssetPlacement[] = [
  authoredPlacement("authored.farm.pumpkin-patch", { assetId: "prop_pumpkin_patch_a", x: -70, z: -47, rotationY: -0.18, scale: [1, 1, 1] }),
  authoredPlacement("authored.tree.apple.orchard-a", { assetId: "tree_apple_a", x: 82, z: -44, rotationY: 0.22, scale: [1, 1, 1], grounding: [1.05, 0.74] }),
  authoredPlacement("authored.tree.apple.orchard-b", { assetId: "tree_apple_a", x: 88, z: -40, rotationY: -0.48, scale: [1, 1, 1], grounding: [1, 0.72] }),
  authoredPlacement("authored.tree.apple.orchard-c", { assetId: "tree_apple_a", x: 86, z: -52, rotationY: 0.84, scale: [1, 1, 1], grounding: [1, 0.7] }),
  authoredPlacement("authored.tree.oak.farm-west", { assetId: "tree_oak_c", x: -82, z: -47, rotationY: 0.35, scale: [1, 1, 1], grounding: [1.18, 0.78] }),
  authoredPlacement("authored.tree.oak.village", { assetId: "tree_oak_a", x: 78, z: -42, rotationY: 0.58, scale: [1, 1, 1], grounding: [1.22, 0.8] }),
  authoredPlacement("authored.tree.pine.headland", { assetId: "tree_pine_b", x: -122, z: 45, rotationY: -0.42, scale: [1, 1, 1], grounding: [1.28, 0.8] }),
  authoredPlacement("authored.foliage.reeds.bridge-south", { assetId: "foliage_reeds_a", x: -8, z: -14.5, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.foliage.reeds.bridge-north", { assetId: "foliage_reeds_a", x: -20, z: 0.5, rotationY: -0.25, scale: [1, 1, 1] }),
  authoredPlacement("authored.rock.headland-a", { assetId: "rock_coastal_a", x: -98, z: WorldLayout.coastlineZ(-98) - 15, rotationY: 0.24, scale: [1.15, 0.82, 1.1], grounding: [2.25, 1.35] }),
  authoredPlacement("authored.rock.headland-b", { assetId: "rock_coastal_b", x: -88, z: WorldLayout.coastlineZ(-88) - 15, rotationY: -0.36, scale: [0.9, 0.72, 0.86], grounding: [2.05, 1.25] }),
  authoredPlacement("authored.rock.western-shelf", { assetId: "rock_coastal_c", x: -48, z: WorldLayout.coastlineZ(-48) - 10, rotationY: 0.17, scale: [0.82, 0.72, 0.86], grounding: [1.65, 1.18] }),
  authoredPlacement("authored.rock.harbor-shelf-boulder", { assetId: "rock_coastal_boulder_a", x: 108, z: WorldLayout.coastlineZ(108) - 8, rotationY: 0.32, scale: [1, 1, 1], grounding: [0.9, 0.62] }),
  authoredPlacement("authored.rock.eastern-shelf", { assetId: "rock_coastal_d", x: 126, z: WorldLayout.coastlineZ(126) - 10, rotationY: -0.22, scale: [1, 0.8, 0.95], grounding: [2.15, 1.42] }),
  authoredPlacement("authored.rock.uplands-boulder", { assetId: "rock_boulder_a", x: 93, z: -31, rotationY: 0.38, scale: [1.2, 1, 1.1], grounding: [1.7, 1.15] }),
  authoredPlacement("authored.rock.village-field", { assetId: "rock_field_a", x: 80, z: -34, rotationY: 0.62, scale: [0.8, 0.65, 0.75], grounding: [0.85, 0.58] }),
  authoredPlacement("authored.rock.harbor-boulder", { assetId: "rock_boulder_a", x: 91, z: 57, rotationY: -0.18, scale: [1.1, 0.9, 1], grounding: [1.55, 1.05] }),
  authoredPlacement("authored.prop.lamp.village-west", { assetId: "prop_lamp_post_a", x: 46, z: -46, rotationY: 0, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-east", { assetId: "prop_lamp_post_a", x: 63, z: -48, rotationY: 0.08, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-mill", { assetId: "prop_lamp_post_a", x: MILL_WORLD.x + 2.4, z: MILL_WORLD.z + 4.2, rotationY: 0.12, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.harbor", { assetId: "prop_lamp_post_a", x: 72.5, z: 57.5, rotationY: 0.05, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.crate.harbor", { assetId: "prop_crate_wood_a", x: 75, z: 62.5, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.barrel.harbor", { assetId: "prop_barrel_wood_a", x: 77, z: 63.5, rotationY: 0.1, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.trap.harbor", { assetId: "prop_lobster_trap_a", x: 80, z: 65.5, rotationY: 0.65, scale: [1, 1, 1] }),
  authoredPlacement("authored.prop.net-rack.harbor", { assetId: "prop_fishing_net_rack_a", x: 67.5, z: 64.5, rotationY: 0.22, scale: [1, 1, 1] }),
  authoredPlacement("authored.fauna.chicken.farm-a", { assetId: "fauna_chicken_a", x: -61.8, z: -52.2, rotationY: 0.8, scale: [1.1, 1.1, 1.1] }),
  authoredPlacement("authored.fauna.chicken.farm-b", { assetId: "fauna_chicken_a", x: -58.7, z: -55.8, rotationY: -0.5, scale: [0.92, 0.92, 0.92] }),
  authoredPlacement("authored.prop.wagon.farm-road", { assetId: "prop_wagon_cart_a", x: -49, z: -59, rotationY: -0.12, scale: [1, 1, 1], grounding: [1.5, 1.05] }),
  authoredPlacement("authored.fauna.cow.farm-meadow", { assetId: "fauna_cow_a", x: -47, z: -51, rotationY: 0.42, scale: [1, 1, 1], grounding: [0.9, 0.62] }),
  // --- Curated Polyfork Vignettes ---

  // Farmhouse exterior: firewood stacked against the west wall of the farmhouse
  authoredPlacement("authored.farm.firewood", { assetId: "prop_firewood_stack_a", x: -57.5, z: -53.5, rotationY: Math.PI + 0.08, scale: [1, 1, 1] }),
  // Wheelbarrow parked beside the farm work-path, facing the crop rows
  authoredPlacement("authored.farm.wheelbarrow", { assetId: "prop_wheelbarrow_a", x: -62, z: -57, rotationY: -0.3, scale: [1, 1, 1] }),
  // Beehive in the sunny meadow east of the chicken yard
  authoredPlacement("authored.farm.beehive", { assetId: "prop_beehive_a", x: -56, z: -49, rotationY: -0.2, scale: [1, 1, 1] }),
  // Sunflower row along the northern farm perimeter fence
  authoredPlacement("authored.farm.sunflowers", { assetId: "foliage_sunflower_a", x: -68, z: -43, rotationY: 0.4, scale: [1, 1, 1] }),
  // Mushroom cluster under the large western oak (shade-dwelling)
  authoredPlacement("authored.farm.mushrooms", { assetId: "foliage_mushroom_cluster_a", x: -80, z: -49, rotationY: 0.2, scale: [0.9, 0.9, 0.9] }),
  // Rabbit foraging in the meadow between farm and village
  authoredPlacement("authored.fauna.rabbit-meadow", { assetId: "fauna_rabbit_a", x: -55, z: -43, rotationY: 1.2, scale: [1, 1, 1] }),

  // Harbor cargo staging: crate & sack grouped tightly against the Fish Market exterior (x:64, z:60)
  authoredPlacement("authored.harbor.cargo-crate", { assetId: "prop_cargo_crate_large_a", x: 62.5, z: 58, rotationY: -0.08, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.cargo-sack", { assetId: "prop_cargo_sack_a", x: 63.5, z: 57.5, rotationY: 0.35, scale: [1, 1, 1] }),
  // Dock lantern at the pier entrance, aligned with the walkway
  authoredPlacement("authored.harbor.dock-lantern", { assetId: "prop_dock_lantern_a", x: 74, z: 62, rotationY: 0, scale: [1, 1, 1], practicalLight: true }),
  // Mooring post at the dock edge near the rowboat
  authoredPlacement("authored.harbor.mooring-post", { assetId: "prop_mooring_post_a", x: 79, z: 66, rotationY: 0, scale: [1, 1, 1] }),

  // Village plaza: open packed courtyard. Buildings sit on a wide ring with
  // published +Z doors facing the market. The mill pad stays southwest, off-court.
  authoredPlacement("authored.village.bench", { assetId: "prop_bench_wood_a", x: 61.5, z: -47.2, rotationY: villageDoorFacingPlaza(61.5, -47.2), scale: [1, 1, 1] }),
  authoredPlacement("authored.village.well", { assetId: "prop_water_well_a", x: 50.2, z: -54.6, rotationY: 0.22, scale: [1, 1, 1], grounding: [1.1, 0.95] }),
  authoredPlacement("authored.village.signpost", { assetId: "prop_signpost_trail_a", x: 47.2, z: -44.4, rotationY: 0.18, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.clay-oven", { assetId: "prop_clay_oven_a", x: MILL_WORLD.x + 4.6, z: MILL_WORLD.z + 2.2, rotationY: villageDoorFacingPlaza(MILL_WORLD.x + 4.6, MILL_WORLD.z + 2.2), scale: [1, 1, 1] }),
  authoredPlacement("authored.village.tool-shed", { assetId: "prop_tool_shed_a", x: 24, z: -72, rotationY: villageDoorFacingPlaza(24, -72), scale: [1, 1, 1], grounding: [1.4, 1.3] }),
  authoredPlacement("authored.village.outhouse", { assetId: "building_outhouse_a", x: 24, z: -62, rotationY: villageDoorFacingPlaza(24, -62), scale: [1, 1, 1], grounding: [0.95, 0.9] }),
  authoredPlacement("authored.village.homestead-gate", { assetId: "prop_farm_gate_a", x: 58.2, z: -58.2, rotationY: 0.9, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.fence-a", { assetId: "prop_fence_wood_a", x: 62.2, z: -58.4, rotationY: 0.9, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.fence-b", { assetId: "prop_fence_wood_a", x: 64.4, z: -60.0, rotationY: 1.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.village.cottage-west", { assetId: "house_cottage_a", x: 36, z: -50, rotationY: villageDoorFacingPlaza(36, -50), scale: [1, 1, 1], grounding: [2.7, 2.4] }),
  authoredPlacement("authored.village.cottage-southwest", { assetId: "house_cottage_b", x: 38, z: -60, rotationY: villageDoorFacingPlaza(38, -60), scale: [1, 1, 1], grounding: [2.5, 2.7] }),
  authoredPlacement("authored.village.cottage-garden", { assetId: "house_cottage_a", x: 72, z: -64, rotationY: villageDoorFacingPlaza(72, -64), scale: [0.96, 0.96, 0.96], grounding: [2.6, 2.3] }),
  authoredPlacement("authored.village.cottage-south", { assetId: "house_cottage_b", x: 48, z: -66, rotationY: villageDoorFacingPlaza(48, -66), scale: [1, 1, 1], grounding: [2.5, 2.7] }),
  authoredPlacement("authored.village.inn", { assetId: "building_inn_a", x: 64, z: -38, rotationY: villageDoorFacingPlaza(64, -38), scale: [1, 1, 1], grounding: [4.0, 3.7] }),
  authoredPlacement("authored.village.market-hall", { assetId: "building_village_market_hall_a", x: 72, z: -51, rotationY: villageDoorFacingPlaza(72, -51), scale: [1, 1, 1], grounding: [4.4, 3.6] }),
  authoredPlacement("authored.village.barn", { assetId: "building_barn_a", x: 38, z: -68, rotationY: villageDoorFacingPlaza(38, -68), scale: [1, 1, 1], grounding: [4.3, 2.8] }),

  // Forest fallen log on the inland meadow slope
  authoredPlacement("authored.forest.fallen-log", { assetId: "prop_fallen_log_a", x: 34, z: -34, rotationY: 0.6, scale: [1, 1, 1] }),
  // Driftwood log washed up on the beach west of harbor
  authoredPlacement("authored.coast.driftwood-log", { assetId: "prop_driftwood_log_a", x: 30, z: WorldLayout.coastlineZ(30) - 3, rotationY: 0.8, scale: [1, 1, 1] }),
  // Beach grass tuft near the driftwood
  authoredPlacement("authored.coast.beach-grass", { assetId: "foliage_beach_grass_a", x: 32, z: WorldLayout.coastlineZ(32) - 2, rotationY: 0.15, scale: [1, 1, 1] })
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
  const patches = patchDistribution
    ? Array.from({ length: patchDistribution.patchCount }, () => ({
        x: WORLD_BOUNDS.minX + 5 + rng() * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 10),
        z: WORLD_BOUNDS.minZ + 5 + rng() * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 10),
        radius: patchDistribution.radiusRange[0]
          + (patchDistribution.radiusRange[1] - patchDistribution.radiusRange[0]) * rng(),
        depthScale: patchDistribution.depthScaleRange[0]
          + (patchDistribution.depthScaleRange[1] - patchDistribution.depthScaleRange[0]) * rng(),
        rotation: rng() * Math.PI * 2
      }))
    : [];
  for (let attempt = 0; attempt < count * 200 && placements.length < count; attempt++) {
    let x: number;
    let z: number;
    if (patches.length > 0) {
      const patch = patches[Math.floor(rng() * patches.length)];
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
    const density = clamp01(densityWeight(x, z));
    if (density < 1 && rng() > density) continue;
    if (!predicate(x, z) || !hasGroundCoverClearance(x, z)) continue;
    const scale = scaleRange[0] + (scaleRange[1] - scaleRange[0]) * rng();
    const index = placements.length;
    const grassPatchVariant = groundCoverPatchVariantIndex(x, z, seed, 6);
    const selectedVariant = category === "grass"
      ? grassPatchVariant < 3 ? 0 : grassPatchVariant < 4 ? 1 : 2
      : index % assetIds.length;
    const grassScale = selectedVariant === 2
      ? { horizontal: 1.42, vertical: 0.76 }
      : selectedVariant === 1
        ? { horizontal: 1.6, vertical: 0.7 }
        : { horizontal: 1.52, vertical: 0.7 };
    const horizontalScale = category === "grass" ? grassScale.horizontal : 1;
    const verticalScale = category === "grass" ? grassScale.vertical : 1;
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

export function generateGroundCoverPlacements(worldSeed: number): GroundCoverPlacement[] {
  const high = GROUND_COVER_DENSITY.high;
  const commonGround = (x: number, z: number) =>
    WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && !WorldLayout.isInterior(x, z)
    && WorldLayout.terrainNormal(x, z).y > 0.78
    && WorldLayout.pathInfluence(x, z) < 0.08
    && WorldLayout.roadsideInfluence(x, z) < 0.94
    && WorldLayout.farmSoilInfluence(x, z) < 0.08;

  const grass = scatterGroundCover(
    "grass",
    ["foliage_grass_a", "foliage_grass_b", "foliage_grass_c"],
    high.grass,
    mixSeed(worldSeed, 0x1a31),
    (x, z) => commonGround(x, z) && WorldLayout.shorelineWetness(x, z) < 0.62,
    [0.78, 1.12],
    "ground-cover.grass",
    grassPlacementDensityAt,
    { patchCount: 880, radiusRange: [1.4, 3.8], depthScaleRange: [0.52, 0.94] }
  );
  const flowers = scatterGroundCover(
    "flowers",
    ["foliage_wildflower_a", "foliage_wildflower_b", "foliage_wildflower_c"],
    high.flowers,
    mixSeed(worldSeed, 0x2b47),
    (x, z) => commonGround(x, z)
      && WorldLayout.terrainSurfaceWeights(x, z).meadow > 0.08
      && WorldLayout.shorelineWetness(x, z) < 0.45,
    [0.9, 1.22],
    "ground-cover.flowers",
    (x, z) => {
      const farmBias = clamp01(1 - distanceTo(x, z, STARTER_FARM_LAYOUT.origin) / 48);
      return clamp01(
        0.42
          + WorldLayout.terrainSurfaceWeights(x, z).meadow * 0.3
          + farmBias * 0.55
          + WorldLayout.pathShoulderInfluence(x, z) * 0.16
      );
    },
    { patchCount: 92, radiusRange: [0.55, 1.65], depthScaleRange: [0.6, 1] }
  );
  const coastPebbleCount = Math.round(high.pebbles * 0.56);
  const coastPebbles = scatterCoastGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], coastPebbleCount, mixSeed(worldSeed, 0x3c59), [0.55, 8.4], (x, z) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && WorldLayout.terrainNormal(x, z).y > 0.68 && WorldLayout.pathInfluence(x, z) < 0.08 && WorldLayout.coastProfile(x).beach + WorldLayout.coastProfile(x).rockShelf > 0.42, [0.74, 1.12]);
  const pathPebbleCount = Math.round(high.pebbles * 0.2);
  const shoulderPebbles = scatterGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], high.pebbles - coastPebbles.length - pathPebbleCount, mixSeed(worldSeed, 0x3c5a), (x, z) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && WorldLayout.farmSoilInfluence(x, z) < 0.12 && WorldLayout.pathShoulderInfluence(x, z) > 0.12 && WorldLayout.pathInfluence(x, z) < 0.2, [0.74, 1.12], "ground-cover.shoulder.pebbles", (x, z) => 0.68 + WorldLayout.pathShoulderInfluence(x, z) * 0.32);
  const pathPebbles = scatterGroundCover(
    "pebbles",
    ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"],
    pathPebbleCount,
    mixSeed(worldSeed, 0x3c5b),
    (x, z) => WorldLayout.isWalkable(x, z)
      && !WorldLayout.isWater(x, z)
      && !WorldLayout.isBridgeDeck(x, z)
      && WorldLayout.terrainNormal(x, z).y > 0.74
      && WorldLayout.farmSoilInfluence(x, z) < 0.12
      && WorldLayout.pathInfluence(x, z) > 0.28,
    [0.52, 0.86],
    "ground-cover.path.pebbles",
    (x, z) => WorldLayout.pathInfluence(x, z)
  );
  const driftwood = scatterCoastGroundCover("driftwood", ["prop_driftwood_a", "prop_driftwood_b", "prop_driftwood_c"], high.driftwood, mixSeed(worldSeed, 0x4d6b), [0.65, 5.2], (x, z) => WorldLayout.isWalkable(x, z) && WorldLayout.terrainNormal(x, z).y > 0.72 && WorldLayout.coastProfile(x).beach > 0.28 && WorldLayout.pathInfluence(x, z) < 0.08, [0.78, 1.08]);
  return [...grass, ...flowers, ...coastPebbles, ...shoulderPebbles, ...pathPebbles, ...driftwood];
}

const ENVIRONMENT_LAYOUT_CACHE = new Map<number, WorldEnvironmentLayout>();

export function createWorldEnvironmentLayout(worldSeed: number): WorldEnvironmentLayout {
  const cached = ENVIRONMENT_LAYOUT_CACHE.get(worldSeed);
  if (cached) return cached;
  const fixed = fixedEnvironmentPlacements();
  const seededFill = SEEDED_FILL_CLUSTERS.flatMap((definition) =>
    generateEnvironmentClusterPlacements(worldSeed, definition)
  );
  const staticPlacements = [...AUTHORED_DETAIL_PLACEMENTS, ...fixed, ...seededFill];
  for (const placement of staticPlacements) {
    if (!placement.grounding) continue;
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

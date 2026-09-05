import { createHarborCoastPlacements, retainLegacyHarborDressing, retainHarborGroundCover } from "./HarborCoastLayout";
import {
  WorldLayout,
  WORLD_BOUNDS,
  WORLD_LAYOUT_V5,
  pointSegmentProjection,
  type WorldArchitecturePad
} from "./WorldLayout";
import { STARTER_DONKEY_ANCHOR, STARTER_FARM_LAYOUT, farmLocalToWorld, starterStructureAnchor } from "./FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "./FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, HARBOR_SKIFF_MOORING, RIVER_CROSSING, VILLAGE_MARKET } from "./WorldAnchors";
import {
  compositionAddress,
  compositionPlacementTag,
  compositionPriority,
  islandCompositionPriority,
  sampleWorldComposition,
  type CompositionCategory,
  type CompositionPlacementTag,
  type WorldCompositionSample,
  type WorldDistrictId
} from "./WorldCompositionField";
import { WORLD_ISLAND_DEFINITIONS, type WorldBiomeId, type WorldIslandId } from "./WorldIslands";

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
  islandId?: WorldIslandId;
  biomeId?: WorldBiomeId;
  /** Deterministic presentation provenance; excluded from canonical state and saves. */
  compositionTag?: CompositionPlacementTag;
}

export interface PlacementOverride {
  x: number;
  z: number;
  rotationY: number;
}

/** DEV layout-editor pins for seeded/layout-derived instances. Empty until an in-game drop writes an id. */
export const PLACEMENT_OVERRIDES: Readonly<Record<string, PlacementOverride>> = {
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
  
  authoredPlacement("authored.harbor.repair-platform", { assetId: "prop_dock_platform_a", x: 95, z: 50.5, rotationY: 0.25, scale: [1, 1, 1], clearanceRadiusMeters: 1.6 }),
  
  authoredPlacement("authored.harbor.spare-railing", { assetId: "prop_pier_railing_a", x: 68.4, z: 60.5, rotationY: -1.8326, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.anchor-store", { assetId: "prop_anchor_admiralty_a", x: 106, z: 55, rotationY: -0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.drying-rack", { assetId: "prop_fish_drying_rack_a", x: 85, z: 59, rotationY: 0.25, scale: [1, 1, 1], grounding: [1.1, 0.41], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.harbor.mooring-post", { assetId: "prop_mooring_post_a", x: 85, z: 68, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.harbor.yard-lantern", { assetId: "prop_dock_lantern_a", x: 86, z: 56.5, rotationY: 0.25, scale: [1, 1, 1], practicalLight: true }),

  // A maintained stopping place on the lighthouse walk; no new fire/camping mechanic.
  authoredPlacement("authored.coast.walk-kiosk", { assetId: "prop_trail_kiosk_a", x: -60, z: 65, rotationY: 2.7, scale: [1, 1, 1], clearanceRadiusMeters: 1.5 }),
  authoredPlacement("authored.coast.rest-fire-pit", { assetId: "prop_fire_pit_a", x: -62, z: 60, rotationY: 0.2, scale: [1, 1, 1], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.woodland.habitat-snag", { assetId: "tree_dead_a", x: -151, z: -118, rotationY: 0.4, scale: [1, 1, 1] }),
  // The old toe became a steep face; the broad western summit supports the whole rock.
  authoredPlacement("authored.woodland.boulder", { assetId: "rock_boulder_large_a", x: -126, z: -116, rotationY: -0.3, scale: [1, 1, 1], grounding: [1.1, 0.99], clearanceRadiusMeters: 2 }),
  authoredPlacement("authored.coast.headland-spire", { assetId: "rock_spire_a", x: -115, z: 72, rotationY: 0.3, scale: [1, 1, 1], grounding: [0.65, 0.73], clearanceRadiusMeters: 1.4 }),

  // Marine plants are rooted on the bed. Only the buoy and lily leaves use waterline height.
  authoredPlacement("authored.coast.sea-stack", { assetId: "rock_sea_stack_a", x: -151, z: WorldLayout.coastlineZ(-151) + 7, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.navigation-buoy", { assetId: "prop_marker_buoy_a", x: 110, y: -0.12, z: WorldLayout.coastlineZ(110) + 10, rotationY: 0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.river.lily-pocket", { assetId: "foliage_lily_pad_a", x: WorldLayout.riverCenterX(-112) - WorldLayout.riverHalfWidth(-112) + 0.8, y: 0.035, z: -112, rotationY: 0.6, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.seagrass", { assetId: "foliage_seagrass_tuft_a", x: 134, z: WorldLayout.coastlineZ(134) + 2, rotationY: 0.2, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.algae", { assetId: "foliage_algae_frond_a", x: 135.5, z: WorldLayout.coastlineZ(135.5) + 2.5, rotationY: -0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.reef-rock", { assetId: "rock_reef_small_a", x: 137, z: WorldLayout.coastlineZ(137) + 3, rotationY: 0.5, scale: [1, 1, 1] }),
  // Keep the established reef IDs below the shallow shelf's trough envelope;
  // the clear water now reveals the whole bed instead of hiding dry coral tips.
  authoredPlacement("authored.coast.coral-pillar", { assetId: "prop_coral_pillar_a", x: 133, z: WorldLayout.coastlineZ(133) + 31, rotationY: 0.3, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.coral-staghorn", { assetId: "prop_coral_staghorn_a", x: 137, z: WorldLayout.coastlineZ(137) + 27, rotationY: -0.4, scale: [1, 1, 1] }),
  authoredPlacement("authored.coast.coral-table", { assetId: "prop_coral_table_a", x: 139, z: WorldLayout.coastlineZ(139) + 29, rotationY: 0.1, scale: [1, 1, 1] }),
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
  authoredPlacement("authored.prop.lamp.harbor", { assetId: "prop_lamp_post_a", x: 68.9, z: 57.4, rotationY: -4.1888, scale: [1, 1, 1], practicalLight: true }),
  // The village carried three lamps against sixteen structures, so most of it
  // went dark after dusk while the starter farm stayed warm. These fill the
  // gaps along the routes players actually walk: the northern approach past the
  // roadside stall, the market frontage, the eastern cottage cluster, and the
  // orchard track. Static placements join the shared batches, and the per-tier
  // `practicalLightBudget` still caps how many are lit at once, so coverage
  // improves without adding either draw calls or active point lights.
  authoredPlacement("authored.prop.lamp.village-north", { assetId: "prop_lamp_post_a", x: 51.4, z: -19.6, rotationY: 1.2217, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-market", { assetId: "prop_lamp_post_a", x: 61.2, z: -55.8, rotationY: -0.9599, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.village-garden", { assetId: "prop_lamp_post_a", x: 70.6, z: -60.4, rotationY: 2.0944, scale: [1, 1, 1], practicalLight: true }),
  authoredPlacement("authored.prop.lamp.orchard-track", { assetId: "prop_lamp_post_a", x: 103.5, z: -55.2, rotationY: -1.5708, scale: [1, 1, 1], practicalLight: true }),
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
  authoredPlacement("authored.forest.fallen-log", { assetId: "prop_fallen_log_a", x: 26, z: -20.1, rotationY: 0.6, scale: [1, 1, 1] }),
  // Driftwood log washed up on the beach west of harbor
  authoredPlacement("authored.coast.driftwood-log", { assetId: "prop_driftwood_log_a", x: 30, z: WorldLayout.coastlineZ(30) - 3, rotationY: 0.8, scale: [1, 1, 1] }),
  // Beach grass tuft near the driftwood
  authoredPlacement("authored.coast.beach-grass", { assetId: "foliage_beach_grass_a", x: 32, z: WorldLayout.coastlineZ(32) - 2, rotationY: 0.15, scale: [1, 1, 1] }),
  authoredPlacement("authored.copy.tree_apple_a.1", { assetId: "tree_apple_a", x: -59.8, z: -75.7, rotationY: 1.0894, scale: [0.92, 0.91, 0.92] }),
  authoredPlacement("authored.copy.tree_oak_c.1", { assetId: "tree_oak_c", x: -47.5, z: -53.8, rotationY: 5.1019, scale: [0.94, 0.95, 0.94] }),
];

function independentCoastalDressing(worldSeed: number): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const candidateCount = 20;
  for (let address = 0; address < candidateCount; address++) {
    const xProgress = compositionPriority(worldSeed, "short-cover", address, 0x4b1d, 0);
    const depthProgress = compositionPriority(worldSeed, "short-cover", address, 0x4b1d, 1);
    const x = WORLD_BOUNDS.minX + 8 + xProgress * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 16);
    const z = WorldLayout.coastlineZ(x) + 1.4 + depthProgress * 4.2;
    if (!WorldLayout.isWater(x, z)) continue;
    const scale = 0.82 + compositionPriority(worldSeed, "short-cover", address, 0x4b1d, 2) * 0.24;
    placements.push({
      id: `seeded-fill.${compositionAddress(worldSeed, "short-cover", address, 0x4b1d, 3)}`,
      origin: "seeded-fill",
      assetId: "foliage_kelp_a",
      x,
      z,
      rotationY: compositionPriority(worldSeed, "short-cover", address, 0x4b1d, 4) * Math.PI * 2,
      scale: [scale, scale, scale]
    });
  }
  return placements;
}

interface CausalStructuralSpec {
  category: CompositionCategory;
  targetCount: number;
  salt: number;
  spacing: number;
  scaleRange: readonly [number, number];
  footprint: readonly [number, number];
}

const DEPOSITIONAL_RIVER_CANDIDATE_Z = Array.from({ length: 127 }, (_, index) => -176 + index * 2)
  .filter((z) => {
    const section = WorldLayout.riverSectionAt(z);
    return Math.max(section.leftDeposition, section.rightDeposition) >= 0.24;
  });

function structuralAssetFor(
  category: CompositionCategory,
  sample: WorldCompositionSample,
  speciesRoll: number
): string {
  if (category === "tree") {
    if (sample.habitat.orchard >= 0.34 && sample.district.farm >= 0.35) return "tree_apple_a";
    if (sample.district.headland >= 0.34 || sample.habitat.exposed >= 0.54) {
      return speciesRoll < 0.48 ? "tree_pine_a" : speciesRoll < 0.82 ? "tree_pine_b" : "tree_pine_young_a";
    }
    const sheltered = ["tree_oak_a", "tree_oak_b", "tree_oak_c", "tree_oak_broadleaf_a", "tree_maple_a"] as const;
    return sheltered[Math.min(sheltered.length - 1, Math.floor(speciesRoll * sheltered.length))];
  }
  if (category === "bush") return speciesRoll < 0.58 ? "foliage_bush_a" : "foliage_bush_round_a";
  if (category === "reed") return speciesRoll < 0.52 ? "foliage_reeds_a" : "foliage_cattail_a";
  if (category === "rock") {
    if (sample.district.headland >= 0.3 || sample.district.coast >= 0.48) {
      return "rock_coastal_boulder_a";
    }
    return "rock_field_a";
  }
  throw new Error(`[WorldEnvironmentLayout] Unsupported structural category ${category}`);
}

function structuralCandidatePosition(
  worldSeed: number,
  spec: CausalStructuralSpec,
  address: number
): { x: number; z: number } {
  if (spec.category === "reed") {
    const reachRoll = compositionPriority(worldSeed, spec.category, address, spec.salt, 1);
    const reachIndex = Math.min(
      DEPOSITIONAL_RIVER_CANDIDATE_Z.length - 1,
      Math.floor(reachRoll * DEPOSITIONAL_RIVER_CANDIDATE_Z.length)
    );
    const z = (DEPOSITIONAL_RIVER_CANDIDATE_Z[reachIndex] ?? -48)
      + (compositionPriority(worldSeed, spec.category, address, spec.salt, 11) - 0.5) * 1.6;
    const section = WorldLayout.riverSectionAt(z);
    const depositionalSide = section.leftDeposition >= section.rightDeposition ? -1 : 1;
    const side = compositionPriority(worldSeed, spec.category, address, spec.salt, 9) < 0.82
      ? depositionalSide
      : -depositionalSide;
    const waterWidth = side > 0 ? section.rightWaterWidth : section.leftWaterWidth;
    const bankRun = side > 0 ? section.rightBankRun : section.leftBankRun;
    const dryShelfOffset = 0.12
      + bankRun * (0.004 + compositionPriority(worldSeed, spec.category, address, spec.salt, 10) * 0.018);
    return {
      x: section.centerX + side * (waterWidth + dryShelfOffset),
      z
    };
  }
  const inset = 5;
  return {
    x: WORLD_BOUNDS.minX + inset
      + compositionPriority(worldSeed, spec.category, address, spec.salt, 0)
        * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - inset * 2),
    z: WORLD_BOUNDS.minZ + inset
      + compositionPriority(worldSeed, spec.category, address, spec.salt, 1)
        * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - inset * 2)
  };
}

function clearsCompleteRouteCorridor(x: number, z: number, extraMeters: number = 0): boolean {
  for (const route of WorldLayout.compiledRouteNetwork()) {
    const corridor = route.halfWidth + route.shoulderWidthMeters + route.terrainFeatherMeters + extraMeters;
    if (
      x < route.minX - corridor
      || x > route.maxX + corridor
      || z < route.minZ - corridor
      || z > route.maxZ + corridor
    ) continue;
    for (const segment of route.segments) {
      if (
        x < segment.minX - corridor
        || x > segment.maxX + corridor
        || z < segment.minZ - corridor
        || z > segment.maxZ + corridor
      ) continue;
      if (pointSegmentProjection(x, z, segment.start, segment.end).distance < corridor) return false;
    }
  }
  return true;
}

function causesDenseRouteWall(
  x: number,
  z: number,
  accepted: readonly EnvironmentAssetPlacement[]
): boolean {
  const route = WorldLayout.nearestRouteDistance(x, z);
  const edgeReach = route.halfWidth + route.shoulderWidthMeters + route.terrainFeatherMeters + 11;
  if (route.distance > edgeReach) return false;
  let neighbors = 0;
  for (const placement of accepted) {
    if (placement.compositionTag?.category !== "tree" && placement.compositionTag?.category !== "bush") continue;
    const other = WorldLayout.nearestRouteDistance(placement.x, placement.z);
    if (other.route.id !== route.route.id) continue;
    if (Math.abs(other.distanceAlongRoute - route.distanceAlongRoute) > 12) continue;
    neighbors += 1;
    if (neighbors >= 4) return true;
  }
  return false;
}

function generateDistrictLandmarkSpecimens(
  worldSeed: number,
  occupied: readonly EnvironmentAssetPlacement[]
): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  const districts: readonly Exclude<WorldDistrictId, "river">[] = ["farm", "village", "harbor", "headland", "coast"];
  for (const [districtIndex, district] of districts.entries()) {
    let best: { placement: EnvironmentAssetPlacement; score: number } | null = null;
    for (let address = 0; address < 320; address++) {
      const spec: CausalStructuralSpec = {
        category: "tree",
        targetCount: 1,
        salt: 0x711d + districtIndex * 97,
        spacing: 11,
        scaleRange: [1.1, 1.34],
        footprint: [1.32, 0.86]
      };
      const point = structuralCandidatePosition(worldSeed, spec, address);
      const sample = sampleWorldComposition(worldSeed, point.x, point.z);
      if (sample.district.dominant !== district || sample.opening > 0.72) continue;
      const score = sample.density.tree * 0.74
        + sample.macro * 0.18
        + compositionPriority(worldSeed, "tree", address, spec.salt, 8) * 0.08;
      if (best && score <= best.score) continue;
      const scale = 1.12 + compositionPriority(worldSeed, "tree", address, spec.salt, 9) * 0.22;
      const placement: EnvironmentAssetPlacement = {
        id: `seeded-fill.${compositionAddress(worldSeed, "tree", address, spec.salt, 11)}`,
        origin: "seeded-fill",
        assetId: structuralAssetFor(
          "tree",
          sample,
          compositionPriority(worldSeed, "tree", address, spec.salt, 12)
        ),
        x: point.x,
        z: point.z,
        rotationY: compositionPriority(worldSeed, "tree", address, spec.salt, 10) * Math.PI * 2,
        scale: [scale, scale * 1.08, scale],
        grounding: [1.32 * scale, 0.86 * scale],
        compositionTag: {
          ...compositionPlacementTag(worldSeed, "tree", address, spec.salt, 13, sample),
          role: "landmark",
          district
        }
      };
      const radius = 3.2 * scale;
      if (
        sample.route.clearance > 0.005
        || sample.route.gateway > 0.05
        || sample.architectureClearance > 0.05
        || sample.coastlineClearance > 0.05
        || sample.fishingAccessClearance > 0.08
        || !clearsCompleteRouteCorridor(point.x, point.z, 0.4)
        || !clearsLandmarks(point.x, point.z, radius)
        || occupied.some((other) => distanceTo(point.x, point.z, other) < radius + 2.8)
        || placements.some((other) => distanceTo(point.x, point.z, other) < radius + 2.8)
        || !isPlacementFootprintStable(placement, 0.78, 0.66)
      ) continue;
      best = { placement, score };
    }
    if (best) placements.push(best.placement);
  }
  return placements;
}

function generateRouteFrameSpecimens(
  worldSeed: number,
  occupied: readonly EnvironmentAssetPlacement[]
): EnvironmentAssetPlacement[] {
  const placements: EnvironmentAssetPlacement[] = [];
  for (const [routeIndex, route] of WorldLayout.compiledRouteNetwork().slice(0, 5).entries()) {
    const candidates = route.samples
      .slice(3, -3)
      .filter((sample) => sample.distanceAlongRoute >= route.totalLength * 0.22)
      .filter((sample) => sample.distanceAlongRoute <= route.totalLength * 0.78)
      .map((sample, sampleIndex) => ({
        sample,
        sampleIndex,
        priority: compositionPriority(worldSeed, "bush", routeIndex, sampleIndex, 0x6f21)
      }))
      .sort((left, right) => right.priority - left.priority);

    for (const candidate of candidates) {
      const pair: EnvironmentAssetPlacement[] = [];
      for (const side of [-1, 1] as const) {
        const address = routeIndex * 2048 + candidate.sampleIndex * 2 + (side > 0 ? 1 : 0);
        const offset = route.corridorRadiusMeters + 4.2
          + compositionPriority(worldSeed, "bush", address, 0x6f21, 1) * 2.4;
        const x = candidate.sample.point.x + candidate.sample.normal.x * side * offset;
        const z = candidate.sample.point.z + candidate.sample.normal.z * side * offset;
        const sample = sampleWorldComposition(worldSeed, x, z);
        const scale = 0.82 + compositionPriority(worldSeed, "bush", address, 0x6f21, 2) * 0.28;
        const placement: EnvironmentAssetPlacement = {
          id: `seeded-fill.${compositionAddress(worldSeed, "bush", address, 0x6f21, 3)}`,
          origin: "seeded-fill",
          assetId: structuralAssetFor(
            "bush",
            sample,
            compositionPriority(worldSeed, "bush", address, 0x6f21, 4)
          ),
          x,
          z,
          rotationY: compositionPriority(worldSeed, "bush", address, 0x6f21, 5) * Math.PI * 2,
          scale: [scale, scale * 1.05, scale],
          grounding: [0.7 * scale, 0.58 * scale],
          compositionTag: {
            ...compositionPlacementTag(worldSeed, "bush", address, 0x6f21, 6, sample),
            role: "route-frame"
          }
        };
        if (
          WorldLayout.isWater(x, z)
          || WorldLayout.isInterior(x, z)
          || sample.route.clearance > 0.005
          || sample.route.gateway > 0.05
          || sample.architectureClearance > 0.05
          || sample.coastlineClearance > 0.1
          || sample.fishingAccessClearance > 0.08
          || !clearsCompleteRouteCorridor(x, z, 0.35)
          || !clearsLandmarks(x, z, 1.6)
          || occupied.some((other) => distanceTo(x, z, other) < 3.2)
          || placements.some((other) => distanceTo(x, z, other) < 2.5)
          || !isPlacementFootprintStable(placement, 0.76, 0.72)
        ) {
          continue;
        }
        pair.push(placement);
      }
      if (pair.length > 0) {
        placements.push(...pair);
        break;
      }
    }
  }
  return placements;
}

function generateCausalStructuralPlacements(
  worldSeed: number,
  existing: readonly EnvironmentAssetPlacement[]
): EnvironmentAssetPlacement[] {
  const specs: readonly CausalStructuralSpec[] = [
    { category: "tree", targetCount: 235, salt: 0x1d17, spacing: 5.4, scaleRange: [0.74, 1.38], footprint: [1.2, 0.8] },
    { category: "bush", targetCount: 115, salt: 0x2b29, spacing: 2.5, scaleRange: [0.62, 1.24], footprint: [0.7, 0.58] },
    { category: "reed", targetCount: 84, salt: 0x3c41, spacing: 1.7, scaleRange: [0.74, 1.08], footprint: [0.45, 0.38] },
    { category: "rock", targetCount: 72, salt: 0x4d53, spacing: 2.6, scaleRange: [0.72, 1.28], footprint: [0.9, 0.7] }
  ];
  const accepted: EnvironmentAssetPlacement[] = [];
  const landmarks = generateDistrictLandmarkSpecimens(worldSeed, existing);
  accepted.push(...landmarks);
  accepted.push(...generateRouteFrameSpecimens(worldSeed, [...existing, ...accepted]));
  for (const spec of specs) {
    const candidateMultiplier = spec.category === "tree" ? 36
      : spec.category === "bush" ? 36
        : spec.category === "reed" ? 36
          : 50;
    const candidateCount = spec.targetCount * candidateMultiplier;
    for (let address = 0; address < candidateCount; address++) {
      if (accepted.filter((placement) => placement.compositionTag?.category === spec.category).length >= spec.targetCount) break;
      const point = structuralCandidatePosition(worldSeed, spec, address);
      const sample = sampleWorldComposition(worldSeed, point.x, point.z);
      const selection = compositionPriority(worldSeed, spec.category, address, spec.salt, 2);
      const isolateOpportunity = sample.opening >= 0.35 ? 0.16 : 0;
      const selectionGain = spec.category === "reed" ? 10 : 3;
      if (selection > Math.max(sample.density[spec.category] * selectionGain, isolateOpportunity)) continue;
      const tag: CompositionPlacementTag = {
        ...compositionPlacementTag(worldSeed, spec.category, address, spec.salt, 3, sample),
        priority: 1 - address / Math.max(1, candidateCount)
      };
      if (spec.category === "reed") {
        const bank = WorldLayout.riverBankSample(point.x, point.z);
        if (
          bank.wetness < 0.34
          || bank.deposition < 0.24
          || bank.deposition <= bank.erosion * 0.7
          || bank.fishingAccess > 0.2
        ) continue;
      }
      const candidate = { address, ...point, sample, tag };
      const roleSpacing = candidate.tag.role === "isolate" ? spec.spacing * 1.7
        : candidate.tag.role === "landmark" ? spec.spacing * 2
          : candidate.tag.role === "core" ? spec.spacing * 0.82
            : spec.spacing;
      if (
        WorldLayout.isInterior(candidate.x, candidate.z)
        || WorldLayout.isWater(candidate.x, candidate.z)
        || candidate.sample.route.clearance > 0.005
        || candidate.sample.route.gateway > 0.12
        || candidate.sample.architectureClearance > 0.08
        || candidate.sample.coastlineClearance > 0.1
        || candidate.sample.fishingAccessClearance > 0.08
        || !clearsCompleteRouteCorridor(candidate.x, candidate.z, 0.35)
        || ((spec.category === "tree" || spec.category === "bush")
          && causesDenseRouteWall(candidate.x, candidate.z, accepted))
        || !clearsLandmarks(candidate.x, candidate.z, spec.spacing * 0.45)
        || distanceTo(candidate.x, candidate.z, STARTER_DONKEY_ANCHOR) < STARTER_DONKEY_ANCHOR.clearanceRadius + roleSpacing
        || existing.some((other) => distanceTo(candidate.x, candidate.z, other) < roleSpacing + 1.8)
        || accepted.some((other) => distanceTo(candidate.x, candidate.z, other) < Math.max(
          roleSpacing,
          other.compositionTag?.role === "isolate" ? spec.spacing * 1.7 : 0
        ))
      ) continue;
      const scaleRoll = compositionPriority(worldSeed, spec.category, candidate.address, spec.salt, 4);
      const speciesRoll = compositionPriority(worldSeed, spec.category, candidate.address, spec.salt, 5);
      const scale = spec.scaleRange[0] + (spec.scaleRange[1] - spec.scaleRange[0]) * scaleRoll;
      const rotationY = compositionPriority(worldSeed, spec.category, candidate.address, spec.salt, 6) * Math.PI * 2;
      const grounding = [spec.footprint[0] * scale, spec.footprint[1] * scale] as const;
      const placement: EnvironmentAssetPlacement = {
        id: `seeded-fill.${candidate.tag.address}`,
        origin: "seeded-fill",
        assetId: structuralAssetFor(spec.category, candidate.sample, speciesRoll),
        x: candidate.x,
        z: candidate.z,
        rotationY,
        scale: [scale, scale * (0.92 + compositionPriority(worldSeed, spec.category, candidate.address, spec.salt, 7) * 0.16), scale],
        grounding: spec.category === "reed" ? undefined : grounding,
        compositionTag: candidate.tag
      };
      if (spec.category !== "reed") {
        const coastalRock = placement.assetId.startsWith("rock_coastal_");
        const stable = isPlacementFootprintStable(
          placement,
          spec.category === "rock" ? (coastalRock ? 0.8 : 0.72) : 0.76,
          spec.category === "rock" ? (coastalRock ? 1.05 : 0.78) : 0.72
        );
        if (!stable) continue;
      } else if (WorldLayout.waterSignedDistance(candidate.x, candidate.z) > -0.12) {
        continue;
      }
      if (spec.category === "reed" && accepted.some((other) => {
        if (other.compositionTag?.category !== "reed") return false;
        return Math.abs(Math.abs(other.x - candidate.x) - 5.55) <= 0.22
          || Math.abs(Math.abs(other.z - candidate.z) - 5.55) <= 0.22;
      })) continue;
      accepted.push(placement);
    }
  }
  return accepted;
}

function islandCacheKey(worldSeed: number, islandId: WorldIslandId): string {
  return `${WORLD_LAYOUT_V5.revision}:${worldSeed}:${islandId}`;
}

const CAUSAL_COMPOSITION_CACHE = new Map<string, readonly EnvironmentAssetPlacement[]>();

/** Structural field output only; used by the 64-seed composition audit without generating ground cover. */
export function generateCausalCompositionPlacements(worldSeed: number): readonly EnvironmentAssetPlacement[] {
  const cacheKey = islandCacheKey(worldSeed, "island.neva");
  const cached = CAUSAL_COMPOSITION_CACHE.get(cacheKey);
  if (cached) return cached;
  const base = [...AUTHORED_DETAIL_PLACEMENTS, ...independentCoastalDressing(worldSeed)];
  const placements = generateCausalStructuralPlacements(worldSeed, base);
  CAUSAL_COMPOSITION_CACHE.set(cacheKey, placements);
  return placements;
}

const SUNREACH_STRUCTURAL_SPECS = [
  { category: "tree" as const, count: 48, spacing: 7.4, salt: 0x71a1, scale: [0.86, 1.08] as const },
  { category: "bush" as const, count: 62, spacing: 3.3, salt: 0x71b3, scale: [0.7, 1.04] as const },
  { category: "rock" as const, count: 38, spacing: 4.2, salt: 0x71c7, scale: [0.72, 1.18] as const }
] as const;

function sunreachStructuralAsset(
  category: "tree" | "bush" | "rock",
  sample: WorldCompositionSample,
  variant: number
): string {
  if (category === "tree") {
    if (sample.habitat["olive-grove"] > 0.18) return variant < 0.5 ? "tree_olive_a" : "tree_olive_b";
    return variant < 0.55 ? "tree_pine_a" : "tree_pine_b";
  }
  if (category === "bush") return variant < 0.52 ? "foliage_bush_a" : "foliage_bush_round_a";
  if (sample.habitat["reef-edge"] > 0.12) return "rock_reef_small_a";
  return variant < 0.52 ? "rock_field_a" : "rock_coastal_boulder_a";
}

export function generateSunreachCausalCompositionPlacements(
  worldSeed: number
): readonly EnvironmentAssetPlacement[] {
  const cacheKey = islandCacheKey(worldSeed, "island.sunreach");
  const cached = CAUSAL_COMPOSITION_CACHE.get(cacheKey);
  if (cached) return cached;
  const bounds = WORLD_ISLAND_DEFINITIONS["island.sunreach"].authoredBounds;
  const accepted: EnvironmentAssetPlacement[] = [];
  for (const spec of SUNREACH_STRUCTURAL_SPECS) {
    let categoryCount = 0;
    for (let address = 0; address < spec.count * 240 && categoryCount < spec.count; address++) {
      const x = bounds.minX + 4
        + islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 0)
          * (bounds.maxX - bounds.minX - 8);
      const z = bounds.minZ + 4
        + islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 1)
          * (bounds.maxZ - bounds.minZ - 8);
      if (WorldLayout.islandAt(x, z) !== "island.sunreach" || !WorldLayout.isWalkable(x, z)) continue;
      const sample = sampleWorldComposition(worldSeed, x, z);
      const selection = islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 2);
      const isolateOpportunity = sample.opening >= 0.34 ? 0.12 : 0;
      if (selection > Math.max(sample.density[spec.category] * 3.4, isolateOpportunity)) continue;
      if (
        sample.route.clearance > 0.04
        || sample.architectureClearance > 0.28
        || sample.coastlineClearance > 0.18
        || WorldLayout.terrainNormalY(x, z) < (spec.category === "rock" ? 0.58 : 0.72)
        || accepted.some((placement) => Math.hypot(placement.x - x, placement.z - z) < spec.spacing)
      ) continue;
      const scaleRoll = islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 3);
      const variant = islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 4);
      const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * scaleRoll;
      const tag = compositionPlacementTag(worldSeed, spec.category, address, spec.salt, 5, sample);
      const placement: EnvironmentAssetPlacement = {
        id: `seeded-fill.${tag.address}`,
        origin: "seeded-fill",
        islandId: "island.sunreach",
        biomeId: "biome.sunreach_warm_dry",
        assetId: sunreachStructuralAsset(spec.category, sample, variant),
        x,
        z,
        rotationY: islandCompositionPriority("island.sunreach", worldSeed, spec.category, address, spec.salt, 6) * Math.PI * 2,
        scale: [scale, scale * (0.92 + variant * 0.14), scale],
        grounding: spec.category === "bush" ? undefined : [1.05 * scale, 0.82 * scale],
        compositionTag: tag
      };
      const isCoastalRock = placement.assetId.startsWith("rock_coastal_");
      if (placement.grounding && !isPlacementFootprintStable(
        placement,
        isCoastalRock ? 0.8 : 0.72,
        isCoastalRock ? 1.1 : 0.78
      )) continue;
      accepted.push(placement);
      categoryCount += 1;
    }
    if (categoryCount !== spec.count) {
      throw new Error(`[WorldEnvironmentLayout] Could only place ${categoryCount}/${spec.count} Sunreach ${spec.category} instances`);
    }
  }
  CAUSAL_COMPOSITION_CACHE.set(cacheKey, accepted);
  return accepted;
}

const SUNREACH_AUTHORED_PLACEMENTS: readonly EnvironmentAssetPlacement[] = [
  {
    id: "authored.sunreach.cove-dock",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "dock_straight_a",
    x: 351,
    z: 58,
    rotationY: Math.PI * 0.5,
    scale: [1, 1, 1]
  },
  {
    id: "authored.sunreach.cove-market",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "building_market_stall_a",
    x: 373,
    z: 56,
    rotationY: -Math.PI * 0.5,
    scale: [0.92, 0.92, 0.92],
    grounding: [4.5, 3.5],
    practicalLight: true
  },
  {
    id: "authored.sunreach.terrace-cistern",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "prop_water_well_a",
    x: 468,
    z: 16,
    rotationY: 0.42,
    scale: [0.9, 0.9, 0.9],
    grounding: [1.8, 1.8]
  },
  {
    id: "authored.sunreach.ridge-landmark",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "rock_spire_a",
    x: 590,
    z: 25,
    rotationY: 1.18,
    scale: [1.08, 1.08, 1.08]
  },
  {
    id: "authored.sunreach.hand-mill",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "prop_potting_bench_a",
    x: 444,
    z: 21,
    rotationY: 2.35,
    scale: [0.82, 0.82, 0.82],
    grounding: [1.25, 0.9]
  },
  {
    id: "authored.sunreach.workbench",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "prop_farm_workbench_a",
    x: 466,
    z: 17,
    rotationY: -0.7,
    scale: [0.9, 0.9, 0.9],
    grounding: [1.25, 0.9]
  },
  {
    id: "authored.sunreach.fish-table",
    origin: "authored",
    islandId: "island.sunreach",
    biomeId: "biome.sunreach_warm_dry",
    assetId: "prop_farm_workbench_a",
    x: 382,
    z: 61,
    rotationY: -1.5,
    scale: [0.88, 0.88, 0.88],
    grounding: [1.2, 0.85]
  },
  ...[
    { id: "cove-north", x: 341, z: 47, rotationY: 0.18 },
    { id: "cove-south", x: 339, z: 72, rotationY: -0.12 },
    { id: "reef-west", x: 512, z: 194, rotationY: 0.08 },
    { id: "reef-east", x: 550, z: 208, rotationY: -0.2 }
  ].map((buoy) => ({
    id: `authored.sunreach.buoy.${buoy.id}`,
    origin: "authored" as const,
    islandId: "island.sunreach" as const,
    biomeId: "biome.sunreach_warm_dry" as const,
    assetId: "prop_marker_buoy_a",
    x: buoy.x,
    y: 0,
    z: buoy.z,
    rotationY: buoy.rotationY,
    scale: [0.82, 0.82, 0.82] as [number, number, number]
  }))
];

/** Fill the spaces between authored districts without moving their existing anchors. */
function generateLandscapeDressing(
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

  return placements;
}

const GROUND_COVER_COMPOSITION_STEP_METERS = 4;
const GROUND_COVER_SURFACE_STEP_METERS = 4;
const GROUND_COVER_COMPOSITION_CACHE = new Map<string, Map<string, WorldCompositionSample>>();
const GROUND_COVER_SURFACE_CACHE = new Map<
  string,
  ReturnType<typeof WorldLayout.terrainSurfaceSample>
>();
const GROUND_COVER_NORMAL_Y_CACHE = new Map<string, number>();

function quantizedGroundCoverKey(x: number, z: number, step: number): string {
  return `${Math.round(x / step)},${Math.round(z / step)}`;
}

function sampleGroundCoverComposition(worldSeed: number, x: number, z: number): WorldCompositionSample {
  const islandId = WorldLayout.terrainPatchAt(x, z)?.islandId ?? "island.neva";
  const cacheKey = islandCacheKey(worldSeed, islandId);
  let cache = GROUND_COVER_COMPOSITION_CACHE.get(cacheKey);
  if (!cache) {
    cache = new Map();
    GROUND_COVER_COMPOSITION_CACHE.set(cacheKey, cache);
  }
  const key = quantizedGroundCoverKey(x, z, GROUND_COVER_COMPOSITION_STEP_METERS);
  const cached = cache.get(key);
  if (cached) return cached;
  const sampleX = Math.round(x / GROUND_COVER_COMPOSITION_STEP_METERS) * GROUND_COVER_COMPOSITION_STEP_METERS;
  const sampleZ = Math.round(z / GROUND_COVER_COMPOSITION_STEP_METERS) * GROUND_COVER_COMPOSITION_STEP_METERS;
  const sample = sampleWorldComposition(worldSeed, sampleX, sampleZ);
  cache.set(key, sample);
  return sample;
}

function sampleGroundCoverSurface(
  x: number,
  z: number
): ReturnType<typeof WorldLayout.terrainSurfaceSample> {
  const key = quantizedGroundCoverKey(x, z, GROUND_COVER_SURFACE_STEP_METERS);
  const cached = GROUND_COVER_SURFACE_CACHE.get(key);
  if (cached) return cached;
  const sampleX = Math.round(x / GROUND_COVER_SURFACE_STEP_METERS) * GROUND_COVER_SURFACE_STEP_METERS;
  const sampleZ = Math.round(z / GROUND_COVER_SURFACE_STEP_METERS) * GROUND_COVER_SURFACE_STEP_METERS;
  const sample = WorldLayout.terrainSurfaceSample(sampleX, sampleZ);
  GROUND_COVER_SURFACE_CACHE.set(key, sample);
  return sample;
}

function sampleGroundCoverNormalY(x: number, z: number): number {
  const key = quantizedGroundCoverKey(x, z, GROUND_COVER_SURFACE_STEP_METERS);
  const cached = GROUND_COVER_NORMAL_Y_CACHE.get(key);
  if (cached !== undefined) return cached;
  const sampleX = Math.round(x / GROUND_COVER_SURFACE_STEP_METERS) * GROUND_COVER_SURFACE_STEP_METERS;
  const sampleZ = Math.round(z / GROUND_COVER_SURFACE_STEP_METERS) * GROUND_COVER_SURFACE_STEP_METERS;
  const normalY = WorldLayout.terrainNormal(sampleX, sampleZ).y;
  GROUND_COVER_NORMAL_Y_CACHE.set(key, normalY);
  return normalY;
}

function scatterGroundCover(
  category: GroundCoverCategory,
  assetIds: readonly string[],
  count: number,
  seed: number,
  predicate: (
    x: number,
    z: number,
    surface: ReturnType<typeof WorldLayout.terrainSurfaceSample>,
    composition: WorldCompositionSample
  ) => boolean,
  scaleRange: readonly [number, number],
  idGroup: string = `ground-cover.${category}`,
  densityWeight: (
    x: number,
    z: number,
    surface: ReturnType<typeof WorldLayout.terrainSurfaceSample>,
    composition: WorldCompositionSample
  ) => number = () => 1,
  worldSeed: number = seed
): GroundCoverPlacement[] {
  const placements: GroundCoverPlacement[] = [];
  const compositionCategory: CompositionCategory = category === "flowers"
    ? "flower"
    : category === "bushes"
      ? "bush"
      : category === "pebbles"
        ? "rock"
        : "short-cover";
  const attemptMultiplier = category === "pebbles" ? 240 : 180;
  for (let attempt = 0; attempt < count * attemptMultiplier && placements.length < count; attempt++) {
    const candidateAddress = category === "flowers" ? Math.floor(attempt / 3) : attempt;
    const candidateSlot = category === "flowers" ? attempt % 3 : 0;
    const baseX = WORLD_BOUNDS.minX + 5
      + compositionPriority(worldSeed, compositionCategory, candidateAddress, seed, 0)
        * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 10);
    const baseZ = WORLD_BOUNDS.minZ + 5
      + compositionPriority(worldSeed, compositionCategory, candidateAddress, seed, 1)
        * (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ - 10);
    const driftAngle = compositionPriority(worldSeed, compositionCategory, candidateAddress, seed, 10 + candidateSlot) * Math.PI * 2;
    const driftRadius = category === "flowers"
      ? 0.08 + Math.pow(
        compositionPriority(worldSeed, compositionCategory, candidateAddress, seed, 20 + candidateSlot),
        1.7
      ) * 0.45
      : 0;
    const x = baseX + Math.cos(driftAngle) * driftRadius;
    const z = baseZ + Math.sin(driftAngle) * driftRadius;
    const composition = sampleGroundCoverComposition(worldSeed, x, z);
    const selection = compositionPriority(worldSeed, compositionCategory, candidateAddress, seed, 2);
    const fieldDensity = composition.density[compositionCategory];
    const maximumDensity = category === "grass"
      ? clamp01(0.2 + fieldDensity * 0.8)
      : category === "flowers"
        ? clamp01(0.025 + fieldDensity * fieldDensity * 1.5)
        : clamp01(0.5 + fieldDensity * 0.5);
    if (selection > maximumDensity) continue;
    const surface = sampleGroundCoverSurface(x, z);
    if (!predicate(x, z, surface, composition) || !hasGroundCoverClearance(x, z)) continue;
    const weight = densityWeight(x, z, surface, composition);
    const density = category === "grass"
      ? clamp01(
        0.04
        + weight * 0.16
        + fieldDensity * 0.8
      )
      : category === "flowers"
        ? clamp01(0.02 + Math.pow(fieldDensity * (0.65 + weight * 0.35), 2) * 1.5)
      : clamp01(
        0.12
        + weight * 0.38
        + fieldDensity * 0.5
      );
    if (selection > density) continue;
    const exactSurface = WorldLayout.terrainSurfaceSample(x, z);
    if (!predicate(x, z, exactSurface, composition)) continue;
    if (
      (category === "grass" || category === "flowers" || category === "bushes" || category === "meadowTall")
      && WorldLayout.terrainNormal(x, z).y <= 0.66
    ) continue;
    const scale = scaleRange[0]
      + (scaleRange[1] - scaleRange[0])
        * compositionPriority(worldSeed, compositionCategory, attempt, seed, 3);
    const variantRoll = compositionPriority(worldSeed, compositionCategory, attempt, seed, 4);
    const selectedVariant = Math.min(assetIds.length - 1, Math.floor(variantRoll * assetIds.length));
    const grassScale = grassClumpScale(selectedVariant);
    const categoryScale = GROUND_COVER_SCALE_PROFILE[category];
    const horizontalScale = category === "grass" ? grassScale.horizontal : categoryScale.horizontal;
    const verticalScale = category === "grass" ? grassScale.vertical : categoryScale.vertical;
    const tag = compositionPlacementTag(
      worldSeed,
      compositionCategory,
      candidateAddress,
      seed,
      category === "flowers" ? candidateSlot : 5,
      composition
    );
    placements.push({
      id: `seeded-fill.${idGroup}.${tag.address}`,
      origin: "seeded-fill",
      category,
      assetId: assetIds[selectedVariant],
      x,
      z,
      rotationY: compositionPriority(worldSeed, compositionCategory, attempt, seed, 6) * Math.PI * 2,
      scale: [
        scale * horizontalScale * (0.94 + compositionPriority(worldSeed, compositionCategory, attempt, seed, 7) * 0.12),
        scale * verticalScale,
        scale * horizontalScale * (0.94 + compositionPriority(worldSeed, compositionCategory, attempt, seed, 8) * 0.12)
      ],
      compositionTag: tag
    });
  }
  if (placements.length !== count) {
    throw new Error(`[WorldEnvironmentLayout] Could only place ${placements.length}/${count} ${category} instances`);
  }
  placements.sort((left, right) => (right.compositionTag?.priority ?? 0) - (left.compositionTag?.priority ?? 0));
  return placements;
}

function scatterCoastGroundCover(
  category: "pebbles" | "driftwood",
  assetIds: readonly string[],
  count: number,
  seed: number,
  landwardOffsets: readonly [number, number],
  predicate: (x: number, z: number) => boolean,
  scaleRange: readonly [number, number],
  worldSeed: number
): GroundCoverPlacement[] {
  const placements: GroundCoverPlacement[] = [];
  for (let attempt = 0; attempt < count * 150 && placements.length < count; attempt++) {
    const compositionCategory: CompositionCategory = category === "pebbles" ? "rock" : "short-cover";
    const x = WORLD_BOUNDS.minX + 6
      + compositionPriority(worldSeed, compositionCategory, attempt, seed, 0)
        * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - 12);
    const progress = Math.sqrt(compositionPriority(worldSeed, compositionCategory, attempt, seed, 1));
    const landwardOffset = landwardOffsets[0] + (landwardOffsets[1] - landwardOffsets[0]) * progress;
    const z = WorldLayout.coastlineZ(x) - landwardOffset
      + (compositionPriority(worldSeed, compositionCategory, attempt, seed, 2) - 0.5) * 0.24;
    if (!predicate(x, z) || !clearsLandmarks(x, z, 0.15)) continue;
    const scale = scaleRange[0]
      + (scaleRange[1] - scaleRange[0])
        * compositionPriority(worldSeed, compositionCategory, attempt, seed, 3);
    const variant = Math.min(
      assetIds.length - 1,
      Math.floor(compositionPriority(worldSeed, compositionCategory, attempt, seed, 4) * assetIds.length)
    );
    const composition = sampleGroundCoverComposition(worldSeed, x, z);
    const tag = compositionPlacementTag(worldSeed, compositionCategory, attempt, seed, 5, composition);
    placements.push({
      id: `seeded-fill.ground-cover.coast.${category}.${tag.address}`,
      origin: "seeded-fill",
      category,
      assetId: assetIds[variant],
      x,
      z,
      rotationY: compositionPriority(worldSeed, compositionCategory, attempt, seed, 6) * Math.PI * 2,
      scale: [
        scale * (0.94 + compositionPriority(worldSeed, compositionCategory, attempt, seed, 7) * 0.12),
        scale,
        scale * (0.94 + compositionPriority(worldSeed, compositionCategory, attempt, seed, 8) * 0.12)
      ],
      compositionTag: tag
    });
  }
  if (placements.length !== count) {
    throw new Error(`[WorldEnvironmentLayout] Could only place ${placements.length}/${count} coastal ${category} instances`);
  }
  return placements.sort((left, right) => (right.compositionTag?.priority ?? 0) - (left.compositionTag?.priority ?? 0));
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
    && sampleGroundCoverNormalY(x, z) > 0.66
    && surface.farmInfluence < 0.08;

  const grass = scatterGroundCover(
    "grass",
    ["foliage_grass_a", "foliage_grass_b", "foliage_grass_c"],
    high.grass,
    mixSeed(worldSeed, 0x1a31),
    (x, z, surface) => {
      return meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < GRASS_MAX_PATH_INFLUENCE
        && surface.shorelineWetness < 0.62;
    },
    [0.96, 1.22],
    "ground-cover.grass",
    (_x, _z, _surface, composition) => composition.density["short-cover"],
    worldSeed
  );
  const homesteadGrass = scatterGroundCover(
    "grass",
    ["foliage_grass_a", "foliage_grass_b", "foliage_grass_c"],
    HOMESTEAD_MEADOW_GRASS_COUNT,
    mixSeed(worldSeed, 0x1a42),
    (x, z, surface) => {
      const distance = distanceTo(x, z, STARTER_FARM_LAYOUT.origin);
      return distance >= 8
        && distance <= 43
        && meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < GRASS_MAX_PATH_INFLUENCE
        && surface.shorelineWetness < 0.62;
    },
    [0.96, 1.22],
    "ground-cover.grass.homestead",
    (_x, _z, _surface, composition) => composition.density["short-cover"],
    worldSeed
  );
  const flowers = scatterGroundCover(
    "flowers",
    ["foliage_flower_drift_a", "foliage_flower_drift_b", "foliage_flower_drift_c"],
    high.flowers,
    mixSeed(worldSeed, 0x2b47),
    (x, z, surface) => {
      return meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < GRASS_MAX_PATH_INFLUENCE
        && surface.weights.meadow > 0.08
        && surface.shorelineWetness < 0.45;
    },
    [2.85, 4.15],
    "ground-cover.flowers",
    (x, z, surface) => {
      const farmBias = clamp01(1 - distanceTo(x, z, STARTER_FARM_LAYOUT.origin) / 48);
      return clamp01(
        0.38
          + surface.weights.meadow * 0.48
          + farmBias * 0.22
          + WorldLayout.pathShoulderInfluence(x, z) * 0.38
      );
    },
    worldSeed
  );
  const bushes = scatterGroundCover(
    "bushes",
    ["foliage_bush_a", "foliage_bush_round_a"],
    high.bushes,
    mixSeed(worldSeed, 0x2b91),
    (x, z, surface) => {
      return meadowCoverGround(x, z, surface)
        && WorldLayout.pathInfluence(x, z) < 0.08
        && surface.shorelineWetness < 0.58;
    },
    [0.62, 0.92],
    "ground-cover.bushes",
    (_x, _z, _surface, composition) => composition.density.bush,
    worldSeed
  );
  const tallMeadowGround = (
    x: number,
    z: number,
    surface: ReturnType<typeof WorldLayout.terrainSurfaceSample>
  ) => {
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
    (_x, _z, surface) => {
      return clamp01(
        0.22
          + surface.shorelineWetness * 0.55
          + surface.weights.meadow * 0.36
      );
    },
    worldSeed
  ).map((placement) => {
    const surface = sampleGroundCoverSurface(placement.x, placement.z);
    const wetness = surface.shorelineWetness;
    const waterDistance = WorldLayout.waterSignedDistance(placement.x, placement.z);
    const coastDistance = placement.z - WorldLayout.coastlineZ(placement.x);
    const belongsAtCoastalWetEdge = coastDistance > -8
      && coastDistance < -0.7
      && (wetness > 0.14 || waterDistance > -5.5);
    if (!belongsAtCoastalWetEdge) return placement;
    const bank = WorldLayout.riverBankSample(placement.x, placement.z);
    const belongsInReedPocket = bank.wetness > 0.38
      && bank.deposition > bank.erosion
      && bank.fishingAccess < 0.18;
    return {
      ...placement,
      assetId: belongsInReedPocket
        ? (placement.compositionTag?.priority ?? 0) >= 0.5 ? "foliage_reeds_a" : "foliage_cattail_a"
        : "foliage_beach_grass_a"
    };
  });
  const coastPebbleCount = Math.round(high.pebbles * 0.42);
  const coastPebbles = scatterCoastGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], coastPebbleCount, mixSeed(worldSeed, 0x3c59), [0.55, 8.4], (x, z) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && WorldLayout.terrainNormal(x, z).y > 0.68 && WorldLayout.pathInfluence(x, z) < 0.08 && WorldLayout.coastProfile(x).beach + WorldLayout.coastProfile(x).rockShelf > 0.42, [0.74, 1.12], worldSeed);
  const pathPebbleCount = Math.round(high.pebbles * 0.22);
  const shoulderPebbles = scatterGroundCover("pebbles", ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"], high.pebbles - coastPebbles.length - pathPebbleCount, mixSeed(worldSeed, 0x3c5a), (x, z, surface) => WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && surface.farmInfluence < 0.12 && WorldLayout.pathShoulderInfluence(x, z) > 0.12 && WorldLayout.pathInfluence(x, z) < 0.2, [0.74, 1.12], "ground-cover.shoulder.pebbles", (x, z) => 0.68 + WorldLayout.pathShoulderInfluence(x, z) * 0.32, worldSeed);
  const pathPebbles = scatterGroundCover(
    "pebbles",
    ["rock_pebble_cluster_a", "rock_pebble_cluster_b", "rock_pebble_cluster_c"],
    pathPebbleCount,
    mixSeed(worldSeed, 0x3c5b),
    (x, z, surface) => WorldLayout.isWalkable(x, z)
      && !WorldLayout.isWater(x, z)
      && !WorldLayout.isBridgeDeck(x, z)
      && WorldLayout.terrainNormal(x, z).y > 0.74
      && surface.farmInfluence < 0.12
      && WorldLayout.pathInfluence(x, z) > 0.28,
    [0.52, 0.86],
    "ground-cover.path.pebbles",
    (x, z) => WorldLayout.pathInfluence(x, z),
    worldSeed
  );
  const paving = generateInstancedPathSlabs(high.paving, mixSeed(worldSeed, 0x3c71));
  const driftwood = scatterCoastGroundCover("driftwood", ["prop_driftwood_a", "prop_driftwood_b", "prop_driftwood_c"], high.driftwood, mixSeed(worldSeed, 0x4d6b), [0.65, 5.2], (x, z) => WorldLayout.isWalkable(x, z) && WorldLayout.terrainNormal(x, z).y > 0.72 && WorldLayout.coastProfile(x).beach > 0.28 && WorldLayout.pathInfluence(x, z) < 0.08, [0.78, 1.08], worldSeed);
  const placements = [
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
  GROUND_COVER_COMPOSITION_CACHE.delete(islandCacheKey(worldSeed, "island.neva"));
  GROUND_COVER_COMPOSITION_CACHE.delete(islandCacheKey(worldSeed, "island.sunreach"));
  GROUND_COVER_SURFACE_CACHE.clear();
  GROUND_COVER_NORMAL_Y_CACHE.clear();
  return placements;
}

export function generateSunreachGroundCoverPlacements(worldSeed: number): GroundCoverPlacement[] {
  const bounds = WORLD_ISLAND_DEFINITIONS["island.sunreach"].authoredBounds;
  const specs = [
    { category: "grass" as const, composition: "short-cover" as const, count: 360, salt: 0x7311, assets: ["foliage_beach_grass_a", "foliage_meadow_tall_a"] as const, scale: [0.78, 1.12] as const },
    { category: "flowers" as const, composition: "flower" as const, count: 72, salt: 0x7327, assets: ["foliage_flower_drift_a", "foliage_flower_drift_c"] as const, scale: [1.8, 2.8] as const },
    { category: "pebbles" as const, composition: "rock" as const, count: 96, salt: 0x7339, assets: ["rock_pebble_cluster_a", "rock_pebble_cluster_c"] as const, scale: [0.62, 0.94] as const }
  ] as const;
  const placements: GroundCoverPlacement[] = [];
  for (const spec of specs) {
    let placed = 0;
    for (let address = 0; address < spec.count * 160 && placed < spec.count; address++) {
      const x = bounds.minX + 3
        + islandCompositionPriority("island.sunreach", worldSeed, spec.composition, address, spec.salt, 0)
          * (bounds.maxX - bounds.minX - 6);
      const z = bounds.minZ + 3
        + islandCompositionPriority("island.sunreach", worldSeed, spec.composition, address, spec.salt, 1)
          * (bounds.maxZ - bounds.minZ - 6);
      if (WorldLayout.islandAt(x, z) !== "island.sunreach" || WorldLayout.terrainNormalY(x, z) < 0.64) continue;
      const sample = sampleWorldComposition(worldSeed, x, z);
      if (
        sample.route.clearance > 0.1
        || sample.architectureClearance > 0.36
        || sample.coastlineClearance > 0.32
      ) continue;
      const density = spec.composition === "flower"
        ? sample.density.flower
        : spec.composition === "rock" ? sample.density.rock : sample.density["short-cover"];
      if (islandCompositionPriority("island.sunreach", worldSeed, spec.composition, address, spec.salt, 2) > density * 5.2) continue;
      const variant = islandCompositionPriority("island.sunreach", worldSeed, spec.composition, address, spec.salt, 3);
      const scale = spec.scale[0] + (spec.scale[1] - spec.scale[0]) * variant;
      const tag = compositionPlacementTag(worldSeed, spec.composition, address, spec.salt, 4, sample);
      placements.push({
        id: `seeded-fill.ground-cover.${tag.address}`,
        origin: "seeded-fill",
        islandId: "island.sunreach",
        biomeId: "biome.sunreach_warm_dry",
        category: spec.category,
        assetId: spec.assets[Math.min(spec.assets.length - 1, Math.floor(variant * spec.assets.length))],
        x,
        z,
        rotationY: islandCompositionPriority("island.sunreach", worldSeed, spec.composition, address, spec.salt, 5) * Math.PI * 2,
        scale: [scale, scale * (0.78 + variant * 0.18), scale],
        compositionTag: tag
      });
      placed += 1;
    }
    if (placed !== spec.count) {
      throw new Error(`[WorldEnvironmentLayout] Could only place ${placed}/${spec.count} Sunreach ${spec.category} instances`);
    }
  }
  return placements;
}

const STATIC_PLACEMENTS_CACHE = new Map<string, readonly EnvironmentAssetPlacement[]>();
const ENVIRONMENT_LAYOUT_CACHE = new Map<string, WorldEnvironmentLayout>();

export function createWorldStaticPlacements(worldSeed: number): readonly EnvironmentAssetPlacement[] {
  const cacheKey = `${WORLD_LAYOUT_V5.revision}:${worldSeed}:all-islands`;
  const cached = STATIC_PLACEMENTS_CACHE.get(cacheKey);
  if (cached) return cached;
  const coastalDressing = independentCoastalDressing(worldSeed);
  const existing = applyPlacementOverrides([
    ...AUTHORED_DETAIL_PLACEMENTS,
    ...coastalDressing
  ]).filter((placement) => !PLACEMENT_REMOVED.includes(placement.id));
  const causalPlacements = generateCausalCompositionPlacements(worldSeed);
  const sunreachPlacements = [
    ...SUNREACH_AUTHORED_PLACEMENTS,
    ...generateSunreachCausalCompositionPlacements(worldSeed)
  ];
  const composed = [...existing, ...causalPlacements, ...sunreachPlacements];
  const staticPlacements = [...composed, ...generateLandscapeDressing(composed)].filter(retainLegacyHarborDressing);
  staticPlacements.push(...createHarborCoastPlacements());
  for (const placement of staticPlacements) {
    if (!placement.grounding) continue;
    if (PLACEMENT_OVERRIDES[placement.id]) continue;
    const isCoastalRock = placement.assetId.startsWith("rock_coastal_");
    if (!isPlacementFootprintStable(
      placement,
      isCoastalRock ? 0.8 : 0.72,
      isCoastalRock ? 1.1 : 0.78
    )) {
      throw new Error(`[WorldEnvironmentLayout] Unstable authored footprint ${placement.id}`);
    }
  }
  STATIC_PLACEMENTS_CACHE.set(cacheKey, staticPlacements);
  return staticPlacements;
}

export function createWorldEnvironmentLayout(worldSeed: number): WorldEnvironmentLayout {
  const cacheKey = `${WORLD_LAYOUT_V5.revision}:${worldSeed}:all-islands`;
  const cached = ENVIRONMENT_LAYOUT_CACHE.get(cacheKey);
  if (cached) return cached;
  const staticPlacements = createWorldStaticPlacements(worldSeed);
  let cachedGroundCover: readonly GroundCoverPlacement[] | null = null;
  const layout: WorldEnvironmentLayout = {
    worldSeed,
    staticPlacements,
    get groundCoverPlacements() {
      if (!cachedGroundCover) {
        cachedGroundCover = [
          ...generateGroundCoverPlacements(worldSeed).filter(retainHarborGroundCover),
          ...generateSunreachGroundCoverPlacements(worldSeed)
        ];
      }
      return cachedGroundCover;
    }
  };
  ENVIRONMENT_LAYOUT_CACHE.set(cacheKey, layout);
  return layout;
}


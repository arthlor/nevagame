import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANONICAL_RENDER_CONFIG } from "../render/config/VisualRenderConfig";
import { PALETTE_HEX, type PaletteToken } from "../render/materials/PaletteTokens";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  starterFarmsteadAnchor,
  starterStructureAnchor,
  type FarmPathKind
} from "./FarmLayout";
import { FARMHOUSE_INTERIOR_BOUNDS, FARMHOUSE_INTERIOR_ORIGIN, isInsideFarmhouseInterior } from "./FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, HARBOR_PIER_DECK, HARBOR_SKIFF_MOORING, RIVER_CROSSING, VILLAGE_MARKET, VILLAGE_PLAZA, WORLD_SPAWN } from "./WorldAnchors";
import {
  buildOrganicRoadGeometry,
  sampleRoadCrossSection,
  type RoadCrossSectionSample
} from "./RoadGeometry";
import { conformRoadGeometryToTerrain } from "./RoadTerrainConformity";
import { getProcessingStationRuntimeRotationY } from "./ProcessingStationApproach";
import {
  attachSurfaceFieldAttributes,
  writeSurfaceFieldAttributes
} from "../render/materials/SurfaceFieldAttributes";
import {
  FISHING_ECOLOGY_DEFINITIONS,
  OPEN_CHANNEL_REQUIREMENT,
  SUNREACH_ANCHORS,
  WORLD_ISLAND_DEFINITIONS,
  worldIslandDefinitions,
  type FishingEcologyDefinition,
  type MarineSample,
  type SailingRequirement,
  type WorldBiomeId,
  type WorldClimateSample,
  type WorldClimateWeatherInput,
  type WorldDrainageSample,
  type WorldIslandDefinition,
  type WorldIslandId,
  type WorldRegionId,
  type WorldTerrainPatchDefinition
} from "./WorldIslands";
import {
  signedDistanceToSunreachCoast,
  SUNREACH_ROUTES,
  sunreachDrainageSample,
  sunreachNaturalTerrainHeight,
  sunreachRegionAt
} from "./SunreachWorld";

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface WorldPoint {
  x: number;
  z: number;
}

export type LandmarkId =
  | "farmhouse"
  | "well"
  | "bridge"
  | "fish-market"
  | "lighthouse"
  | "windmill"
  | "produce-stall"
  | "dock";

export interface LandmarkLayout extends WorldPoint {
  id: LandmarkId;
  yOffset: number;
  rotationY: number;
  scale: number;
}

export type TerrainSurface =
  | "grass"
  | "meadow"
  | "dry-soil"
  | "damp-soil"
  | "path"
  | "shoulder"
  | "beach"
  | "riverbed"
  | "wet-shoreline"
  | "cliff";

export interface TerrainSurfaceWeights {
  grass: number;
  meadow: number;
  drySoil: number;
  dampSoil: number;
  path: number;
  shoulder: number;
  beach: number;
  riverbed: number;
  wetShoreline: number;
  cliff: number;
}

export interface TerrainSurfaceSample {
  weights: TerrainSurfaceWeights;
  farmInfluence: number;
  shorelineWetness: number;
  river: RiverBankSample;
  drainage?: WorldDrainageSample;
}

export type TraversalSurfaceSource = "terrain" | "road" | "bridge" | "pier" | "interior";

/** Exact walkable support shared by canonical traversal and presentation grounding. */
export interface TraversalSurfaceSample {
  height: number;
  normal: Readonly<{ x: number; y: number; z: number }>;
  source: TraversalSurfaceSource;
}

export interface CoastProfile {
  beach: number;
  rockShelf: number;
  cliff: number;
  reedPocket: number;
  headland: number;
  harborCove: number;
  beachWidthMeters: number;
  wetBandWidthMeters: number;
  rockToeWidthMeters: number;
  cliffRiseStartMeters: number;
  cliffRiseEndMeters: number;
}

export type RiverSide = "left" | "right";

/** Longitudinal river cause shared by terrain, water, physics, and dressing. */
export interface RiverSectionProfile {
  z: number;
  centerX: number;
  tangent: Readonly<WorldPoint>;
  curvature: number;
  leftWaterWidth: number;
  rightWaterWidth: number;
  bedElevation: number;
  thalwegOffset: number;
  leftBankRun: number;
  rightBankRun: number;
  leftFloodplainWidth: number;
  rightFloodplainWidth: number;
  leftErosion: number;
  rightErosion: number;
  leftDeposition: number;
  rightDeposition: number;
  estuaryInfluence: number;
}

/** Side-aware cross-section weights derived from one RiverSectionProfile. */
export interface RiverBankSample {
  section: RiverSectionProfile;
  side: RiverSide;
  signedLateral: number;
  waterEdgeDistance: number;
  waterSignedDistance: number;
  channel: number;
  lowerBank: number;
  upperBank: number;
  floodplain: number;
  wetness: number;
  erosion: number;
  deposition: number;
  fishingAccess: number;
}

export interface WorldDistrictSample {
  farm: number;
  village: number;
  harbor: number;
  headland: number;
  coast: number;
  riverCorridor: number;
}

export interface FishingAccessSample {
  habitat: FishingHabitatId | null;
  accessible: boolean;
  target: WorldPoint | null;
  distanceMeters: number;
  side: RiverSide | null;
  reason: "bridge" | "pier" | "bank" | "coast" | "water" | "blocked";
}

export interface RiverFishingAccessReserve {
  id: string;
  z: number;
  side: RiverSide;
  halfLengthMeters: number;
  approachDepthMeters: number;
}

export type FishingHabitatId = "river" | "lake" | "coast" | "offshore";

export type WorldRouteKind = "arterial" | "lane" | "trail";
export type WorldRouteScope = "regional" | "farmstead";

export interface WorldRoute {
  id: string;
  scope: WorldRouteScope;
  kind: WorldRouteKind;
  widthMeters: number;
  points: readonly WorldPoint[];
  /** Route segments that must remain linear, such as the bridge approach/deck. */
  linearSegmentIndices?: readonly number[];
}

/**
 * Canonical authored footprint for a static village building.
 *
 * The environment composer consumes these values rather than keeping a
 * second, drift-prone table of building centers, rotations, and clearances.
 */
export interface WorldArchitecturePad {
  id: string;
  center: WorldPoint;
  rotationY: number;
  /** Unscaled horizontal half-extents used for grounding and collision review. */
  envelope: readonly [number, number];
  frontageClearanceMeters: number;
  frontApproachMeters: number;
}

export interface WorldRouteJunction {
  id: string;
  center: WorldPoint;
  radiusMeters: number;
  /** Soft apron extension used by terrain, surface weights, and road geometry. */
  blendLengthMeters: number;
  surface: "field" | "farm-yard" | "village-market" | "landmark-gateway";
  routeIds: readonly string[];
}

export interface WorldRouteProfile {
  crownMeters: number;
  rutDepthMeters: number;
  shoulderDropMeters: number;
  shoulderWidthMeters: number;
  /** Outer corridor distance over which the graded shoulder feathers into the meadow. */
  terrainFeatherMeters: number;
  gradingStrength: number;
}

export interface WorldLayoutDescriptor {
  revision: 10;
  anchors: {
    starterFarm: WorldPoint;
    playerSpawn: WorldPoint;
    privateHomestead: WorldPoint;
    villageMarket: WorldPoint;
    riverCrossing: WorldPoint;
    bridge: WorldPoint;
    lighthouse: WorldPoint;
    fishMarket: WorldPoint;
    harborDock: WorldPoint;
  };
  coast: readonly WorldPoint[];
  river: readonly WorldPoint[];
  riverMouth: WorldPoint;
  routes: readonly WorldRoute[];
  architecturePads: readonly WorldArchitecturePad[];
}

export const WORLD_BOUNDS: WorldBounds = { minX: -180, maxX: 180, minZ: -160, maxZ: 120 };
export const SAILABLE_BOUNDS: WorldBounds = { minX: -260, maxX: 720, minZ: -240, maxZ: 300 };
/**
 * 384 cells across 600 m is a 1.56 m grid. The previous 2.34 m grid could not
 * resolve an 11 m river or a 9 m beach without turning every bank into a
 * single hard triangle row, which is the main reason the coastline read as
 * cut paper rather than terrain.
 */
export const TERRAIN_RESOLUTION = 384;
export const TERRAIN_SIZE_METERS = 600;
const TERRAIN_GRID_STEP_METERS = TERRAIN_SIZE_METERS / TERRAIN_RESOLUTION;
const TRAVERSAL_TRIANGLE_EPSILON = 1e-6;
export const WATER_SURFACE = Object.freeze({
  width: 1150,
  depth: 750,
  centerX: 225,
  centerZ: 20,
  segmentsX: 221,
  segmentsZ: 144
});

const COAST_SPLINE = [
  { x: -220, z: 84 },
  { x: -175, z: 89 },
  { x: -130, z: 96 },
  { x: -92, z: 94 },
  { x: -52, z: 87 },
  { x: -12, z: 83 },
  { x: 24, z: 79 },
  { x: 52, z: 74 },
  { x: 72, z: 68 },
  { x: 94, z: 73 },
  { x: 130, z: 82 },
  { x: 175, z: 88 },
  { x: 220, z: 85 }
] as const;

const RIVER_SPLINE = [
  { x: -31, z: -180 },
  { x: -29, z: -135 },
  { x: -26, z: -96 },
  { x: -22, z: -58 },
  { x: -17, z: -25 },
  { x: -14, z: -7 },
  { x: -7, z: 24 },
  { x: 4, z: 52 },
  { x: 15, z: 82 }
] as const;

interface RiverProfileKnot {
  z: number;
  leftWaterWidth: number;
  rightWaterWidth: number;
  bedElevation: number;
  thalwegOffset: number;
  leftBankRun: number;
  rightBankRun: number;
  leftFloodplainWidth: number;
  rightFloodplainWidth: number;
}

/**
 * Authored longitudinal river profile. Knots follow the existing centerline,
 * preserve the bridge span, and keep water-edge changes within the migration
 * envelope while breaking the old mirrored cross-section.
 */
const RIVER_PROFILE_KNOTS: readonly RiverProfileKnot[] = [
  { z: -180, leftWaterWidth: 5.1, rightWaterWidth: 5.9, bedElevation: -1.45, thalwegOffset: -0.35, leftBankRun: 7.8, rightBankRun: 4.8, leftFloodplainWidth: 7, rightFloodplainWidth: 3 },
  { z: -135, leftWaterWidth: 5.8, rightWaterWidth: 5.1, bedElevation: -1.92, thalwegOffset: 0.45, leftBankRun: 4.4, rightBankRun: 8.2, leftFloodplainWidth: 2.8, rightFloodplainWidth: 7.5 },
  { z: -96, leftWaterWidth: 5, rightWaterWidth: 6.2, bedElevation: -1.58, thalwegOffset: -0.55, leftBankRun: 8.6, rightBankRun: 4.2, leftFloodplainWidth: 8, rightFloodplainWidth: 2.5 },
  { z: -58, leftWaterWidth: 6.1, rightWaterWidth: 5, bedElevation: -2.02, thalwegOffset: 0.6, leftBankRun: 4.1, rightBankRun: 9, leftFloodplainWidth: 2.4, rightFloodplainWidth: 8.4 },
  { z: -25, leftWaterWidth: 5.2, rightWaterWidth: 6.3, bedElevation: -1.52, thalwegOffset: -0.7, leftBankRun: 8.7, rightBankRun: 4, leftFloodplainWidth: 8.2, rightFloodplainWidth: 2.3 },
  { z: -7, leftWaterWidth: 5.55, rightWaterWidth: 5.55, bedElevation: -1.72, thalwegOffset: 0, leftBankRun: 6, rightBankRun: 6, leftFloodplainWidth: 4, rightFloodplainWidth: 4 },
  { z: 24, leftWaterWidth: 6.5, rightWaterWidth: 5.4, bedElevation: -2.08, thalwegOffset: 0.75, leftBankRun: 4.2, rightBankRun: 9.5, leftFloodplainWidth: 2.5, rightFloodplainWidth: 9 },
  { z: 52, leftWaterWidth: 6.2, rightWaterWidth: 7.2, bedElevation: -1.68, thalwegOffset: -0.8, leftBankRun: 10, rightBankRun: 4.5, leftFloodplainWidth: 9.5, rightFloodplainWidth: 3 },
  { z: 82, leftWaterWidth: 8.2, rightWaterWidth: 9, bedElevation: -2.18, thalwegOffset: 0.6, leftBankRun: 8, rightBankRun: 11, leftFloodplainWidth: 8, rightFloodplainWidth: 12 }
] as const;

export const RIVER_FISHING_ACCESS_RESERVES: readonly RiverFishingAccessReserve[] = [
  { id: "upper-river-west", z: -105, side: "left", halfLengthMeters: 7, approachDepthMeters: 8 },
  { id: "middle-river-east", z: -40, side: "right", halfLengthMeters: 6.5, approachDepthMeters: 8 },
  { id: "lower-river-west", z: 38, side: "left", halfLengthMeters: 7.5, approachDepthMeters: 8.5 }
];

const RIVER_MOUTH = Object.freeze({ x: 15, z: 82 });

export const WORLD_ROUTE_PROFILES: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>> = Object.freeze({
  arterial: Object.freeze({
    crownMeters: 0.095,
    rutDepthMeters: 0.038,
    shoulderDropMeters: 0.014,
    shoulderWidthMeters: 1.55,
    terrainFeatherMeters: 1.25,
    gradingStrength: 0.9
  }),
  lane: Object.freeze({
    crownMeters: 0.068,
    rutDepthMeters: 0.027,
    shoulderDropMeters: 0.011,
    shoulderWidthMeters: 1.25,
    terrainFeatherMeters: 1.1,
    gradingStrength: 0.78
  }),
  trail: Object.freeze({
    crownMeters: 0.03,
    rutDepthMeters: 0.012,
    shoulderDropMeters: 0.006,
    shoulderWidthMeters: 0.85,
    terrainFeatherMeters: 0.9,
    gradingStrength: 0.58
  })
});

const BRIDGE_CENTER = Object.freeze({ x: -15.3, z: -6});
export const BRIDGE_WORLD_PROFILE = Object.freeze({
  spanLength: 14.2,
  deckWidth: 3.8,
  entrySurfaceY: 1.4,
  approachLength: 8,
  lateralBlendWidth: 3.6,
  westBankSurfaceY: 1.68,
  eastBankSurfaceY: 2.05,
  gatewayDepthMeters: 1.25,
  gatewayInsetMeters: 0.12,
  gatewayOverlapMeters: 0.22,
  gatewaySlabCount: 3,
  gatewaySlabGapMeters: 0.08
});

const BRIDGE_HALF_SPAN = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
const BRIDGE_ROOT_Y_OFFSET = 0.35;
// The bridge deck is an authored compound collision, not part of the coarse
// terrain heightfield. Keep this profile beside the traversal surface helper
// so the kinematic actor follows the same stepped top as the physical boxes.
const BRIDGE_DECK_COLLISION_HALF_SPAN = 6.4545;
const BRIDGE_DECK_COLLISION_SEGMENT_SPACING = 1.2909;
const BRIDGE_DECK_COLLISION_TOPS_LOCAL_Y = Object.freeze([
  2.708,
  2.9103,
  3.0677,
  3.1801,
  3.2475,
  3.27,
  3.2475,
  3.1801,
  3.0677,
  2.9103,
  2.708
]);
const BRIDGE_BOUNDARY_EPSILON = 0.001;

interface TraversalRoadTriangle {
  a: readonly [number, number, number];
  b: readonly [number, number, number];
  c: readonly [number, number, number];
}

interface RawTraversalSurfaceSample {
  height: number;
  source: TraversalSurfaceSource;
}

const terrainBaseHeightfieldCache = new Map<WorldTerrainPatchDefinition["id"], Float32Array>();
let pathGeometryTemplateCache: THREE.BufferGeometry | null = null;
let traversalRoadTriangleIndexCache: Map<string, TraversalRoadTriangle[]> | null = null;
let cachedTraversalSurfaceQuery: {
  x: number;
  z: number;
  sampleDistance: number;
  result: TraversalSurfaceSample;
} | null = null;

function traversalCellKey(x: number, z: number): string {
  return `${Math.floor(x / TERRAIN_GRID_STEP_METERS)}:${Math.floor(z / TERRAIN_GRID_STEP_METERS)}`;
}

function sampleTraversalBasePlane(x: number, z: number): number {
  const patch = WorldLayout.terrainPatchAt(x, z);
  if (!patch) return WorldLayout.terrainBaseHeight(x, z);
  const heightfield = WorldLayout.terrainBaseHeightfieldForPatch(patch.id);
  const resolution = patch.resolution;
  const stepMeters = patch.sizeMeters / resolution;
  const minimumX = patch.center.x - patch.sizeMeters * 0.5;
  const minimumZ = patch.center.z - patch.sizeMeters * 0.5;
  const maximumIndex = resolution - 1;
  const column = THREE.MathUtils.clamp(
    Math.floor((x - minimumX) / stepMeters),
    0,
    maximumIndex
  );
  const row = THREE.MathUtils.clamp(
    Math.floor((z - minimumZ) / stepMeters),
    0,
    maximumIndex
  );
  const cellX = minimumX + column * stepMeters;
  const cellZ = minimumZ + row * stepMeters;
  const u = THREE.MathUtils.clamp((x - cellX) / stepMeters, 0, 1);
  const v = THREE.MathUtils.clamp((z - cellZ) / stepMeters, 0, 1);
  const stride = resolution + 1;
  const height = (gridX: number, gridZ: number): number =>
    heightfield[gridX * stride + gridZ];
  const a = height(column, row);
  const b = height(column, row + 1);
  const c = height(column + 1, row + 1);
  const d = height(column + 1, row);
  return u + v <= 1
    ? a + u * (d - a) + v * (b - a)
    : c + (1 - u) * (b - c) + (1 - v) * (d - c);
}

function sharedTraversalRoadTriangleIndex(): Map<string, TraversalRoadTriangle[]> {
  if (traversalRoadTriangleIndexCache) return traversalRoadTriangleIndexCache;
  const geometry = WorldLayout.buildPathGeometry();
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex();
  if (!indices) {
    geometry.dispose();
    throw new Error("[WorldLayout] Canonical traversal road geometry must be indexed");
  }
  const cells = new Map<string, TraversalRoadTriangle[]>();
  for (let offset = 0; offset < indices.count; offset += 3) {
    const triangle: TraversalRoadTriangle = {
      a: [positions.getX(indices.getX(offset)), positions.getY(indices.getX(offset)), positions.getZ(indices.getX(offset))],
      b: [positions.getX(indices.getX(offset + 1)), positions.getY(indices.getX(offset + 1)), positions.getZ(indices.getX(offset + 1))],
      c: [positions.getX(indices.getX(offset + 2)), positions.getY(indices.getX(offset + 2)), positions.getZ(indices.getX(offset + 2))]
    };
    const minimumX = Math.floor(Math.min(triangle.a[0], triangle.b[0], triangle.c[0]) / TERRAIN_GRID_STEP_METERS);
    const maximumX = Math.floor(Math.max(triangle.a[0], triangle.b[0], triangle.c[0]) / TERRAIN_GRID_STEP_METERS);
    const minimumZ = Math.floor(Math.min(triangle.a[2], triangle.b[2], triangle.c[2]) / TERRAIN_GRID_STEP_METERS);
    const maximumZ = Math.floor(Math.max(triangle.a[2], triangle.b[2], triangle.c[2]) / TERRAIN_GRID_STEP_METERS);
    for (let cellX = minimumX; cellX <= maximumX; cellX++) {
      for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ++) {
        const key = `${cellX}:${cellZ}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(triangle);
        cells.set(key, bucket);
      }
    }
  }
  geometry.dispose();
  traversalRoadTriangleIndexCache = cells;
  return cells;
}

function sampleTraversalRoadPlane(x: number, z: number): number | null {
  let highest = Number.NEGATIVE_INFINITY;
  for (const triangle of sharedTraversalRoadTriangleIndex().get(traversalCellKey(x, z)) ?? []) {
    const { a, b, c } = triangle;
    const determinant = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(determinant) <= 1e-12) continue;
    const weightA = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / determinant;
    const weightB = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / determinant;
    const weightC = 1 - weightA - weightB;
    if (Math.min(weightA, weightB, weightC) < -TRAVERSAL_TRIANGLE_EPSILON) continue;
    highest = Math.max(highest, a[1] * weightA + b[1] * weightB + c[1] * weightC);
  }
  return Number.isFinite(highest) ? highest : null;
}
const roundBridgeCoordinate = (value: number): number => Math.round(value * 10) / 10;
const BRIDGE_WEST_DECK_EDGE = Object.freeze({
  x: BRIDGE_CENTER.x - BRIDGE_HALF_SPAN,
  z: BRIDGE_CENTER.z
});
const BRIDGE_EAST_DECK_EDGE = Object.freeze({
  x: BRIDGE_CENTER.x + BRIDGE_HALF_SPAN,
  z: BRIDGE_CENTER.z
});
const BRIDGE_WEST_APPROACH_START = Object.freeze({
  x: BRIDGE_WEST_DECK_EDGE.x - BRIDGE_WORLD_PROFILE.approachLength,
  z: BRIDGE_CENTER.z
});
const BRIDGE_EAST_APPROACH_END = Object.freeze({
  x: roundBridgeCoordinate(BRIDGE_EAST_DECK_EDGE.x + BRIDGE_WORLD_PROFILE.approachLength),
  z: BRIDGE_CENTER.z
});
const LIGHTHOUSE_GATEWAY = Object.freeze({ x: -92, z: 74 });
const STARTER_MILL_WORLD = starterStructureAnchor("struct.starter_mill")!;

const starterFarmEntryPath = STARTER_FARM_LAYOUT.paths.find((path) => path.id === "farm-entry");
const STARTER_FARM_YARD_GATE = farmLocalToWorld(
  STARTER_FARM_LAYOUT.farmId,
  starterFarmEntryPath?.points.at(-1) ?? { x: 7.4, z: -8.4 }
);

/**
 * Regional routes are reserved for a gameplay destination, a named landmark,
 * or a deliberate connection between those places. Unanchored scenic spurs
 * belong in authored ground composition, not in the walkable road network.
 */
export const WORLD_ROUTES: readonly WorldRoute[] = [
  {
    id: "farm-village",
    scope: "regional",
    kind: "arterial",
    widthMeters: 3.8,
    points: [
      STARTER_FARM_YARD_GATE,
      { x: -49, z: -66 },
      { x: -41, z: -50 },
      { x: -32, z: -32 },
      BRIDGE_WEST_APPROACH_START,
      BRIDGE_WEST_DECK_EDGE,
      BRIDGE_CENTER,
      BRIDGE_EAST_DECK_EDGE,
      BRIDGE_EAST_APPROACH_END,
      RIVER_CROSSING,
      { x: 14, z: -16 },
      { x: 26, z: -26 },
      { x: 38, z: -36 },
      { x: 46, z: -44 },
      VILLAGE_MARKET.position
    ],
    linearSegmentIndices: [4, 5, 6, 7]
  },
  {
    id: "village-homestead",
    scope: "regional",
    kind: "lane",
    widthMeters: 3.1,
    points: [
      VILLAGE_MARKET.position,
      { x: 57, z: -56 },
      { x: 60, z: -60 }
    ]
  },
  {
    id: "village-harbor",
    scope: "regional",
    kind: "arterial",
    widthMeters: 4.2,
    points: [
      VILLAGE_MARKET.position,
      { x: 56, z: -28 },
      { x: 58, z: -4 },
      { x: 60, z: 20 },
      { x: 62, z: 44 },
      HARBOR_MARKET.position
    ]
  },
  {
    id: "village-lighthouse",
    scope: "regional",
    kind: "lane",
    widthMeters: 3.2,
    points: [
      VILLAGE_MARKET.position,
      { x: 38, z: -36 },
      { x: 18, z: -20 },
      RIVER_CROSSING,
      BRIDGE_EAST_APPROACH_END,
      BRIDGE_EAST_DECK_EDGE,
      BRIDGE_CENTER,
      BRIDGE_WEST_DECK_EDGE,
      BRIDGE_WEST_APPROACH_START,
      { x: -20, z: 14 },
      { x: -43, z: 34 },
      { x: -68, z: 54 },
      LIGHTHOUSE_GATEWAY
    ],
    linearSegmentIndices: [4, 5, 6, 7]
  },
  {
    id: "cliffside-coastal-walk",
    scope: "regional",
    kind: "trail",
    widthMeters: 2.6,
    // Stay on dry banks: the river mouth between the headland and harbor is not fordable,
    // so the trail follows the west shore, crosses the stone bridge, then climbs the east bank.
    points: [
      { x: -92, z: 74 },
      { x: -68, z: 70 },
      { x: -40, z: 68 },
      { x: -16, z: 62 },
      { x: -22, z: 34 },
      { x: -20, z: 14 },
      BRIDGE_WEST_APPROACH_START,
      BRIDGE_WEST_DECK_EDGE,
      BRIDGE_CENTER,
      BRIDGE_EAST_DECK_EDGE,
      BRIDGE_EAST_APPROACH_END,
      { x: 18, z: 8 },
      { x: 32, z: 28 },
      { x: 48, z: 46 },
      { x: 58, z: 54 },
      HARBOR_MARKET.position
    ],
    linearSegmentIndices: [6, 7, 8, 9]
  }
] as const;

const FARM_PATH_KIND_TO_WORLD_KIND: Readonly<Record<FarmPathKind, WorldRouteKind>> = {
  lane: "lane",
  trail: "trail"
};

export const FARM_ROUTES: readonly WorldRoute[] = STARTER_FARM_LAYOUT.paths.map((path) => ({
  id: path.id,
  scope: "farmstead",
  kind: FARM_PATH_KIND_TO_WORLD_KIND[path.kind],
  widthMeters: path.widthMeters,
  points: path.points.map((point) => farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, point))
}));

export const WORLD_ROUTE_NETWORK: readonly WorldRoute[] = [
  ...WORLD_ROUTES,
  ...FARM_ROUTES,
  ...SUNREACH_ROUTES
];

export const WORLD_ROUTE_JUNCTIONS: readonly WorldRouteJunction[] = [
  {
    id: "starter-farm-field",
    center: farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x: 0, z: -7 }),
    radiusMeters: 2.05,
    blendLengthMeters: 1.2,
    surface: "field",
    routeIds: ["farm-entry", "farm-work-zone"]
  },
  {
    id: "starter-farm-yard",
    center: STARTER_FARM_YARD_GATE,
    radiusMeters: 3.35,
    blendLengthMeters: 1.6,
    surface: "farm-yard",
    routeIds: ["farm-village", "farm-entry", "farm-home"]
  },
  {
    id: "village-market",
    center: VILLAGE_MARKET.position,
    radiusMeters: 9.2,
    blendLengthMeters: 2.8,
    surface: "village-market",
    routeIds: ["farm-village", "village-homestead", "village-harbor", "village-lighthouse"]
  },
  {
    id: "river-crossing",
    center: RIVER_CROSSING,
    radiusMeters: 3.2,
    blendLengthMeters: 1.4,
    surface: "landmark-gateway",
    routeIds: ["farm-village", "village-lighthouse"]
  },
  {
    id: "lighthouse-gateway",
    center: LIGHTHOUSE_GATEWAY,
    radiusMeters: 2.65,
    blendLengthMeters: 1.35,
    surface: "landmark-gateway",
    routeIds: ["village-lighthouse", "cliffside-coastal-walk"]
  },
  {
    id: "harbor-market-gateway",
    center: HARBOR_MARKET.position,
    radiusMeters: 3.25,
    blendLengthMeters: 1.45,
    surface: "landmark-gateway",
    routeIds: ["village-harbor", "cliffside-coastal-walk"]
  }
];

function villageArchitectureRotation(center: WorldPoint): number {
  return Math.atan2(VILLAGE_MARKET.position.x - center.x, VILLAGE_MARKET.position.z - center.z);
}

/**
 * Authored village composition contract. Keep this table aligned with the
 * published architecture collision primitives and use it as the sole source
 * for runtime building placement envelopes and frontage spacing.
 */
export const WORLD_ARCHITECTURE_PADS: readonly WorldArchitecturePad[] = [
  // Village approach and orchard homesteads; existing terrain, no new gameplay anchors.
  { id: "village.approach-inn", center: { x: 76, z: -25 }, rotationY: -0.624023, envelope: [4.5, 4.1], frontageClearanceMeters: 7, frontApproachMeters: 4 },
  { id: "village.cooperative-hall", center: { x: 38, z: 12 }, rotationY: 2.111216, envelope: [5, 4.2], frontageClearanceMeters: 7.5, frontApproachMeters: 4 },
  { id: "orchard.barn", center: { x: 100, z: -66 }, rotationY: -0.566729, envelope: [4.8, 3.2], frontageClearanceMeters: 6.5, frontApproachMeters: 4 },
  { id: "orchard.farmhouse", center: { x: 134, z: -32 }, rotationY: -1.172274, envelope: [4.5, 4.75], frontageClearanceMeters: 7.5, frontApproachMeters: 4 },
  { id: "orchard.tool-shed", center: { x: 105, z: -49 }, rotationY: -0.764568, envelope: [1.55, 1.4], frontageClearanceMeters: 3, frontApproachMeters: 2.5 },
  { id: "orchard.outhouse", center: { x: 129, z: -50 }, rotationY: -0.95724, envelope: [1.1, 1.5], frontageClearanceMeters: 2.5, frontApproachMeters: 2 },
  { id: "village.roadside-stall", center: { x: 52.7, z: -14}, rotationY: 1.5708, envelope: [1.25, 0.85], frontageClearanceMeters: 2.5, frontApproachMeters: 2 },
  {
    id: "village.tool-shed",
    center: { x: 25.3, z: -71.5},
    rotationY: 0.9744,
    envelope: [2, 1.7],
    frontageClearanceMeters: 2.6,
    frontApproachMeters: 4
  },
  {
    id: "village.outhouse",
    center: { x: 24, z: -62 },
    rotationY: villageArchitectureRotation({ x: 24, z: -62 }),
    envelope: [1.35, 1.25],
    frontageClearanceMeters: 2.2,
    frontApproachMeters: 2.2
  },
  {
    id: "village.cottage-west",
    center: { x: 36, z: -50 },
    rotationY: villageArchitectureRotation({ x: 36, z: -50 }),
    envelope: [2.7, 2.4],
    frontageClearanceMeters: 4.5,
    frontApproachMeters: 4.5
  },
  {
    id: "village.cottage-southwest",
    center: { x: 38, z: -60 },
    rotationY: villageArchitectureRotation({ x: 38, z: -60 }),
    envelope: [2.5, 2.7],
    frontageClearanceMeters: 4.3,
    frontApproachMeters: 4.5
  },
  {
    id: "village.cottage-garden",
    center: { x: 72, z: -64 },
    rotationY: villageArchitectureRotation({ x: 72, z: -64 }),
    envelope: [3.4, 2.8],
    frontageClearanceMeters: 5,
    frontApproachMeters: 4.8
  },
  {
    id: "village.cottage-south",
    center: { x: 66.2, z: -69.7},
    rotationY: -0.5236,
    envelope: [2.5, 2.7],
    frontageClearanceMeters: 4.3,
    frontApproachMeters: 4.5
  },
  {
    id: "village.inn",
    // 2 m south of the original (64, -38) so the north corners stay on the court.
    center: { x: 63.1, z: -38.9},
    rotationY: -1.5708,
    envelope: [5.2, 4.2],
    frontageClearanceMeters: 6.5,
    frontApproachMeters: 6
  },
  {
    id: "village.market-hall",
    // 2 m west of the original (72, -51) so the east corners stay off the upland ridge.
    center: { x: 68.9, z: -53.1},
    rotationY: -2.0944,
    envelope: [5.3, 4.2],
    frontageClearanceMeters: 7,
    frontApproachMeters: 6
  },
  {
    id: "village.barn",
    center: { x: 46.1, z: -66 },
    rotationY: 0.5236,
    envelope: [5.3, 3.2],
    frontageClearanceMeters: 6,
    frontApproachMeters: 5.5
  }
];

const RAIN_SHELTER_LANDMARKS: readonly { id: LandmarkId; radius: number; rise: number }[] = [
  { id: "farmhouse", radius: 4.6, rise: 4.4 },
  { id: "windmill", radius: 3.4, rise: 7.5 },
  { id: "lighthouse", radius: 2.8, rise: 10 }
];

function pointInRotatedEnvelope(
  x: number,
  z: number,
  center: WorldPoint,
  rotationY: number,
  halfX: number,
  halfZ: number
): boolean {
  const dx = x - center.x;
  const dz = z - center.z;
  const cosine = Math.cos(-rotationY);
  const sine = Math.sin(-rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return Math.abs(localX) <= halfX && Math.abs(localZ) <= halfZ;
}

export const WORLD_LAYOUT_V5: WorldLayoutDescriptor = {
  revision: 10,
  anchors: {
    starterFarm: STARTER_FARM_LAYOUT.origin,
    playerSpawn: WORLD_SPAWN.playerPosition,
    privateHomestead: { x: 60, z: -60 },
    villageMarket: VILLAGE_MARKET.position,
    riverCrossing: RIVER_CROSSING,
    bridge: BRIDGE_CENTER,
    lighthouse: LIGHTHOUSE_GATEWAY,
    fishMarket: HARBOR_MARKET.position,
    harborDock: HARBOR_DOCK.boatPosition
  },
  coast: COAST_SPLINE,
  river: RIVER_SPLINE,
  riverMouth: RIVER_MOUTH,
  routes: WORLD_ROUTE_NETWORK,
  architecturePads: WORLD_ARCHITECTURE_PADS
};

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function pointToSegmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  const t = lengthSq <= 1e-12 ? 0 : THREE.MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

type RiverProfileNumericKey = Exclude<keyof RiverProfileKnot, "z">;

function interpolateRiverProfileKnot(z: number, key: RiverProfileNumericKey): number {
  if (z <= RIVER_PROFILE_KNOTS[0].z) return RIVER_PROFILE_KNOTS[0][key];
  const last = RIVER_PROFILE_KNOTS[RIVER_PROFILE_KNOTS.length - 1];
  if (z >= last.z) return last[key];
  const upperIndex = RIVER_PROFILE_KNOTS.findIndex((knot) => z <= knot.z);
  const lower = RIVER_PROFILE_KNOTS[upperIndex - 1];
  const upper = RIVER_PROFILE_KNOTS[upperIndex];
  const t = smoothstep(lower.z, upper.z, z);
  return THREE.MathUtils.lerp(lower[key], upper[key], t);
}

function catmullScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

function monotoneCatmullScalar(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const delta = p2 - p1;
  if (Math.abs(delta) <= 0.000001) return p1;
  let startSlope = 0.5 * (p2 - p0);
  let endSlope = 0.5 * (p3 - p1);
  if (startSlope * delta <= 0) startSlope = 0;
  if (endSlope * delta <= 0) endSlope = 0;
  const slopeLimit = Math.abs(delta) * 3;
  startSlope = THREE.MathUtils.clamp(startSlope, -slopeLimit, slopeLimit);
  endSlope = THREE.MathUtils.clamp(endSlope, -slopeLimit, slopeLimit);
  const normalizedStartSlope = startSlope / delta;
  const normalizedEndSlope = endSlope / delta;
  const slopeMagnitude = normalizedStartSlope ** 2 + normalizedEndSlope ** 2;
  if (slopeMagnitude > 9) {
    const scale = 3 / Math.sqrt(slopeMagnitude);
    startSlope = normalizedStartSlope * scale * delta;
    endSlope = normalizedEndSlope * scale * delta;
  }
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1
    + (t3 - 2 * t2 + t) * startSlope
    + (-2 * t3 + 3 * t2) * p2
    + (t3 - t2) * endSlope;
}

function splineValue(points: readonly WorldPoint[], coordinate: number, axis: "x" | "z"): number {
  // The only z-keyed spline is the authored river, already stored in ascending
  // z order. Re-sorting and allocating a copy for every terrain sample made
  // the 600 m heightfield disproportionately expensive.
  const ordered = axis === "x" ? points : RIVER_SPLINE;
  const key = axis;
  const valueKey = axis === "x" ? "z" : "x";
  if (coordinate <= ordered[0][key]) return ordered[0][valueKey];
  if (coordinate >= ordered[ordered.length - 1][key]) return ordered[ordered.length - 1][valueKey];
  const index = ordered.findIndex((point, pointIndex) => pointIndex > 0 && coordinate <= point[key]);
  const p1 = ordered[index - 1];
  const p2 = ordered[index];
  const p0 = ordered[Math.max(0, index - 2)];
  const p3 = ordered[Math.min(ordered.length - 1, index + 1)];
  const t = (coordinate - p1[key]) / Math.max(0.0001, p2[key] - p1[key]);
  return catmullScalar(p0[valueKey], p1[valueKey], p2[valueKey], p3[valueKey], t);
}

function sampleRoutePoints(route: WorldRoute, subdivisions: number = 10): WorldPoint[] {
  const sampled: WorldPoint[] = [];
  const points = route.points;
  const linearSegments = new Set(route.linearSegmentIndices ?? []);
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      if (linearSegments.has(index)) {
        sampled.push({
          x: THREE.MathUtils.lerp(p1.x, p2.x, t),
          z: THREE.MathUtils.lerp(p1.z, p2.z, t)
        });
        continue;
      }
      sampled.push({
        x: monotoneCatmullScalar(p0.x, p1.x, p2.x, p3.x, t),
        z: monotoneCatmullScalar(p0.z, p1.z, p2.z, p3.z, t)
      });
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

export interface CompiledWorldRouteSample {
  point: WorldPoint;
  tangent: WorldPoint;
  normal: WorldPoint;
  distanceAlongRoute: number;
  segmentIndex: number;
}

export interface CompiledWorldRouteSegment {
  start: WorldPoint;
  end: WorldPoint;
  dx: number;
  dz: number;
  lengthSquared: number;
  length: number;
  tangent: WorldPoint;
  cumulativeStart: number;
  cumulativeEnd: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CompiledWorldRoute {
  route: WorldRoute;
  halfWidth: number;
  shoulderWidthMeters: number;
  terrainFeatherMeters: number;
  corridorRadiusMeters: number;
  samples: readonly CompiledWorldRouteSample[];
  segments: readonly CompiledWorldRouteSegment[];
  totalLength: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function buildCompiledRoute(route: WorldRoute): CompiledWorldRoute {
    const path = sampleRoutePoints(route);
    const halfWidth = route.widthMeters * 0.5;
    const profile = WORLD_ROUTE_PROFILES[route.kind];
    const samples: CompiledWorldRouteSample[] = [];
    const segments: CompiledWorldRouteSegment[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let cumulativeDistance = 0;

    for (let index = 0; index < path.length; index++) {
      const previous = path[Math.max(0, index - 1)];
      const next = path[Math.min(path.length - 1, index + 1)];
      const tangentX = next.x - previous.x;
      const tangentZ = next.z - previous.z;
      const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
      const tangent = { x: tangentX / tangentLength, z: tangentZ / tangentLength };
      samples.push({
        point: path[index],
        tangent,
        normal: { x: -tangent.z, z: tangent.x },
        distanceAlongRoute: cumulativeDistance,
        segmentIndex: Math.min(index, Math.max(0, path.length - 2))
      });
      minX = Math.min(minX, path[index].x);
      maxX = Math.max(maxX, path[index].x);
      minZ = Math.min(minZ, path[index].z);
      maxZ = Math.max(maxZ, path[index].z);

      if (index < path.length - 1) {
        const nextPoint = path[index + 1];
        const dx = nextPoint.x - path[index].x;
        const dz = nextPoint.z - path[index].z;
        const lengthSquared = dx * dx + dz * dz;
        const length = Math.max(0.0001, Math.sqrt(lengthSquared));
        const segmentTangent = { x: dx / length, z: dz / length };
        const cumulativeStart = cumulativeDistance;
        cumulativeDistance += length;
        segments.push({
          start: path[index],
          end: nextPoint,
          dx,
          dz,
          lengthSquared,
          length,
          tangent: segmentTangent,
          cumulativeStart,
          cumulativeEnd: cumulativeDistance,
          minX: Math.min(path[index].x, nextPoint.x),
          maxX: Math.max(path[index].x, nextPoint.x),
          minZ: Math.min(path[index].z, nextPoint.z),
          maxZ: Math.max(path[index].z, nextPoint.z)
        });
      }
    }

    // The terrain and cover systems use the same corridor bounds as the mesh.
    // Including the feather here keeps the spatial index useful at the soft edge.
    const corridorRadiusMeters = halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters;
    return {
      route,
      halfWidth,
      shoulderWidthMeters: profile.shoulderWidthMeters,
      terrainFeatherMeters: profile.terrainFeatherMeters,
      corridorRadiusMeters,
      samples,
      segments,
      totalLength: cumulativeDistance,
      minX: minX - corridorRadiusMeters,
      maxX: maxX + corridorRadiusMeters,
      minZ: minZ - corridorRadiusMeters,
      maxZ: maxZ + corridorRadiusMeters
    };
}

/**
 * One deterministic route compilation is shared by map projection, terrain,
 * surface weights, cover placement, road geometry, and roadside details.
 */
export const COMPILED_WORLD_ROUTES: readonly CompiledWorldRoute[] = WORLD_ROUTE_NETWORK.map(buildCompiledRoute);

export const WORLD_PATHS: readonly (readonly WorldPoint[])[] = COMPILED_WORLD_ROUTES.map((compiledRoute) =>
  compiledRoute.samples.map((sample) => sample.point)
);
export const WORLD_REGIONAL_PATHS: readonly (readonly WorldPoint[])[] = COMPILED_WORLD_ROUTES
  .filter((compiledRoute) => compiledRoute.route.scope === "regional")
  .map((compiledRoute) => compiledRoute.samples.map((sample) => sample.point));

interface RouteSegmentReference {
  routeIndex: number;
  segmentIndex: number;
}

function buildRouteSegmentIndex(
  routes: readonly CompiledWorldRoute[]
): ReadonlyMap<string, readonly RouteSegmentReference[]> {
  const buckets = new Map<string, RouteSegmentReference[]>();
  for (const [routeIndex, route] of routes.entries()) {
    for (const [segmentIndex, segment] of route.segments.entries()) {
      const minCellX = routeIndexCell(segment.minX - route.corridorRadiusMeters - ROUTE_INDEX_PADDING_METERS);
      const maxCellX = routeIndexCell(segment.maxX + route.corridorRadiusMeters + ROUTE_INDEX_PADDING_METERS);
      const minCellZ = routeIndexCell(segment.minZ - route.corridorRadiusMeters - ROUTE_INDEX_PADDING_METERS);
      const maxCellZ = routeIndexCell(segment.maxZ + route.corridorRadiusMeters + ROUTE_INDEX_PADDING_METERS);
      for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
          const key = routeIndexKey(cellX, cellZ);
          const bucket = buckets.get(key) ?? [];
          bucket.push({ routeIndex, segmentIndex });
          buckets.set(key, bucket);
        }
      }
    }
  }
  return buckets;
}

const ROUTE_INDEX_CELL_SIZE_METERS = 8;
const ROUTE_INDEX_PADDING_METERS = 18;

function routeIndexKey(cellX: number, cellZ: number): string {
  return `${cellX}:${cellZ}`;
}

function routeIndexCell(value: number): number {
  return Math.floor(value / ROUTE_INDEX_CELL_SIZE_METERS);
}

const ROUTE_SEGMENT_INDEX = buildRouteSegmentIndex(COMPILED_WORLD_ROUTES);
const ROUTE_CANDIDATE_KEYS = new Set<number>();
const FAR_FROM_ROUTES: RouteProjection = {
  distance: Number.POSITIVE_INFINITY,
  halfWidth: COMPILED_WORLD_ROUTES[0].halfWidth,
  shoulderWidthMeters: COMPILED_WORLD_ROUTES[0].shoulderWidthMeters,
  terrainFeatherMeters: COMPILED_WORLD_ROUTES[0].terrainFeatherMeters,
  route: COMPILED_WORLD_ROUTES[0].route,
  point: { ...COMPILED_WORLD_ROUTES[0].segments[0].start },
  tangent: { ...COMPILED_WORLD_ROUTES[0].segments[0].tangent },
  normal: {
    x: -COMPILED_WORLD_ROUTES[0].segments[0].tangent.z,
    z: COMPILED_WORLD_ROUTES[0].segments[0].tangent.x
  },
  routeIndex: 0,
  segmentIndex: 0,
  distanceAlongRoute: COMPILED_WORLD_ROUTES[0].segments[0].cumulativeStart
};

export interface RouteProjection {
  distance: number;
  halfWidth: number;
  shoulderWidthMeters: number;
  terrainFeatherMeters: number;
  route: WorldRoute;
  point: WorldPoint;
  tangent: WorldPoint;
  normal: WorldPoint;
  routeIndex: number;
  segmentIndex: number;
  distanceAlongRoute: number;
}

let cachedRouteQuery: { x: number; z: number; result: RouteProjection } | null = null;

export function pointSegmentProjection(
  x: number,
  z: number,
  start: WorldPoint,
  end: WorldPoint
): { distance: number; point: WorldPoint; tangent: WorldPoint } {

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 0.0001) {
    return {
      distance: Math.hypot(x - start.x, z - start.z),
      point: { ...start },
      tangent: { x: 1, z: 0 }
    };
  }
  const progress = clamp01(((x - start.x) * dx + (z - start.z) * dz) / lengthSquared);
  const length = Math.sqrt(lengthSquared);
  const point = { x: start.x + dx * progress, z: start.z + dz * progress };
  return {
    distance: Math.hypot(x - point.x, z - point.z),
    point,
    tangent: { x: dx / length, z: dz / length }
  };
}

function boxWeight(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  feather: number
): number {
  const dx = Math.max(0, Math.abs(x - centerX) - halfWidth);
  const dz = Math.max(0, Math.abs(z - centerZ) - halfDepth);
  return 1 - smoothstep(0, feather, Math.hypot(dx, dz));
}

function radialWeight(x: number, z: number, centerX: number, centerZ: number, radius: number, feather: number): number {
  return 1 - smoothstep(radius, radius + feather, Math.hypot(x - centerX, z - centerZ));
}

function bandWeight(value: number, center: number, radius: number, feather: number): number {
  return 1 - smoothstep(radius, radius + feather, Math.abs(value - center));
}

function normalizedSurfaceWeights(weights: TerrainSurfaceWeights): TerrainSurfaceWeights {
  const sum = Object.values(weights).reduce((total, value) => total + value, 0);
  if (sum <= 0.0001) return { ...weights, grass: 1 };
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / sum])
  ) as unknown as TerrainSurfaceWeights;
}

function routeJunctionInfluence(x: number, z: number): number {
  return WORLD_ROUTE_JUNCTIONS.reduce(
    (strongest, junction) => Math.max(
      strongest,
      radialWeight(
        x,
        z,
        junction.center.x,
        junction.center.z,
        junction.radiusMeters,
        junction.blendLengthMeters
      )
    ),
    0
  );
}

/** Canonical authored-region geography shared by simulation, physics, and presentation. */
export class WorldLayout {
  public static islands(): readonly Readonly<WorldIslandDefinition>[] {
    return worldIslandDefinitions();
  }

  public static terrainPatches(): readonly Readonly<WorldTerrainPatchDefinition>[] {
    return this.islands().map((island) => island.terrainPatch);
  }

  public static terrainPatchAt(x: number, z: number): Readonly<WorldTerrainPatchDefinition> | null {
    for (const patch of this.terrainPatches()) {
      if (x >= patch.bounds.minX && x <= patch.bounds.maxX && z >= patch.bounds.minZ && z <= patch.bounds.maxZ) {
        return patch;
      }
    }
    return null;
  }

  public static islandAt(x: number, z: number): WorldIslandId | null {
    const sunreach = WORLD_ISLAND_DEFINITIONS["island.sunreach"];
    if (
      x >= sunreach.authoredBounds.minX
      && x <= sunreach.authoredBounds.maxX
      && z >= sunreach.authoredBounds.minZ
      && z <= sunreach.authoredBounds.maxZ
      && signedDistanceToSunreachCoast(x, z) <= 0
    ) return "island.sunreach";
    const neva = WORLD_ISLAND_DEFINITIONS["island.neva"].authoredBounds;
    if (x >= neva.minX && x <= neva.maxX && z >= neva.minZ && z <= neva.maxZ) return "island.neva";
    return null;
  }

  public static biomeAt(x: number, z: number): WorldBiomeId | null {
    const islandId = this.islandAt(x, z);
    return islandId ? WORLD_ISLAND_DEFINITIONS[islandId].biomeId : null;
  }

  public static climateSampleAt(
    x: number,
    z: number,
    weather: Readonly<WorldClimateWeatherInput>
  ): WorldClimateSample {
    const marine = this.marineSampleAt(x, z);
    const islandId = this.islandAt(x, z)
      ?? (marine.ecologyWeights["ecology.sunreach"] > marine.ecologyWeights["ecology.neva"]
        ? "island.sunreach"
        : "island.neva");
    if (islandId === "island.neva") {
      return {
        islandId,
        biomeId: "biome.neva_temperate",
        climateId: "temperate",
        temperatureC: weather.temperatureC,
        temperatureOffsetC: 0,
        precipitation: weather.precipitation,
        rainfallEffectiveness: 1,
        effectivePrecipitation: weather.precipitation,
        evaporationMultiplier: 1,
        exposure: clamp01(weather.windSpeed / 17)
      };
    }
    const drainage = sunreachDrainageSample(x, z);
    const exposure = clamp01(
      drainage.saltExposure * 0.25
      + drainage.slope * 0.2
      + marine.openWaterExposure * 0.55
    );
    return {
      islandId,
      biomeId: "biome.sunreach_warm_dry",
      climateId: "warm",
      temperatureC: weather.temperatureC + 4,
      temperatureOffsetC: 4,
      precipitation: weather.precipitation,
      rainfallEffectiveness: 0.65,
      effectivePrecipitation: weather.precipitation * 0.65,
      evaporationMultiplier: 1.3 + exposure * 0.32,
      exposure
    };
  }

  public static drainageSampleAt(x: number, z: number): WorldDrainageSample {
    if (this.islandAt(x, z) === "island.sunreach" || this.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
      return sunreachDrainageSample(x, z);
    }
    const river = this.riverBankSample(x, z);
    return {
      islandId: "island.neva",
      catchment: clamp01(Math.max(river.channel, river.floodplain)),
      wash: clamp01(Math.max(river.lowerBank, river.channel)),
      erosion: river.erosion,
      deposition: river.deposition,
      moisturePotential: river.wetness,
      slope: clamp01(1 - this.terrainNormalY(x, z)),
      aspect: 0,
      saltExposure: clamp01(this.coastProfile(x).headland * this.shorelineWetness(x, z)),
      reefShelfInfluence: 0
    };
  }

  public static fishingEcologyAt(x: number, z: number): Readonly<FishingEcologyDefinition> {
    const weights = this.marineSampleAt(x, z).ecologyWeights;
    return weights["ecology.sunreach"] > weights["ecology.neva"]
      ? FISHING_ECOLOGY_DEFINITIONS["ecology.sunreach"]
      : FISHING_ECOLOGY_DEFINITIONS["ecology.neva"];
  }

  public static navigationRequirementAt(x: number, z: number): Readonly<SailingRequirement> | null {
    const marine = this.marineSampleAt(x, z);
    return marine.openWaterExposure >= OPEN_CHANNEL_REQUIREMENT.exposureThreshold
      && marine.ecologyWeights["ecology.sunreach"] >= 0.08
      ? OPEN_CHANNEL_REQUIREMENT
      : null;
  }

  public static routeDefinitions(): readonly WorldRoute[] {
    return WORLD_ROUTE_NETWORK;
  }

  public static compiledRouteNetwork(): readonly CompiledWorldRoute[] {
    return COMPILED_WORLD_ROUTES;
  }

  public static regionalRouteDefinitions(): readonly WorldRoute[] {
    return WORLD_ROUTES;
  }

  public static routeJunctions(): readonly WorldRouteJunction[] {
    return WORLD_ROUTE_JUNCTIONS;
  }

  public static coastlineZ(x: number): number {
    const authoredSpline = splineValue(COAST_SPLINE, x, "x");
    const broadCoves =
      bandWeight(x, 72, 7, 18) * -1.2
      + bandWeight(x, -92, 10, 24) * 0.8
      + bandWeight(x, -154, 10, 24) * -0.55;
    const rockyInlets =
      Math.sin(x * 0.061 + 0.45) * 0.62
      + Math.sin(x * 0.023 - 0.8) * 0.34;
    return authoredSpline + broadCoves + rockyInlets;
  }

  public static coastProfile(x: number): CoastProfile {
    const headland = bandWeight(x, -92, 10, 30);
    const harborCove = bandWeight(x, 72, 8, 22);
    const westernBeach = bandWeight(x, -154, 12, 28);
    const easternShelf = bandWeight(x, 132, 10, 26);
    const westernShelf = bandWeight(x, -46, 8, 22);
    // Most of Neva's coast is a walkable sand or stone toe. Tall cliffs are
    // authored landmarks, not the default waterline profile repeated around
    // the island.
    const rawBeach = Math.max(
      0.02,
      0.52 + harborCove * 1.15 + westernBeach * 0.88 - headland * 0.42 - easternShelf * 0.22
    );
    const rawRockShelf = 0.28 + easternShelf * 0.98 + westernShelf * 0.52 + headland * 0.38;
    const rawCliff = Math.max(
      0,
      0.06 + headland * 1.5 + easternShelf * 0.44 - harborCove * 0.08 - westernBeach * 0.04
    );
    const total = Math.max(0.0001, rawBeach + rawRockShelf + rawCliff);
    const beach = clamp01(rawBeach / total);
    const rockShelf = clamp01(rawRockShelf / total);
    const cliff = clamp01(rawCliff / total);
    const reedPocket = clamp01(harborCove * 0.68 + westernBeach * 0.58 + bandWeight(x, 18, 6, 16) * 0.48);
    return {
      beach,
      rockShelf,
      cliff,
      reedPocket,
      headland,
      harborCove,
      beachWidthMeters: 8 + beach * 10 + harborCove * 2,
      wetBandWidthMeters: 1.6 + beach * 1.05 + reedPocket * 0.55,
      rockToeWidthMeters: 3.4 + rockShelf * 4.6 + beach * 1.5,
      cliffRiseStartMeters: 3.8 + rockShelf * 3 + beach * 3,
      cliffRiseEndMeters: 11 + rockShelf * 4 + cliff * 3
    };
  }

  public static riverCenterX(z: number): number {
    return splineValue(RIVER_SPLINE, z, "z");
  }

  public static riverSectionAt(z: number): RiverSectionProfile {
    const derivativeStep = 1;
    const centerX = this.riverCenterX(z);
    const previousCenterX = this.riverCenterX(z - derivativeStep);
    const nextCenterX = this.riverCenterX(z + derivativeStep);
    const dx = (nextCenterX - previousCenterX) / (derivativeStep * 2);
    const tangentLength = Math.max(0.0001, Math.hypot(dx, 1));
    const curvature = (nextCenterX - centerX * 2 + previousCenterX)
      / Math.pow(1 + dx * dx, 1.5);
    const bend = THREE.MathUtils.clamp(curvature * 42, -1, 1);
    const bendStrength = smoothstep(0.04, 0.35, Math.abs(bend));
    const bridgeLock = 1 - smoothstep(5, 12, Math.abs(z - BRIDGE_CENTER.z));
    const leftWaterWidth = THREE.MathUtils.lerp(
      interpolateRiverProfileKnot(z, "leftWaterWidth"),
      5.55,
      bridgeLock
    );
    const rightWaterWidth = THREE.MathUtils.lerp(
      interpolateRiverProfileKnot(z, "rightWaterWidth"),
      5.55,
      bridgeLock
    );
    const leftOutside = smoothstep(0.04, 0.35, bend);
    const rightOutside = smoothstep(0.04, 0.35, -bend);
    const authoredLeftBankRun = interpolateRiverProfileKnot(z, "leftBankRun");
    const authoredRightBankRun = interpolateRiverProfileKnot(z, "rightBankRun");
    const steepBankRun = Math.min(authoredLeftBankRun, authoredRightBankRun, 4.8);
    const shelfBankRun = Math.max(authoredLeftBankRun, authoredRightBankRun, 8.2);
    const curvedLeftBankRun = THREE.MathUtils.lerp(
      authoredLeftBankRun,
      bend >= 0 ? steepBankRun : shelfBankRun,
      bendStrength
    );
    const curvedRightBankRun = THREE.MathUtils.lerp(
      authoredRightBankRun,
      bend >= 0 ? shelfBankRun : steepBankRun,
      bendStrength
    );
    const leftBankRun = THREE.MathUtils.lerp(curvedLeftBankRun, 6, bridgeLock);
    const rightBankRun = THREE.MathUtils.lerp(curvedRightBankRun, 6, bridgeLock);
    const authoredLeftFloodplain = interpolateRiverProfileKnot(z, "leftFloodplainWidth");
    const authoredRightFloodplain = interpolateRiverProfileKnot(z, "rightFloodplainWidth");
    const narrowFloodplain = Math.min(authoredLeftFloodplain, authoredRightFloodplain, 3.2);
    const wideFloodplain = Math.max(authoredLeftFloodplain, authoredRightFloodplain, 8);
    const curvedLeftFloodplain = THREE.MathUtils.lerp(
      authoredLeftFloodplain,
      bend >= 0 ? narrowFloodplain : wideFloodplain,
      bendStrength
    );
    const curvedRightFloodplain = THREE.MathUtils.lerp(
      authoredRightFloodplain,
      bend >= 0 ? wideFloodplain : narrowFloodplain,
      bendStrength
    );
    const leftFloodplainWidth = THREE.MathUtils.lerp(curvedLeftFloodplain, 4, bridgeLock);
    const rightFloodplainWidth = THREE.MathUtils.lerp(curvedRightFloodplain, 4, bridgeLock);
    const authoredBedElevation = interpolateRiverProfileKnot(z, "bedElevation");
    const bedElevation = authoredBedElevation
      + THREE.MathUtils.lerp(0.055, -0.045, bendStrength) * (1 - bridgeLock);
    const authoredThalwegMagnitude = Math.abs(interpolateRiverProfileKnot(z, "thalwegOffset"));
    const maximumThalwegOffset = Math.min(leftWaterWidth, rightWaterWidth) * 0.35;
    const thalwegMagnitude = Math.min(
      maximumThalwegOffset,
      (0.18 + authoredThalwegMagnitude * 0.82 + Math.min(leftWaterWidth, rightWaterWidth) * 0.045)
        * bendStrength
    );
    const bendThalwegOffset = bend > 0 ? -thalwegMagnitude : bend < 0 ? thalwegMagnitude : 0;
    const mouthDistance = RIVER_MOUTH.z - z;
    const estuaryInfluence = mouthDistance >= 0
      ? 1 - smoothstep(16, 30, mouthDistance)
      : 1 - smoothstep(25, 39, -mouthDistance);
    return {
      z,
      centerX,
      tangent: { x: dx / tangentLength, z: 1 / tangentLength },
      curvature,
      leftWaterWidth,
      rightWaterWidth,
      bedElevation,
      thalwegOffset: THREE.MathUtils.lerp(bendThalwegOffset, 0, bridgeLock),
      leftBankRun,
      rightBankRun,
      leftFloodplainWidth,
      rightFloodplainWidth,
      leftErosion: THREE.MathUtils.lerp(0.16 + leftOutside * 0.84, 0.18, bridgeLock),
      rightErosion: THREE.MathUtils.lerp(0.16 + rightOutside * 0.84, 0.18, bridgeLock),
      leftDeposition: THREE.MathUtils.lerp(0.18 + rightOutside * 0.82, 0.2, bridgeLock),
      rightDeposition: THREE.MathUtils.lerp(0.18 + leftOutside * 0.82, 0.2, bridgeLock),
      estuaryInfluence: clamp01(estuaryInfluence)
    };
  }

  /** Mean compatibility width. New geography consumers use riverSectionAt. */
  public static riverHalfWidth(z: number): number {
    const section = this.riverSectionAt(z);
    return (section.leftWaterWidth + section.rightWaterWidth) * 0.5;
  }

  public static riverDistance(x: number, z: number): number {
    return Math.abs(x - this.riverCenterX(z));
  }

  /** Positive values are river water, negative values are dry of that bank. */
  public static riverWaterSignedDistance(x: number, z: number): number {
    const section = this.riverSectionAt(z);
    const signedLateral = x - section.centerX;
    const width = signedLateral < 0 ? section.leftWaterWidth : section.rightWaterWidth;
    return width - Math.abs(signedLateral);
  }

  public static riverBankSample(x: number, z: number): RiverBankSample {
    const section = this.riverSectionAt(z);
    const signedLateral = x - section.centerX;
    const side: RiverSide = signedLateral < 0 ? "left" : "right";
    const waterWidth = side === "left" ? section.leftWaterWidth : section.rightWaterWidth;
    const bankRun = side === "left" ? section.leftBankRun : section.rightBankRun;
    const floodplainWidth = side === "left" ? section.leftFloodplainWidth : section.rightFloodplainWidth;
    const erosion = side === "left" ? section.leftErosion : section.rightErosion;
    const deposition = side === "left" ? section.leftDeposition : section.rightDeposition;
    const waterEdgeDistance = Math.abs(signedLateral) - waterWidth;
    const waterSignedDistance = -waterEdgeDistance;
    const dryDistance = Math.max(0, waterEdgeDistance);
    const channel = waterSignedDistance > 0
      ? smoothstep(0, Math.max(1.2, waterWidth * 0.7), waterSignedDistance)
      : 0;
    const lowerBank = waterEdgeDistance >= -0.35
      ? (1 - smoothstep(bankRun * 0.42, bankRun * 0.72, dryDistance))
        * smoothstep(-0.35, Math.max(0.35, bankRun * 0.18), waterEdgeDistance)
      : 0;
    const upperBank = waterEdgeDistance >= 0
      ? smoothstep(bankRun * 0.28, bankRun * 0.58, dryDistance)
        * (1 - smoothstep(bankRun * 0.92, bankRun + floodplainWidth * 0.35, dryDistance))
      : 0;
    const floodplain = waterEdgeDistance >= 0
      ? smoothstep(bankRun * 0.82, bankRun + floodplainWidth * 0.18, dryDistance)
        * (1 - smoothstep(bankRun + floodplainWidth * 0.7, bankRun + floodplainWidth, dryDistance))
      : 0;
    const wetness = clamp01(Math.max(
      1 - smoothstep(-0.15, 4.2 + deposition * 1.8, Math.abs(waterEdgeDistance)),
      floodplain * (0.34 + deposition * 0.46),
      lowerBank * (0.42 + deposition * 0.32)
    ));
    const fishingAccess = waterEdgeDistance >= 0
      ? smoothstep(0.35, 1.1, dryDistance)
        * (1 - smoothstep(3.8, 5.4, dryDistance))
        * (1 - erosion * 0.72)
      : 0;
    return {
      section,
      side,
      signedLateral,
      waterEdgeDistance,
      waterSignedDistance,
      channel,
      lowerBank,
      upperBank,
      floodplain,
      wetness,
      erosion,
      deposition,
      fishingAccess
    };
  }

  /** Low-frequency authored influence shared by the river mouth's visual systems. */
  public static estuaryInfluence(x: number, z: number): number {
    const mouth = WORLD_LAYOUT_V5.riverMouth;
    const longitudinal = z < mouth.z
      ? 1 - smoothstep(16, 30, mouth.z - z)
      : 1 - smoothstep(25, 39, z - mouth.z);
    const seawardFlare = smoothstep(0, 24, z - mouth.z) * 7.5;
    const profileZ = Math.min(z, mouth.z);
    const lateralRadius = (
      interpolateRiverProfileKnot(profileZ, "leftWaterWidth")
      + interpolateRiverProfileKnot(profileZ, "rightWaterWidth")
    ) * 0.5 + 7 + seawardFlare;
    const lateral = 1 - smoothstep(lateralRadius * 0.72, lateralRadius, Math.abs(x - mouth.x));
    return clamp01(longitudinal * lateral);
  }

  /** Exact legacy Neva water field inside the original terrain patch. */
  private static nevaWaterSignedDistance(x: number, z: number): number {
    const patch = WORLD_ISLAND_DEFINITIONS["island.neva"].terrainPatch;
    if (
      x < patch.bounds.minX
      || x > patch.bounds.maxX
      || z < patch.bounds.minZ
      || z > patch.bounds.maxZ
    ) {
      const dx = Math.max(patch.bounds.minX - x, 0, x - patch.bounds.maxX);
      const dz = Math.max(patch.bounds.minZ - z, 0, z - patch.bounds.maxZ);
      return Math.hypot(dx, dz) + 0.000001;
    }
    const coast = z - this.coastlineZ(x);
    const river = this.riverWaterSignedDistance(x, z);
    const eligibleRiver = z <= this.coastlineZ(x) + 1.5 ? river : Number.NEGATIVE_INFINITY;
    const hardUnion = Math.max(coast, eligibleRiver);
    if (hardUnion <= 0) return hardUnion;

    // Smooth only the already-positive underwater magnitude. The hard union
    // above remains the exact sign owner, so saved land/water positions do not
    // move as the river blends into the coastal shelf.
    const estuary = this.estuaryInfluence(x, z);
    if (estuary <= 0.0001) return hardUnion;
    const coastDepth = Math.max(0, coast);
    const riverDepth = Math.max(0, eligibleRiver);
    const roundedMagnitude = Math.hypot(coastDepth, riverDepth);
    return Math.max(0.000001, THREE.MathUtils.lerp(hardUnion, roundedMagnitude, estuary * 0.42));
  }

  public static marineSampleAt(x: number, z: number): MarineSample {
    const nevaDistance = this.nevaWaterSignedDistance(x, z);
    const sunreachDistance = signedDistanceToSunreachCoast(x, z);
    const signedShoreDistance = Math.min(nevaDistance, sunreachDistance);
    const sunreachProximity = 1 / Math.pow(12 + Math.max(0, sunreachDistance), 2);
    const nevaProximity = 1 / Math.pow(12 + Math.max(0, nevaDistance), 2);
    const ecologyTotal = Math.max(0.000001, sunreachProximity + nevaProximity);
    const sunreachEcology = sunreachProximity / ecologyTotal;
    const nevaEcology = nevaProximity / ecologyTotal;
    const coveShelter = clamp01(
      radialWeight(x, z, 350, 58, 8, 58)
      * (1 - smoothstep(42, 105, Math.max(0, signedShoreDistance)))
    );
    const channel = smoothstep(145, 220, x) * (1 - smoothstep(675, 720, x));
    const openWaterExposure = clamp01(
      channel * (0.62 + smoothstep(12, 80, Math.max(0, signedShoreDistance)) * 0.38)
      * (1 - coveShelter * 0.78)
    );
    const reefInfluence = clamp01(
      radialWeight(x, z, 548, 194, 30, 92)
      * (1 - smoothstep(42, 95, Math.abs(signedShoreDistance)))
    );
    const shallowWaterInfluence = signedShoreDistance > 0
      ? 1 - smoothstep(4, 38, signedShoreDistance)
      : 0;
    const waveX = 0.34 + openWaterExposure * 0.18;
    const waveZ = -0.94 + reefInfluence * 0.12;
    const waveLength = Math.hypot(waveX, waveZ);
    const flowX = 0.82 - reefInfluence * 0.28;
    const flowZ = 0.24 + openWaterExposure * 0.3;
    const flowLength = Math.hypot(flowX, flowZ);
    return {
      signedShoreDistance,
      bathymetryMeters: signedShoreDistance > 0
        ? Math.min(18, 0.45 + signedShoreDistance * (reefInfluence > 0.1 ? 0.045 : 0.075))
        : 0,
      coveShelter,
      openWaterExposure,
      reefInfluence,
      shallowWaterInfluence,
      waveDirection: { x: waveX / waveLength, z: waveZ / waveLength },
      flowDirection: { x: flowX / flowLength, z: flowZ / flowLength },
      navigationHazard: clamp01(openWaterExposure * 0.66 + reefInfluence * 0.48),
      ecologyWeights: {
        "ecology.neva": nevaEcology,
        "ecology.sunreach": sunreachEcology
      }
    };
  }

  /** Positive values are water; negative values are dry land. */
  public static waterSignedDistance(x: number, z: number): number {
    return this.marineSampleAt(x, z).signedShoreDistance;
  }

  public static isBridgeDeck(x: number, z: number): boolean {
    return (
      Math.abs(x - BRIDGE_CENTER.x) <= BRIDGE_HALF_SPAN + 0.000001 &&
      Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + 0.000001
    );
  }

  /** Raised road approaches are dry land even while the river sign is nearby. */
  public static isBridgeApproach(x: number, z: number): boolean {
    const withinApproachWidth = Math.abs(z - BRIDGE_CENTER.z)
      <= BRIDGE_WORLD_PROFILE.deckWidth * 0.6 + BRIDGE_BOUNDARY_EPSILON;
    if (!withinApproachWidth) return false;
    return (
      (x >= BRIDGE_WEST_APPROACH_START.x - BRIDGE_BOUNDARY_EPSILON
        && x <= BRIDGE_WEST_DECK_EDGE.x + BRIDGE_BOUNDARY_EPSILON)
      || (x >= BRIDGE_EAST_DECK_EDGE.x - BRIDGE_BOUNDARY_EPSILON
        && x <= BRIDGE_EAST_APPROACH_END.x + BRIDGE_BOUNDARY_EPSILON)
    );
  }

  /** Walkable harbor pier plus mooring slips. Hull water stays sailable. */
  public static isPierDeck(x: number, z: number): boolean {
    const slipWidth = 2.35;
    const hullKeepout = HARBOR_PIER_DECK.hullKeepout;
    const dock = this.landmark("dock");
    const onVisualPier =
      Math.abs(x - dock.x) <= HARBOR_PIER_DECK.halfWidthX &&
      Math.abs(z - dock.z) <= HARBOR_PIER_DECK.halfLengthZ &&
      Math.hypot(x - HARBOR_DOCK.boatPosition.x, z - HARBOR_DOCK.boatPosition.z) > hullKeepout &&
      Math.hypot(x - HARBOR_SKIFF_MOORING.boatPosition.x, z - HARBOR_SKIFF_MOORING.boatPosition.z) > hullKeepout;
    const southEdge = dock.z - HARBOR_PIER_DECK.halfLengthZ;
    const onShoreStairs =
      Math.abs(x - dock.x) <= HARBOR_PIER_DECK.stairHalfWidthX &&
      z <= southEdge + 0.25 &&
      z >= southEdge - HARBOR_PIER_DECK.stairRun;
    return (
      onVisualPier
      || onShoreStairs
      || this.isPierSlip(x, z, HARBOR_DOCK.playerPosition, HARBOR_DOCK.boatPosition, slipWidth, hullKeepout)
      || this.isPierSlip(x, z, HARBOR_SKIFF_MOORING.playerPosition, HARBOR_SKIFF_MOORING.boatPosition, slipWidth, hullKeepout)
    );
  }

  /** Walkable plank top of the harbor pier in world Y. */
  public static pierDeckSurfaceY(): number {
    const dock = this.landmark("dock");
    return this.terrainHeight(dock.x, dock.z) + dock.yOffset + HARBOR_PIER_DECK.deckSurfaceAssetY;
  }

  private static isPierSlip(
    x: number,
    z: number,
    apron: { x: number; z: number },
    hull: { x: number; z: number },
    halfWidth: number,
    hullKeepout: number
  ): boolean {
    const spanX = hull.x - apron.x;
    const spanZ = hull.z - apron.z;
    const span = Math.hypot(spanX, spanZ);
    if (span <= hullKeepout) return false;
    if (Math.hypot(x - hull.x, z - hull.z) <= hullKeepout) return false;
    // End the walkway before the hull so the keepout circle is not ringed by
    // an unsailable slip band that traps a departing boat.
    const endX = hull.x - (spanX / span) * hullKeepout;
    const endZ = hull.z - (spanZ / span) * hullKeepout;
    return pointToSegmentDistance(x, z, apron.x, apron.z, endX, endZ) <= halfWidth;
  }

  public static isWater(x: number, z: number): boolean {
    return this.waterSignedDistance(x, z) > 0
      && !this.isBridgeDeck(x, z)
      && !this.isBridgeApproach(x, z)
      && !this.isPierDeck(x, z);
  }

  public static fishingHabitatAt(x: number, z: number): FishingHabitatId | null {
    if (!this.isWater(x, z)) return null;
    const marine = this.marineSampleAt(x, z);
    if (marine.ecologyWeights["ecology.sunreach"] > marine.ecologyWeights["ecology.neva"]) {
      if (marine.reefInfluence > 0.08 || marine.signedShoreDistance <= 58) return "coast";
      return "offshore";
    }
    const coastDistance = z - this.coastlineZ(x);
    if (coastDistance <= 0) return "river";
    // Lake is the authored estuary lagoon, not a global nearshore carp band.
    // Open sea and beaches classify as coast; the Act 5 story school at
    // coastlineZ(18)+12 stays lake via estuary influence.
    if (coastDistance <= 24 && this.estuaryInfluence(x, z) > 0.08) return "lake";
    if (coastDistance <= 130) return "coast";
    return "offshore";
  }

  public static nearbyFishingHabitat(x: number, z: number, reachMeters: number = 4.5): FishingHabitatId | null {
    return this.fishingAccessAt(x, z, reachMeters).habitat;
  }

  public static fishingAccessClearanceAt(
    x: number,
    z: number,
    bankSample?: RiverBankSample
  ): number {
    const bank = bankSample ?? this.riverBankSample(x, z);
    if (bank.waterEdgeDistance < -0.2) return 0;
    let clearance = 0;
    for (const reserve of RIVER_FISHING_ACCESS_RESERVES) {
      if (reserve.side !== bank.side) continue;
      const longitudinal = 1 - smoothstep(
        reserve.halfLengthMeters,
        reserve.halfLengthMeters + 3,
        Math.abs(z - reserve.z)
      );
      const approach = smoothstep(-0.2, 0.45, bank.waterEdgeDistance)
        * (1 - smoothstep(
          reserve.approachDepthMeters,
          reserve.approachDepthMeters + 3,
          bank.waterEdgeDistance
        ));
      clearance = Math.max(clearance, longitudinal * approach);
    }
    return clamp01(clearance);
  }

  public static fishingAccessAt(x: number, z: number, reachMeters: number = 4.5): FishingAccessSample {
    if (this.isBridgeDeck(x, z)) {
      return {
        habitat: "river",
        accessible: true,
        target: { x: this.riverCenterX(z), z },
        distanceMeters: 0,
        side: x < this.riverCenterX(z) ? "left" : "right",
        reason: "bridge"
      };
    }
    if (this.isPierDeck(x, z)) {
      return {
        habitat: "coast",
        accessible: true,
        target: { x, z: this.coastlineZ(x) + Math.min(2, reachMeters) },
        distanceMeters: 0,
        side: null,
        reason: "pier"
      };
    }
    const direct = this.fishingHabitatAt(x, z);
    if (direct) {
      return {
        habitat: direct,
        accessible: true,
        target: { x, z },
        distanceMeters: 0,
        side: null,
        reason: "water"
      };
    }

    const island = this.islandAt(x, z);
    const marine = this.marineSampleAt(x, z);
    if (
      island === "island.sunreach"
      && marine.signedShoreDistance <= 0
      && marine.signedShoreDistance > -reachMeters
    ) {
      const epsilon = 0.5;
      const gradientX = this.marineSampleAt(x + epsilon, z).signedShoreDistance
        - this.marineSampleAt(x - epsilon, z).signedShoreDistance;
      const gradientZ = this.marineSampleAt(x, z + epsilon).signedShoreDistance
        - this.marineSampleAt(x, z - epsilon).signedShoreDistance;
      const gradientLength = Math.hypot(gradientX, gradientZ);
      if (gradientLength > 0.0001) {
        const distance = Math.abs(marine.signedShoreDistance) + 1.2;
        const target = {
          x: x + gradientX / gradientLength * distance,
          z: z + gradientZ / gradientLength * distance
        };
        const habitat = this.fishingHabitatAt(target.x, target.z);
        const accessible = habitat !== null && this.isWalkable(x, z) && this.terrainNormalY(x, z) >= 0.7;
        return {
          habitat: accessible ? habitat : null,
          accessible,
          target: accessible ? target : null,
          distanceMeters: Math.abs(marine.signedShoreDistance),
          side: null,
          reason: accessible ? "coast" : "blocked"
        };
      }
    }

    const bank = this.riverBankSample(x, z);
    const riverEligible = z <= this.coastlineZ(x) + 1.5
      && bank.waterEdgeDistance >= 0
      && bank.waterEdgeDistance <= reachMeters;
    if (riverEligible) {
      const bankSlopeSupport = this.terrainNormalY(x, z);
      const reservedAccess = this.fishingAccessClearanceAt(x, z, bank);
      const direction = bank.side === "left" ? -1 : 1;
      const waterWidth = bank.side === "left"
        ? bank.section.leftWaterWidth
        : bank.section.rightWaterWidth;
      const target = {
        x: bank.section.centerX + direction * Math.max(0.4, waterWidth - 0.8),
        z
      };
      const accessible = this.isWalkable(x, z)
        && bankSlopeSupport >= 0.76
        && bank.fishingAccess >= 0.12
        && reservedAccess >= 0.42
        && this.isWater(target.x, target.z);
      return {
        habitat: accessible ? "river" : null,
        accessible,
        target: accessible ? target : null,
        distanceMeters: bank.waterEdgeDistance,
        side: bank.side,
        reason: accessible ? "bank" : "blocked"
      };
    }

    const coastDistance = z - this.coastlineZ(x);
    if (coastDistance > -reachMeters && coastDistance <= 0) {
      const target = { x, z: this.coastlineZ(x) + Math.min(2, reachMeters) };
      const habitat = this.fishingHabitatAt(target.x, target.z);
      const accessible = habitat !== null && this.isWalkable(x, z) && this.terrainNormalY(x, z) >= 0.7;
      return {
        habitat: accessible ? habitat : null,
        accessible,
        target: accessible ? target : null,
        distanceMeters: Math.abs(coastDistance),
        side: null,
        reason: accessible ? "coast" : "blocked"
      };
    }
    return {
      habitat: null,
      accessible: false,
      target: null,
      distanceMeters: Number.POSITIVE_INFINITY,
      side: null,
      reason: "blocked"
    };
  }

  public static districtSampleAt(x: number, z: number): WorldDistrictSample {
    const farmAnchor = WORLD_LAYOUT_V5.anchors.starterFarm;
    const river = this.riverBankSample(x, z);
    const bridgeGateway = radialWeight(x, z, BRIDGE_CENTER.x, BRIDGE_CENTER.z, 8, 11);
    const westOfRiver = x < river.section.centerX;
    const separatorStrength = (1 - bridgeGateway) * (1 - smoothstep(5, 22, Math.abs(river.signedLateral)));
    let farm = Math.max(
      radialWeight(x, z, farmAnchor.x, farmAnchor.z, 26, 56),
      radialWeight(x, z, -92, -72, 34, 52) * 0.72
    );
    let village = Math.max(
      radialWeight(x, z, VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z, 28, 58),
      radialWeight(x, z, 30, -22, 18, 54) * 0.74
    );
    let harbor = radialWeight(x, z, HARBOR_MARKET.position.x, HARBOR_MARKET.position.z, 18, 36);
    let headland = radialWeight(x, z, LIGHTHOUSE_GATEWAY.x, LIGHTHOUSE_GATEWAY.z, 20, 52);
    const coastDistance = z - this.coastlineZ(x);
    let coast = clamp01(
      smoothstep(-42, -5, coastDistance)
      + radialWeight(x, z, -35, 66, 28, 80) * 0.42
    );
    if (separatorStrength > 0) {
      if (westOfRiver) {
        village *= 1 - separatorStrength * 0.74;
        harbor *= 1 - separatorStrength * 0.82;
      } else {
        farm *= 1 - separatorStrength * 0.76;
        headland *= 1 - separatorStrength * 0.54;
      }
    }
    farm = Math.max(farm, radialWeight(x, z, farmAnchor.x, farmAnchor.z, 12, 10));
    village = Math.max(village, radialWeight(x, z, VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z, 14, 9));
    harbor = Math.max(harbor, radialWeight(x, z, HARBOR_MARKET.position.x, HARBOR_MARKET.position.z, 12, 8));
    headland = Math.max(headland, radialWeight(x, z, LIGHTHOUSE_GATEWAY.x, LIGHTHOUSE_GATEWAY.z, 12, 8));
    coast = Math.max(coast, headland * 0.54);
    return {
      farm: clamp01(farm),
      village: clamp01(village),
      harbor: clamp01(harbor),
      headland: clamp01(headland),
      coast: clamp01(coast),
      riverCorridor: clamp01(Math.max(river.channel, river.lowerBank, river.upperBank, river.floodplain * 0.82))
    };
  }

  public static regionAt(x: number, z: number): WorldRegionId {
    if (this.isInterior(x, z)) return "region.farm";
    if (this.islandAt(x, z) === "island.sunreach") return sunreachRegionAt(x, z);
    const marine = this.marineSampleAt(x, z);
    if (
      this.isWater(x, z)
      && marine.openWaterExposure >= 0.38
      && x > 235
      && x < 390
    ) return "region.open_channel";
    if (
      this.isWater(x, z)
      && marine.ecologyWeights["ecology.sunreach"] > marine.ecologyWeights["ecology.neva"]
    ) return "region.sunreach_cove";
    const habitat = this.fishingHabitatAt(x, z);
    if (habitat === "offshore" || z >= 130) return "region.offshore";
    const district = this.districtSampleAt(x, z);
    const scores = [
      { id: "region.farm" as const, score: district.farm },
      { id: "region.village" as const, score: district.village },
      { id: "region.harbor" as const, score: district.harbor },
      { id: "region.coast" as const, score: Math.max(district.headland, district.coast) }
    ];
    scores.sort((left, right) => right.score - left.score);
    return scores[0].id;
  }

  public static isInterior(x: number, z: number): boolean {
    return isInsideFarmhouseInterior(x, z);
  }

  /** Flatten Rapier/visual heightfield a cell beyond the pocket so interior walls do not climb the world lip. */
  private static isInteriorTerrainPad(x: number, z: number): boolean {
    const pad = 3;
    return (
      x >= FARMHOUSE_INTERIOR_BOUNDS.minX - pad &&
      x <= FARMHOUSE_INTERIOR_BOUNDS.maxX + pad &&
      z >= FARMHOUSE_INTERIOR_BOUNDS.minZ - pad &&
      z <= FARMHOUSE_INTERIOR_BOUNDS.maxZ + pad
    );
  }

  /**
   * Presentation rain hit for roofs and interiors. Gameplay weather is unchanged.
   * Village pads use authored envelopes; farmhouse/mill/lighthouse use landmark radii.
   */
  public static rainShelterHit(x: number, z: number): { height: number } | null {
    if (this.isInterior(x, z)) {
      return { height: FARMHOUSE_INTERIOR_BOUNDS.ceilingY };
    }
    for (const pad of WORLD_ARCHITECTURE_PADS) {
      if (!pointInRotatedEnvelope(x, z, pad.center, pad.rotationY, pad.envelope[0], pad.envelope[1])) {
        continue;
      }
      const rise = Math.max(3.6, Math.max(pad.envelope[0], pad.envelope[1]) * 0.85);
      return { height: this.terrainHeight(x, z) + rise };
    }
    for (const shelter of RAIN_SHELTER_LANDMARKS) {
      const landmark = this.landmark(shelter.id);
      if (Math.hypot(x - landmark.x, z - landmark.z) <= shelter.radius) {
        return { height: this.terrainHeight(x, z) + shelter.rise };
      }
    }
    return null;
  }

  public static isWalkable(x: number, z: number): boolean {
    if (this.isInterior(x, z)) return true;
    const islandId = this.islandAt(x, z);
    if (islandId === "island.sunreach") return !this.isWater(x, z);
    return (
      x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX &&
      z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ &&
      (!this.isWater(x, z) || this.isBridgeDeck(x, z) || this.isPierDeck(x, z))
    );
  }

  public static isSailable(x: number, z: number): boolean {
    return (
      x >= SAILABLE_BOUNDS.minX && x <= SAILABLE_BOUNDS.maxX &&
      z >= SAILABLE_BOUNDS.minZ && z <= SAILABLE_BOUNDS.maxZ &&
      this.isWater(x, z) && !this.isBridgeDeck(x, z) && !this.isPierDeck(x, z)
    );
  }

  private static nearestValid(
    point: WorldPoint,
    predicate: (x: number, z: number) => boolean,
    maximumRadius: number,
    fallback: Readonly<WorldPoint>
  ): WorldPoint {
    if (predicate(point.x, point.z)) return { ...point };
    for (let radius = 0.5; radius <= maximumRadius; radius += 0.5) {
      const steps = Math.max(16, Math.ceil(radius * 5));
      for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const candidate = { x: point.x + Math.cos(angle) * radius, z: point.z + Math.sin(angle) * radius };
        if (predicate(candidate.x, candidate.z)) return candidate;
      }
    }
    return { ...fallback };
  }

  public static nearestValidGround(point: WorldPoint, maximumRadius: number = 72): WorldPoint {
    const sunreachPatch = WORLD_ISLAND_DEFINITIONS["island.sunreach"].terrainPatch;
    const nevaPatch = WORLD_ISLAND_DEFINITIONS["island.neva"].terrainPatch;
    const sunreachNearest = Math.hypot(point.x - sunreachPatch.center.x, point.z - sunreachPatch.center.z)
      < Math.hypot(point.x - nevaPatch.center.x, point.z - nevaPatch.center.z);
    return this.nearestValid(
      point,
      (x, z) => this.isWalkable(x, z),
      maximumRadius,
      sunreachNearest ? SUNREACH_ANCHORS.dockPlayer : WORLD_SPAWN.playerPosition
    );
  }

  public static nearestValidSailable(point: WorldPoint, maximumRadius: number = 120): WorldPoint {
    const sunreachPatch = WORLD_ISLAND_DEFINITIONS["island.sunreach"].terrainPatch;
    const nevaPatch = WORLD_ISLAND_DEFINITIONS["island.neva"].terrainPatch;
    const sunreachNearest = Math.hypot(point.x - sunreachPatch.center.x, point.z - sunreachPatch.center.z)
      < Math.hypot(point.x - nevaPatch.center.x, point.z - nevaPatch.center.z);
    const fallback = sunreachNearest
      ? SUNREACH_ANCHORS.dockBoat
      : { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z };
    return this.nearestValid(point, (x, z) => this.isSailable(x, z), maximumRadius, fallback);
  }

  private static applyPlateau(
    height: number,
    x: number,
    z: number,
    targetHeight: number,
    centerX: number,
    centerZ: number,
    halfWidth: number,
    halfDepth: number,
    feather: number
  ): number {
    return THREE.MathUtils.lerp(height, targetHeight, boxWeight(x, z, centerX, centerZ, halfWidth, halfDepth, feather));
  }

  /** Authored landform before route grading. Never calls terrainHeight. */
  public static naturalTerrainHeight(x: number, z: number): number {
    if (this.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
      return sunreachNaturalTerrainHeight(x, z);
    }
    const westernRidge = radialWeight(x, z, -128, -18, 34, 62) * 4.6;
    const northernRidge = radialWeight(x, z, -12, -132, 48, 68) * 3.3;
    const easternUplands = radialWeight(x, z, 68, -58, 28, 48) * 5.1;
    const lighthouseHeadland = radialWeight(x, z, -92, 73, 12, 28) * 8.6;
    const harborShoulder = radialWeight(x, z, 68, 54, 12, 24) * 0.9;
    const farmBasin = radialWeight(x, z, -65, -55, 18, 26) * -1.15;
    const authoredPlanes =
      Math.sin((x + z * 0.72) * 0.018) * 0.54 +
      Math.sin((x * 0.36 - z) * 0.031) * 0.32 +
      Math.cos((x + z) * 0.009) * 0.42;
    let height = 1.8 + westernRidge + northernRidge + easternUplands + lighthouseHeadland + harborShoulder + farmBasin + authoredPlanes;

    const riverSection = this.riverSectionAt(z);
    const riverSignedLateral = x - riverSection.centerX;
    const riverSide: RiverSide = riverSignedLateral < 0 ? "left" : "right";
    const riverDistance = Math.abs(riverSignedLateral);
    const riverWidth = riverSide === "left"
      ? riverSection.leftWaterWidth
      : riverSection.rightWaterWidth;
    const riverBankRun = riverSide === "left" ? riverSection.leftBankRun : riverSection.rightBankRun;
    const riverFloodplain = riverSide === "left"
      ? riverSection.leftFloodplainWidth
      : riverSection.rightFloodplainWidth;
    const riverDeposition = riverSide === "left" ? riverSection.leftDeposition : riverSection.rightDeposition;
    const thalwegDistance = Math.abs(riverSignedLateral - riverSection.thalwegOffset);
    const riverBed = riverSection.bedElevation
      - (1 - smoothstep(0.25, Math.max(1.8, riverWidth * 0.48), thalwegDistance)) * 0.24;
    const riverBankTop = Math.min(
      height,
      0.42 + riverDeposition * 0.32 + smoothstep(-180, 82, z) * 0.2
    );
    if (riverDistance <= riverWidth + riverBankRun + riverFloodplain) {
      const bankRise = smoothstep(riverWidth - 0.35, riverWidth + riverBankRun, riverDistance);
      const lowerToUpper = THREE.MathUtils.lerp(riverBed, riverBankTop, bankRise);
      const floodplainBlend = smoothstep(
        riverWidth + riverBankRun,
        riverWidth + riverBankRun + riverFloodplain,
        riverDistance
      );
      height = THREE.MathUtils.lerp(lowerToUpper, height, floodplainBlend);
    }

    const coastDistance = z - this.coastlineZ(x);
    const coastProfile = this.coastProfile(x);
    if (coastDistance > 0) {
      const nearshoreShelf = coastProfile.rockShelf * (1 - smoothstep(0.2, 8, coastDistance)) * 0.28;
      const coastalShelf = -0.48 + nearshoreShelf - Math.min(16, coastDistance * 0.11);
      const mouth = WORLD_LAYOUT_V5.riverMouth;
      const channelCrossSection = 1 - smoothstep(
        riverWidth - 0.8,
        riverWidth + 3.8,
        riverDistance
      );
      const channelContinuation = 1 - smoothstep(0, 24, Math.max(0, z - mouth.z));
      const channelDepth = riverSection.bedElevation - Math.min(0.42, Math.max(0, z - mouth.z) * 0.018);
      const channelBlend = this.estuaryInfluence(x, z) * channelCrossSection * channelContinuation;
      height = THREE.MathUtils.lerp(coastalShelf, Math.min(coastalShelf, channelDepth), channelBlend);
    } else if (coastDistance > -34) {
      const landward = -coastDistance;
      const shoreInfluence = 1 - smoothstep(24, 34, landward);
      const broadPlane = Math.sin(x * 0.081 + landward * 0.28) * 0.055;

      // Sand beaches rise slowly from the waterline before blending into the
      // inland landform. Their broad width gives the 600 m terrain grid enough
      // samples to read as a beach instead of one vertical triangle row.
      const beachGrade = 0.025
        + Math.min(landward, coastProfile.beachWidthMeters) * 0.045
        + broadPlane;
      const beachHeight = THREE.MathUtils.lerp(
        beachGrade,
        height,
        smoothstep(
          coastProfile.beachWidthMeters * 0.72,
          coastProfile.beachWidthMeters + 8,
          landward
        )
      );

      // Rocky coast keeps a low, irregular toe at the water. Terraces are
      // deliberately shallow so they read as broad stone planes rather than
      // stacked retaining walls.
      const shelfTerraces =
        smoothstep(2.8, 4.4, landward) * 0.11
        + smoothstep(7.2, 9.4, landward) * 0.16;
      const shelfGrade = 0.08
        + Math.min(landward, coastProfile.rockToeWidthMeters) * 0.055
        + shelfTerraces
        + broadPlane;
      const shelfHeight = THREE.MathUtils.lerp(
        shelfGrade,
        height,
        smoothstep(
          coastProfile.rockToeWidthMeters * 0.82,
          coastProfile.rockToeWidthMeters + 12,
          landward
        )
      );

      // Cliffs begin behind a walkable rock/sand toe. This preserves the
      // lighthouse headland silhouette while removing the repeated sheer wall
      // directly at sea level seen around the harbor and ordinary coast.
      const cliffLip = 8.8 + coastProfile.headland * 5.2 + coastProfile.rockShelf * 1.3;
      const cliffToeHeight = 0.12
        + Math.min(landward, coastProfile.cliffRiseStartMeters) * 0.06
        + broadPlane;
      const cliffFaceHeight = THREE.MathUtils.lerp(
        cliffToeHeight,
        cliffLip,
        smoothstep(
          coastProfile.cliffRiseStartMeters,
          coastProfile.cliffRiseEndMeters,
          landward
        )
      );
      const cliffHeight = THREE.MathUtils.lerp(
        cliffFaceHeight,
        height,
        smoothstep(
          coastProfile.cliffRiseEndMeters,
          coastProfile.cliffRiseEndMeters + 9,
          landward
        )
      );
      const authoredShoreHeight =
        beachHeight * coastProfile.beach
        + shelfHeight * coastProfile.rockShelf
        + cliffHeight * coastProfile.cliff;
      height = THREE.MathUtils.lerp(height, authoredShoreHeight, shoreInfluence * 0.98);

      // Broad, asymmetric silt shelves soften the dry banks immediately before
      // the mouth while leaving the canonical water sign untouched.
      const bankDistance = riverDistance - riverWidth;
      const bankShelf = 1 - smoothstep(0.4, 7.8, Math.max(0, bankDistance));
      const bankSide = riverSide === "left" ? 1 : -1;
      const siltHeight = 0.12 + landward * 0.048 + bankSide * 0.055;
      const siltBlend = this.estuaryInfluence(x, z)
        * bankShelf
        * smoothstep(-0.2, 2.8, bankDistance)
        * (0.48 + riverDeposition * 0.32);
      height = THREE.MathUtils.lerp(height, Math.min(height, siltHeight), siltBlend);

      // The coast profile owns the banks, but it must not refill the river
      // channel as it approaches the shoreline.
      const channelRestoration = 1 - smoothstep(riverWidth - 0.4, riverWidth + 3.8, riverDistance);
      height = THREE.MathUtils.lerp(height, riverBed, channelRestoration);
    }

    height = this.applyPlateau(height, x, z, 1.2, -65, -55, 17, 13.5, 9);
    height = this.applyPlateau(height, x, z, 1.16, -57, -53.5, 7.5, 7.0, 6.5);
    height = this.applyPlateau(height, x, z, 2.05, RIVER_CROSSING.x, RIVER_CROSSING.z, 5.5, 5.0, 6.5);
    height = this.applyPlateau(height, x, z, 6.4, VILLAGE_PLAZA.x, VILLAGE_PLAZA.z, 18, 16, 11);
    height = this.applyPlateau(height, x, z, 6.3, 60, -60, 9, 8, 8);
    height = this.applyPlateau(height, x, z, 6.5, STARTER_MILL_WORLD.x, STARTER_MILL_WORLD.z, 7.2, 7.2, 6.5);
    // Keep the working harbor apron flat inland, then release it into the
    // canonical beach profile before the waterline. The previous plateau
    // remained fully active under the sea and created a one-metre vertical
    // green wall around the dock.
    const harborApronWeight = boxWeight(x, z, 68, 62, 8, 4.5, 6.5)
      * smoothstep(0.35, 4.8, Math.max(0, -coastDistance));
    height = THREE.MathUtils.lerp(height, 1.05, harborApronWeight);
    height = this.applyPlateau(height, x, z, 13.6, -92, 74, 7.4, 5.8, 8.5);
    height = this.applyPlateau(height, x, z, 0.0, FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z, 4.5, 3.8, 2.0);

    // The bridge foundation belongs on the riverbed. The approaches rise smoothly
    // to meet its deck at entrySurfaceY (1.4m) and connect flush to the banks.
    const bridgeLateralDistance = Math.abs(z - BRIDGE_CENTER.z);
    const bridgeAcross = 1 - smoothstep(
      BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + 0.4,
      BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + BRIDGE_WORLD_PROFILE.lateralBlendWidth,
      bridgeLateralDistance
    );
    const westApproachProgress = clamp01(
      (x - BRIDGE_WEST_APPROACH_START.x) / BRIDGE_WORLD_PROFILE.approachLength
    );
    const eastApproachProgress = clamp01(
      (x - BRIDGE_EAST_DECK_EDGE.x) / BRIDGE_WORLD_PROFILE.approachLength
    );

    // East approach (smooth ramp towards the village market). The bridge profile
    // owns the approach length so the terrain and route corridor cannot drift.
    if (
      x >= BRIDGE_EAST_DECK_EDGE.x - BRIDGE_BOUNDARY_EPSILON
      && x <= BRIDGE_EAST_APPROACH_END.x + BRIDGE_BOUNDARY_EPSILON
      && bridgeAcross > 0
    ) {
      const eastRampHeight = THREE.MathUtils.lerp(
        BRIDGE_WORLD_PROFILE.entrySurfaceY,
        BRIDGE_WORLD_PROFILE.eastBankSurfaceY,
        eastApproachProgress
      );
      height = THREE.MathUtils.lerp(height, eastRampHeight, bridgeAcross);
    }

    // West approach (smooth ramp towards the starter farm basin).
    if (
      x >= BRIDGE_WEST_APPROACH_START.x - BRIDGE_BOUNDARY_EPSILON
      && x <= BRIDGE_WEST_DECK_EDGE.x + BRIDGE_BOUNDARY_EPSILON
      && bridgeAcross > 0
    ) {
      const westRampHeight = THREE.MathUtils.lerp(
        BRIDGE_WORLD_PROFILE.westBankSurfaceY,
        BRIDGE_WORLD_PROFILE.entrySurfaceY,
        westApproachProgress
      );
      height = THREE.MathUtils.lerp(height, westRampHeight, bridgeAcross);
    }

    return height;
  }

  /** Graded landform without the exact worked-road relief collider. */
  public static terrainBaseHeight(x: number, z: number): number {
    if (this.isInteriorTerrainPad(x, z)) {
      return FARMHOUSE_INTERIOR_BOUNDS.floorY;
    }
    const naturalHeight = this.naturalTerrainHeight(x, z);
    const route = this.nearestRouteDistance(x, z);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const gradingRadius = route.halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters;
    const bridgeCorridor =
      x >= BRIDGE_WEST_APPROACH_START.x &&
      x <= BRIDGE_EAST_APPROACH_END.x &&
      Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + BRIDGE_WORLD_PROFILE.lateralBlendWidth;
    if (
      route.distance >= gradingRadius
      || this.waterSignedDistance(x, z) > -0.35
      || this.isInterior(x, z)
      || bridgeCorridor
    ) return naturalHeight;

    const longitudinalSample = route.route.kind === "arterial" ? 2.4 : route.route.kind === "lane" ? 1.8 : 1.2;
    const before = this.naturalTerrainHeight(
      route.point.x - route.tangent.x * longitudinalSample,
      route.point.z - route.tangent.z * longitudinalSample
    );
    const after = this.naturalTerrainHeight(
      route.point.x + route.tangent.x * longitudinalSample,
      route.point.z + route.tangent.z * longitudinalSample
    );
    const corridorAverage = (before + naturalHeight + after) / 3;
    const lateralBlend = 1 - smoothstep(
      route.halfWidth * 0.38,
      gradingRadius,
      route.distance
    );
    const desiredDelta = corridorAverage - naturalHeight;
    const cappedDelta = THREE.MathUtils.clamp(desiredDelta, -0.45, 0.45);
    const junctionBlend = routeJunctionInfluence(x, z) * 0.18;
    return naturalHeight + cappedDelta * Math.max(lateralBlend, junctionBlend) * profile.gradingStrength;
  }

  public static roadSurfaceSample(x: number, z: number): RoadCrossSectionSample {
    const route = this.nearestRouteDistance(x, z);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const sample = sampleRoadCrossSection({
      routeId: route.route.id,
      routeKind: route.route.kind,
      profile,
      halfWidthMeters: route.halfWidth,
      lateralDistanceMeters: route.distance,
      distanceAlongRouteMeters: route.distanceAlongRoute
    });
    if (
      route.distance >= route.halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters * 0.78
      || this.waterSignedDistance(x, z) > -0.2
      || this.isInterior(x, z)
      || this.isBridgeDeck(x, z)
    ) {
      return { ...sample, surfaceOffsetMeters: 0 };
    }
    const bridgeGatewayDistance = Math.abs(x - BRIDGE_CENTER.x) - BRIDGE_HALF_SPAN;
    const bridgeGatewayBlend =
      bridgeGatewayDistance >= 0
      && bridgeGatewayDistance < BRIDGE_WORLD_PROFILE.gatewayDepthMeters
      && Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + profile.terrainFeatherMeters
        ? smoothstep(0, BRIDGE_WORLD_PROFILE.gatewayDepthMeters, bridgeGatewayDistance)
        : 1;
    return {
      ...sample,
      surfaceOffsetMeters: sample.surfaceOffsetMeters * bridgeGatewayBlend
    };
  }

  /** Final canonical terrain height, including physical worked-road relief. */
  public static terrainHeight(x: number, z: number): number {
    return this.terrainBaseHeight(x, z) + this.roadSurfaceSample(x, z).surfaceOffsetMeters;
  }

  private static rawTraversalSurfaceSample(x: number, z: number): RawTraversalSurfaceSample {
    if (this.isInterior(x, z)) {
      return { height: FARMHOUSE_INTERIOR_BOUNDS.floorY, source: "interior" };
    }
    if (this.isBridgeDeck(x, z)) {
      const localX = THREE.MathUtils.clamp(
        x - BRIDGE_CENTER.x,
        -BRIDGE_DECK_COLLISION_HALF_SPAN,
        BRIDGE_DECK_COLLISION_HALF_SPAN
      );
      const segmentIndex = THREE.MathUtils.clamp(
        Math.round((localX + BRIDGE_DECK_COLLISION_HALF_SPAN) / BRIDGE_DECK_COLLISION_SEGMENT_SPACING),
        0,
        BRIDGE_DECK_COLLISION_TOPS_LOCAL_Y.length - 1
      );
      return {
        height: this.terrainHeight(BRIDGE_CENTER.x, BRIDGE_CENTER.z)
          + BRIDGE_ROOT_Y_OFFSET
          + BRIDGE_DECK_COLLISION_TOPS_LOCAL_Y[segmentIndex],
        source: "bridge"
      };
    }
    if (this.isPierDeck(x, z)) {
      return { height: this.pierDeckSurfaceY(), source: "pier" };
    }

    const terrainHeight = sampleTraversalBasePlane(x, z);
    const roadHeight = sampleTraversalRoadPlane(x, z);
    if (roadHeight !== null && roadHeight >= terrainHeight - TRAVERSAL_TRIANGLE_EPSILON) {
      return { height: Math.max(terrainHeight, roadHeight), source: "road" };
    }
    return { height: terrainHeight, source: "terrain" };
  }

  /**
   * Exact deterministic support represented by the rendered/Rapier terrain
   * grid, conformed indexed road triangles, and authored traversal overrides.
   */
  public static traversalSurfaceSample(
    x: number,
    z: number,
    sampleDistance: number = 0.45
  ): TraversalSurfaceSample {
    if (
      cachedTraversalSurfaceQuery &&
      cachedTraversalSurfaceQuery.x === x &&
      cachedTraversalSurfaceQuery.z === z &&
      cachedTraversalSurfaceQuery.sampleDistance === sampleDistance
    ) {
      return cachedTraversalSurfaceQuery.result;
    }

    const center = this.rawTraversalSurfaceSample(x, z);
    let normal: TraversalSurfaceSample["normal"] = { x: 0, y: 1, z: 0 };
    if (center.source === "terrain" || center.source === "road") {
      const safeDistance = Math.max(0.01, sampleDistance);
      const left = this.rawTraversalSurfaceSample(x - safeDistance, z).height;
      const right = this.rawTraversalSurfaceSample(x + safeDistance, z).height;
      const back = this.rawTraversalSurfaceSample(x, z - safeDistance).height;
      const front = this.rawTraversalSurfaceSample(x, z + safeDistance).height;
      const normalX = left - right;
      const normalY = safeDistance * 2;
      const normalZ = back - front;
      const length = Math.hypot(normalX, normalY, normalZ);
      normal = length > 1e-8
        ? { x: normalX / length, y: normalY / length, z: normalZ / length }
        : { x: 0, y: 1, z: 0 };
    }
    const result: TraversalSurfaceSample = {
      height: center.height,
      normal,
      source: center.source
    };
    cachedTraversalSurfaceQuery = { x, z, sampleDistance, result };
    return result;
  }

  public static traversalSurfaceHeight(x: number, z: number): number {
    return this.traversalSurfaceSample(x, z).height;
  }

  /** Y component of the terrain normal without allocating a Vector3. */
  public static terrainNormalY(x: number, z: number, sampleDistance: number = 0.45): number {
    const left = this.terrainHeight(x - sampleDistance, z);
    const right = this.terrainHeight(x + sampleDistance, z);
    const back = this.terrainHeight(x, z - sampleDistance);
    const front = this.terrainHeight(x, z + sampleDistance);
    const nx = left - right;
    const ny = sampleDistance * 2;
    const nz = back - front;
    const length = Math.hypot(nx, ny, nz);
    return length > 1e-8 ? ny / length : 1;
  }

  public static terrainNormal(x: number, z: number, sampleDistance: number = 0.45): THREE.Vector3 {
    const left = this.terrainHeight(x - sampleDistance, z);
    const right = this.terrainHeight(x + sampleDistance, z);
    const back = this.terrainHeight(x, z - sampleDistance);
    const front = this.terrainHeight(x, z + sampleDistance);
    return new THREE.Vector3(left - right, sampleDistance * 2, back - front).normalize();
  }

  public static nearestRouteDistance(x: number, z: number): RouteProjection {
    if (cachedRouteQuery && cachedRouteQuery.x === x && cachedRouteQuery.z === z) {
      return cachedRouteQuery.result;
    }
    const routes = COMPILED_WORLD_ROUTES;
    const minCellX = routeIndexCell(x - ROUTE_INDEX_PADDING_METERS);
    const maxCellX = routeIndexCell(x + ROUTE_INDEX_PADDING_METERS);
    const minCellZ = routeIndexCell(z - ROUTE_INDEX_PADDING_METERS);
    const maxCellZ = routeIndexCell(z + ROUTE_INDEX_PADDING_METERS);
    ROUTE_CANDIDATE_KEYS.clear();
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (const reference of ROUTE_SEGMENT_INDEX.get(routeIndexKey(cellX, cellZ)) ?? []) {
          ROUTE_CANDIDATE_KEYS.add(reference.routeIndex * 10000 + reference.segmentIndex);
        }
      }
    }

    // Index miss means the point is outside every road corridor + padding, so
    // path/shoulder/grading influence is already zero. Scanning every segment
    // here was the cover-scatter timeout: 7k grass attempts × four height
    // samples each used to flatten the whole network.
    if (ROUTE_CANDIDATE_KEYS.size === 0) {
      cachedRouteQuery = { x, z, result: FAR_FROM_ROUTES };
      return FAR_FROM_ROUTES;
    }

    let bestDistance = Number.POSITIVE_INFINITY;
    let bestProjection: RouteProjection = FAR_FROM_ROUTES;
    for (const packed of ROUTE_CANDIDATE_KEYS) {
      const routeIndex = Math.floor(packed / 10000);
      const segmentIndex = packed - routeIndex * 10000;
      const pRoute = routes[routeIndex];
      const seg = pRoute.segments[segmentIndex];
      const dx = seg.dx;
      const dz = seg.dz;
      const progress = clamp01(((x - seg.start.x) * dx + (z - seg.start.z) * dz) / seg.lengthSquared);
      const projX = seg.start.x + dx * progress;
      const projZ = seg.start.z + dz * progress;
      const dist = Math.hypot(x - projX, z - projZ);

      if (dist < bestDistance) {
        bestDistance = dist;
        bestProjection = {
          distance: dist,
          halfWidth: pRoute.halfWidth,
          shoulderWidthMeters: pRoute.shoulderWidthMeters,
          terrainFeatherMeters: pRoute.terrainFeatherMeters,
          route: pRoute.route,
          point: { x: projX, z: projZ },
          tangent: seg.tangent,
          normal: { x: -seg.tangent.z, z: seg.tangent.x },
          routeIndex,
          segmentIndex,
          distanceAlongRoute: THREE.MathUtils.lerp(seg.cumulativeStart, seg.cumulativeEnd, progress)
        };
      }
    }

    cachedRouteQuery = { x, z, result: bestProjection };
    return bestProjection;
  }

  public static pathInfluence(x: number, z: number): number {
    const route = this.nearestRouteDistance(x, z);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const routeInfluence = 1 - smoothstep(
      route.halfWidth * 0.72,
      route.halfWidth + profile.shoulderWidthMeters * 0.72,
      route.distance
    );
    return Math.max(routeInfluence, routeJunctionInfluence(x, z));
  }

  public static pathShoulderInfluence(x: number, z: number): number {
    const route = this.nearestRouteDistance(x, z);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const outer = 1 - smoothstep(
      route.halfWidth + profile.shoulderWidthMeters * 0.18,
      route.halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters,
      route.distance
    );
    return Math.max(0, outer, routeJunctionInfluence(x, z) * 0.45);
  }

  /** Full roadside envelope used to keep large cover out of the graded corridor. */
  public static roadsideInfluence(x: number, z: number): number {
    const route = this.nearestRouteDistance(x, z);
    const corridor = 1 - smoothstep(
      route.halfWidth + route.shoulderWidthMeters * 0.28,
      route.halfWidth + route.shoulderWidthMeters + route.terrainFeatherMeters,
      route.distance
    );
    return Math.max(corridor, routeJunctionInfluence(x, z) * 0.82);
  }

  public static farmSoilInfluence(x: number, z: number): number {
    if (this.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
      const localX = x - 455;
      const localZ = z - 5;
      return clamp01(1 - smoothstep(0.82, 1.16, Math.hypot(localX / 27, localZ / 31)));
    }
    const localX = x - STARTER_FARM_LAYOUT.origin.x;
    const localZ = z - STARTER_FARM_LAYOUT.origin.z;
    const ellipse = 1 - smoothstep(0.88, 1.24, Math.hypot(localX / 7.2, localZ / 6.2));
    const irregular = 0.94 + Math.sin(localX * 0.72 + localZ * 0.31) * 0.035;
    const homestead = 1 - smoothstep(0.9, 1.18, Math.hypot((x - 60) / 9.2, (z + 60) / 9.2));
    return clamp01(Math.max(ellipse * irregular, homestead * 0.9));
  }

  public static shorelineWetness(x: number, z: number): number {
    if (this.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
      const marine = this.marineSampleAt(x, z);
      const drainage = sunreachDrainageSample(x, z);
      return clamp01(
        (1 - smoothstep(0.12, 2.7, Math.abs(marine.signedShoreDistance))) * 0.86
        + drainage.moisturePotential * 0.48
      );
    }
    const coastDistance = z - this.coastlineZ(x);
    const coastalWetness = 1 - smoothstep(
      0.16,
      this.coastProfile(x).wetBandWidthMeters,
      Math.abs(coastDistance)
    );
    const riverWetness = coastDistance <= 1.5 ? this.riverBankSample(x, z).wetness : 0;
    return Math.max(coastalWetness, riverWetness);
  }

  public static terrainSurfaceSample(x: number, z: number, sampledNormalY?: number): TerrainSurfaceSample {
    if (this.terrainPatchAt(x, z)?.islandId === "island.sunreach") {
      return this.sunreachTerrainSurfaceSample(x, z, sampledNormalY);
    }
    const waterDistance = this.waterSignedDistance(x, z);
    const river = this.riverBankSample(x, z);
    const route = this.nearestRouteDistance(x, z);
    const dryRoute = waterDistance < -0.2 ? 1 : 0;

    // Terrain-level path warmth uses the same compiled centerline, width, and
    // junction envelope as the visible ribbon. A second village-wide dirt
    // wash made meadow triangles read as road.
    const junction = routeJunctionInfluence(x, z) * dryRoute;
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const packedCore = (1 - smoothstep(
      route.halfWidth * 0.16,
      route.halfWidth + profile.shoulderWidthMeters * 0.4,
      route.distance
    )) * dryRoute;
    const shoulderOuter = (1 - smoothstep(
      route.halfWidth + profile.shoulderWidthMeters * 0.16,
      route.halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters,
      route.distance
    )) * dryRoute;
    const path = Math.max(packedCore, junction * 0.72);
    const shoulder = Math.max(
      0,
      shoulderOuter - packedCore * 0.72,
      junction * 0.22
    ) * 0.52;
    const farm = this.farmSoilInfluence(x, z);
    const wet = this.shorelineWetness(x, z);
    const estuary = this.estuaryInfluence(x, z);
    const coastDistance = z - this.coastlineZ(x);
    const riverFringe = coastDistance <= 0
      ? Math.max(river.lowerBank, river.upperBank * 0.68, river.floodplain * river.deposition * 0.72)
      : 0;
    const normalY = sampledNormalY ?? this.terrainNormalY(x, z);
    const coastProfile = this.coastProfile(x);
    const coastBandWidth = Math.max(22, coastProfile.beachWidthMeters + 6);
    const coastBand = coastDistance <= 0 ? smoothstep(-coastBandWidth, -0.12, coastDistance) : 0;
    const slopeCliff = clamp01((0.76 - normalY) / 0.3);
    const cliff = clamp01(
      coastBand * coastProfile.cliff * (0.28 + slopeCliff * 0.92)
      + coastBand * coastProfile.rockShelf * slopeCliff * 0.48
    ) * (1 - estuary * 0.76);
    const siltShelf = estuary
      * Math.max(river.lowerBank, river.floodplain)
      * (0.35 + river.deposition * 0.65)
      * dryRoute;
    const beach = coastBand
      * (coastProfile.beach + coastProfile.rockShelf * 0.24)
      * (1 - cliff * 0.82)
      * (1 - estuary * 0.58);
    const meadowPattern = clamp01(
      0.48
      + Math.sin(x * 0.036 - z * 0.027) * 0.23
      + Math.sin((x + z) * 0.014 + 1.4) * 0.17
    );
    const drySoil = farm * (1 - wet * 0.35);
    const dampSoil = Math.max(
      farm * wet * 0.55,
      riverFringe * (0.48 + river.deposition * 0.28),
      siltShelf * 0.82
    );
    const riverbed = waterDistance > 0
      ? 0.82 + estuary * 0.12 + river.channel * 0.04 + river.erosion * 0.02
      : 0;
    const remaining = clamp01(1 - Math.max(path, shoulder, drySoil, dampSoil, beach, riverbed, cliff));
    return {
      weights: normalizedSurfaceWeights({
        grass: remaining * (1 - meadowPattern * 0.44) * (1 - siltShelf * 0.58),
        meadow: remaining * meadowPattern * 0.44 * (1 - siltShelf * 0.72),
        drySoil,
        dampSoil,
        path,
        shoulder,
        beach,
        riverbed,
        wetShoreline: wet * (0.56 + coastProfile.rockShelf * 0.22 + estuary * 0.22),
        cliff
      }),
      farmInfluence: farm,
      shorelineWetness: wet,
      river
    };
  }

  private static sunreachTerrainSurfaceSample(
    x: number,
    z: number,
    sampledNormalY?: number
  ): TerrainSurfaceSample {
    const marine = this.marineSampleAt(x, z);
    const drainage = sunreachDrainageSample(x, z);
    const route = this.nearestRouteDistance(x, z);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const dryRoute = marine.signedShoreDistance < -0.2 ? 1 : 0;
    const packedCore = (1 - smoothstep(
      route.halfWidth * 0.16,
      route.halfWidth + profile.shoulderWidthMeters * 0.4,
      route.distance
    )) * dryRoute;
    const shoulderOuter = (1 - smoothstep(
      route.halfWidth + profile.shoulderWidthMeters * 0.16,
      route.halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters,
      route.distance
    )) * dryRoute;
    const path = packedCore;
    const shoulder = Math.max(0, shoulderOuter - packedCore * 0.72) * 0.52;
    const farm = this.farmSoilInfluence(x, z);
    const wet = this.shorelineWetness(x, z);
    const normalY = sampledNormalY ?? this.terrainNormalY(x, z);
    const slopeCliff = clamp01((0.8 - normalY) / 0.34);
    const dryShoreBand = marine.signedShoreDistance <= 0
      ? 1 - smoothstep(0.2, 18, -marine.signedShoreDistance)
      : 0;
    const beach = clamp01(
      dryShoreBand * (1 - drainage.saltExposure * 0.38) * (1 - slopeCliff * 0.72)
    );
    const cliff = clamp01(
      dryShoreBand * slopeCliff * (0.34 + drainage.saltExposure * 0.66)
      + slopeCliff * drainage.erosion * 0.46
    );
    const drySoil = clamp01(Math.max(
      farm * (1 - drainage.moisturePotential * 0.28),
      (0.22 + drainage.saltExposure * 0.24) * dryRoute * (1 - path)
    ));
    const dampSoil = clamp01(
      Math.max(farm * drainage.moisturePotential * 0.48, drainage.wash * drainage.deposition * 0.7)
      * dryRoute
    );
    const seabed = marine.signedShoreDistance > 0
      ? clamp01(0.78 + marine.shallowWaterInfluence * 0.12 + marine.reefInfluence * 0.1)
      : 0;
    const meadowPattern = clamp01(
      0.34
      + Math.sin(x * 0.031 - z * 0.026) * 0.15
      + drainage.moisturePotential * 0.32
      - drainage.saltExposure * 0.22
    );
    const protectedWeight = Math.max(path, shoulder, drySoil, dampSoil, beach, seabed, cliff);
    const remaining = clamp01(1 - protectedWeight);
    return {
      weights: normalizedSurfaceWeights({
        grass: remaining * (0.44 + drainage.moisturePotential * 0.24),
        meadow: remaining * meadowPattern,
        drySoil,
        dampSoil,
        path,
        shoulder,
        beach,
        riverbed: seabed,
        wetShoreline: wet * (0.38 + marine.reefInfluence * 0.24),
        cliff
      }),
      farmInfluence: farm,
      shorelineWetness: wet,
      river: this.riverBankSample(x, z),
      drainage
    };
  }

  public static terrainSurfaceWeights(x: number, z: number, sampledNormalY?: number): TerrainSurfaceWeights {
    return this.terrainSurfaceSample(x, z, sampledNormalY).weights;
  }

  public static terrainSurface(x: number, z: number): TerrainSurface {
    const weights = this.terrainSurfaceWeights(x, z);
    const entries: Array<[TerrainSurface, number]> = [
      ["grass", weights.grass], ["meadow", weights.meadow], ["dry-soil", weights.drySoil],
      ["damp-soil", weights.dampSoil], ["path", weights.path], ["shoulder", weights.shoulder],
      ["beach", weights.beach], ["riverbed", weights.riverbed], ["wet-shoreline", weights.wetShoreline],
      ["cliff", weights.cliff]
    ];
    return entries.reduce((best, entry) => entry[1] > best[1] ? entry : best, entries[0])[0];
  }

  public static landmark(id: LandmarkId): LandmarkLayout {
    const mill = STARTER_MILL_WORLD;
    const farmhouse = starterFarmsteadAnchor("farmhouse")!;
    const well = starterFarmsteadAnchor("well")!;
    const layouts: Record<LandmarkId, Omit<LandmarkLayout, "id">> = {
      farmhouse: { x: farmhouse.x, z: farmhouse.z, yOffset: 0, rotationY: farmhouse.rotationY, scale: farmhouse.scale },
      well: { x: well.x, z: well.z, yOffset: 0, rotationY: well.rotationY, scale: well.scale },
      bridge: { x: BRIDGE_CENTER.x, z: BRIDGE_CENTER.z, yOffset: BRIDGE_ROOT_Y_OFFSET, rotationY: 0, scale: 1 },
      "fish-market": {
        x: HARBOR_MARKET.position.x,
        z: HARBOR_MARKET.position.z,
        yOffset: 0,
        rotationY: HARBOR_MARKET.rotationY,
        scale: HARBOR_MARKET.scale
      },
      lighthouse: { x: -92, z: 74, yOffset: 0, rotationY: 0.08, scale: 0.58 },
      windmill: {
        x: mill.x,
        z: mill.z,
        yOffset: 0,
        rotationY: getProcessingStationRuntimeRotationY("struct.starter_mill"),
        scale: 0.62
      },
      "produce-stall": {
        x: VILLAGE_MARKET.position.x,
        z: VILLAGE_MARKET.position.z,
        yOffset: 0,
        rotationY: VILLAGE_MARKET.rotationY,
        scale: 1
      },
      dock: { x: 75.5, z: 71.6, yOffset: 0, rotationY: 1.5708, scale: 1 }
    };
    return { id, ...layouts[id] };
  }

  private static buildTerrainHeightfield(
    patch: Readonly<WorldTerrainPatchDefinition>,
    heightAt: (x: number, z: number) => number
  ): Float32Array {
    const resolution = patch.resolution;
    const samples = new Float32Array((resolution + 1) * (resolution + 1));
    for (let row = 0; row <= resolution; row++) {
      for (let column = 0; column <= resolution; column++) {
        // Rapier lays heightfield rows along X and columns along Z. Keeping
        // this order aligned with terrainHeight prevents transposed slopes.
        const x = patch.center.x + (row / resolution - 0.5) * patch.sizeMeters;
        const z = patch.center.z + (column / resolution - 0.5) * patch.sizeMeters;
        // Do not synthesize a bridge deck into the terrain collider. The
        // catalog bridge collision is the sole physical deck authority.
        samples[row * (resolution + 1) + column] = heightAt(x, z);
      }
    }
    return samples;
  }

  /** Canonical sampled heightfield used by diagnostics and layout tests. */
  public static terrainHeightfield(): Float32Array {
    return this.terrainHeightfieldForPatch("terrain.neva");
  }

  public static terrainHeightfieldForPatch(
    patchId: WorldTerrainPatchDefinition["id"]
  ): Float32Array {
    const patch = this.terrainPatches().find((candidate) => candidate.id === patchId);
    if (!patch) throw new Error(`[WorldLayout] Unknown terrain patch ${patchId}`);
    return this.buildTerrainHeightfield(patch, (x, z) => this.terrainHeight(x, z));
  }

  /**
   * Coarse Rapier landform; the exact road surface is a separate shared
   * trimesh. Memoized: physics, traversal sampling, and diagnostics all want
   * the same grid, and rebuilding it per caller cost hundreds of milliseconds
   * of startup for an identical result. Callers must treat it as read-only.
   */
  public static terrainBaseHeightfield(): Float32Array {
    return this.terrainBaseHeightfieldForPatch("terrain.neva");
  }

  public static terrainBaseHeightfieldForPatch(
    patchId: WorldTerrainPatchDefinition["id"]
  ): Float32Array {
    const cached = terrainBaseHeightfieldCache.get(patchId);
    if (cached) return cached;
    const patch = this.terrainPatches().find((candidate) => candidate.id === patchId);
    if (!patch) throw new Error(`[WorldLayout] Unknown terrain patch ${patchId}`);
    const heightfield = this.buildTerrainHeightfield(patch, (x, z) => this.terrainBaseHeight(x, z));
    terrainBaseHeightfieldCache.set(patchId, heightfield);
    return heightfield;
  }

  private static tokenColor(token: PaletteToken): THREE.Color {
    return new THREE.Color(PALETTE_HEX[token]);
  }

  /**
   * The worked-road ribbon is derived entirely from static route data, so it
   * is built once and handed out as clones. The visual mesh, the Rapier
   * trimesh, and the traversal triangle index each used to rebuild it.
   */
  public static buildPathGeometry(): THREE.BufferGeometry {
    pathGeometryTemplateCache ??= this.buildPathGeometryTemplate();
    return pathGeometryTemplateCache.clone();
  }

  private static buildPathGeometryTemplate(): THREE.BufferGeometry {
    const source = buildOrganicRoadGeometry({
      routes: COMPILED_WORLD_ROUTES,
      junctions: WORLD_ROUTE_JUNCTIONS,
      profiles: WORLD_ROUTE_PROFILES,
      bridge: {
        center: BRIDGE_CENTER,
        halfSpan: BRIDGE_HALF_SPAN,
        deckWidth: BRIDGE_WORLD_PROFILE.deckWidth,
        entrySurfaceY: BRIDGE_WORLD_PROFILE.entrySurfaceY,
        westDeckEdge: BRIDGE_WEST_DECK_EDGE,
        eastDeckEdge: BRIDGE_EAST_DECK_EDGE,
        gatewayDepthMeters: BRIDGE_WORLD_PROFILE.gatewayDepthMeters,
        gatewayInsetMeters: BRIDGE_WORLD_PROFILE.gatewayInsetMeters,
        gatewayOverlapMeters: BRIDGE_WORLD_PROFILE.gatewayOverlapMeters,
        gatewaySlabCount: BRIDGE_WORLD_PROFILE.gatewaySlabCount,
        gatewaySlabGapMeters: BRIDGE_WORLD_PROFILE.gatewaySlabGapMeters
      },
      heightAt: (x, z) => this.terrainHeight(x, z),
      isBridgeDeck: (x, z) => this.isBridgeDeck(x, z)
    });
    const patchGeometries = this.terrainPatches().map((patch) => conformRoadGeometryToTerrain(source, {
      sizeMeters: patch.sizeMeters,
      resolution: patch.resolution,
      centerX: patch.center.x,
      centerZ: patch.center.z,
      heightAt: (x, z) => this.terrainBaseHeight(x, z)
    }));
    const geometry = patchGeometries.length === 1
      ? patchGeometries[0]
      : mergeGeometries(patchGeometries, false);
    if (!geometry) throw new Error("[WorldLayout] Could not merge terrain-conformed route patches");
    const nevaUserData = patchGeometries[0].userData;
    const roadTriangleCount = patchGeometries.reduce(
      (total, patchGeometry) => total + (patchGeometry.userData.roadTriangleCount as number),
      0
    );
    const junctionTriangleCount = patchGeometries.reduce(
      (total, patchGeometry) => total + (patchGeometry.userData.junctionTriangleCount as number),
      0
    );
    geometry.userData = {
      ...nevaUserData,
      roadTriangleCount,
      junctionTriangleCount,
      terrainPatchCount: patchGeometries.length
    };
    if (geometry !== patchGeometries[0]) {
      for (const patchGeometry of patchGeometries) patchGeometry.dispose();
    }
    source.dispose();
    attachSurfaceFieldAttributes(
      geometry,
      (x, z, sampledNormalY) => this.terrainSurfaceSample(x, z, sampledNormalY)
    );
    return geometry;
  }

  public static buildTerrainGeometry(
    patchId: WorldTerrainPatchDefinition["id"] = "terrain.neva"
  ): THREE.BufferGeometry {
    const patch = this.terrainPatches().find((candidate) => candidate.id === patchId);
    if (!patch) throw new Error(`[WorldLayout] Unknown terrain patch ${patchId}`);
    const indexed = new THREE.PlaneGeometry(
      patch.sizeMeters,
      patch.sizeMeters,
      patch.resolution,
      patch.resolution
    );
    indexed.rotateX(-Math.PI / 2);
    // The terrain material derives every lookup from world position, so the
    // plane's UV set is pure vertex-fetch bandwidth on a ~900k vertex mesh.
    indexed.deleteAttribute("uv");
    const indexedPositions = indexed.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < indexedPositions.count; index++) {
      const x = indexedPositions.getX(index) + patch.center.x;
      const z = indexedPositions.getZ(index) + patch.center.z;
      // Match Rapier's coarse landform. The shared fine road mesh owns the
      // crown/ruts; sampling them into this grid again creates crossing faces.
      indexedPositions.setY(index, this.terrainBaseHeight(x, z));
    }
    indexedPositions.needsUpdate = true;
    indexed.computeVertexNormals();
    const indexedNormals = indexed.getAttribute("normal") as THREE.BufferAttribute;
    const indexedColors = new Float32Array(indexedPositions.count * 3);
    const indexedTerrainGreenMask = new Uint8Array(indexedPositions.count);
    const indexedTerrainPathBlend = new Uint8Array(indexedPositions.count);
    const indexedTerrainShoreWeights = new Uint8Array(indexedPositions.count * 3);
    const indexedFaceting = new Float32Array(indexedPositions.count);
    const surfaceSamples = new Array<TerrainSurfaceSample>(indexedPositions.count);
    const palette: Record<keyof TerrainSurfaceWeights, THREE.Color> = {
      grass: this.tokenColor("foliage_sage_01"),
      meadow: this.tokenColor("grass_yellow_01"),
      drySoil: this.tokenColor("soil_dry_01"),
      dampSoil: this.tokenColor("soil_damp_01"),
      path: this.tokenColor("path_dust_01"),
      shoulder: this.tokenColor("soil_warm_01"),
      beach: this.tokenColor("sand_warm_01"),
      riverbed: this.tokenColor("stone_cool_01"),
      wetShoreline: this.tokenColor("shore_wet_01"),
      cliff: this.tokenColor("stone_cool_01")
    };

    const normalPolicy = CANONICAL_RENDER_CONFIG.terrainSurface.normals;
    for (let index = 0; index < indexedPositions.count; index++) {
      const x = indexedPositions.getX(index) + patch.center.x;
      const z = indexedPositions.getZ(index) + patch.center.z;
      const normalX = indexedNormals.getX(index);
      const normalY = Math.abs(indexedNormals.getY(index));
      const normalZ = indexedNormals.getZ(index);
      const surfaceSample = this.terrainSurfaceSample(x, z, normalY);
      surfaceSamples[index] = surfaceSample;
      const weights = surfaceSample.weights;
      const routeUnderlayWeight = weights.path + weights.shoulder;
      const vegetationShare = weights.grass + weights.meadow;
      const shoreShare = weights.beach + weights.wetShoreline + weights.cliff;
      const greenMask = Math.round(
        clamp01(vegetationShare * (1 - smoothstep(0.08, 0.42, shoreShare)) + routeUnderlayWeight) * 255
      );
      // The precise 17-strip route ribbon owns visible worked ground. Keep its
      // coarse terrain-grid underlay green so interpolated path vertices cannot
      // produce a second several-metre brown halo outside the ribbon edge.
      const grassShare = weights.grass + weights.meadow;
      const grassBoost = grassShare > 1e-5 ? weights.grass / grassShare : 0.72;
      const visualWeights: TerrainSurfaceWeights = {
        ...weights,
        path: 0,
        shoulder: 0,
        grass: weights.grass + routeUnderlayWeight * grassBoost,
        meadow: weights.meadow + routeUnderlayWeight * (1 - grassBoost)
      };
      const color = new THREE.Color(0, 0, 0);
      for (const [key, weight] of Object.entries(visualWeights) as Array<[keyof TerrainSurfaceWeights, number]>) {
        color.r += palette[key].r * weight;
        color.g += palette[key].g * weight;
        color.b += palette[key].b * weight;
      }
      const broadVariation =
        Math.sin(x * 0.027 + z * 0.019) * 0.024
        + Math.sin(x * 0.011 - z * 0.034 + 1.2) * 0.018;
      const aspectVariation = normalX * 0.026 - normalZ * 0.018;
      const topPlaneWarmth = smoothstep(0.82, 0.99, normalY) * 0.014;
      const facetVariation = THREE.MathUtils.clamp(
        0.975 + broadVariation + aspectVariation + topPlaneWarmth,
        0.91,
        1.07
      );
      color.multiplyScalar(facetVariation);
      indexedColors.set([color.r, color.g, color.b], index * 3);
      indexedTerrainGreenMask[index] = greenMask;
      // Byte-normalized: 1/255 is finer than any visible blend step and the
      // terrain mesh carries close to a million vertices.
      indexedTerrainPathBlend[index] = Math.round(clamp01(this.pathInfluence(x, z)) * 255);
      indexedTerrainShoreWeights.set(
        [
          Math.round(clamp01(weights.beach) * 255),
          Math.round(clamp01(weights.wetShoreline) * 255),
          Math.round(clamp01(weights.cliff) * 255)
        ],
        index * 3
      );
      const slopeFaceting = 1 - smoothstep(
        normalPolicy.fullyFacetedNormalY,
        normalPolicy.continuityStartNormalY,
        normalY
      );
      const semanticFaceting = smoothstep(
        normalPolicy.cliffWeightStart,
        normalPolicy.cliffWeightFull,
        weights.cliff
      );
      indexedFaceting[index] = Math.max(slopeFaceting, semanticFaceting);
    }

    indexed.setAttribute("color", new THREE.BufferAttribute(indexedColors, 3));
    indexed.setAttribute(
      "terrainGreenMask",
      new THREE.Uint8BufferAttribute(indexedTerrainGreenMask, 1, true)
    );
    indexed.setAttribute(
      "terrainPathBlend",
      new THREE.Uint8BufferAttribute(indexedTerrainPathBlend, 1, true)
    );
    indexed.setAttribute(
      "terrainShoreWeights",
      new THREE.Uint8BufferAttribute(indexedTerrainShoreWeights, 3, true)
    );
    indexed.setAttribute("terrainFaceting", new THREE.BufferAttribute(indexedFaceting, 1));
    writeSurfaceFieldAttributes(indexed, surfaceSamples);

    const geometry = indexed.index ? indexed.toNonIndexed() : indexed;
    if (geometry !== indexed) indexed.dispose();
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
    const colors = geometry.getAttribute("color") as THREE.BufferAttribute;
    const faceting = geometry.getAttribute("terrainFaceting") as THREE.BufferAttribute;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const blendedNormal = new THREE.Vector3();
    const faceColor = new THREE.Color();
    const vertexColor = new THREE.Color();
    for (let index = 0; index < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index);
      b.fromBufferAttribute(positions, index + 1);
      c.fromBufferAttribute(positions, index + 2);
      edgeA.copy(b).sub(a);
      edgeB.copy(c).sub(a);
      faceNormal.crossVectors(edgeA, edgeB).normalize();
      faceColor.setRGB(
        (colors.getX(index) + colors.getX(index + 1) + colors.getX(index + 2)) / 3,
        (colors.getY(index) + colors.getY(index + 1) + colors.getY(index + 2)) / 3,
        (colors.getZ(index) + colors.getZ(index + 1) + colors.getZ(index + 2)) / 3
      );
      const faceValue = THREE.MathUtils.clamp(
        0.985 + faceNormal.x * 0.026 - faceNormal.z * 0.018,
        0.94,
        1.06
      );
      faceColor.multiplyScalar(faceValue);
      for (let vertex = 0; vertex < 3; vertex++) {
        const vertexIndex = index + vertex;
        const facetingWeight = clamp01(faceting.getX(vertexIndex));
        blendedNormal
          .set(normals.getX(vertexIndex), normals.getY(vertexIndex), normals.getZ(vertexIndex))
          .lerp(faceNormal, facetingWeight)
          .normalize();
        normals.setXYZ(vertexIndex, blendedNormal.x, blendedNormal.y, blendedNormal.z);
        vertexColor
          .setRGB(colors.getX(vertexIndex), colors.getY(vertexIndex), colors.getZ(vertexIndex))
          .lerp(faceColor, facetingWeight * normalPolicy.facetedColorBlend);
        colors.setXYZ(vertexIndex, vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }
    normals.needsUpdate = true;
    colors.needsUpdate = true;
    geometry.deleteAttribute("terrainFaceting");
    geometry.userData.terrainNormalPolicy = { ...normalPolicy };
    geometry.userData.terrainPatchId = patch.id;
    geometry.userData.terrainPatchCenter = { ...patch.center };
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

}

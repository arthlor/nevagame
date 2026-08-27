import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../render/config/VisualRenderConfig";
import { PALETTE_HEX, type PaletteToken } from "../render/materials/PaletteTokens";
import {
  STARTER_FARM_LAYOUT,
  farmLocalToWorld,
  starterFarmsteadAnchor,
  starterStructureAnchor,
  type FarmPathKind
} from "./FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN, isInsideFarmhouseInterior } from "./FarmhouseInterior";
import { HARBOR_DOCK, HARBOR_MARKET, RIVER_CROSSING, VILLAGE_MARKET, VILLAGE_PLAZA, WORLD_SPAWN } from "./WorldAnchors";
import {
  buildOrganicRoadGeometry,
  sampleRoadCrossSection,
  type RoadCrossSectionSample
} from "./RoadGeometry";
import { getProcessingStationRuntimeRotationY } from "./ProcessingStationApproach";

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

export interface CoastProfile {
  beach: number;
  rockShelf: number;
  cliff: number;
  reedPocket: number;
  headland: number;
  harborCove: number;
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
  revision: 7;
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
export const SAILABLE_BOUNDS: WorldBounds = { minX: -260, maxX: 260, minZ: -240, maxZ: 280 };
export const TERRAIN_RESOLUTION = 256;
export const TERRAIN_SIZE_METERS = 600;
export const WATER_SURFACE = Object.freeze({
  width: 750,
  depth: 750,
  centerX: 0,
  centerZ: 20,
  segmentsX: 144,
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
  gatewaySlabCount: 3,
  gatewaySlabGapMeters: 0.08
});

const BRIDGE_HALF_SPAN = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
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
    points: [
      { x: -92, z: 74 },
      { x: -68, z: 70 },
      { x: -40, z: 68 },
      { x: -10, z: 66 },
      { x: 22, z: 62 },
      { x: 47, z: 58 },
      HARBOR_MARKET.position
    ]
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
  ...FARM_ROUTES
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
  {
    id: "village.tool-shed",
    center: { x: 23, z: -72 },
    rotationY: villageArchitectureRotation({ x: 23, z: -72 }),
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

export const WORLD_LAYOUT_V5: WorldLayoutDescriptor = {
  revision: 7,
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
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
  .slice(0, WORLD_ROUTES.length)
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

interface RouteProjection {
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
    const rawBeach = 0.16 + harborCove * 0.88 + westernBeach * 0.74 - headland * 0.13;
    const rawRockShelf = 0.24 + easternShelf * 0.72 + westernShelf * 0.55 + headland * 0.2;
    const rawCliff = 0.24 + headland * 0.92 + easternShelf * 0.42 - harborCove * 0.18 - westernBeach * 0.12;
    const total = Math.max(0.0001, rawBeach + rawRockShelf + rawCliff);
    return {
      beach: clamp01(rawBeach / total),
      rockShelf: clamp01(rawRockShelf / total),
      cliff: clamp01(rawCliff / total),
      reedPocket: clamp01(harborCove * 0.68 + westernBeach * 0.58 + bandWeight(x, 18, 6, 16) * 0.48),
      headland,
      harborCove
    };
  }

  public static riverCenterX(z: number): number {
    return splineValue(RIVER_SPLINE, z, "z");
  }

  public static riverHalfWidth(z: number): number {
    return 5.5 + smoothstep(35, 82, z) * 3.5 + Math.sin(z * 0.041 + 0.9) * 0.28;
  }

  public static riverDistance(x: number, z: number): number {
    return Math.abs(x - this.riverCenterX(z));
  }

  /** Low-frequency authored influence shared by the river mouth's visual systems. */
  public static estuaryInfluence(x: number, z: number): number {
    const mouth = WORLD_LAYOUT_V5.riverMouth;
    const longitudinal = z < mouth.z
      ? 1 - smoothstep(16, 30, mouth.z - z)
      : 1 - smoothstep(25, 39, z - mouth.z);
    const seawardFlare = smoothstep(0, 24, z - mouth.z) * 7.5;
    const lateralRadius = this.riverHalfWidth(Math.min(z, mouth.z)) + 7 + seawardFlare;
    const lateral = 1 - smoothstep(lateralRadius * 0.72, lateralRadius, Math.abs(x - mouth.x));
    return clamp01(longitudinal * lateral);
  }

  /** Positive values are water; negative values are dry land. */
  public static waterSignedDistance(x: number, z: number): number {
    const coast = z - this.coastlineZ(x);
    const river = this.riverHalfWidth(z) - this.riverDistance(x, z);
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

  public static isBridgeDeck(x: number, z: number): boolean {
    return (
      Math.abs(x - BRIDGE_CENTER.x) <= BRIDGE_HALF_SPAN + 0.000001 &&
      Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + 0.000001
    );
  }

  public static isWater(x: number, z: number): boolean {
    return this.waterSignedDistance(x, z) > 0 && !this.isBridgeDeck(x, z);
  }

  public static fishingHabitatAt(x: number, z: number): FishingHabitatId | null {
    if (!this.isWater(x, z)) return null;
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
    if (this.isBridgeDeck(x, z)) return "river";
    const direct = this.fishingHabitatAt(x, z);
    if (direct) return direct;
    const coastDistance = z - this.coastlineZ(x);
    const riverEdgeDistance = this.riverDistance(x, z) - this.riverHalfWidth(z);
    if (coastDistance <= 0 && riverEdgeDistance <= reachMeters) return "river";
    if (coastDistance > -reachMeters && coastDistance <= 0) {
      const adjacent = this.fishingHabitatAt(x, this.coastlineZ(x) + Math.min(2, reachMeters));
      if (adjacent) return adjacent;
      return this.estuaryInfluence(x, z) > 0.08 ? "lake" : "coast";
    }
    return null;
  }

  public static regionAt(x: number, z: number): "region.village" | "region.farm" | "region.coast" {
    if (z >= 48) return "region.coast";
    if (x <= -34 && z <= 8) return "region.farm";
    return "region.village";
  }

  public static isInterior(x: number, z: number): boolean {
    return isInsideFarmhouseInterior(x, z);
  }

  public static isWalkable(x: number, z: number): boolean {
    if (this.isInterior(x, z)) return true;
    return (
      x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX &&
      z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ &&
      (!this.isWater(x, z) || this.isBridgeDeck(x, z))
    );
  }

  public static isSailable(x: number, z: number): boolean {
    return (
      x >= SAILABLE_BOUNDS.minX && x <= SAILABLE_BOUNDS.maxX &&
      z >= SAILABLE_BOUNDS.minZ && z <= SAILABLE_BOUNDS.maxZ &&
      this.isWater(x, z) && !this.isBridgeDeck(x, z)
    );
  }

  private static nearestValid(point: WorldPoint, predicate: (x: number, z: number) => boolean, maximumRadius: number): WorldPoint {
    if (predicate(point.x, point.z)) return { ...point };
    for (let radius = 0.5; radius <= maximumRadius; radius += 0.5) {
      const steps = Math.max(16, Math.ceil(radius * 5));
      for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const candidate = { x: point.x + Math.cos(angle) * radius, z: point.z + Math.sin(angle) * radius };
        if (predicate(candidate.x, candidate.z)) return candidate;
      }
    }
    return { ...WORLD_SPAWN.playerPosition };
  }

  public static nearestValidGround(point: WorldPoint, maximumRadius: number = 72): WorldPoint {
    return this.nearestValid(point, (x, z) => this.isWalkable(x, z), maximumRadius);
  }

  public static nearestValidSailable(point: WorldPoint, maximumRadius: number = 120): WorldPoint {
    const candidate = this.nearestValid(point, (x, z) => this.isSailable(x, z), maximumRadius);
    return this.isSailable(candidate.x, candidate.z) ? candidate : { x: HARBOR_DOCK.boatPosition.x, z: HARBOR_DOCK.boatPosition.z };
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

    const riverDistance = this.riverDistance(x, z);
    const riverWidth = this.riverHalfWidth(z);
    const riverBed = -1.65 - smoothstep(0, 1, Math.abs(Math.sin(z * 0.021))) * 0.16;
    height = THREE.MathUtils.lerp(riverBed, height, smoothstep(riverWidth - 0.4, riverWidth + 11, riverDistance));

    const coastDistance = z - this.coastlineZ(x);
    const coastProfile = this.coastProfile(x);
    if (coastDistance > 0) {
      const nearshoreShelf = coastProfile.rockShelf * (1 - smoothstep(0.2, 8, coastDistance)) * 0.28;
      const coastalShelf = -0.48 + nearshoreShelf - Math.min(16, coastDistance * 0.11);
      const mouth = WORLD_LAYOUT_V5.riverMouth;
      const channelCrossSection = 1 - smoothstep(
        this.riverHalfWidth(z) - 0.8,
        this.riverHalfWidth(z) + 3.8,
        this.riverDistance(x, z)
      );
      const channelContinuation = 1 - smoothstep(0, 24, Math.max(0, z - mouth.z));
      const channelDepth = -1.74 - Math.min(0.42, Math.max(0, z - mouth.z) * 0.018);
      const channelBlend = this.estuaryInfluence(x, z) * channelCrossSection * channelContinuation;
      height = THREE.MathUtils.lerp(coastalShelf, Math.min(coastalShelf, channelDepth), channelBlend);
    } else if (coastDistance > -30) {
      const landward = -coastDistance;
      const shoreInfluence = smoothstep(-30, -0.08, coastDistance);
      const broadPlane = Math.sin(x * 0.081 + landward * 0.28) * 0.075;
      const beachHeight = 0.06 + landward * 0.066 + broadPlane;
      const shelfTerraces =
        smoothstep(2.2, 3.4, landward) * 0.28
        + smoothstep(6.2, 7.8, landward) * 0.42
        + smoothstep(11, 13.5, landward) * 0.36;
      const shelfHeight = 0.16 + landward * 0.085 + shelfTerraces + broadPlane;
      const cliffLip = 8.8 + coastProfile.headland * 5.2 + coastProfile.rockShelf * 1.3;
      const cliffHeight = THREE.MathUtils.lerp(
        cliffLip,
        height,
        smoothstep(2.5, 24, landward)
      );
      const authoredShoreHeight =
        beachHeight * coastProfile.beach
        + shelfHeight * coastProfile.rockShelf
        + cliffHeight * coastProfile.cliff;
      height = THREE.MathUtils.lerp(height, authoredShoreHeight, shoreInfluence * 0.94);

      // Broad, asymmetric silt shelves soften the dry banks immediately before
      // the mouth while leaving the canonical water sign untouched.
      const bankDistance = this.riverDistance(x, z) - this.riverHalfWidth(z);
      const bankShelf = 1 - smoothstep(0.4, 7.8, Math.max(0, bankDistance));
      const bankSide = x < this.riverCenterX(z) ? 1 : -1;
      const siltHeight = 0.12 + landward * 0.048 + bankSide * 0.055;
      const siltBlend = this.estuaryInfluence(x, z) * bankShelf * smoothstep(-0.2, 2.8, bankDistance) * 0.72;
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
    height = this.applyPlateau(height, x, z, 1.05, 68, 64, 7.5, 5.5, 5.5);
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
    if (x >= BRIDGE_EAST_DECK_EDGE.x && x <= BRIDGE_EAST_APPROACH_END.x && bridgeAcross > 0) {
      const eastRampHeight = THREE.MathUtils.lerp(
        BRIDGE_WORLD_PROFILE.entrySurfaceY,
        BRIDGE_WORLD_PROFILE.eastBankSurfaceY,
        eastApproachProgress
      );
      height = THREE.MathUtils.lerp(height, eastRampHeight, bridgeAcross);
    }

    // West approach (smooth ramp towards the starter farm basin).
    if (x >= BRIDGE_WEST_APPROACH_START.x && x <= BRIDGE_WEST_DECK_EDGE.x && bridgeAcross > 0) {
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

  public static terrainNormal(x: number, z: number, sampleDistance: number = 0.45): THREE.Vector3 {
    const left = this.terrainHeight(x - sampleDistance, z);
    const right = this.terrainHeight(x + sampleDistance, z);
    const back = this.terrainHeight(x, z - sampleDistance);
    const front = this.terrainHeight(x, z + sampleDistance);
    return new THREE.Vector3(left - right, sampleDistance * 2, back - front).normalize();
  }

  private static nearestRouteDistance(x: number, z: number): RouteProjection {
    if (cachedRouteQuery && cachedRouteQuery.x === x && cachedRouteQuery.z === z) {
      return cachedRouteQuery.result;
    }
    const routes = COMPILED_WORLD_ROUTES;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestProjection: RouteProjection = {
      distance: Number.POSITIVE_INFINITY,
      halfWidth: routes[0].halfWidth,
      shoulderWidthMeters: routes[0].shoulderWidthMeters,
      terrainFeatherMeters: routes[0].terrainFeatherMeters,
      route: routes[0].route,
      point: { ...routes[0].segments[0].start },
      tangent: { ...routes[0].segments[0].tangent },
      normal: { x: -routes[0].segments[0].tangent.z, z: routes[0].segments[0].tangent.x },
      routeIndex: 0,
      segmentIndex: 0,
      distanceAlongRoute: routes[0].segments[0].cumulativeStart
    };

    const minCellX = routeIndexCell(x - ROUTE_INDEX_PADDING_METERS);
    const maxCellX = routeIndexCell(x + ROUTE_INDEX_PADDING_METERS);
    const minCellZ = routeIndexCell(z - ROUTE_INDEX_PADDING_METERS);
    const maxCellZ = routeIndexCell(z + ROUTE_INDEX_PADDING_METERS);
    const candidates = new Set<number>();
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        for (const reference of ROUTE_SEGMENT_INDEX.get(routeIndexKey(cellX, cellZ)) ?? []) {
          candidates.add(reference.routeIndex * 10000 + reference.segmentIndex);
        }
      }
    }

    const references = candidates.size > 0
      ? [...candidates].map((reference) => {
        const routeIndex = Math.floor(reference / 10000);
        return { routeIndex, segmentIndex: reference - routeIndex * 10000 };
      })
      : routes.flatMap((route, routeIndex) => route.segments.map((_, segmentIndex) => ({ routeIndex, segmentIndex })));

    for (const { routeIndex, segmentIndex } of references) {
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
    const localX = x - STARTER_FARM_LAYOUT.origin.x;
    const localZ = z - STARTER_FARM_LAYOUT.origin.z;
    const ellipse = 1 - smoothstep(0.88, 1.24, Math.hypot(localX / 7.2, localZ / 6.2));
    const irregular = 0.94 + Math.sin(localX * 0.72 + localZ * 0.31) * 0.035;
    const homestead = 1 - smoothstep(0.9, 1.18, Math.hypot((x - 60) / 9.2, (z + 60) / 9.2));
    return clamp01(Math.max(ellipse * irregular, homestead * 0.9));
  }

  public static shorelineWetness(x: number, z: number): number {
    return 1 - smoothstep(0.2, 4.2, Math.abs(this.waterSignedDistance(x, z)));
  }

  public static terrainSurfaceWeights(x: number, z: number, sampledNormalY?: number): TerrainSurfaceWeights {
    const waterDistance = this.waterSignedDistance(x, z);
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
      ? 1 - smoothstep(this.riverHalfWidth(z) + 0.7, this.riverHalfWidth(z) + 5.2, this.riverDistance(x, z))
      : 0;
    const normalY = sampledNormalY ?? this.terrainNormal(x, z).y;
    const coastProfile = this.coastProfile(x);
    const coastBand = coastDistance <= 0 ? smoothstep(-18, -0.15, coastDistance) : 0;
    const slopeCliff = clamp01((0.76 - normalY) / 0.3);
    const cliff = clamp01(
      coastBand * coastProfile.cliff * (0.28 + slopeCliff * 0.92)
      + coastBand * coastProfile.rockShelf * slopeCliff * 0.48
    ) * (1 - estuary * 0.76);
    const siltShelf = estuary
      * (1 - smoothstep(this.riverHalfWidth(z) + 0.5, this.riverHalfWidth(z) + 7.5, this.riverDistance(x, z)))
      * dryRoute;
    const beach = coastBand * coastProfile.beach * (1 - cliff * 0.82) * (1 - estuary * 0.58);
    const meadowPattern = clamp01(
      0.48
      + Math.sin(x * 0.036 - z * 0.027) * 0.23
      + Math.sin((x + z) * 0.014 + 1.4) * 0.17
    );
    const drySoil = farm * (1 - wet * 0.35);
    const dampSoil = Math.max(farm * wet * 0.55, riverFringe * 0.65, siltShelf * 0.82);
    const riverbed = waterDistance > 0 ? 0.84 + estuary * 0.14 : 0;
    const remaining = clamp01(1 - Math.max(path, shoulder, drySoil, dampSoil, beach, riverbed, cliff));
    return normalizedSurfaceWeights({
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
    });
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
      bridge: { x: BRIDGE_CENTER.x, z: BRIDGE_CENTER.z, yOffset: 0.35, rotationY: 0, scale: 1 },
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
      dock: { x: 78, z: 67.3, yOffset: -0.65, rotationY: Math.PI / 2, scale: 1 }
    };
    return { id, ...layouts[id] };
  }

  private static buildTerrainHeightfield(heightAt: (x: number, z: number) => number): Float32Array {
    const samples = new Float32Array((TERRAIN_RESOLUTION + 1) * (TERRAIN_RESOLUTION + 1));
    for (let row = 0; row <= TERRAIN_RESOLUTION; row++) {
      for (let column = 0; column <= TERRAIN_RESOLUTION; column++) {
        // Rapier lays heightfield rows along X and columns along Z. Keeping
        // this order aligned with terrainHeight prevents transposed slopes.
        const x = (row / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        const z = (column / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        // Do not synthesize a bridge deck into the terrain collider. The
        // catalog bridge collision is the sole physical deck authority.
        samples[row * (TERRAIN_RESOLUTION + 1) + column] = heightAt(x, z);
      }
    }
    return samples;
  }

  /** Canonical sampled heightfield used by diagnostics and layout tests. */
  public static terrainHeightfield(): Float32Array {
    return this.buildTerrainHeightfield((x, z) => this.terrainHeight(x, z));
  }

  /** Coarse Rapier landform; the exact road surface is a separate shared trimesh. */
  public static terrainBaseHeightfield(): Float32Array {
    return this.buildTerrainHeightfield((x, z) => this.terrainBaseHeight(x, z));
  }

  private static tokenColor(token: PaletteToken): THREE.Color {
    return new THREE.Color(PALETTE_HEX[token]);
  }

  public static buildPathGeometry(): THREE.BufferGeometry {
    return buildOrganicRoadGeometry({
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
        gatewaySlabCount: BRIDGE_WORLD_PROFILE.gatewaySlabCount,
        gatewaySlabGapMeters: BRIDGE_WORLD_PROFILE.gatewaySlabGapMeters
      },
      heightAt: (x, z) => this.terrainHeight(x, z),
      isBridgeDeck: (x, z) => this.isBridgeDeck(x, z)
    });
  }

  public static buildTerrainGeometry(): THREE.BufferGeometry {
    const indexed = new THREE.PlaneGeometry(TERRAIN_SIZE_METERS, TERRAIN_SIZE_METERS, TERRAIN_RESOLUTION, TERRAIN_RESOLUTION);
    indexed.rotateX(-Math.PI / 2);
    const indexedPositions = indexed.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < indexedPositions.count; index++) {
      const x = indexedPositions.getX(index);
      const z = indexedPositions.getZ(index);
      indexedPositions.setY(index, this.terrainHeight(x, z));
    }
    indexedPositions.needsUpdate = true;
    indexed.computeVertexNormals();
    const indexedNormals = indexed.getAttribute("normal") as THREE.BufferAttribute;
    const indexedColors = new Float32Array(indexedPositions.count * 3);
    const indexedTerrainGreenMask = new Uint8Array(indexedPositions.count);
    const indexedTerrainPathBlend = new Float32Array(indexedPositions.count);
    const indexedFaceting = new Float32Array(indexedPositions.count);
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
      const x = indexedPositions.getX(index);
      const z = indexedPositions.getZ(index);
      const normalX = indexedNormals.getX(index);
      const normalY = Math.abs(indexedNormals.getY(index));
      const normalZ = indexedNormals.getZ(index);
      const weights = this.terrainSurfaceWeights(x, z, normalY);
      const routeUnderlayWeight = weights.path + weights.shoulder;
      const protectedSurfaceWeight =
        weights.drySoil
        + weights.dampSoil
        + weights.beach
        + weights.riverbed
        + weights.wetShoreline
        + weights.cliff;
      const greenMask = protectedSurfaceWeight > 0.0001
        ? 0
        : Math.round(clamp01(weights.grass + weights.meadow + routeUnderlayWeight) * 255);
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
      indexedTerrainPathBlend[index] = clamp01(this.pathInfluence(x, z));
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
      new THREE.BufferAttribute(indexedTerrainPathBlend, 1)
    );
    indexed.setAttribute("terrainFaceting", new THREE.BufferAttribute(indexedFaceting, 1));

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
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

}

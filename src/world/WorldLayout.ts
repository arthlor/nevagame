import * as THREE from "three";
import { PALETTE_HEX, type PaletteToken } from "../render/materials/PaletteTokens";
import {
  STARTER_FARM_LAYOUT,
  starterFarmsteadAnchor,
  starterStructureAnchor
} from "./FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN, isInsideFarmhouseInterior } from "./FarmhouseInterior";
import { HARBOR_DOCK, VILLAGE_MARKET, WORLD_SPAWN } from "./WorldAnchors";

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

export interface WorldRoute {
  id: string;
  kind: WorldRouteKind;
  widthMeters: number;
  points: readonly WorldPoint[];
}

export interface WorldRouteProfile {
  crownMeters: number;
  rutDepthMeters: number;
  shoulderDropMeters: number;
  shoulderWidthMeters: number;
  gradingStrength: number;
}

export interface WorldLayoutDescriptor {
  revision: 3;
  anchors: {
    starterFarm: WorldPoint;
    playerSpawn: WorldPoint;
    privateHomestead: WorldPoint;
    villageMarket: WorldPoint;
    bridge: WorldPoint;
    lighthouse: WorldPoint;
    fishMarket: WorldPoint;
    harborDock: WorldPoint;
  };
  coast: readonly WorldPoint[];
  river: readonly WorldPoint[];
  riverMouth: WorldPoint;
  routes: readonly WorldRoute[];
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
    gradingStrength: 0.9
  }),
  lane: Object.freeze({
    crownMeters: 0.068,
    rutDepthMeters: 0.027,
    shoulderDropMeters: 0.011,
    shoulderWidthMeters: 1.25,
    gradingStrength: 0.78
  }),
  trail: Object.freeze({
    crownMeters: 0.03,
    rutDepthMeters: 0.012,
    shoulderDropMeters: 0.006,
    shoulderWidthMeters: 0.85,
    gradingStrength: 0.58
  })
});

export const WORLD_ROUTES: readonly WorldRoute[] = [
  {
    id: "farm-village",
    kind: "arterial",
    widthMeters: 3.8,
    points: [
      { x: -65, z: -63 },
      { x: -52, z: -45 },
      { x: -39, z: -28 },
      { x: -25, z: -12 },
      { x: -14, z: -7 },
      { x: 0, z: -5 }
    ]
  },
  {
    id: "village-homestead",
    kind: "lane",
    widthMeters: 3.1,
    points: [
      { x: 0, z: -5 },
      { x: 18, z: -16 },
      { x: 37, z: -34 },
      { x: 60, z: -60 }
    ]
  },
  {
    id: "village-harbor",
    kind: "arterial",
    widthMeters: 4.2,
    points: [
      { x: 0, z: -5 },
      { x: 19, z: 11 },
      { x: 38, z: 31 },
      { x: 55, z: 49 },
      { x: 68, z: 64 }
    ]
  },
  {
    id: "village-lighthouse",
    kind: "lane",
    widthMeters: 3.2,
    points: [
      { x: 0, z: -5 },
      { x: -20, z: 14 },
      { x: -43, z: 34 },
      { x: -68, z: 54 },
      { x: -92, z: 74 }
    ]
  },
  {
    id: "riverbank-trail",
    kind: "trail",
    widthMeters: 2.4,
    points: [
      { x: -20, z: -138 },
      { x: -17, z: -104 },
      { x: -14, z: -70 },
      { x: -10, z: -38 },
      { x: -5, z: -12 },
      { x: 5, z: 22 },
      { x: 16, z: 50 },
      { x: 26, z: 73 }
    ]
  },
  {
    id: "cliffside-coastal-walk",
    kind: "trail",
    widthMeters: 2.6,
    points: [
      { x: -92, z: 74 },
      { x: -68, z: 70 },
      { x: -40, z: 68 },
      { x: -10, z: 66 },
      { x: 22, z: 62 },
      { x: 47, z: 58 },
      { x: 68, z: 64 }
    ]
  },
  {
    id: "orchard-path",
    kind: "trail",
    widthMeters: 2.2,
    points: [
      { x: 60, z: -60 },
      { x: 70, z: -52 },
      { x: 73, z: -39 },
      { x: 63, z: -31 },
      { x: 51, z: -39 },
      { x: 54, z: -58 }
    ]
  }
] as const;

export const WORLD_LAYOUT_V3: WorldLayoutDescriptor = {
  revision: 3,
  anchors: {
    starterFarm: STARTER_FARM_LAYOUT.origin,
    playerSpawn: WORLD_SPAWN.playerPosition,
    privateHomestead: { x: 60, z: -60 },
    villageMarket: VILLAGE_MARKET.position,
    bridge: { x: -14, z: -7 },
    lighthouse: { x: -92, z: 74 },
    fishMarket: { x: 68, z: 64 },
    harborDock: HARBOR_DOCK.boatPosition
  },
  coast: COAST_SPLINE,
  river: RIVER_SPLINE,
  riverMouth: RIVER_MOUTH,
  routes: WORLD_ROUTES
};

const BRIDGE_CENTER = WORLD_LAYOUT_V3.anchors.bridge;
export const BRIDGE_WORLD_PROFILE = Object.freeze({
  spanLength: 14.2,
  deckWidth: 3.8,
  entrySurfaceY: 1.4,
  approachLength: 8
});

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

function sampleRoute(route: WorldRoute, subdivisions: number = 10): WorldPoint[] {
  const sampled: WorldPoint[] = [];
  const points = route.points;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let step = 0; step < subdivisions; step++) {
      const t = step / subdivisions;
      sampled.push({
        x: catmullScalar(p0.x, p1.x, p2.x, p3.x, t),
        z: catmullScalar(p0.z, p1.z, p2.z, p3.z, t)
      });
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

export const WORLD_PATHS: readonly (readonly WorldPoint[])[] = WORLD_ROUTES.map((route) => sampleRoute(route));

interface SampledRouteSegment {
  start: WorldPoint;
  end: WorldPoint;
  dx: number;
  dz: number;
  lengthSquared: number;
  length: number;
  tangent: WorldPoint;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface PrecomputedRoute {
  route: WorldRoute;
  halfWidth: number;
  segments: SampledRouteSegment[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function buildPrecomputedRoutes(paths: readonly (readonly WorldPoint[])[]): readonly PrecomputedRoute[] {
  return WORLD_ROUTES.map((route, routeIndex) => {
    const path = paths[routeIndex];
    const halfWidth = route.widthMeters * 0.5;
    const segments: SampledRouteSegment[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < path.length - 1; index++) {
      const start = path[index];
      const end = path[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const lengthSquared = dx * dx + dz * dz;
      const length = Math.max(0.0001, Math.sqrt(lengthSquared));
      const segMinX = Math.min(start.x, end.x);
      const segMaxX = Math.max(start.x, end.x);
      const segMinZ = Math.min(start.z, end.z);
      const segMaxZ = Math.max(start.z, end.z);

      minX = Math.min(minX, segMinX);
      maxX = Math.max(maxX, segMaxX);
      minZ = Math.min(minZ, segMinZ);
      maxZ = Math.max(maxZ, segMaxZ);

      segments.push({
        start,
        end,
        dx,
        dz,
        lengthSquared,
        length,
        tangent: { x: dx / length, z: dz / length },
        minX: segMinX,
        maxX: segMaxX,
        minZ: segMinZ,
        maxZ: segMaxZ
      });
    }

    return {
      route,
      halfWidth,
      segments,
      minX,
      maxX,
      minZ,
      maxZ
    };
  });
}

// Presentation/path queries use the dense Catmull samples so curved trails
// remain exact. Height and surface generation use the authored control
// segments; those are the same route owner at a fraction of the query cost.
const PRECISE_PRECOMPUTED_ROUTES: readonly PrecomputedRoute[] = buildPrecomputedRoutes(WORLD_PATHS);
const FAST_PRECOMPUTED_ROUTES: readonly PrecomputedRoute[] = buildPrecomputedRoutes(
  WORLD_ROUTES.map((route) => route.points)
);

interface RouteProjection {
  distance: number;
  halfWidth: number;
  route: WorldRoute;
  point: WorldPoint;
  tangent: WorldPoint;
}

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

/** Canonical authored-region geography shared by simulation, physics, and presentation. */
export class WorldLayout {
  public static routeDefinitions(): readonly WorldRoute[] {
    return WORLD_ROUTES;
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
    const mouth = WORLD_LAYOUT_V3.riverMouth;
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
      Math.abs(x - BRIDGE_CENTER.x) <= BRIDGE_WORLD_PROFILE.spanLength * 0.505 &&
      Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.5
    );
  }

  public static isWater(x: number, z: number): boolean {
    return this.waterSignedDistance(x, z) > 0 && !this.isBridgeDeck(x, z);
  }

  public static fishingHabitatAt(x: number, z: number): FishingHabitatId | null {
    if (!this.isWater(x, z)) return null;
    const coastDistance = z - this.coastlineZ(x);
    if (coastDistance <= 0) return "river";
    if (coastDistance <= 24) return "lake";
    if (coastDistance <= 130) return "coast";
    return "offshore";
  }

  public static nearbyFishingHabitat(x: number, z: number, reachMeters: number = 4.5): FishingHabitatId | null {
    const direct = this.fishingHabitatAt(x, z);
    if (direct) return direct;
    const coastDistance = z - this.coastlineZ(x);
    const riverEdgeDistance = this.riverDistance(x, z) - this.riverHalfWidth(z);
    if (coastDistance <= 0 && riverEdgeDistance <= reachMeters && !this.isBridgeDeck(x, z)) return "river";
    if (coastDistance > -reachMeters) return "lake";
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
      const mouth = WORLD_LAYOUT_V3.riverMouth;
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
    height = this.applyPlateau(height, x, z, 2.05, 0, -5, 7.5, 6.4, 7.5);
    height = this.applyPlateau(height, x, z, 6.25, 60, -60, 11, 10, 8.5);
    height = this.applyPlateau(height, x, z, 6.6, 54, -58, 7.2, 7.2, 6.5);
    height = this.applyPlateau(height, x, z, 1.05, 68, 64, 7.5, 5.5, 5.5);
    height = this.applyPlateau(height, x, z, 13.6, -92, 74, 7.4, 5.8, 8.5);
    height = this.applyPlateau(height, x, z, 0.0, FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z, 4.5, 3.8, 2.0);

    // The bridge foundation belongs on the riverbed. The approaches rise smoothly
    // to meet its deck at entrySurfaceY (1.4m) and connect flush to the banks.
    const bridgeHalfLength = BRIDGE_WORLD_PROFILE.spanLength * 0.5; // 7.1m
    const bridgeLateralDistance = Math.abs(z - BRIDGE_CENTER.z);
    const bridgeAcross = 1 - smoothstep(
      BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + 0.4,
      BRIDGE_WORLD_PROFILE.deckWidth * 0.5 + 3.6,
      bridgeLateralDistance
    );

    // East approach (smooth ramp towards village center at [0, -5])
    if (x >= BRIDGE_CENTER.x + bridgeHalfLength - 0.6 && x <= VILLAGE_MARKET.position.x + 2.0 && bridgeAcross > 0) {
      const eastProgress = clamp01((x - (BRIDGE_CENTER.x + bridgeHalfLength)) / (VILLAGE_MARKET.position.x - (BRIDGE_CENTER.x + bridgeHalfLength)));
      const eastRampHeight = THREE.MathUtils.lerp(BRIDGE_WORLD_PROFILE.entrySurfaceY, 2.05, eastProgress);
      const eastWeight = bridgeAcross * smoothstep(BRIDGE_CENTER.x + bridgeHalfLength - 0.7, BRIDGE_CENTER.x + bridgeHalfLength - 0.1, x);
      height = THREE.MathUtils.lerp(height, eastRampHeight, eastWeight);
    }

    // West approach (smooth ramp towards starter farm basin)
    if (x <= BRIDGE_CENTER.x - bridgeHalfLength + 0.6 && x >= BRIDGE_CENTER.x - bridgeHalfLength - 11.0 && bridgeAcross > 0) {
      const westProgress = clamp01(((BRIDGE_CENTER.x - bridgeHalfLength) - x) / 9.5);
      const westRampHeight = THREE.MathUtils.lerp(BRIDGE_WORLD_PROFILE.entrySurfaceY, 1.22, westProgress);
      const westWeight = bridgeAcross * (1 - smoothstep(BRIDGE_CENTER.x - bridgeHalfLength + 0.1, BRIDGE_CENTER.x - bridgeHalfLength + 0.7, x));
      height = THREE.MathUtils.lerp(height, westRampHeight, westWeight);
    }

    return height;
  }

  /** Final shared terrain height consumed by rendering and Rapier. */
  public static terrainHeight(x: number, z: number): number {
    const naturalHeight = this.naturalTerrainHeight(x, z);
    const route = this.nearestRouteDistance(x, z, FAST_PRECOMPUTED_ROUTES);
    const profile = WORLD_ROUTE_PROFILES[route.route.kind];
    const gradingRadius = route.halfWidth + profile.shoulderWidthMeters;
    if (
      route.distance >= gradingRadius
      || this.waterSignedDistance(x, z) > -0.35
      || this.isInterior(x, z)
      || Math.hypot(x - BRIDGE_CENTER.x, z - BRIDGE_CENTER.z) < 8.5
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
    const lateralBlend = 1 - smoothstep(route.halfWidth * 0.4, gradingRadius, route.distance);
    const desiredDelta = corridorAverage - profile.rutDepthMeters * 0.25 - naturalHeight;
    const cappedDelta = THREE.MathUtils.clamp(desiredDelta, -0.45, 0.45);
    return naturalHeight + cappedDelta * lateralBlend * profile.gradingStrength;
  }

  public static terrainNormal(x: number, z: number, sampleDistance: number = 0.45): THREE.Vector3 {
    const left = this.terrainHeight(x - sampleDistance, z);
    const right = this.terrainHeight(x + sampleDistance, z);
    const back = this.terrainHeight(x, z - sampleDistance);
    const front = this.terrainHeight(x, z + sampleDistance);
    return new THREE.Vector3(left - right, sampleDistance * 2, back - front).normalize();
  }

  private static nearestRouteDistance(
    x: number,
    z: number,
    routes: readonly PrecomputedRoute[] = PRECISE_PRECOMPUTED_ROUTES
  ): RouteProjection {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestProjection: RouteProjection = {
      distance: Number.POSITIVE_INFINITY,
      halfWidth: routes[0].halfWidth,
      route: routes[0].route,
      point: { ...routes[0].segments[0].start },
      tangent: { ...routes[0].segments[0].tangent }
    };

    const maxSearchRadius = 14;

    for (let rIndex = 0; rIndex < routes.length; rIndex++) {
      const pRoute = routes[rIndex];
      const routePadding = pRoute.halfWidth + maxSearchRadius;
      if (
        bestDistance < Number.POSITIVE_INFINITY &&
        (x < pRoute.minX - routePadding ||
         x > pRoute.maxX + routePadding ||
         z < pRoute.minZ - routePadding ||
         z > pRoute.maxZ + routePadding)
      ) {
        continue;
      }

      const segments = pRoute.segments;
      for (let sIndex = 0; sIndex < segments.length; sIndex++) {
        const seg = segments[sIndex];
        const segPadding = pRoute.halfWidth + maxSearchRadius;
        if (
          bestDistance < Number.POSITIVE_INFINITY &&
          (x < seg.minX - segPadding ||
           x > seg.maxX + segPadding ||
           z < seg.minZ - segPadding ||
           z > seg.maxZ + segPadding)
        ) {
          continue;
        }

        const dx = seg.dx;
        const dz = seg.dz;
        const lengthSquared = seg.lengthSquared;
        const progress = clamp01(((x - seg.start.x) * dx + (z - seg.start.z) * dz) / lengthSquared);
        const projX = seg.start.x + dx * progress;
        const projZ = seg.start.z + dz * progress;
        const dist = Math.hypot(x - projX, z - projZ);

        if (dist < bestDistance) {
          bestDistance = dist;
          bestProjection = {
            distance: dist,
            halfWidth: pRoute.halfWidth,
            route: pRoute.route,
            point: { x: projX, z: projZ },
            tangent: seg.tangent
          };
        }
      }
    }

    return bestProjection;
  }

  public static pathInfluence(x: number, z: number): number {
    const route = this.nearestRouteDistance(x, z);
    return 1 - smoothstep(route.halfWidth * 0.72, route.halfWidth + 1.35, route.distance);
  }

  public static pathShoulderInfluence(x: number, z: number): number {
    const route = this.nearestRouteDistance(x, z);
    const outer = 1 - smoothstep(route.halfWidth + 0.2, route.halfWidth + 2.1, route.distance);
    return Math.max(0, outer - this.pathInfluence(x, z) * 0.72);
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
    const route = this.nearestRouteDistance(x, z, FAST_PRECOMPUTED_ROUTES);
    const dryRoute = waterDistance < -0.2 ? 1 : 0;

    // Village marketplace plaza opening at [0, -5]
    // Moderate terrain tint — provides a warm buffer zone so the overlay ribbon edges blend in
    const distToVillageMarket = Math.hypot(x - VILLAGE_MARKET.position.x, z - VILLAGE_MARKET.position.z);
    const villagePlaza = (1 - smoothstep(3.0, 9.0, distToVillageMarket)) * dryRoute * 0.48;

    // Terrain-level path warmth — broad enough to create a visible transition zone
    // around routes so the overlay ribbon edges merge seamlessly into warm terrain
    const pathWobble = Math.sin(x * 0.11 + z * 0.14) * 0.12 + Math.cos(x * 0.08 - z * 0.17) * 0.08;
    const effectiveHalfWidth = route.halfWidth * (1 + pathWobble);
    const pathFalloff = route.route.kind === "trail" ? 2.2 : 3.2;
    const pathRaw = (1 - smoothstep(effectiveHalfWidth * 0.15, effectiveHalfWidth + pathFalloff, route.distance)) * dryRoute;
    const path = Math.max(pathRaw * 0.42, villagePlaza);

    const shoulderOuter = 1 - smoothstep(effectiveHalfWidth + 0.8, effectiveHalfWidth + 4.5, route.distance);
    const shoulder = Math.max(0, shoulderOuter - pathRaw * 0.55, villagePlaza * 0.4) * dryRoute * 0.48;
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
    const mill = starterStructureAnchor("struct.starter_mill")!;
    const farmhouse = starterFarmsteadAnchor("farmhouse")!;
    const well = starterFarmsteadAnchor("well")!;
    const layouts: Record<LandmarkId, Omit<LandmarkLayout, "id">> = {
      farmhouse: { x: farmhouse.x, z: farmhouse.z, yOffset: 0, rotationY: farmhouse.rotationY, scale: farmhouse.scale },
      well: { x: well.x, z: well.z, yOffset: 0, rotationY: well.rotationY, scale: well.scale },
      bridge: { x: -14, z: -7, yOffset: 0.1, rotationY: 0, scale: 1 },
      "fish-market": { x: 68, z: 64, yOffset: 0, rotationY: Math.PI - 0.2, scale: 0.84 },
      lighthouse: { x: -92, z: 74, yOffset: 0, rotationY: 0.08, scale: 0.58 },
      windmill: { x: mill.x, z: mill.z, yOffset: 0, rotationY: mill.rotationY, scale: 0.62 },
      "produce-stall": {
        x: VILLAGE_MARKET.position.x,
        z: VILLAGE_MARKET.position.z,
        yOffset: 0,
        rotationY: VILLAGE_MARKET.rotationY,
        scale: 1
      },
      dock: { x: 78, z: 67, yOffset: -0.65, rotationY: Math.PI / 2, scale: 1 }
    };
    return { id, ...layouts[id] };
  }

  public static terrainHeightfield(): Float32Array {
    const samples = new Float32Array((TERRAIN_RESOLUTION + 1) * (TERRAIN_RESOLUTION + 1));
    for (let row = 0; row <= TERRAIN_RESOLUTION; row++) {
      for (let column = 0; column <= TERRAIN_RESOLUTION; column++) {
        // Rapier lays heightfield rows along X and columns along Z. Keeping
        // this order aligned with terrainHeight prevents transposed slopes.
        const x = (row / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        const z = (column / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
        samples[row * (TERRAIN_RESOLUTION + 1) + column] = this.terrainHeight(x, z);
      }
    }
    return samples;
  }

  private static tokenColor(token: PaletteToken): THREE.Color {
    return new THREE.Color(PALETTE_HEX[token]);
  }

  public static buildPathGeometry(): THREE.BufferGeometry {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const transverse = [-1, -0.88, -0.72, -0.52, -0.34, -0.16, 0, 0.16, 0.34, 0.52, 0.72, 0.88, 1] as const;
    const grass = this.tokenColor("foliage_sage_01");
    const dryShoulder = this.tokenColor("soil_dry_01");
    const warmShoulder = this.tokenColor("soil_warm_01");
    const road = this.tokenColor("path_dust_01");
    const rut = this.tokenColor("soil_damp_01").lerp(road, 0.46);

    const plazaCenter = VILLAGE_MARKET.position;
    const plazaRadius = 4.2;
    const plazaSegments = 16;

    // 1. Authored route ribbons
    for (const [routeIndex, route] of WORLD_ROUTES.entries()) {
      const path = WORLD_PATHS[routeIndex];
      const profile = WORLD_ROUTE_PROFILES[route.kind];
      const baseVertex = positions.length / 3;

      for (let pointIndex = 0; pointIndex < path.length; pointIndex++) {
        const previous = path[Math.max(0, pointIndex - 1)];
        const next = path[Math.min(path.length - 1, pointIndex + 1)];
        const tangentX = next.x - previous.x;
        const tangentZ = next.z - previous.z;
        const length = Math.max(0.0001, Math.hypot(tangentX, tangentZ));
        const normalX = -tangentZ / length;
        const normalZ = tangentX / length;
        const distToPlaza = Math.hypot(path[pointIndex].x - plazaCenter.x, path[pointIndex].z - plazaCenter.z);
        const plazaWidening = distToPlaza < 7.5 ? (1 - smoothstep(3.8, 7.5, distToPlaza)) * 0.4 : 0;
        const authoredWidth =
          0.97
          + Math.sin(pointIndex * 0.31 + routeIndex * 1.7) * (route.kind === "trail" ? 0.085 : 0.055)
          + Math.sin(pointIndex * 0.09 + routeIndex) * 0.025
          + plazaWidening;
        const junctionProgress = Math.min(pointIndex, path.length - 1 - pointIndex);
        const junctionWidening = route.kind !== "trail" ? (1 - smoothstep(0, 4, junctionProgress)) * 0.08 : 0;
        const halfWidth = route.widthMeters * 0.5 * (authoredWidth + junctionWidening);

        for (const offset of transverse) {
          const edgeWobble = Math.sin(pointIndex * 0.43 + routeIndex * 2.1 + offset * 3.1) * 0.025;
          const x = path[pointIndex].x + normalX * halfWidth * (offset + edgeWobble);
          const z = path[pointIndex].z + normalZ * halfWidth * (offset + edgeWobble);
          const absoluteOffset = Math.abs(offset);
          const crown = Math.pow(1 - absoluteOffset, 1.45) * profile.crownMeters;
          const wheelRut = route.kind === "trail"
            ? 0
            : Math.exp(-Math.pow((absoluteOffset - 0.34) / 0.09, 2)) * profile.rutDepthMeters;
          const brokenTrailWear = route.kind === "trail"
            ? Math.exp(-Math.pow(absoluteOffset / 0.3, 2))
              * profile.rutDepthMeters
              * (0.35 + (Math.sin(pointIndex * 0.83 + routeIndex) * 0.5 + 0.5) * 0.65)
            : 0;
          const shoulderDrop = smoothstep(0.75, 1, absoluteOffset) * profile.shoulderDropMeters;
          const baseLift = 0.025;
          const isVertexInBridgeSpan =
            Math.abs(x - BRIDGE_CENTER.x) < BRIDGE_WORLD_PROFILE.spanLength * 0.5 &&
            Math.abs(z - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.6;
          const rawHeight = isVertexInBridgeSpan
            ? BRIDGE_WORLD_PROFILE.entrySurfaceY
            : this.terrainHeight(x, z);
          positions.push(x, rawHeight + baseLift + crown - wheelRut - brokenTrailWear - shoulderDrop, z);

          // Wider edge feathering so ribbon edges blend seamlessly into the warm terrain tint
          const edgeEncroachment = smoothstep(0.58, 1, absoluteOffset);
          const shoulderBlend = smoothstep(0.42, 0.78, absoluteOffset);
          const rutWeight = route.kind !== "trail"
            ? Math.exp(-Math.pow((absoluteOffset - 0.34) / 0.085, 2))
            : Math.exp(-Math.pow(absoluteOffset / 0.3, 2))
              * smoothstep(-0.1, 0.55, Math.sin(pointIndex * 0.83 + routeIndex));
          // Edge grass blend ramps from ~40% at shoulder edge to ~92% at the outermost strip,
          // ensuring the ribbon dissolves into the warm terrain-tinted ground
          const grassBlend = edgeEncroachment * (0.40 + (Math.sin(pointIndex * 0.47 + routeIndex) * 0.5 + 0.5) * 0.52);
          const base = road.clone()
            .lerp(warmShoulder, shoulderBlend * 0.65)
            .lerp(dryShoulder, shoulderBlend * 0.25)
            .lerp(rut, rutWeight * (route.kind === "trail" ? 0.46 : 0.76))
            .lerp(grass, grassBlend);
          const variation = 0.95 + (Math.sin(pointIndex * 1.17 + offset * 7.1 + routeIndex) * 0.5 + 0.5) * 0.08;
          colors.push(base.r * variation, base.g * variation, base.b * variation);
        }
      }

      for (let pointIndex = 0; pointIndex < path.length - 1; pointIndex++) {
        const segMidX = (path[pointIndex].x + path[pointIndex + 1].x) * 0.5;
        const segMidZ = (path[pointIndex].z + path[pointIndex + 1].z) * 0.5;

        // Skip bridge deck span over water
        const isBridgeSegment =
          Math.abs(segMidX - BRIDGE_CENTER.x) < BRIDGE_WORLD_PROFILE.spanLength * 0.46 &&
          Math.abs(segMidZ - BRIDGE_CENTER.z) <= BRIDGE_WORLD_PROFILE.deckWidth * 0.55;
        if (isBridgeSegment) continue;

        // Skip segments inside the village square plaza
        const dist1 = Math.hypot(path[pointIndex].x - plazaCenter.x, path[pointIndex].z - plazaCenter.z);
        const dist2 = Math.hypot(path[pointIndex + 1].x - plazaCenter.x, path[pointIndex + 1].z - plazaCenter.z);
        if (dist1 < 3.8 && dist2 < 3.8) continue;

        for (let column = 0; column < transverse.length - 1; column++) {
          const current = baseVertex + pointIndex * transverse.length + column;
          const next = current + transverse.length;
          if ((pointIndex + column + routeIndex) % 2 === 0) {
            indices.push(current, current + 1, next, next, current + 1, next + 1);
          } else {
            indices.push(current, current + 1, next + 1, current, next + 1, next);
          }
        }
      }
    }

    // 2. Village marketplace plaza hub at [0, -5]
    const plazaCenterIndex = positions.length / 3;
    const plazaCenterHeight = this.terrainHeight(plazaCenter.x, plazaCenter.z) + 0.025;
    positions.push(plazaCenter.x, plazaCenterHeight, plazaCenter.z);
    const plazaCenterColor = road.clone().lerp(warmShoulder, 0.28);
    colors.push(plazaCenterColor.r, plazaCenterColor.g, plazaCenterColor.b);

    const plazaRingStartIndex = positions.length / 3;
    for (let seg = 0; seg < plazaSegments; seg++) {
      const angle = (seg / plazaSegments) * Math.PI * 2;
      const rx = plazaCenter.x + Math.cos(angle) * plazaRadius;
      const rz = plazaCenter.z + Math.sin(angle) * plazaRadius;
      const ry = this.terrainHeight(rx, rz) + 0.022;
      positions.push(rx, ry, rz);
      const ringColor = road.clone()
        .lerp(warmShoulder, 0.48)
        .lerp(grass, 0.18);
      const variation = 0.96 + Math.sin(seg * 1.7) * 0.04;
      colors.push(ringColor.r * variation, ringColor.g * variation, ringColor.b * variation);
    }
    for (let seg = 0; seg < plazaSegments; seg++) {
      const nextSeg = (seg + 1) % plazaSegments;
      indices.push(plazaCenterIndex, plazaRingStartIndex + seg, plazaRingStartIndex + nextSeg);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.routeProfiles = WORLD_ROUTES.map((route) => ({
      id: route.id,
      kind: route.kind,
      ...WORLD_ROUTE_PROFILES[route.kind]
    }));
    return geometry;
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
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
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

    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const center = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    const edgeA = new THREE.Vector3();
    const edgeB = new THREE.Vector3();
    for (let index = 0; index < positions.count; index += 3) {
      a.fromBufferAttribute(positions, index);
      b.fromBufferAttribute(positions, index + 1);
      c.fromBufferAttribute(positions, index + 2);
      center.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      edgeA.copy(b).sub(a);
      edgeB.copy(c).sub(a);
      faceNormal.crossVectors(edgeA, edgeB).normalize();
      const weights = this.terrainSurfaceWeights(center.x, center.z, Math.abs(faceNormal.y));
      const color = new THREE.Color(0, 0, 0);
      for (const [key, weight] of Object.entries(weights) as Array<[keyof TerrainSurfaceWeights, number]>) {
        color.r += palette[key].r * weight;
        color.g += palette[key].g * weight;
        color.b += palette[key].b * weight;
      }
      const broadVariation =
        Math.sin(center.x * 0.027 + center.z * 0.019) * 0.024
        + Math.sin(center.x * 0.011 - center.z * 0.034 + 1.2) * 0.018;
      const aspectVariation = faceNormal.x * 0.026 - faceNormal.z * 0.018;
      const topPlaneWarmth = smoothstep(0.82, 0.99, Math.abs(faceNormal.y)) * 0.014;
      const facetVariation = THREE.MathUtils.clamp(
        0.975 + broadVariation + aspectVariation + topPlaneWarmth,
        0.91,
        1.07
      );
      color.multiplyScalar(facetVariation);
      for (let vertex = 0; vertex < 3; vertex++) colors.set([color.r, color.g, color.b], (index + vertex) * 3);
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

}

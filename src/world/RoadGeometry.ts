import * as THREE from "three";
import { PALETTE_HEX } from "../render/materials/PaletteTokens";
import type {
  CompiledWorldRoute,
  WorldPoint,
  WorldRouteJunction,
  WorldRouteKind,
  WorldRouteProfile
} from "./WorldLayout";

export interface OrganicRoadGeometryOptions {
  routes: readonly CompiledWorldRoute[];
  junctions: readonly WorldRouteJunction[];
  profiles: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>>;
  bridge: {
    center: WorldPoint;
    halfSpan: number;
    deckWidth: number;
    entrySurfaceY: number;
    westDeckEdge: WorldPoint;
    eastDeckEdge: WorldPoint;
    gatewayDepthMeters: number;
    gatewayInsetMeters: number;
    gatewayOverlapMeters?: number;
    gatewaySlabCount: number;
    gatewaySlabGapMeters: number;
  };
  heightAt: (x: number, z: number) => number;
  isBridgeDeck: (x: number, z: number) => boolean;
}

export interface RoadCrossSectionInput {
  profile: Readonly<WorldRouteProfile>;
  halfWidthMeters: number;
  lateralDistanceMeters: number;
}

export interface RoadCrossSectionSample {
  normalizedCoreDistance: number;
  crownMeters: number;
  shoulderAmount: number;
  edgeGrassAmount: number;
  surfaceOffsetMeters: number;
}

/**
 * Class code each road vertex carries in its `roadClass` attribute: the three
 * route kinds, then shared surfaces (junctions, the bridge gateway) that carry
 * no wheel tracks of their own.
 */
export const ROAD_CLASS_CODES: Readonly<Record<WorldRouteKind | "shared", number>> = Object.freeze({
  arterial: 0, lane: 1, trail: 2, shared: 3
});

const TRANSVERSE_OFFSETS = [
  -1, -0.97, -0.9, -0.78, -0.62, -0.42, -0.21, -0.14, 0,
  0.14, 0.21, 0.42, 0.62, 0.78, 0.9, 0.97, 1
] as const;

function paletteColor(token: keyof typeof PALETTE_HEX): THREE.Color {
  return new THREE.Color(PALETTE_HEX[token]);
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

/** Where a branch strip meets the route it continues. The ribbon stops here. */
function junctionApronRadius(junction: WorldRouteJunction): number {
  return junction.radiusMeters + junction.blendLengthMeters * 1.08;
}

/**
 * A wedge between two meeting roads is paved out to here. Shallow forks need
 * the longer run; a right-angle crossing meets sooner.
 */
export const JUNCTION_GORE_REACH_METERS = 10;
/** Wider than this, the gap is the outside of the fork and stays meadow. */
const JUNCTION_GORE_OPEN_ANGLE = 2.55;

interface PlannedBranch extends JunctionBranch {
  heading: number;
  reach: number;
  featherHalfWidth: number;
}

interface JunctionPlan {
  junction: WorldRouteJunction;
  branches: PlannedBranch[];
}

function leftNormal(direction: WorldPoint): WorldPoint {
  return { x: -direction.z, z: direction.x };
}

function angleDelta(from: number, to: number): number {
  let delta = to - from;
  if (delta <= 0) delta += Math.PI * 2;
  return delta;
}

function headingContains(start: number, end: number, heading: number): boolean {
  return angleDelta(start, heading) <= angleDelta(start, end) + 1e-3;
}

/** Distance from the centre to where the two inner edges have clearly separated. */
function goreMeetDistance(a: PlannedBranch, b: PlannedBranch, delta: number): number {
  const span = Math.max(0.18, Math.sin(delta / 2));
  return (a.halfWidth + b.halfWidth + 3.2) / (2 * span);
}

function planJunctions(
  routes: readonly CompiledWorldRoute[],
  junctions: readonly WorldRouteJunction[],
  profiles: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>>
): JunctionPlan[] {
  return junctions.map((junction) => {
    const apron = junctionApronRadius(junction);
    const branches: PlannedBranch[] = junctionBranches(routes, junction).map((branch) => {
      const profile = profiles[branch.kind];
      return {
        ...branch,
        heading: Math.atan2(branch.direction.x, branch.direction.z),
        reach: apron,
        featherHalfWidth: branch.halfWidth + branch.shoulderWidthMeters + profile.terrainFeatherMeters * 0.78
      };
    }).sort((left, right) => left.heading - right.heading);
    for (let index = 0; index < branches.length; index++) {
      const current = branches[index];
      const next = branches[(index + 1) % branches.length];
      const delta = angleDelta(current.heading, next.heading);
      if (delta > JUNCTION_GORE_OPEN_ANGLE) continue;
      const reach = Math.min(JUNCTION_GORE_REACH_METERS, Math.max(apron, goreMeetDistance(current, next, delta)));
      current.reach = Math.max(current.reach, reach);
      next.reach = Math.max(next.reach, reach);
    }
    return { junction, branches };
  });
}

function pointInJunctionPlan(plan: JunctionPlan, point: WorldPoint): boolean {
  const dx = point.x - plan.junction.center.x;
  const dz = point.z - plan.junction.center.z;
  const distance = Math.hypot(dx, dz);
  const core = Math.max(0.72, plan.junction.radiusMeters * 0.74);
  if (distance <= core * 1.08) return true;
  const heading = Math.atan2(dx, dz);
  for (const branch of plan.branches) {
    const along = dx * branch.direction.x + dz * branch.direction.z;
    if (along < -0.25 || along > branch.reach) continue;
    const normal = leftNormal(branch.direction);
    if (Math.abs(dx * normal.x + dz * normal.z) <= branch.featherHalfWidth) return true;
  }
  for (let index = 0; index < plan.branches.length; index++) {
    const current = plan.branches[index];
    const next = plan.branches[(index + 1) % plan.branches.length];
    if (angleDelta(current.heading, next.heading) > JUNCTION_GORE_OPEN_ANGLE) continue;
    if (distance > Math.min(current.reach, next.reach)) continue;
    if (headingContains(current.heading, next.heading, heading)) return true;
  }
  return false;
}

/** A per-route offset, 0–1000 m, so neighbouring roads' track drift never runs in step. */
export function routeStationOffset(routeId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < routeId.length; index++) {
    hash ^= routeId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.round(((hash >>> 0) / 0xffffffff) * 1000);
}

/**
 * Canonical worked-road relief: a low crown falling to a loose shoulder that
 * feathers into the ground. It is symmetric across the centre line and never
 * drops below the graded terrain base used by the coarse Rapier heightfield.
 * Wheel tracks are lighting only (`RoadSurfaceMaterial`); they are never cut
 * into the collider, so the carriage and walkers ride a smooth crown.
 */
export function sampleRoadCrossSection(input: RoadCrossSectionInput): RoadCrossSectionSample {
  const lateralDistance = Math.abs(input.lateralDistanceMeters);
  const packedHalfWidth = Math.max(0.0001, input.halfWidthMeters);
  const shoulderHalfWidth = packedHalfWidth + input.profile.shoulderWidthMeters;
  const featherHalfWidth = shoulderHalfWidth + input.profile.terrainFeatherMeters * 0.78;
  const normalizedCoreDistance = clamp01(lateralDistance / packedHalfWidth);
  const shoulderAmount = smoothstep(
    packedHalfWidth * 0.86,
    shoulderHalfWidth,
    lateralDistance
  );
  const edgeGrassAmount = smoothstep(
    shoulderHalfWidth * 0.86,
    featherHalfWidth,
    lateralDistance
  ) * 0.9;
  const crownMeters = Math.pow(1 - normalizedCoreDistance, 1.42) * input.profile.crownMeters;
  const shoulderDropMeters = smoothstep(
    packedHalfWidth * 0.84,
    shoulderHalfWidth,
    lateralDistance
  ) * input.profile.shoulderDropMeters;
  const feather = 1 - smoothstep(
    shoulderHalfWidth * 0.72,
    featherHalfWidth,
    lateralDistance
  );
  return {
    normalizedCoreDistance,
    crownMeters,
    shoulderAmount,
    edgeGrassAmount,
    surfaceOffsetMeters: Math.max(0, crownMeters - shoulderDropMeters) * feather
  };
}

function normalize2D(x: number, z: number): WorldPoint {
  const length = Math.max(0.0001, Math.hypot(x, z));
  return { x: x / length, z: z / length };
}

function dot2D(a: WorldPoint, b: WorldPoint): number {
  return a.x * b.x + a.z * b.z;
}

function distance2D(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function blendColors(
  base: THREE.Color,
  warm: THREE.Color,
  dry: THREE.Color,
  shoulderAmount: number
): THREE.Color {
  return base.clone()
    .lerp(warm, shoulderAmount * 0.58)
    .lerp(dry, shoulderAmount * 0.12);
}

function outwardDirections(
  route: CompiledWorldRoute,
  center: WorldPoint
): WorldPoint[] {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [index, sample] of route.samples.entries()) {
    const distance = distance2D(sample.point, center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  const directions: WorldPoint[] = [];
  for (const neighborIndex of [closestIndex - 1, closestIndex + 1]) {
    if (neighborIndex < 0 || neighborIndex >= route.samples.length) continue;
    const neighbor = route.samples[neighborIndex].point;
    const direction = normalize2D(neighbor.x - center.x, neighbor.z - center.z);
    if (distance2D(neighbor, center) > 0.35) directions.push(direction);
  }
  if (directions.length > 0) return directions;

  const tangent = route.samples[closestIndex]?.tangent ?? { x: 1, z: 0 };
  return [tangent, { x: -tangent.x, z: -tangent.z }];
}

interface JunctionBranch {
  direction: WorldPoint;
  halfWidth: number;
  shoulderWidthMeters: number;
  kind: WorldRouteKind;
}

function junctionBranches(
  routes: readonly CompiledWorldRoute[],
  junction: WorldRouteJunction
): JunctionBranch[] {
  const branches: JunctionBranch[] = [];
  for (const route of routes) {
    if (!junction.routeIds.includes(route.route.id)) continue;
    for (const direction of outwardDirections(route, junction.center)) {
      const existing = branches.find((branch) => dot2D(branch.direction, direction) > 0.96);
      if (existing) {
        existing.direction = normalize2D(
          existing.direction.x + direction.x,
          existing.direction.z + direction.z
        );
        if (route.halfWidth > existing.halfWidth) existing.kind = route.route.kind;
        existing.halfWidth = Math.max(existing.halfWidth, route.halfWidth);
        existing.shoulderWidthMeters = Math.max(
          existing.shoulderWidthMeters,
          route.shoulderWidthMeters
        );
        continue;
      }
      branches.push({
        direction,
        halfWidth: route.halfWidth,
        shoulderWidthMeters: route.shoulderWidthMeters,
        kind: route.route.kind
      });
    }
  }
  return branches;
}

function routeJoin(
  route: CompiledWorldRoute,
  sampleIndex: number
): { normal: WorldPoint; miterScale: number } {
  const sample = route.samples[sampleIndex];
  const previous = route.samples[Math.max(0, sampleIndex - 1)]?.tangent ?? sample.tangent;
  const next = route.samples[Math.min(route.samples.length - 1, sampleIndex + 1)]?.tangent ?? sample.tangent;
  const previousNormal = { x: -previous.z, z: previous.x };
  const nextNormal = { x: -next.z, z: next.x };
  const bisectorX = previousNormal.x + nextNormal.x;
  const bisectorZ = previousNormal.z + nextNormal.z;
  const miter = Math.hypot(bisectorX, bisectorZ) > 0.0001
    ? normalize2D(bisectorX, bisectorZ)
    : nextNormal;
  const denominator = Math.abs(dot2D(miter, nextNormal));
  return {
    normal: miter,
    // Bounded miter prevents acute authored corners from producing spikes or
    // self-intersecting shoulder strips.
    miterScale: THREE.MathUtils.clamp(1 / Math.max(0.72, denominator), 0.86, 1.28)
  };
}

function colorWithVariation(color: THREE.Color, signal: number, amount: number = 0.06): THREE.Color {
  const variation = 1 - amount * 0.5 + (Math.sin(signal) * 0.5 + 0.5) * amount;
  return color.clone().multiplyScalar(variation);
}

function renderedCoordinate(value: number): number {
  // BufferGeometry stores positions as float32. Sampling the owner with the
  // same quantized coordinate prevents a one-ULP height seam at the bridge
  // deck boundary and at coarse terrain cells.
  return Math.fround(value);
}

export function buildOrganicRoadGeometry(options: OrganicRoadGeometryOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const frames: number[] = [];
  const classes: number[] = [];
  const indices: number[] = [];
  const road = paletteColor("path_dust_01");
  const warmShoulder = paletteColor("soil_warm_01");
  const dryShoulder = paletteColor("soil_dry_01");
  const shoulderGrass = paletteColor("foliage_sage_01");
  const warmStone = paletteColor("stone_warm_01");
  const goldenStone = paletteColor("stone_golden_01");
  const heightAt = (x: number, z: number): number => options.heightAt(renderedCoordinate(x), renderedCoordinate(z));
  const isBridgeDeck = (x: number, z: number): boolean => options.isBridgeDeck(renderedCoordinate(x), renderedCoordinate(z));

  // Every vertex carries its road's own frame: signed metres across the centre
  // line and metres along it. Both are linear across a strip, so they survive
  // any later triangle split exactly, and the material draws wheel tracks from
  // them instead of from wear sampled at whatever vertices the mesh happens to
  // have (which drew wobbling, pinching tracks).
  const appendVertex = (
    point: WorldPoint & { y: number },
    color: THREE.Color,
    opacity: number = 1,
    frame: readonly [across: number, along: number] = [0, 0],
    classCode: number = ROAD_CLASS_CODES.shared
  ): number => {
    const vertexIndex = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b, clamp01(opacity));
    frames.push(frame[0], frame[1]);
    classes.push(classCode);
    return vertexIndex;
  };

  const appendTriangle = (a: number, b: number, c: number): void => {
    const ax = positions[a * 3];
    const az = positions[a * 3 + 2];
    const abx = positions[b * 3] - ax;
    const abz = positions[b * 3 + 2] - az;
    const acx = positions[c * 3] - ax;
    const acz = positions[c * 3 + 2] - az;
    if (abz * acx - abx * acz < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };

  const appendQuad = (
    corners: readonly [
      WorldPoint & { y: number },
      WorldPoint & { y: number },
      WorldPoint & { y: number },
      WorldPoint & { y: number }
    ],
    color: THREE.Color
  ): void => {
    const base = corners.map((corner) => appendVertex(corner, color));
    appendTriangle(base[0], base[1], base[2]);
    appendTriangle(base[0], base[2], base[3]);
  };

  const junctionPlans = planJunctions(options.routes, options.junctions, options.profiles);
  const junctionPlanById = new Map(junctionPlans.map((plan) => [plan.junction.id, plan]));
  const junctionForRoute = (routeId: string, point: WorldPoint): WorldRouteJunction | undefined => {
    return options.junctions.find((junction) =>
      junction.routeIds.includes(routeId)
      // The paved wedge and the branch strips own this ground. The route
      // ribbon stops at that edge so the two surfaces do not stack.
      && pointInJunctionPlan(junctionPlanById.get(junction.id)!, point)
    );
  };

  // Where a lesser road runs on a greater road's surface — a branch leaving
  // its trunk, a service loop along a lane — only the greater road is drawn,
  // so two sets of tracks never lie across each other. Collision still takes
  // the upper of both, as it always has.
  const classRank: Readonly<Record<WorldRouteKind, number>> = { arterial: 0, lane: 1, trail: 2 };
  const outranks = (other: number, route: number): boolean => {
    const a = classRank[options.routes[other].route.kind], b = classRank[options.routes[route].route.kind];
    return a < b || (a === b && other < route);
  };
  const onGreaterRoad = (routeIndex: number, point: WorldPoint): boolean => {
    for (let other = 0; other < options.routes.length; other++) {
      if (other === routeIndex || !outranks(other, routeIndex)) continue;
      const greater = options.routes[other];
      if (point.x < greater.minX || point.x > greater.maxX || point.z < greater.minZ || point.z > greater.maxZ) continue;
      const reach = greater.halfWidth - 0.15;
      for (const segment of greater.segments) {
        if (point.x < segment.minX - reach || point.x > segment.maxX + reach
          || point.z < segment.minZ - reach || point.z > segment.maxZ + reach) continue;
        const t = clamp01(((point.x - segment.start.x) * segment.dx + (point.z - segment.start.z) * segment.dz) / segment.lengthSquared);
        if (Math.hypot(point.x - segment.start.x - segment.dx * t, point.z - segment.start.z - segment.dz * t) <= reach) return true;
      }
    }
    return false;
  };

  let roadTriangleCount = 0;
  let junctionTriangleCount = 0;
  let gatewayTriangleCount = 0;
  let boundedJoinMaximum = 0;
  let roundedCapCount = 0;

  for (const [routeIndex, compiledRoute] of options.routes.entries()) {
    const route = compiledRoute.route;
    const profile = options.profiles[route.kind];
    const classCode = ROAD_CLASS_CODES[route.kind];
    const stationOffset = routeStationOffset(route.id);
    const ringVertices: number[][] = [];
    const packedHalfWidth = compiledRoute.halfWidth;
    const shoulderHalfWidth = packedHalfWidth + compiledRoute.shoulderWidthMeters;
    // The feather is part of the visible corridor, but not part of the packed
    // travel surface. Keeping it in the same ribbon lets the worked earth
    // dissolve into the meadow without a second, drifting edge mesh.
    const featherHalfWidth = shoulderHalfWidth + compiledRoute.terrainFeatherMeters * 0.78;

    const appendRoadRing = (
      point: WorldPoint,
      normal: WorldPoint,
      station: number,
      miterScale: number
    ): number[] => {
      const ring: number[] = [];
      for (const offset of TRANSVERSE_OFFSETS) {
        const lateralDistance = Math.abs(offset) * featherHalfWidth;
        const crossSection = sampleRoadCrossSection({
          profile,
          halfWidthMeters: packedHalfWidth,
          lateralDistanceMeters: lateralDistance
        });
        const x = point.x + normal.x * featherHalfWidth * offset * miterScale;
        const z = point.z + normal.z * featherHalfWidth * offset * miterScale;
        const y = isBridgeDeck(x, z)
          ? options.bridge.entrySurfaceY
          : heightAt(x, z);
        // The outer shoulder picks up a bounded amount of the meadow token
        // before the coverage cut, so grass intrudes through colour and shape
        // rather than a wide transparent blur. Wear is the material's.
        const vertexColor = blendColors(road, warmShoulder, dryShoulder, crossSection.shoulderAmount)
          .lerp(shoulderGrass, clamp01(crossSection.edgeGrassAmount * 0.7));
        const surfaceOpacity = 1 - smoothstep(0.08, 0.92, crossSection.edgeGrassAmount);
        ring.push(appendVertex({ x, y, z }, vertexColor, surfaceOpacity,
          [offset * featherHalfWidth, station], classCode));
      }
      return ring;
    };

    const connectRings = (currentRing: number[], nextRing: number[], sampleIndex: number): void => {
      for (let column = 0; column < TRANSVERSE_OFFSETS.length - 1; column++) {
        if ((sampleIndex + column + routeIndex) % 2 === 0) {
          appendTriangle(currentRing[column], currentRing[column + 1], nextRing[column]);
          appendTriangle(nextRing[column], currentRing[column + 1], nextRing[column + 1]);
        } else {
          appendTriangle(currentRing[column], currentRing[column + 1], nextRing[column + 1]);
          appendTriangle(currentRing[column], nextRing[column + 1], nextRing[column]);
        }
        roadTriangleCount += 2;
      }
    };

    for (const [sampleIndex, sample] of compiledRoute.samples.entries()) {
      const join = routeJoin(compiledRoute, sampleIndex);
      boundedJoinMaximum = Math.max(boundedJoinMaximum, join.miterScale);
      ringVertices.push(appendRoadRing(
        sample.point,
        join.normal,
        sample.distanceAlongRoute + stationOffset,
        join.miterScale
      ));
    }

    const apronBoundary = (junction: WorldRouteJunction, inside: WorldPoint, outside: WorldPoint): WorldPoint => {
      const plan = junctionPlanById.get(junction.id)!;
      let low = 0;
      let high = 1;
      for (let step = 0; step < 18; step++) {
        const t = (low + high) * 0.5;
        const x = inside.x + (outside.x - inside.x) * t;
        const z = inside.z + (outside.z - inside.z) * t;
        if (pointInJunctionPlan(plan, { x, z })) low = t;
        else high = t;
      }
      const t = (low + high) * 0.5;
      return {
        x: inside.x + (outside.x - inside.x) * t,
        z: inside.z + (outside.z - inside.z) * t
      };
    };

    for (let sampleIndex = 0; sampleIndex < compiledRoute.samples.length - 1; sampleIndex++) {
      const startSample = compiledRoute.samples[sampleIndex];
      const endSample = compiledRoute.samples[sampleIndex + 1];
      const start = startSample.point;
      const end = endSample.point;
      // The authored bridge route contains exact west/east deck-boundary
      // samples. Skipping only the fully enclosed intervals gives exact deck
      // clipping while retaining a clean, capped approach at each boundary.
      if (isBridgeDeck(start.x, start.z) && isBridgeDeck(end.x, end.z)) continue;
      const startJunction = junctionForRoute(route.id, start);
      const endJunction = junctionForRoute(route.id, end);
      if (startJunction && endJunction && startJunction.id === endJunction.id) continue;
      if (onGreaterRoad(routeIndex, start) && onGreaterRoad(routeIndex, end)) continue;

      if ((startJunction || endJunction) && !(startJunction && endJunction)) {
        const junction = (startJunction ?? endJunction)!;
        const insideIndex = startJunction ? sampleIndex : sampleIndex + 1;
        const outsideIndex = startJunction ? sampleIndex + 1 : sampleIndex;
        const inside = compiledRoute.samples[insideIndex];
        const outside = compiledRoute.samples[outsideIndex];
        if (pointInJunctionPlan(junctionPlanById.get(junction.id)!, outside.point)) continue;
        const boundary = apronBoundary(junction, inside.point, outside.point);
        const outsideJoin = routeJoin(compiledRoute, outsideIndex);
        const span = Math.max(1e-4, distance2D(inside.point, outside.point));
        const travelled = distance2D(inside.point, boundary);
        const station = stationOffset + inside.distanceAlongRoute
          + (outside.distanceAlongRoute - inside.distanceAlongRoute) * (travelled / span);
        const boundaryRing = appendRoadRing(boundary, outsideJoin.normal, station, outsideJoin.miterScale);
        if (startJunction) connectRings(boundaryRing, ringVertices[outsideIndex], sampleIndex);
        else connectRings(ringVertices[outsideIndex], boundaryRing, sampleIndex);
        continue;
      }

      connectRings(ringVertices[sampleIndex], ringVertices[sampleIndex + 1], sampleIndex);
    }

    const appendRoundedCap = (sampleIndex: number, outwardSign: number): void => {
      const sample = compiledRoute.samples[sampleIndex];
      const touchingJunction = options.junctions.some((junction) =>
        junction.routeIds.includes(route.id)
        && distance2D(sample.point, junction.center) <= junction.radiusMeters + junction.blendLengthMeters * 0.72
      );
      if (touchingJunction || isBridgeDeck(sample.point.x, sample.point.z) || onGreaterRoad(routeIndex, sample.point)) return;
      roundedCapCount++;
      const tangent = {
        x: sample.tangent.x * outwardSign,
        z: sample.tangent.z * outwardSign
      };
      const normal = sample.normal;
      const capRadius = shoulderHalfWidth;
      // The cap's vertices keep the road's own frame, so its tracks run out
      // into the cap instead of stopping at a seam.
      const frameAt = (x: number, z: number): [number, number] => [
        (x - sample.point.x) * normal.x + (z - sample.point.z) * normal.z,
        sample.distanceAlongRoute + stationOffset
          + (x - sample.point.x) * sample.tangent.x + (z - sample.point.z) * sample.tangent.z
      ];
      const center = {
        x: sample.point.x + tangent.x * capRadius * 0.48,
        z: sample.point.z + tangent.z * capRadius * 0.48,
        y: heightAt(sample.point.x + tangent.x * capRadius * 0.48, sample.point.z + tangent.z * capRadius * 0.48)
      };
      const centerIndex = appendVertex(center, colorWithVariation(road, sample.distanceAlongRoute + routeIndex * 1.7, 0.035),
        1, frameAt(center.x, center.z), classCode);
      const arc: number[] = [];
      const arcSegments = 8;
      for (let step = 0; step <= arcSegments; step++) {
        const angle = -Math.PI * 0.5 + (step / arcSegments) * Math.PI;
        const x = sample.point.x + tangent.x * Math.cos(angle) * capRadius + normal.x * Math.sin(angle) * capRadius;
        const z = sample.point.z + tangent.z * Math.cos(angle) * capRadius + normal.z * Math.sin(angle) * capRadius;
        arc.push(appendVertex(
          { x, y: heightAt(x, z), z },
          colorWithVariation(road, sample.distanceAlongRoute + step * 0.37 + routeIndex, 0.035),
          0.08,
          frameAt(x, z),
          classCode
        ));
      }
      for (let step = 0; step < arcSegments; step++) {
        appendTriangle(centerIndex, arc[step], arc[step + 1]);
        roadTriangleCount++;
      }
      // The fan center sits beyond the endpoint. Close its diameter back to
      // the ribbon; the arc triangles alone leave a triangular hole here.
      appendTriangle(centerIndex, arc[arcSegments], arc[0]);
      roadTriangleCount++;
    };

    appendRoundedCap(0, -1);
    appendRoundedCap(compiledRoute.samples.length - 1, 1);
  }

  const junctionCoreSegmentCount = 20;
  let junctionArmCount = 0;
  let junctionGoreTriangleCount = 0;
  for (const plan of junctionPlans) {
    const junction = plan.junction;
    const branches = plan.branches;
    const coreRadius = Math.max(0.72, junction.radiusMeters * 0.74);
    const centerHeight = heightAt(junction.center.x, junction.center.z);
    const centerColor = junction.surface === "village-market"
      ? road.clone().lerp(warmShoulder, 0.4)
      : junction.surface === "landmark-gateway"
        ? road.clone().lerp(warmShoulder, 0.34)
        : road.clone().lerp(warmShoulder, junction.surface === "farm-yard" ? 0.3 : 0.22);
    const centerIndex = appendVertex({ ...junction.center, y: centerHeight }, centerColor);
    const coreRing: number[] = [];

    // A compact faceted center gives the junction a shaped apron without the
    // old circular decal. Its broad radius is deliberately smaller than the
    // authored blend envelope so branch arms, not a disk, determine its outline.
    for (let segment = 0; segment < junctionCoreSegmentCount; segment++) {
      const angle = (segment / junctionCoreSegmentCount) * Math.PI * 2;
      const radial = { x: Math.cos(angle), z: Math.sin(angle) };
      const radiusVariation = 0.94 + Math.sin(angle * 2.0 + junction.radiusMeters * 0.7) * 0.035;
      const point = {
        x: junction.center.x + radial.x * coreRadius * radiusVariation,
        z: junction.center.z + radial.z * coreRadius * radiusVariation
      };
      coreRing.push(appendVertex(
        { ...point, y: heightAt(point.x, point.z) },
        colorWithVariation(centerColor, segment * 0.61 + junction.radiusMeters, 0.038)
      ));
    }

    for (let segment = 0; segment < junctionCoreSegmentCount; segment++) {
      const next = (segment + 1) % junctionCoreSegmentCount;
      appendTriangle(centerIndex, coreRing[next], coreRing[segment]);
      junctionTriangleCount++;
    }

    for (const [branchIndex, branch] of branches.entries()) {
      const profile = options.profiles[branch.kind];
      const featherHalfWidth = branch.featherHalfWidth;
      const opacityAt = (lateral: number): number => 1 - smoothstep(0.08, 0.92, sampleRoadCrossSection({
        profile,
        halfWidthMeters: branch.halfWidth,
        lateralDistanceMeters: lateral
      }).edgeGrassAmount);
      const branchNormal = leftNormal(branch.direction);
      const startDistance = coreRadius * 0.86;
      const endDistance = branch.reach;
      const branchColor = colorWithVariation(
        centerColor.clone().lerp(road, 0.65),
        branchIndex * 1.31 + junction.radiusMeters,
        0.035
      );
      const branchEdgeColor = branchColor.clone().lerp(dryShoulder, 0.2);
      const place = (point: WorldPoint, color: THREE.Color, opacity: number, across: number): number =>
        appendVertex(
          { ...point, y: heightAt(point.x, point.z) },
          color,
          opacity,
          [across, 0],
          ROAD_CLASS_CODES.shared
        );
      // Several stations across the strip keep the packed crown opaque. A
      // single quad from centre to feather lets alpha testing cut the road
      // into a pale tongue.
      const laterals = [-1, -0.72, -0.42, 0, 0.42, 0.72, 1];
      const ringAt = (distance: number): number[] => laterals.map((offset) => {
        const across = offset * featherHalfWidth;
        const lateral = Math.abs(across);
        return place(
          {
            x: junction.center.x + branch.direction.x * distance + branchNormal.x * across,
            z: junction.center.z + branch.direction.z * distance + branchNormal.z * across
          },
          Math.abs(offset) > 0.8 ? branchEdgeColor : branchColor,
          opacityAt(lateral),
          across
        );
      });
      const startRing = ringAt(startDistance);
      const endRing = ringAt(endDistance);
      for (let column = 0; column < laterals.length - 1; column++) {
        appendTriangle(startRing[column], startRing[column + 1], endRing[column + 1]);
        appendTriangle(startRing[column], endRing[column + 1], endRing[column]);
        junctionTriangleCount += 2;
      }
      junctionArmCount++;
    }

    const goreSteps = 4;
    for (let index = 0; index < branches.length; index++) {
      const current = branches[index];
      const next = branches[(index + 1) % branches.length];
      const delta = angleDelta(current.heading, next.heading);
      if (delta > JUNCTION_GORE_OPEN_ANGLE) continue;
      const reach = Math.min(current.reach, next.reach);
      const currentNormal = leftNormal(current.direction);
      const nextNormal = leftNormal(next.direction);
      const currentHalf = current.halfWidth + current.shoulderWidthMeters * 0.2;
      const nextHalf = -(next.halfWidth + next.shoulderWidthMeters * 0.2);
      for (let step = 0; step < goreSteps; step++) {
        const near = coreRadius * 0.55 + (reach - coreRadius * 0.55) * step / goreSteps;
        const far = coreRadius * 0.55 + (reach - coreRadius * 0.55) * (step + 1) / goreSteps;
        const corner = (branch: PlannedBranch, normal: WorldPoint, lateral: number, distance: number): WorldPoint & { y: number } => ({
          x: junction.center.x + branch.direction.x * distance + normal.x * lateral,
          z: junction.center.z + branch.direction.z * distance + normal.z * lateral,
          y: 0
        });
        const quad = [
          corner(current, currentNormal, currentHalf, near),
          corner(next, nextNormal, nextHalf, near),
          corner(next, nextNormal, nextHalf, far),
          corner(current, currentNormal, currentHalf, far)
        ].map((point) => ({ ...point, y: heightAt(point.x, point.z) }));
        appendQuad(quad as [
          WorldPoint & { y: number },
          WorldPoint & { y: number },
          WorldPoint & { y: number },
          WorldPoint & { y: number }
        ], centerColor);
        junctionTriangleCount += 2;
        junctionGoreTriangleCount += 2;
      }
    }
  }

  const halfDeckWidth = options.bridge.deckWidth * 0.5;
  const slabCount = Math.max(2, Math.floor(options.bridge.gatewaySlabCount));
  const totalGap = options.bridge.gatewaySlabGapMeters * (slabCount - 1);
  const slabWidth = (options.bridge.deckWidth - totalGap) / slabCount;
  const gatewayHeight = options.bridge.entrySurfaceY;
  const gatewayVertexStart = positions.length / 3;

  for (const [sideIndex, side] of [-1, 1].entries()) {
    const edge = side < 0 ? options.bridge.westDeckEdge : options.bridge.eastDeckEdge;
    for (let slabIndex = 0; slabIndex < slabCount; slabIndex++) {
      const zStart = -halfDeckWidth + slabIndex * (slabWidth + options.bridge.gatewaySlabGapMeters);
      const zEnd = zStart + slabWidth;
      const boundaryInset = options.bridge.gatewayInsetMeters;
      const irregular = Math.sin((slabIndex + 1) * 2.7 + sideIndex * 1.9);
      // Anchor gateway stone slabs to the approach terrain edge.
      const nearX = edge.x + side * boundaryInset;
      const farX = edge.x + side * options.bridge.gatewayDepthMeters;
      const nearZStart = options.bridge.center.z + zStart + 0.035 + irregular * 0.025;
      const nearZEnd = options.bridge.center.z + zEnd - 0.035 + irregular * 0.018;
      const farZStart = nearZStart + Math.sin(slabIndex * 1.4 + sideIndex) * 0.035;
      const farZEnd = nearZEnd + Math.cos(slabIndex * 1.1 + sideIndex) * 0.028;
      const slabColor = (slabIndex + sideIndex) % 2 === 0 ? warmStone : goldenStone;
      const gatewayHeightAt = (x: number, z: number): number =>
        isBridgeDeck(x, z) ? gatewayHeight : heightAt(x, z);
      const nearStart = { x: nearX, y: gatewayHeightAt(nearX, nearZStart), z: nearZStart };
      const nearEnd = { x: nearX, y: gatewayHeightAt(nearX, nearZEnd), z: nearZEnd };
      const farStart = { x: farX, y: heightAt(farX, farZStart), z: farZStart };
      const farEnd = { x: farX, y: heightAt(farX, farZEnd), z: farZEnd };
      // Reverse the west-bank winding so both entries present their stone
      // faces upward to the standard front-face material.
      appendQuad(side < 0
        ? [nearStart, farStart, farEnd, nearEnd]
        : [nearStart, nearEnd, farEnd, farStart],
      colorWithVariation(slabColor, slabIndex * 1.17 + sideIndex, 0.06));
      gatewayTriangleCount += 2;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute("roadFrame", new THREE.Float32BufferAttribute(frames, 2));
  geometry.setAttribute("roadClass", new THREE.Float32BufferAttribute(classes, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.routeProfiles = options.routes.map((compiledRoute) => ({
    ...options.profiles[compiledRoute.route.kind],
    id: compiledRoute.route.id,
    scope: compiledRoute.route.scope,
    kind: compiledRoute.route.kind,
    widthMeters: compiledRoute.route.widthMeters,
    totalLength: compiledRoute.totalLength
  }));
  geometry.userData.compiledRouteCount = options.routes.length;
  geometry.userData.roadTriangleCount = roadTriangleCount;
  geometry.userData.junctionTriangleCount = junctionTriangleCount;
  geometry.userData.bridgeGatewayTriangleCount = gatewayTriangleCount;
  geometry.userData.bridgeGatewayBandCount = slabCount * 2;
  geometry.userData.bridgeGatewayVertexStart = gatewayVertexStart;
  geometry.userData.bridgeGatewayVertexCount = positions.length / 3 - gatewayVertexStart;
  geometry.userData.bridgeGatewayHeight = gatewayHeight;
  geometry.userData.maximumMiterScale = boundedJoinMaximum;
  geometry.userData.roundedCapCount = roundedCapCount;
  geometry.userData.junctionCoreSegmentCount = junctionCoreSegmentCount;
  geometry.userData.junctionArmCount = junctionArmCount;
  geometry.userData.junctionGoreTriangleCount = junctionGoreTriangleCount;
  geometry.userData.junctionSurfaceKinds = options.junctions.map((junction) => junction.surface);
  return geometry;
}

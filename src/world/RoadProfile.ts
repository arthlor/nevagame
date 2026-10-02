import type { RoadClassProfile } from "./RoadClasses";

export interface RoadCrossSectionInput {
  profile: Readonly<RoadClassProfile>;
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

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
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

/** Nine semantic stations, refined only when their crown interpolation exceeds five millimetres. */
export function roadTransverseStations(profile: Readonly<RoadClassProfile>, halfWidth: number): readonly number[] {
  const shoulder = halfWidth + profile.shoulderWidthMeters;
  const outer = shoulder + profile.terrainFeatherMeters * 0.78;
  const base = [-outer, -shoulder, -halfWidth, -halfWidth * 0.5, 0, halfWidth * 0.5, halfWidth, shoulder, outer];
  const relief = (across: number): number => sampleRoadCrossSection({ profile, halfWidthMeters: halfWidth, lateralDistanceMeters: Math.abs(across) }).surfaceOffsetMeters;
  const stations: number[] = [base[0]];
  const subdivide = (a: number, b: number, depth: number): void => {
    const ya = relief(a), yb = relief(b);
    const error = Math.max(...[0.25, 0.5, 0.75].map(t => Math.abs(relief(a + (b - a) * t) - (ya + (yb - ya) * t))));
    if (error > 0.005 && depth < 8) { const mid = (a + b) / 2; subdivide(a, mid, depth + 1); subdivide(mid, b, depth + 1); }
    else stations.push(b);
  };
  for (let i = 1; i < base.length; i++) subdivide(base[i - 1], base[i], 0);
  return stations;
}


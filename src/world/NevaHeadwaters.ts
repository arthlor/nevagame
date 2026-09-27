/**
 * Authored spring and descending upper reach; coordinates and elevations are
 * metres. The upper reach steps rather than ramps: a rock spring at the
 * headwall talus, a short steep chute to a bedrock lip crest, an explicit fall
 * face, and a level plunge pool that hands off to the main river.
 * `fall` owns that discontinuity so reach/surface consumers do not have to
 * infer it from the knots.
 */
export const NEVA_HEADWATERS = Object.freeze({
  source: Object.freeze({ x: -30, z: -150 }),
  endZ: -116,
  sourceRadiusMeters: 2.2,
  // Dry padding lets water vertices follow the same profile before shoreline clipping.
  bounds: Object.freeze({ minX: -55, maxX: -5, minZ: -158, maxZ: -110 }),
  /** Water seeps from the headwall talus into a short rocky chute, spills over
   * a high bedrock lip into a level plunge pool, then leaves the pool over a
   * bedrock sill down a short step-pool staircase (`cascade`). All optical and
   * support consumers use these same stations. */
  elevationKnots: Object.freeze([
    { z: -150, elevation: 33.5 },
    { z: -146, elevation: 32.84 },
    { z: -141, elevation: 32.25 },
    { z: -136.5, elevation: 32 },
    { z: -136, elevation: 32 },
    { z: -134.5, elevation: 4.5 },
    { z: -132, elevation: 4.5 },
    { z: -128, elevation: 4.5 },
    { z: -124, elevation: 4.5 },
    { z: -122.9, elevation: 3.25 },
    { z: -121.5, elevation: 3.1 },
    { z: -120.5, elevation: 1.85 },
    { z: -118.6, elevation: 1.7 },
    { z: -117.6, elevation: 0.45 },
    { z: -116, elevation: 0 }
  ]),
  /** Falling segment between the named reaches; presentation sheets are W07's owner. */
  fall: Object.freeze({
    id: "waterfall.neva_headwaters",
    upstreamReachId: "reach.neva_headwaters",
    downstreamReachId: "reach.neva_main",
    lipZ: -136,
    lipElevation: 32,
    landingZ: -134.5,
    landingElevation: 4.5
  }),
  /**
   * Plunge basin carved into the pool shelf: the water widens and deepens at
   * the landing, then narrows and shallows again toward the outflow so the
   * reach keeps its run/outlet rhythm instead of ending in a uniform trench.
   */
  pool: Object.freeze({
    id: "reach.neva_headwaters_pool",
    centerZ: -130,
    halfLengthMeters: 7,
    widenMeters: 3.2,
    depthMeters: 2.1
  }),
  /**
   * Step-pool outlet between the plunge pool and the meadow river. Each step
   * is one short steep segment of `elevationKnots` (lip to foot): the water
   * shoals over a boulder sill at the lip and scours a small pool below the
   * foot. The channel is confined between rock banks through the staircase,
   * as a steep coarse-bed reach is, before the valley opens. Steps stay inside
   * the scenic headwater reach, so no cascade enters a sailable channel.
   */
  cascade: Object.freeze({
    id: "reach.neva_headwaters_cascade",
    steps: Object.freeze([
      Object.freeze({ lipZ: -124, footZ: -122.9 }),
      Object.freeze({ lipZ: -121.5, footZ: -120.5 }),
      Object.freeze({ lipZ: -118.6, footZ: -117.6 })
    ]),
    /** Metres each water edge draws in through the staircase. */
    confinementMeters: 1.5,
    /** Water depth left over each boulder sill, and extra scour below each foot. */
    sillDepthMeters: 0.38,
    scourDepthMeters: 0.55
  })
});

/** 0 outside the step-pool outlet, 1 through the confined staircase. */
export function headwaterCascadeInfluence(z: number): number {
  const steps = NEVA_HEADWATERS.cascade.steps;
  const start = steps[0].lipZ;
  const end = steps[steps.length - 1].footZ;
  const enter = smooth01((z - (start - 2.5)) / 2);
  const leave = 1 - smooth01((z - (end + 0.4)) / 2.6);
  return enter * leave;
}

/**
 * Bed offset relative to a uniform-depth channel through the staircase:
 * positive over each boulder sill (the water shoals to `sillDepthMeters`
 * at the lip), negative in the scour pool below each foot. Callers pass the
 * uniform depth they would otherwise carve, so a sill never breaks the surface.
 */
export function headwaterCascadeBedOffset(z: number, uniformDepthMeters: number): number {
  const { steps, sillDepthMeters, scourDepthMeters } = NEVA_HEADWATERS.cascade;
  const sillRise = Math.max(0, uniformDepthMeters - sillDepthMeters);
  let offset = 0;
  for (const step of steps) {
    const sill = 1 - smooth01(Math.abs(z - (step.lipZ - 0.45)) / 1.1);
    const scour = 1 - smooth01(Math.abs(z - (step.footZ + 0.75)) / 1.2);
    offset += sill * sillRise - scour * scourDepthMeters;
  }
  return offset;
}

function smooth01(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export function isInHeadwaterBounds(x: number, z: number): boolean {
  const bounds = NEVA_HEADWATERS.bounds;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * True inside the authored falling segment, where the upper channel hands off
 * to the fall and the pool takes over again. Horizontal water surfaces exclude
 * this band; the dedicated fall sheet owns it (W07 surface ownership).
 */
export function isInHeadwaterFallBand(z: number, marginMeters = 0): boolean {
  const fall = NEVA_HEADWATERS.fall;
  return z > fall.lipZ - marginMeters && z < fall.landingZ + marginMeters;
}

/** Rocky spring bowl shared by terrain materials and sheltered-cover suppression. */
export function headwaterSpringInfluence(x: number, z: number): number {
  const distance = Math.hypot(x - NEVA_HEADWATERS.source.x, z - NEVA_HEADWATERS.source.z);
  const t = Math.max(0, Math.min(1, (distance - 7) / 9));
  return 1 - t * t * (3 - 2 * t);
}

/** Smooth monotone profile with level spring, pools and a flush sea-level handoff. */
export function headwaterElevationAt(z: number): number {
  const knots = NEVA_HEADWATERS.elevationKnots;
  if (z <= knots[0].z) return knots[0].elevation;
  for (let index = 1; index < knots.length; index++) {
    const end = knots[index];
    if (z > end.z) continue;
    // Exact at every knot; the eased blend lands a rounding error short.
    if (z === end.z) return end.elevation;
    const start = knots[index - 1];
    const t = (z - start.z) / (end.z - start.z);
    return start.elevation + (end.elevation - start.elevation) * t * t * (3 - 2 * t);
  }
  return 0;
}

/** Exact d(elevation)/dz, shared by CPU and rendered surface normals. */
export function headwaterGradientAt(z: number): number {
  const knots = NEVA_HEADWATERS.elevationKnots;
  if (z <= knots[0].z) return 0;
  for (let index = 1; index < knots.length; index++) {
    const end = knots[index];
    if (z > end.z) continue;
    if (z === end.z) return 0;
    const start = knots[index - 1];
    const length = end.z - start.z;
    const t = (z - start.z) / length;
    return (end.elevation - start.elevation) * 6 * t * (1 - t) / length;
  }
  return 0;
}

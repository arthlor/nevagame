/**
 * Authored spring and descending upper reach; coordinates and elevations are
 * metres. The upper reach steps rather than ramps: a short lip crest, an
 * explicit fall face, and a level pool shelf that hands off to the main river.
 * `fall` owns that discontinuity so reach/surface consumers do not have to
 * infer it from the knots.
 */
export const NEVA_HEADWATERS = Object.freeze({
  source: Object.freeze({ x: -30, z: -150 }),
  endZ: -116,
  sourceRadiusMeters: 2.2,
  // Dry padding lets water vertices follow the same profile before shoreline clipping.
  bounds: Object.freeze({ minX: -55, maxX: -5, minZ: -158, maxZ: -110 }),
  /** A shallow spring run spills over a bedrock lip into a level plunge pool.
   * All optical and support consumers use these same stations. */
  elevationKnots: Object.freeze([
    { z: -150, elevation: 20 },
    { z: -141, elevation: 19.65 },
    { z: -136.5, elevation: 19 },
    { z: -136, elevation: 19 },
    { z: -134.5, elevation: 4.5 },
    { z: -132, elevation: 4.5 },
    { z: -128, elevation: 4.5 },
    { z: -124, elevation: 4.5 },
    { z: -116, elevation: 0 }
  ]),
  /** Falling segment between the named reaches; presentation sheets are W07's owner. */
  fall: Object.freeze({
    id: "waterfall.neva_headwaters",
    upstreamReachId: "reach.neva_headwaters",
    downstreamReachId: "reach.neva_main",
    lipZ: -136,
    lipElevation: 19,
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
  })
});

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

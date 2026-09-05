/** Authored spring and descending upper reach; coordinates and elevations are metres. */
export const NEVA_HEADWATERS = Object.freeze({
  source: Object.freeze({ x: -30, z: -150 }),
  endZ: -116,
  sourceRadiusMeters: 3,
  // Dry padding lets water vertices follow the same profile before shoreline clipping.
  bounds: Object.freeze({ minX: -55, maxX: -5, minZ: -158, maxZ: -110 }),
  elevationKnots: Object.freeze([
    { z: -150, elevation: 20 },
    { z: -136, elevation: 12 },
    { z: -124, elevation: 3 },
    { z: -116, elevation: 0 }
  ])
});

export function isInHeadwaterBounds(x: number, z: number): boolean {
  const bounds = NEVA_HEADWATERS.bounds;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
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

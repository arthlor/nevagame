/** Pure landform profile: cultivation areas remain owned by FarmLayout. */
export interface TerraceBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function smooth01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Compile once, sample without allocations. Beds are flat across their ENTIRE
 * width. Height changes occur only in the unplanted gaps, never through a row.
 * The outer feather joins the existing landscape without a rectangular cliff.
 * This does not change planting permissions, crop coordinates or saved state.
 */
export function createTerraceProfile(
  beds: readonly TerraceBounds[],
  bounds: TerraceBounds,
  elevations: readonly number[],
  featherMeters: number
): (localX: number, localZ: number, naturalHeight: number) => number {
  if (beds.length === 0 || beds.length !== elevations.length
    || !Number.isFinite(featherMeters) || featherMeters <= 0) {
    throw new Error("[TerraceProfile] Expected matching beds/elevations and a positive feather");
  }
  const isValidRect = (rect: TerraceBounds): boolean =>
    [rect.minX, rect.maxX, rect.minZ, rect.maxZ].every(Number.isFinite)
    && rect.minX < rect.maxX && rect.minZ < rect.maxZ;
  if (!isValidRect(bounds)) throw new Error("[TerraceProfile] Invalid bounds");
  const gaps = beds.slice(1).map((bed, index) => ({
    from: beds[index].maxZ,
    to: bed.minZ,
    rise: elevations[index + 1] - elevations[index]
  }));
  beds.forEach((bed, index) => {
    if (!isValidRect(bed) || !Number.isFinite(elevations[index])
      || bed.minX < bounds.minX || bed.maxX > bounds.maxX
      || bed.minZ < bounds.minZ || bed.maxZ > bounds.maxZ
      || (index > 0 && beds[index - 1].maxZ >= bed.minZ)) {
      throw new Error("[TerraceProfile] Beds must be ordered, separated and contained");
    }
  });
  // Capture values, not mutable caller-owned arrays or objects.
  const { minX, maxX, minZ, maxZ } = bounds;
  const firstElevation = elevations[0];
  return (x, z, naturalHeight) => {
    const dx = Math.max(minX - x, 0, x - maxX);
    const dz = Math.max(minZ - z, 0, z - maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance >= featherMeters) return naturalHeight;
    let target = firstElevation;
    for (const gap of gaps) {
      target += gap.rise * smooth01((z - gap.from) / (gap.to - gap.from));
    }
    const influence = 1 - smooth01(distance / featherMeters);
    return naturalHeight + (target - naturalHeight) * influence;
  };
}

/** Small authored Neva landform field. Sunreach never consumes these coordinates. */
export interface NevaLandformSample {
  minimumElevation: number;
  mountain: number;
  exposure: number;
}

export const NEVA_SUMMITS = [
  { id: "spring-mountain", x: -61, z: -178, elevation: 36, radiusX: 72, radiusZ: 58 },
  { id: "western-mountain", x: -126, z: -116, elevation: 28, radiusX: 62, radiusZ: 64 },
  // Broad radii kept deliberately: tightening this dome differentially
  // steepened the historical migration anchor at (-12, -140) past the
  // climbable limit (see terrainLayoutMigration). Cragginess here comes from
  // the slope-driven surface weights, not from narrowing the footprint.
  { id: "northeastern-ridge", x: 20, z: -175, elevation: 15, radiusX: 58, radiusZ: 46 },
  // Eastern backdrop mass for the headwater cirque. Placed so its toe grazes
  // zero exactly along the east-rim walk line and the pool corridor, which the
  // river carve keeps pinned to the water profile: it builds the skyline and
  // the eastern cleft shoulder without touching the walk, the water or any
  // authored east-bank placement. Its western toe stops short of the
  // historical migration anchor at (-12, -140), which must stay walkable
  // ground. Near-channel concealment on this side comes from authored
  // lip-shoulder rocks (discrete, walkable around), never from terrain the
  // east-rim walk must cross.
  { id: "headwater-east-crag", x: 6, z: -152, elevation: 28, radiusX: 19, radiusZ: 26 },
  // Closes the source bowl to the northeast. Kept clear of the spring, the
  // rest stop, the approach viewpoint and the full northern-bluff-trail
  // corridor, which all sit outside its radii. Wide enough that sightlines
  // from the eastern fall-face stance terminate in the bowl wall instead of
  // slipping past it into open sky above the source.
  { id: "spring-headwall", x: -19, z: -165, elevation: 29, radiusX: 24, radiusZ: 17 }
] as const;

const RIDGE_SHOULDERS = [
  // Broad saddles leave the spring in a bowl beneath an uneven skyline.
  // The shoulder east of the peak runs high: from the low eastern pool bank
  // the sightline up the channel must meet rock behind the source bowl,
  // never open sky above it. The bluff trail keeps its benched corridor
  // through the shoulder.
  { start: [-126, -116, 28], end: [-96, -140, 22], width: 38 },
  { start: [-96, -140, 22], end: [-86, -165, 28], width: 34 },
  { start: [-86, -165, 28], end: [-61, -178, 36], width: 34 },
  { start: [-61, -178, 36], end: [-35, -170, 32], width: 32 },
  // High spur tying the headwall into the northeastern dome, so the skyline
  // east of the bowl runs peak–saddle–peak instead of falling into a notch
  // behind the fall. Narrow enough that its endpoint caps stay clear of the
  // east-rim walk and the historical migration anchor at (-12, -140): a wide
  // cap stacked with the natural eastward scarp there and pushed it past the
  // climbable limit.
  { start: [-15, -165, 26], end: [20, -175, 15], width: 16 },
  { start: [-126, -116, 16], end: [-137, -61, 14], width: 26 },
  { start: [-137, -61, 14], end: [-127, -13, 10], width: 28 }
] as const;

export interface NevaTrailPoint { x: number; z: number; elevation: number }

/** A contour climb around the western and northern headland slopes, ending at the spring. */
export const NEVA_FOOTHILL_TRAILS = [
  {
    id: "farm-headwater-trail",
    points: [
      // Join before the workbench's interaction spur and authored collision box.
      { x: -75.4, z: -59.8, elevation: 1.2 },
      { x: -87, z: -60, elevation: 1.2 },
      { x: -98, z: -76, elevation: 5 },
      { x: -108, z: -96, elevation: 10 },
      { x: -103, z: -113, elevation: 15 },
      { x: -83, z: -126, elevation: 18.5 },
      { x: -72, z: -145, elevation: 21 },
      { x: -55, z: -156, elevation: 20.8 },
      { x: -39, z: -156, elevation: 20.6 },
      { x: -37, z: -150, elevation: 20.5 }
    ]
  },
  {
    id: "western-overlook-trail",
    points: [
      { x: -108, z: -96, elevation: 10 },
      { x: -120, z: -94, elevation: 13 },
      { x: -126, z: -88, elevation: 14 }
    ]
  },
  {
    id: "western-beach-trail",
    points: [
      { x: -126, z: -88, elevation: 14 },
      { x: -138, z: -84, elevation: 10 },
      { x: -152, z: -78, elevation: 6 },
      { x: -164, z: -74, elevation: 2.8 },
      { x: -175, z: -68, elevation: 0.8 }
    ]
  },
  {
    id: "northern-bluff-trail",
    points: [
      { x: -37, z: -150, elevation: 20.5 },
      { x: -36, z: -164, elevation: 21 },
      { x: -42, z: -178, elevation: 21.5 },
      { x: -50, z: -192, elevation: 18 },
      { x: -54, z: -206, elevation: 13 },
      { x: -52, z: -218, elevation: 8 }
    ]
  }
] as const;

function smoothstep(start: number, end: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function mound(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number): number {
  const dx = (x - centerX) / radiusX;
  const dz = (z - centerZ) / radiusZ;
  const shoulder = Math.max(0, 1 - dx * dx - dz * dz);
  return shoulder * shoulder;
}

export function sampleNevaLandforms(x: number, z: number): NevaLandformSample {
  let minimumElevation = 0;
  let mountain = 0;
  for (const peak of NEVA_SUMMITS) {
    const weight = mound(x, z, peak.x, peak.z, peak.radiusX, peak.radiusZ);
    minimumElevation = Math.max(minimumElevation, peak.elevation * weight);
    mountain = Math.max(mountain, weight * smoothstep(12, 22, peak.elevation));
  }
  for (const ridge of RIDGE_SHOULDERS) {
    const dx = ridge.end[0] - ridge.start[0];
    const dz = ridge.end[1] - ridge.start[1];
    const t = Math.max(0, Math.min(1,
      ((x - ridge.start[0]) * dx + (z - ridge.start[1]) * dz) / (dx * dx + dz * dz)));
    const offsetX = x - ridge.start[0] - dx * t;
    const offsetZ = z - ridge.start[1] - dz * t;
    // A narrow cut face and a broader lee shoulder make each ridge asymmetric.
    const width = ridge.width * (offsetX * dz - offsetZ * dx > 0 ? 0.8 : 1.15);
    const weight = Math.pow(Math.max(0, 1 - (offsetX * offsetX + offsetZ * offsetZ) / (width * width)), 2);
    const elevation = ridge.start[2] + (ridge.end[2] - ridge.start[2]) * t;
    minimumElevation = Math.max(minimumElevation, elevation * weight);
    mountain = Math.max(mountain, weight * smoothstep(14, 22, elevation));
  }
  // Soft rolling shoulders along the western headlands and eastern outskirts.
  minimumElevation = Math.max(
    minimumElevation,
    14 * mound(x, z, -137, -61, 40, 44),
    10 * mound(x, z, -127, -13, 38, 40),
    14 * mound(x, z, 110, -104, 56, 48),
    9 * mound(x, z, 152, 12, 42, 56),
    7 * mound(x, z, 80, -135, 46, 40)
  );
  return {
    minimumElevation,
    mountain,
    exposure: clamp01(mountain * 0.4 + smoothstep(16, 22, minimumElevation) * 0.25)
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Bench profile shared with the rendered/colliding trail's exact linear segments. */
export function nevaTrailBenchAt(x: number, z: number): { elevation: number; influence: number } {  if (x < -185 || x > -25 || z < -230 || z > -44.8) return { elevation: 0, influence: 0 };
  let nearest = Number.POSITIVE_INFINITY;
  let lower = Number.NEGATIVE_INFINITY;
  let upper = Number.POSITIVE_INFINITY;
  // Paired Lipschitz envelopes bound the grade across forks and corners as well
  // as along the centerline. Nearest-segment interpolation makes seams there.
  const maximumGrade = 0.48;
  for (const trail of NEVA_FOOTHILL_TRAILS) {
    for (const point of trail.points) {
      const rise = maximumGrade * Math.hypot(x - point.x, z - point.z);
      lower = Math.max(lower, point.elevation - rise);
      upper = Math.min(upper, point.elevation + rise);
    }
    for (let index = 1; index < trail.points.length; index++) {
      const start = trail.points[index - 1];
      const end = trail.points[index];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / (dx * dx + dz * dz)));
      const distance = Math.hypot(x - start.x - dx * t, z - start.z - dz * t);
      if (distance >= nearest) continue;
      nearest = distance;
    }
  }
  // A full-width bench contains the road, both shoulders and the coarse collider samples.
  return {
    elevation: (lower + upper) * 0.5,
    influence: 1 - smoothstep(4.8, 12, nearest)
  };
}

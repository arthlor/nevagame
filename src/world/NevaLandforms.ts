/** Small authored Neva landform field. Sunreach never consumes these coordinates. */
export interface NevaLandformSample {
  minimumElevation: number;
  mountain: number;
  exposure: number;
}

export const NEVA_SUMMITS = [
  { id: "spring-mountain", x: -61, z: -178, elevation: 22, radiusX: 58, radiusZ: 50 },
  { id: "western-mountain", x: -126, z: -116, elevation: 16, radiusX: 54, radiusZ: 50 },
  { id: "northeastern-ridge", x: 20, z: -175, elevation: 8, radiusX: 45, radiusZ: 40 }
] as const;

const RIDGE_SHOULDERS = [
  // Gentle rolling saddles framing the sheltered headwater spring
  { start: [-126, -116, 16], end: [-96, -140, 14], width: 28 },
  { start: [-96, -140, 14], end: [-86, -165, 18], width: 28 },
  { start: [-86, -165, 18], end: [-61, -178, 22], width: 28 },
  { start: [-61, -178, 22], end: [-35, -170, 18], width: 26 },
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
    6.5 * mound(x, z, 132, -105, 42, 35),
    5.0 * mound(x, z, 152, 12, 33, 42)
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
export function nevaTrailBenchAt(x: number, z: number): { elevation: number; influence: number } {
  if (x < -185 || x > -25 || z < -230 || z > -44.8) return { elevation: 0, influence: 0 };
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

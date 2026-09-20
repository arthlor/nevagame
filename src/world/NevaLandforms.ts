/** Small authored Neva landform field. Sunreach never consumes these coordinates. */
export interface NevaLandformSample {
  minimumElevation: number;
  mountain: number;
  exposure: number;
}

export const NEVA_SUMMITS = [
  { id: "spring-mountain", x: -61, z: -178, elevation: 36, radiusX: 72, radiusZ: 58 },
  { id: "western-mountain", x: -126, z: -116, elevation: 28, radiusX: 62, radiusZ: 64 },
  { id: "northeastern-ridge", x: 20, z: -175, elevation: 18, radiusX: 66, radiusZ: 57 },
  // Long overlapping shoulders make one watershed behind the falls. Small
  // independent domes previously produced a row of isolated vertical humps.
  { id: "headwater-east-crag", x: 8, z: -155, elevation: 23, radiusX: 36, radiusZ: 39 },
  { id: "spring-headwall", x: -18, z: -169, elevation: 28, radiusX: 38, radiusZ: 28 }
] as const;

const RIDGE_SHOULDERS = [
  { start: [-126, -116, 28], end: [-100, -147, 25], width: 38 },
  { start: [-100, -147, 25], end: [-61, -178, 36], width: 43 },
  { start: [-61, -178, 36], end: [-18, -169, 28], width: 39 },
  { start: [-18, -169, 28], end: [20, -175, 18], width: 32 },
  { start: [20, -175, 18], end: [8, -155, 23], width: 30 },
  { start: [-126, -116, 16], end: [-137, -61, 14], width: 26 },
  { start: [-137, -61, 14], end: [-127, -13, 10], width: 28 }
] as const;

export interface NevaTrailPoint { x: number; z: number; elevation: number }

/** A contour climb around the western and northern headland slopes, ending at the spring. */
const AUTHORED_FOOTHILL_TRAILS = [
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

/** Round a turn inside its adjacent segments; retained forks remain exact.
 * The same sampled polyline owns the bench, map, render ribbon and collider.
 */
function contourTrail(points: readonly NevaTrailPoint[]): NevaTrailPoint[] {
  const result: NevaTrailPoint[] = [{ ...points[0] }];
  const mix = (a: NevaTrailPoint, b: NevaTrailPoint, t: number): NevaTrailPoint => ({
    x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t
  });
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (p.z >= -96) { result.push({ ...p }); continue; }
    const entry = mix(p, points[i - 1], 0.22), exit = mix(p, points[i + 1], 0.22);
    result.push(entry);
    for (let step = 1; step <= 4; step++) {
      const t = step / 4;
      result.push(mix(mix(entry, p, t), mix(p, exit, t), t));
    }
  }
  result.push({ ...points[points.length - 1] });
  return result;
}

export const NEVA_FOOTHILL_TRAILS = AUTHORED_FOOTHILL_TRAILS.map(trail => ({
  id: trail.id, points: contourTrail(trail.points)
}));

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

function radialPlateau(x: number, z: number, cx: number, cz: number, radius: number, feather: number): number {
  return 1 - smoothstep(radius, radius + feather, Math.hypot(x - cx, z - cz));
}

/** Retained district ground before working pads, rivers and road earthworks. */
export function nevaBaseGroundHeight(x: number, z: number): number {
  const westernRidge = radialPlateau(x, z, -128, -18, 34, 62) * 4.6;
  const northernRidge = radialPlateau(x, z, -12, -132, 48, 68) * 3.3;
  const easternUplands = radialPlateau(x, z, 68, -58, 28, 48) * 5.1;
  const lighthouseHeadland = radialPlateau(x, z, -92, 73, 12, 28) * 8.6;
  const harborShoulder = radialPlateau(x, z, 68, 54, 12, 24) * 0.9;
  const farmBasin = radialPlateau(x, z, -65, -55, 18, 26) * -1.15;
  const authoredPlanes =
    Math.sin((x + z * 0.72) * 0.018) * 0.54 +
    Math.sin((x * 0.36 - z) * 0.031) * 0.32 +
    Math.cos((x + z) * 0.009) * 0.42;
  return 1.8 + westernRidge + northernRidge + easternUplands + lighthouseHeadland + harborShoulder + farmBasin + authoredPlanes;
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
export function nevaTrailBenchAt(x: number, z: number): { elevation: number; influence: number } {
  if (x < -207 || x > -5 || z < -250 || z > -27.8) return { elevation: 0, influence: 0 };
  let nearest = Number.POSITIVE_INFINITY;
  let lower = Number.NEGATIVE_INFINITY;
  let upper = Number.POSITIVE_INFINITY;
  // Paired Lipschitz envelopes bound the grade across forks and corners as well
  // as along the centerline. Nearest-segment interpolation makes seams there.
  const maximumGrade = 0.48;
  for (const trail of AUTHORED_FOOTHILL_TRAILS) {
    for (const point of trail.points) {
      const rise = maximumGrade * Math.hypot(x - point.x, z - point.z);
      lower = Math.max(lower, point.elevation - rise);
      upper = Math.min(upper, point.elevation + rise);
    }
  }
  for (const trail of NEVA_FOOTHILL_TRAILS) {
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
  // The walkable core has a broad talus transition, avoiding a deep linear
  // trench when the contour route passes below a ridge.
  return {
    elevation: (lower + upper) * 0.5,
    influence: 1 - smoothstep(4.8, 12 + 18 * (1 - smoothstep(-100, -78, z)), nearest)
  };
}

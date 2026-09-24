import { drainageStripe, gullyProfile } from "./ProceduralNoise";

/** Small authored Neva landform field. Sunreach never consumes these coordinates. */
export interface NevaLandformSample {
  minimumElevation: number;
  mountain: number;
  exposure: number;
}

export const NEVA_SUMMITS = [
  { id: "spring-mountain", x: -61, z: -178, elevation: 58, radiusX: 72, radiusZ: 58 },
  { id: "western-mountain", x: -126, z: -116, elevation: 34, radiusX: 62, radiusZ: 64 },
  { id: "northeastern-ridge", x: 20, z: -175, elevation: 26, radiusX: 66, radiusZ: 57 },
  // Long overlapping shoulders make one watershed behind the falls. Small
  // independent domes previously produced a row of isolated vertical humps.
  { id: "headwater-east-crag", x: 8, z: -155, elevation: 42, radiusX: 36, radiusZ: 39 },
  { id: "spring-headwall", x: -18, z: -169, elevation: 48, radiusX: 38, radiusZ: 28 },
  // Western rim of the spring cleft: hides the source and upper chute from the
  // shortened foothill-trail terminus without blocking the downstream fall face.
  { id: "spring-west-rim", x: -41, z: -152, elevation: 38, radiusX: 14, radiusZ: 10 }
] as const;

const RIDGE_SHOULDERS = [
  { start: [-126, -116, 34], end: [-100, -147, 30], width: 38 },
  { start: [-100, -147, 30], end: [-61, -178, 58], width: 43 },
  { start: [-61, -178, 58], end: [-18, -169, 48], width: 39 },
  { start: [-18, -169, 48], end: [20, -175, 26], width: 32 },
  { start: [20, -175, 26], end: [8, -155, 42], width: 30 },
  // Rim shoulder along the cleft's west wall, chaining into the headwall.
  { start: [-52, -156, 34], end: [-34, -147, 37], width: 14 },
  { start: [-126, -116, 16], end: [-137, -61, 14], width: 26 },
  { start: [-137, -61, 14], end: [-127, -13, 10], width: 28 }
] as const;

export interface NevaTrailPoint { x: number; z: number; elevation: number }

/** A contour climb around the western and northern headland slopes.
 * The farm arm ends at a rim overlook short of the spring; the spring rest
 * stop no longer sits on the source bank. */
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
      { x: -58, z: -154, elevation: 21.2 },
      { x: -48, z: -155, elevation: 21.5 }
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
    // Forks west of the spring rim so the bluff route never climbs the cirque.
    id: "northern-bluff-trail",
    points: [
      { x: -48, z: -155, elevation: 21.5 },
      { x: -47, z: -168, elevation: 22 },
      { x: -52, z: -182, elevation: 21.5 },
      { x: -54, z: -196, elevation: 18 },
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

/** The authored dome-and-shoulder field, retained exactly inside the headwater cirque. */
function authoredLandforms(x: number, z: number): NevaLandformSample {
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

/**
 * The headwater cirque's rim and headwall own the source-concealment and
 * fall-visibility contract (the v55 graybox envelope plus a margin). Inside it
 * the authored field is kept exactly; the procedural summit form fades in
 * beyond it.
 */
const HEADWATER_CIRQUE = { minX: -58, maxX: 23, minZ: -189, maxZ: -107 } as const;
const CIRQUE_FEATHER_METERS = 20;

function cirqueRetention(x: number, z: number): number {
  const dx = Math.max(HEADWATER_CIRQUE.minX - x, 0, x - HEADWATER_CIRQUE.maxX);
  const dz = Math.max(HEADWATER_CIRQUE.minZ - z, 0, z - HEADWATER_CIRQUE.maxZ);
  return 1 - smoothstep(0, CIRQUE_FEATHER_METERS, Math.hypot(dx, dz));
}

// Summit cross-section: a concave flank under a small rounded cap, so each
// summit reads as a peak on a connected ridge rather than a flat-topped dome.
// The flank reaches a little further than the old dome to keep the massif's
// volume.
const SUMMIT_SPREAD = 1.18;
const SUMMIT_CAP = 0.06;
const SUMMIT_EXPONENT = 1.7;
const SUMMIT_CAP_CURVATURE = SUMMIT_EXPONENT * Math.pow(1 - SUMMIT_CAP, SUMMIT_EXPONENT - 1) / (2 * SUMMIT_CAP);
const SUMMIT_CAP_PEAK = Math.pow(1 - SUMMIT_CAP, SUMMIT_EXPONENT) + SUMMIT_CAP_CURVATURE * SUMMIT_CAP * SUMMIT_CAP;
const SUMMIT_GULLY_SALT = 0x5c01;
const SUMMIT_RILL_SALT = 0x5c02;
/** Mean of `gullyProfile` over a full stripe period, so carving keeps the flank's volume. */
const GULLY_MEAN = 0.2732;
// Everything the sculpted summits and shoulders can reach; beyond it only the
// authored soft shoulders apply.
const SCULPTED_BOUNDS = { minX: -225, maxX: 108, minZ: -266, maxZ: 76 } as const;

function summitProfile(s: number): number {
  if (s >= 1) return 0;
  if (s <= SUMMIT_CAP) return (SUMMIT_CAP_PEAK - SUMMIT_CAP_CURVATURE * s * s) / SUMMIT_CAP_PEAK;
  return Math.pow(1 - s, SUMMIT_EXPONENT) / SUMMIT_CAP_PEAK;
}

/**
 * The same summits and shoulders as concave peaks and ridges cut by
 * drainage-aligned gullies and spurs, with rock where the form is exposed.
 */
function sculptedLandforms(x: number, z: number, authored: NevaLandformSample): NevaLandformSample {
  if (x < SCULPTED_BOUNDS.minX || x > SCULPTED_BOUNDS.maxX || z < SCULPTED_BOUNDS.minZ || z > SCULPTED_BOUNDS.maxZ) {
    return authored;
  }
  const features: { value: number; elevation: number; flank: number; downX: number; downZ: number }[] = [];
  for (const peak of NEVA_SUMMITS) {
    const radiusX = peak.radiusX * SUMMIT_SPREAD, radiusZ = peak.radiusZ * SUMMIT_SPREAD;
    const ex = (x - peak.x) / radiusX, ez = (z - peak.z) / radiusZ;
    const s = Math.sqrt(ex * ex + ez * ez);
    if (s >= 1) continue;
    // Downslope follows the gradient of the elliptical radius.
    const gx = ex / radiusX, gz = ez / radiusZ, length = Math.sqrt(gx * gx + gz * gz);
    features.push({ value: peak.elevation * summitProfile(s), elevation: peak.elevation, flank: s,
      downX: length > 1e-9 ? gx / length : 0, downZ: length > 1e-9 ? gz / length : 0 });
  }
  for (const ridge of RIDGE_SHOULDERS) {
    const dx = ridge.end[0] - ridge.start[0];
    const dz = ridge.end[1] - ridge.start[1];
    const t = Math.max(0, Math.min(1,
      ((x - ridge.start[0]) * dx + (z - ridge.start[1]) * dz) / (dx * dx + dz * dz)));
    const offsetX = x - ridge.start[0] - dx * t;
    const offsetZ = z - ridge.start[1] - dz * t;
    // The same narrow cut face and broader lee shoulder as the authored ridge.
    const width = ridge.width * SUMMIT_SPREAD * (offsetX * dz - offsetZ * dx > 0 ? 0.8 : 1.15);
    const distance = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
    const s = distance / width;
    if (s >= 1) continue;
    const elevation = ridge.start[2] + (ridge.end[2] - ridge.start[2]) * t;
    features.push({ value: elevation * summitProfile(s), elevation, flank: s,
      downX: distance > 1e-9 ? offsetX / distance : 0, downZ: distance > 1e-9 ? offsetZ / distance : 0 });
  }
  const softShoulders = Math.max(
    14 * mound(x, z, -137, -61, 40, 44),
    10 * mound(x, z, -127, -13, 38, 40),
    14 * mound(x, z, 110, -104, 56, 48),
    9 * mound(x, z, 152, 12, 42, 56),
    7 * mound(x, z, 80, -135, 46, 40)
  );
  if (features.length === 0) return { minimumElevation: softShoulders, mountain: 0, exposure: 0 };

  let owner = features[0], downX = 0, downZ = 0, mountain = 0;
  for (const feature of features) {
    if (feature.value > owner.value) owner = feature;
    mountain = Math.max(mountain, (feature.value / Math.max(1e-6, feature.elevation)) * smoothstep(12, 22, feature.elevation));
    // A sharp sixth-power weight bends the gully pattern across the seams
    // between neighbouring summits and shoulders instead of shearing it.
    const squared = feature.value * feature.value, weight = squared * squared * squared;
    downX += feature.downX * weight;
    downZ += feature.downZ * weight;
  }
  let rival = 0;
  for (const feature of features) {
    if (feature !== owner && feature.downX * owner.downX + feature.downZ * owner.downZ < 0.5) {
      rival = Math.max(rival, feature.value);
    }
  }
  const downLength = Math.sqrt(downX * downX + downZ * downZ);
  let gully = 0, chute = 0;
  if (downLength > 1e-9) {
    const flankMask = smoothstep(0.02, 0.18, owner.flank) * (1 - smoothstep(0.6, 1, owner.flank));
    // Two faces meeting in a col share one valley floor, not two gully sets.
    const coherence = smoothstep(0, Math.max(2, owner.value * 0.3), owner.value - rival);
    const depth = owner.elevation * 0.05 * flankMask * coherence * smoothstep(14, 26, owner.elevation);
    if (depth > 0.01) {
      const unitX = downX / downLength, unitZ = downZ / downLength;
      const main = gullyProfile(drainageStripe(x, z, unitX, unitZ, 44, SUMMIT_GULLY_SALT)) - GULLY_MEAN;
      const rill = gullyProfile(drainageStripe(x, z, unitX, unitZ, 18, SUMMIT_RILL_SALT)) - GULLY_MEAN;
      gully = depth * (main + rill * 0.25);
      chute = clamp01(-main / 0.9) * flankMask * (1 - smoothstep(0.35, 0.7, owner.flank));
    }
  }
  const relief = Math.max(0, owner.value + gully);
  const minimumElevation = Math.max(relief, softShoulders);
  // Rock on the crest and upper face, in the scree chutes and on the highest
  // ground; spurs and lower flanks keep their soil and trees.
  const exposure = clamp01((1 - smoothstep(0.05, 0.35, owner.flank)) * 0.75 + chute * 0.55
    + smoothstep(34, 56, relief) * 0.3) * smoothstep(12, 24, owner.value);
  return { minimumElevation, mountain, exposure };
}

export function sampleNevaLandforms(x: number, z: number): NevaLandformSample {
  const authored = authoredLandforms(x, z);
  const retention = cirqueRetention(x, z);
  if (retention >= 1) return authored;
  const sculpted = sculptedLandforms(x, z, authored);
  if (retention <= 0) return sculpted;
  return {
    minimumElevation: sculpted.minimumElevation + (authored.minimumElevation - sculpted.minimumElevation) * retention,
    mountain: sculpted.mountain + (authored.mountain - sculpted.mountain) * retention,
    exposure: sculpted.exposure + (authored.exposure - sculpted.exposure) * retention
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Bench profile shared with the rendered/colliding trail's exact linear segments. */
export function nevaTrailBenchAt(
  x: number,
  z: number
): { elevation: number; influence: number; nearest: number } {
  if (x < -207 || x > -5 || z < -250 || z > -27.8) {
    return { elevation: 0, influence: 0, nearest: Number.POSITIVE_INFINITY };
  }
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
  // The walkable core grades fully; farther out the talus softens the join
  // without digging the raised massif down to the route envelope.
  return {
    elevation: (lower + upper) * 0.5,
    influence: 1 - smoothstep(4.8, 12 + 18 * (1 - smoothstep(-100, -78, z)), nearest),
    nearest
  };
}

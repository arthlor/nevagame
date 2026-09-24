import { nevaBaseGroundHeight, sampleNevaLandforms } from "./NevaLandforms";
import { nevaCoveShelterAt, nevaHeadlandAt } from "./NevaCoastField";
import { drainageStripe, fractalNoise, gradientNoise, gullyProfile } from "./ProceduralNoise";
import { MAINLAND_ROUTED_LEGS } from "./MainlandRoutes.generated";
import { MAINLAND_BOUNDS, signedDistanceToNevaCoast } from "./WorldIslands";
import type { WorldPoint, WorldRoute } from "./WorldLayout";

export { MAINLAND_BOUNDS };

/** Authored mainland causes, shared by traversal, climate and composition. */
export const MAINLAND_VILLAGES = {
  pinewatch: {
    id: "pinewatch", label: "Pinewatch", regionId: "region.pinewatch", marketId: "market.pinewatch",
    market: { x: -395, z: 55 }, npc: { x: -386, z: 56 },
    landing: { x: -384, z: 94 }, boat: { x: -384, z: 108 }, elevation: 6
  },
  reedhaven: {
    id: "reedhaven", label: "Reedhaven", regionId: "region.reedhaven", marketId: "market.reedhaven",
    market: { x: -565, z: 340 }, npc: { x: -556, z: 338 },
    landing: { x: -489, z: 333 }, boat: { x: -477, z: 333 }, elevation: 2.4
  },
  highridge: {
    id: "highridge", label: "Highridge", regionId: "region.highridge", marketId: "market.highridge",
    // Highridge's yard is levelled on the bench it stands on (see
    // `mainlandVillageElevation`); the harbour villages keep landing datums.
    market: { x: -340, z: -365 }, npc: { x: -331, z: -365 }, elevation: null
  }
} as const;

export function mainlandSmoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The retained homestead, river lesson, waterfall and harbor keep their detailed relief. */
export function mainlandBlendAt(x: number, z: number): number {
  return Math.max(
    mainlandSmoothstep(165, 255, -x),
    mainlandSmoothstep(225, 315, -z),
    mainlandSmoothstep(160, 240, z)
  );
}

export type MainlandBiomeId = "biome.neva_temperate" | "biome.pine_forest" | "biome.reed_marsh" | "biome.highlands";

export interface MainlandBiomeWeights {
  temperate: number;
  pineForest: number;
  reedMarsh: number;
  highlands: number;
}

/** Broad ecotones follow the northern slopes and low floodplain, not rectangular districts. */
export function mainlandBiomeWeightsAt(x: number, z: number): MainlandBiomeWeights {
  const mainland = mainlandBlendAt(x, z);
  const northernSlope = -z + Math.sin(x * 0.011) * 22 + Math.sin(x * 0.024) * 9;
  const highlands = mainlandSmoothstep(225, 345, northernSlope) * mainland;
  const floodplain = mainlandSmoothstep(130, 255, z + Math.sin(x * 0.014) * 24)
    * (1 - mainlandSmoothstep(-440, -385, x))
    * (1 - mainlandSmoothstep(420, 555, z));
  const reedMarsh = floodplain * (1 - highlands) * mainland;
  const woodland = 1 - mainlandSmoothstep(-390, -275, x + Math.sin(z * 0.015) * 22);
  const pineForest = woodland * (1 - highlands - reedMarsh) * mainland;
  return { temperate: 1 - highlands - reedMarsh - pineForest, pineForest, reedMarsh, highlands };
}

export function mainlandBiomeAt(x: number, z: number): MainlandBiomeId {
  const weights = mainlandBiomeWeightsAt(x, z);
  const candidates: readonly [MainlandBiomeId, number][] = [
    ["biome.neva_temperate", weights.temperate], ["biome.pine_forest", weights.pineForest],
    ["biome.reed_marsh", weights.reedMarsh], ["biome.highlands", weights.highlands]
  ];
  return candidates.reduce((best, candidate) => candidate[1] > best[1] ? candidate : best)[0];
}

export function mainlandRegionAt(x: number, z: number): "region.pinewatch" | "region.reedhaven" | "region.highridge" | null {
  if (mainlandBlendAt(x, z) < 0.5) return null;
  if (z < -250) return "region.highridge";
  return z > 175 ? "region.reedhaven" : "region.pinewatch";
}

/** Map landmarks are peaks along a connected chain, not independent radial terrain stamps. */
export const MAINLAND_SUMMITS = [
  { x: -120, z: -525, height: 102, radiusX: 155, radiusZ: 165 },
  { x: -425, z: -610, height: 132, radiusX: 190, radiusZ: 135 },
  { x: -670, z: -445, height: 86, radiusX: 125, radiusZ: 195 },
  { x: -735, z: 100, height: 44, radiusX: 115, radiusZ: 180 },
  { x: -430, z: 540, height: 46, radiusX: 150, radiusZ: 95 }
] as const;

type LandscapeKnot = readonly [x: number, z: number, elevation: number, width: number];
interface RidgeSpine {
  knots: readonly LandscapeKnot[];
  /** Unit direction of the long, inhabited slope; the opposite face is shorter and steeper. */
  lee: WorldPoint;
}
/**
 * Range crests. Knot elevations are the charted crest heights; the procedural
 * pass below bends the crest line, raises sub-peaks and cuts cols between
 * them, but every charted summit keeps its position and height.
 */
const RIDGE_SPINES: readonly RidgeSpine[] = [
  { lee: { x: 0, z: 1 }, knots: [[-765, -285, 34, 125], [-730, -360, 55, 140], [-670, -445, 86, 165],
    [-560, -555, 105, 160], [-425, -610, 132, 165], [-315, -625, 83, 120],
    [-220, -585, 84, 130], [-120, -525, 102, 130], [-80, -425, 40, 115]] },
  { lee: { x: 1, z: 0 }, knots: [[-805, -100, 18, 95], [-765, 15, 34, 110], [-735, 100, 44, 120],
    [-745, 220, 30, 105], [-715, 340, 17, 100]] },
  { lee: { x: 0, z: -1 }, knots: [[-610, 555, 20, 100], [-520, 535, 36, 120], [-430, 540, 46, 120],
    [-340, 570, 26, 90]] }
];
const MAINLAND_SETTLEMENTS = Object.values(MAINLAND_VILLAGES);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

// Range cross-section: a concave flank (steep rock near the crest, long
// gentle toe) with a parabolic cap so crests are sharp but never a knife edge.
const RANGE_RELIEF_SHARE = 0.75;
const FOOTHILL_SHARE = 0.16;
const FOOTHILL_REACH = 2.1;
const CREST_CAP = 0.05;
const FLANK_EXPONENT = 1.75;
const CAP_CURVATURE = FLANK_EXPONENT * Math.pow(1 - CREST_CAP, FLANK_EXPONENT - 1) / (2 * CREST_CAP);
const CAP_PEAK = Math.pow(1 - CREST_CAP, FLANK_EXPONENT) + CAP_CURVATURE * CREST_CAP * CREST_CAP;
const LEE_WIDTH_GAIN = 0.5;
const CREST_SPACING_METERS = 18;

function rangeProfile(s: number): number {
  if (s >= 1) return 0;
  if (s <= CREST_CAP) return (CAP_PEAK - CAP_CURVATURE * s * s) / CAP_PEAK;
  return Math.pow(1 - s, FLANK_EXPONENT) / CAP_PEAK;
}

interface CrestSample { x: number; z: number; elevation: number; width: number }

/** Hermite crest through every knot; elevation and width follow the same bounded tangents. */
function crestCurve(spine: RidgeSpine, spineIndex: number): CrestSample[] {
  const knots = spine.knots;
  const raw: CrestSample[] = [];
  const pinned: number[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[Math.max(0, i - 1)], b = knots[i], c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    const length = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const tangent = (previous: LandscapeKnot, center: LandscapeKnot, next: LandscapeKnot, axis: number): number => {
      const before = Math.hypot(center[0] - previous[0], center[1] - previous[1]);
      const after = Math.hypot(next[0] - center[0], next[1] - center[1]);
      return (next[axis] - previous[axis]) * length / Math.max(0.001, before + after);
    };
    const steps = Math.max(2, Math.ceil(length / CREST_SPACING_METERS));
    for (let step = 0; step < steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t;
      const h0 = 2 * t3 - 3 * t2 + 1, h1 = t3 - 2 * t2 + t, h2 = -2 * t3 + 3 * t2, h3 = t3 - t2;
      const value = (axis: number): number => h0 * b[axis] + h1 * tangent(a, b, c, axis)
        + h2 * c[axis] + h3 * tangent(b, c, d, axis);
      // Scalars ease between knots so a charted summit stays the local crest height.
      const ease = t2 * (3 - 2 * t);
      if (step === 0 && MAINLAND_SUMMITS.some(summit => summit.x === b[0] && summit.z === b[1])) pinned.push(raw.length);
      raw.push({ x: value(0), z: value(1),
        elevation: b[2] + (c[2] - b[2]) * ease, width: b[3] + (c[3] - b[3]) * ease });
    }
  }
  const last = knots[knots.length - 1];
  if (MAINLAND_SUMMITS.some(summit => summit.x === last[0] && summit.z === last[1])) pinned.push(raw.length);
  raw.push({ x: last[0], z: last[1], elevation: last[2], width: last[3] });

  const arc = [0];
  for (let i = 1; i < raw.length; i++) arc.push(arc[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z));
  const row = 0.37 + spineIndex * 3.1;
  return raw.map((point, i) => {
    const previous = raw[Math.max(0, i - 1)], next = raw[Math.min(raw.length - 1, i + 1)];
    const tx = next.x - previous.x, tz = next.z - previous.z, tl = Math.max(0.001, Math.hypot(tx, tz));
    const toSummit = pinned.reduce((nearest, index) => Math.min(nearest, Math.abs(arc[index] - arc[i])), Infinity);
    const freedom = mainlandSmoothstep(0, 90, toSummit);
    const along = arc[i];
    const bend = (gradientNoise(along / 230, row, 0x5a17) * 0.72 + gradientNoise(along / 97, row, 0x5a18) * 0.28) * 28;
    const relief = gradientNoise(along / 150, row, 0x5a19) * 0.62 + gradientNoise(along / 64, row, 0x5a1a) * 0.38;
    const girth = 1 + gradientNoise(along / 260, row, 0x5a1b) * 0.18;
    return {
      x: point.x - tz / tl * bend * freedom,
      z: point.z + tx / tl * bend * freedom,
      // Cols dip and sub-peaks rise between summits; charted summits stay put.
      elevation: point.elevation * (1 + relief * 0.14 * freedom),
      width: point.width * girth
    };
  });
}

const CREST_SEGMENTS = RIDGE_SPINES.flatMap((spine, spineIndex) => {
  const crest = crestCurve(spine, spineIndex);
  return crest.slice(1).map((b, index) => {
    const a = crest[index];
    const reach = Math.max(a.width, b.width) * (1 - LEE_WIDTH_GAIN * 0.24 + LEE_WIDTH_GAIN) * FOOTHILL_REACH + 0.000001;
    return { a, b, spineIndex, lee: spine.lee, peak: Math.max(a.elevation, b.elevation),
      minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
      minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
  });
});
const RANGE_CELL_METERS = 64;
const RANGE_CELLS = new Map<string, typeof CREST_SEGMENTS>();
for (const segment of CREST_SEGMENTS) {
  for (let gx = Math.floor(segment.minX / RANGE_CELL_METERS); gx <= Math.floor(segment.maxX / RANGE_CELL_METERS); gx++) {
    for (let gz = Math.floor(segment.minZ / RANGE_CELL_METERS); gz <= Math.floor(segment.maxZ / RANGE_CELL_METERS); gz++) {
      const key = `${gx}:${gz}`, bucket = RANGE_CELLS.get(key) ?? [];
      bucket.push(segment);
      RANGE_CELLS.set(key, bucket);
    }
  }
}

interface RangeSample {
  /** Crest-owned relief above the surrounding ground, before gullies. */
  relief: number;
  /** Broad knolls and benches that step down from the range into the plain. */
  foothill: number;
  /** Crest elevation and normalized flank position (0 crest, 1 toe) of the owning range. */
  crest: number;
  flank: number;
  /** Unit downslope direction away from the owning crest. */
  downX: number;
  downZ: number;
  /** 0 where two ranges meet in a col, so gully patterns never shear across it. */
  coherence: number;
}

function rangeAt(x: number, z: number): RangeSample {
  const sample: RangeSample = { relief: 0, foothill: 0, crest: 0, flank: 1, downX: 0, downZ: 1, coherence: 1 };
  const candidates = RANGE_CELLS.get(`${Math.floor(x / RANGE_CELL_METERS)}:${Math.floor(z / RANGE_CELL_METERS)}`);
  if (!candidates) return sample;
  const spineBest = [0, 0, 0];
  let owner = -1, downX = 0, downZ = 0;
  for (const segment of candidates) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const { a, b } = segment;
    const t = segmentProjection(x, z, a, b);
    const dx = x - (a.x + (b.x - a.x) * t), dz = z - (a.z + (b.z - a.z) * t);
    const distance = Math.sqrt(dx * dx + dz * dz);
    const elevation = (a.elevation + (b.elevation - a.elevation) * t) * RANGE_RELIEF_SHARE;
    const leeward = mainlandSmoothstep(-60, 70, dx * segment.lee.x + dz * segment.lee.z);
    const width = (a.width + (b.width - a.width) * t) * (1 - LEE_WIDTH_GAIN * 0.24 + leeward * LEE_WIDTH_GAIN);
    const s = distance / width;
    sample.foothill = Math.max(sample.foothill,
      elevation * FOOTHILL_SHARE * (1 - mainlandSmoothstep(0.55, FOOTHILL_REACH, s)));
    if (s >= 1) continue;
    const relief = elevation * rangeProfile(s);
    spineBest[segment.spineIndex] = Math.max(spineBest[segment.spineIndex], relief);
    if (distance > 0.0001) {
      // Neighbouring crest segments own adjacent wedges of a flank. A sharp
      // sixth-power weight blends their directions across each wedge border, so
      // the gully pattern bends with the crest instead of shearing along a seam.
      const squared = relief * relief, weight = squared * squared * squared;
      downX += dx / distance * weight;
      downZ += dz / distance * weight;
    }
    if (relief <= sample.relief) continue;
    sample.relief = relief;
    sample.crest = elevation;
    sample.flank = s;
    owner = segment.spineIndex;
  }
  const downLength = Math.hypot(downX, downZ);
  if (downLength > 1e-9) {
    sample.downX = downX / downLength;
    sample.downZ = downZ / downLength;
  }
  if (owner >= 0) {
    let rival = 0;
    for (let spine = 0; spine < spineBest.length; spine++) if (spine !== owner) rival = Math.max(rival, spineBest[spine]);
    sample.coherence = mainlandSmoothstep(0, Math.max(4, sample.relief * 0.3), sample.relief - rival);
  }
  return sample;
}

function segmentProjection(x: number, z: number, a: WorldPoint, b: WorldPoint): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  return clamp01(((x - a.x) * dx + (z - a.z) * dz) / Math.max(0.0001, dx * dx + dz * dz));
}

function segmentDistance(x: number, z: number, a: WorldPoint, b: WorldPoint): number {
  const t = segmentProjection(x, z, a, b);
  return Math.hypot(x - a.x - (b.x - a.x) * t, z - a.z - (b.z - a.z) * t);
}

/** Cubic curves pass every authored junction; dense samples are shared by all consumers. */
function smoothCenterline(knots: readonly WorldPoint[], spacing: number): WorldPoint[] {
  const points: WorldPoint[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const a = knots[Math.max(0, i - 1)], b = knots[i];
    const c = knots[i + 1], d = knots[Math.min(knots.length - 1, i + 2)];
    const length = Math.hypot(c.x - b.x, c.z - b.z);
    // A bounded Hermite tangent makes broad bends without overshooting a tight approach.
    const tangent = (previous: WorldPoint, center: WorldPoint, next: WorldPoint): WorldPoint => {
      const before = Math.hypot(center.x - previous.x, center.z - previous.z);
      const after = Math.hypot(next.x - center.x, next.z - center.z);
      const divisor = Math.max(0.001, before + after);
      return { x: (next.x - previous.x) * length / divisor, z: (next.z - previous.z) * length / divisor };
    };
    const first = tangent(a, b, c), second = tangent(b, c, d);
    const steps = Math.max(2, Math.ceil(length * 1.35 / spacing));
    for (let step = 0; step < steps; step++) {
      const t = step / steps, t2 = t * t, t3 = t2 * t;
      const h0 = 2 * t3 - 3 * t2 + 1, h1 = t3 - 2 * t2 + t;
      const h2 = -2 * t3 + 3 * t2, h3 = t3 - t2;
      points.push({ x: h0 * b.x + h1 * first.x + h2 * c.x + h3 * second.x,
        z: h0 * b.z + h1 * first.z + h2 * c.z + h3 * second.z });
    }
  }
  points.push({ ...knots[knots.length - 1] });
  return points;
}

/** The lowland drainage bends between wooded spurs before opening into the marsh cove. */
export const MAINLAND_RIVER = smoothCenterline([
  { x: -590, z: -180 }, { x: -586, z: -128 }, { x: -600, z: -77 },
  { x: -577, z: -22 }, { x: -552, z: 25 }, { x: -550, z: 70 },
  { x: -536, z: 111 }, { x: -531, z: 150 }, { x: -516, z: 188 },
  { x: -500, z: 225 }, { x: -493, z: 257 }, { x: -487, z: 288 }
], 7);

export const MAINLAND_LAKE = {
  center: { x: -574, z: -184 }, radiusX: 40, radiusZ: 51,
  /** The charted western fishing bank; the shore is exact here. */
  fishingBank: { x: -617, z: -180 }
} as const;
const LAKE_SHORE_SALT = 0x61a7;

// The existing query's finite longitudinal window is indexed without changing
// candidate order or its exact boundary. All metadata is immutable geography.
const RIVER_QUERY_ROW_METERS = 32;
const RIVER_SEGMENTS = MAINLAND_RIVER.slice(1).map((b, index) => {
  const a = MAINLAND_RIVER[index], middleZ = (a.z + b.z) * 0.5;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, b, middleZ, width: 6.6 + mainlandSmoothstep(160, 285, middleZ) * 3,
    direction: { x: (b.x - a.x) / length, z: (b.z - a.z) / length },
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
});
const RIVER_QUERY_ROWS = new Map<number, typeof RIVER_SEGMENTS>();
for (const segment of RIVER_SEGMENTS) {
  for (let row = Math.floor((segment.middleZ - 105.000001) / RIVER_QUERY_ROW_METERS);
    row <= Math.floor((segment.middleZ + 105.000001) / RIVER_QUERY_ROW_METERS); row++) {
    const candidates = RIVER_QUERY_ROWS.get(row) ?? [];
    candidates.push(segment);
    RIVER_QUERY_ROWS.set(row, candidates);
  }
}

export interface MainlandWaterSample {
  /** Positive inside freshwater; independent of the ocean coast union. */
  signedDistance: number;
  habitat: "river" | "lake";
  wetness: number;
  /** Unit downstream tangent from the same channel used for banks and fishing. */
  direction: WorldPoint;
}

export function mainlandWaterSample(x: number, z: number): MainlandWaterSample {
  if (x < -705 || x > -395 || z < -285 || z > 350) {
    return { signedDistance: -1000, habitat: "river", wetness: 0, direction: { x: 0, z: 1 } };
  }
  // Keep the established western fishing bank; the lake opens into its eastern wooded basin.
  const lake = 1 - Math.hypot((x - MAINLAND_LAKE.center.x) / MAINLAND_LAKE.radiusX,
    (z - MAINLAND_LAKE.center.z) / MAINLAND_LAKE.radiusZ);
  // Small bays and points break the ellipse everywhere except that bank.
  const bank = mainlandSmoothstep(10, 34, Math.hypot(x - MAINLAND_LAKE.fishingBank.x, z - MAINLAND_LAKE.fishingBank.z));
  const lakeDistance = lake * MAINLAND_LAKE.radiusX
    + (lake > -1.2 ? fractalNoise(x, z, 64, 2, LAKE_SHORE_SALT) * 7 * bank : 0);
  let river = -1000;
  let direction: WorldPoint = { x: 0, z: 1 };
  const candidates = RIVER_QUERY_ROWS.get(Math.floor(z / RIVER_QUERY_ROW_METERS));
  if (candidates) for (const segment of candidates) {
    if (Math.abs(z - segment.middleZ) > 105) continue;
    // An axis-aligned lower bound can reject a segment which cannot improve
    // the current winner; the margin keeps floating-point boundary ties exact.
    const reach = segment.width - river + 0.000001;
    if (x < segment.minX - reach || x > segment.maxX + reach
      || z < segment.minZ - reach || z > segment.maxZ + reach) continue;
    const distance = segment.width - segmentDistance(x, z, segment.a, segment.b);
    if (distance > river) {
      river = distance;
      direction = segment.direction;
    }
  }
  const signedDistance = Math.max(lakeDistance, river);
  return { signedDistance, habitat: lakeDistance > river ? "lake" : "river",
    wetness: 1 - mainlandSmoothstep(0, 40, -signedDistance), direction: { ...direction } };
}

export interface MainlandLandformSample {
  /** Range relief above the ground, after gully carving. */
  ridge: number;
  /** Rolling plain and upland ground beneath the ranges. */
  ground: number;
  /** Signed gully cut: negative in drainage floors, positive on spurs. */
  gully: number;
  valley: number;
  /** Bare-rock exposure in [0, 1]: crests, upper faces, scree chutes and the alpine zone. */
  exposure: number;
  height: number;
}

const PLAIN_SALT = 0x61a1;
const KNOLL_SALT = 0x61a2;
const GULLY_SALT = 0x61a3;
const RILL_SALT = 0x61a4;
const VALLEY_SALT = 0x61a5;
const INLAND_WARP_SALT = 0x61a6;
/** Mean of `gullyProfile` over a full stripe period, so carving keeps the flank's volume. */
const GULLY_MEAN = 0.2732;

/**
 * Inspectable macro causes in world metres. Ground rises from a low coastal
 * plain toward the interior; ranges stand on it with concave flanks, and
 * drainage-aligned gullies and spurs run straight down each flank.
 */
export function mainlandLandformAt(
  x: number,
  z: number,
  shoreDistance = signedDistanceToNevaCoast(x, z)
): MainlandLandformSample {
  return landformAt(x, z, shoreDistance, true);
}

// Height, rock exposure and the terrain bake ask for the same point in turn;
// the field is pure, so the most recent answer is reused verbatim.
let lastLandform: { x: number; z: number; shoreDistance: number; withTerraces: boolean; sample: MainlandLandformSample } | null = null;

function landformAt(x: number, z: number, shoreDistance: number, withTerraces: boolean): MainlandLandformSample {
  const last = lastLandform;
  if (last && last.x === x && last.z === z && last.shoreDistance === shoreDistance && last.withTerraces === withTerraces) {
    return last.sample;
  }
  const sample = computeLandform(x, z, shoreDistance, withTerraces);
  lastLandform = { x, z, shoreDistance, withTerraces, sample };
  return sample;
}

function computeLandform(x: number, z: number, shoreDistance: number, withTerraces: boolean): MainlandLandformSample {
  const biome = mainlandBiomeWeightsAt(x, z);
  // Warped so the plain's contours never copy the straight edges of the coast loop.
  const inland = mainlandSmoothstep(0, 340, -shoreDistance + fractalNoise(x, z, 260, 2, INLAND_WARP_SALT) * 75);
  const plainNoise = fractalNoise(x, z, 310, 3, PLAIN_SALT);
  const plain = 3 + 10 * inland + plainNoise * (1.4 + 3.4 * inland);
  const range = rangeAt(x, z);
  const knolls = 0.45 + 0.55 * (fractalNoise(x, z, 125, 3, KNOLL_SALT) * 0.5 + 0.5);
  const ground = plain + range.foothill * knolls;

  let gully = 0, chute = 0;
  if (range.relief > 0) {
    // Gullies begin just below the crest cap and die out on the toe, where
    // their spurs would otherwise ridge the farmland.
    const flankMask = mainlandSmoothstep(0.01, 0.14, range.flank) * (1 - mainlandSmoothstep(0.62, 1, range.flank));
    const depth = range.crest * 0.085 * flankMask * range.coherence;
    if (depth > 0.01) {
      const main = gullyProfile(drainageStripe(x, z, range.downX, range.downZ, 120, GULLY_SALT)) - GULLY_MEAN;
      const rill = gullyProfile(drainageStripe(x, z, range.downX, range.downZ, 46, RILL_SALT)) - GULLY_MEAN;
      gully = depth * (main + rill * 0.25);
      // Gully floors carry loose scree down the upper flank.
      chute = clamp01(-main / 0.9) * flankMask * (1 - mainlandSmoothstep(0.35, 0.7, range.flank));
    }
  }
  const ridge = Math.max(0, range.relief + gully);
  let height = ground + ridge;
  // Weathered rock where a range stands tall: the crest and its upper face,
  // the scree chutes below it, and everything above the alpine line. Spurs
  // and the long lower flanks keep their soil.
  const exposure = clamp01((1 - mainlandSmoothstep(0.04, 0.32, range.flank)) * 0.85 + chute * 0.6
    + mainlandSmoothstep(52, 105, height) * 0.45) * mainlandSmoothstep(8, 30, range.relief);
  height += (2.8 + plainNoise * 0.5 - height) * biome.reedMarsh;

  const freshwater = mainlandWaterSample(x, z);
  // The valley widens and narrows with the spurs it cuts through, and opens
  // out where it is cut deep so its sides stay soil-covered slopes.
  const valleyReach = 12 + Math.max(52, (height - 2) * 4.5) + fractalNoise(x, z, 180, 2, VALLEY_SALT) * 22;
  const valley = 1 - mainlandSmoothstep(12, valleyReach, -freshwater.signedDistance);
  if (valley > 0) {
    const bank = freshwater.signedDistance > 0 ? -Math.min(3.4, freshwater.signedDistance * 0.36)
      : Math.min(5, -freshwater.signedDistance * 0.1);
    height += (bank - height) * valley;
  }
  // Village foundations are local working terraces; the mountain/river form stays outside them.
  if (withTerraces) for (const village of MAINLAND_SETTLEMENTS) {
    if (Math.abs(x - village.market.x) > 85 || Math.abs(z - village.market.z) > 85) continue;
    const weight = 1 - mainlandSmoothstep(42, 85, Math.hypot(x - village.market.x, z - village.market.z));
    height += (mainlandVillageElevation(village.id) - height) * weight;
  }
  return { ridge, ground, gully, valley, exposure, height };
}

/** Shore character of the mainland coast at a point, from the same landform the terrain uses. */
export function mainlandShoreCharacterAt(x: number, z: number): MainlandCoastCharacter {
  const landform = landformAt(x, z, signedDistanceToNevaCoast(x, z), true);
  return mainlandCoastCharacterAt(x, z, landform.height, landform.valley);
}

/** Presentation and scatter share this rock-exposure cause; see `MainlandLandformSample.exposure`. */
export function mainlandMountainExposureAt(x: number, z: number): number {
  return landformAt(x, z, signedDistanceToNevaCoast(x, z), true).exposure;
}

const VILLAGE_ELEVATIONS = new Map<string, number>();

/**
 * Terrace datum of a village yard. A harbour village keeps its authored
 * datum, which its landing lane and quay are built to; an inland village is
 * levelled at the natural ground under its market, rounded to 10 cm.
 */
export function mainlandVillageElevation(id: keyof typeof MAINLAND_VILLAGES): number {
  let elevation = VILLAGE_ELEVATIONS.get(id);
  if (elevation === undefined) {
    const village = MAINLAND_VILLAGES[id];
    elevation = village.elevation ?? Math.round(landformAt(village.market.x, village.market.z,
      signedDistanceToNevaCoast(village.market.x, village.market.z), false).height * 10) / 10;
    VILLAGE_ELEVATIONS.set(id, elevation);
  }
  return elevation;
}

export interface MainlandCoastCharacter {
  /** 0 beach or low bank, 1 sea cliff. */
  cliff: number;
  /** Protected-cove weight; sheltered water never cuts cliffs. */
  shelter: number;
}

/**
 * High ground and hard-rock headlands meet the sea as cliffs; low ground,
 * soft embayments, river mouths and the sheltered cove keep beaches.
 */
function mainlandCoastCharacterAt(x: number, z: number, landHeight: number, valley = 0): MainlandCoastCharacter {
  const shelter = nevaCoveShelterAt(x, z);
  const relief = mainlandSmoothstep(5, 24, landHeight);
  const cliff = clamp01(relief * 0.8 + nevaHeadlandAt(x, z) * 0.85 - 0.08) * (1 - shelter) * (1 - valley);
  return { cliff, shelter };
}

/** Offshore distance at which even the shallowest shelf has reached the open seabed. */
const COAST_PROFILE_REACH_METERS = 18 / 0.075;

/**
 * Landform shaped by its shore: cliff coasts drop to deeper water behind a
 * narrow rock toe, beaches run out over a berm and a shallow shelf. Road
 * benches are optional so route planning can grade against the ground first.
 */
function mainlandShoreShapedHeight(x: number, z: number, shoreDistance: number, withRoadBench: boolean): number {
  // Open water beyond every shelf skips the coastal character entirely.
  if (shoreDistance > COAST_PROFILE_REACH_METERS) return -18;
  const landform = mainlandLandformAt(x, z, shoreDistance);
  const coast = mainlandCoastCharacterAt(x, z, landform.height, landform.valley);
  if (shoreDistance > 0) {
    // Cliffs drop to deeper water; beaches run out over a shallow shelf.
    return -Math.min(18, shoreDistance * (0.075 + coast.cliff * 0.2));
  }
  let height = landform.height;
  if (withRoadBench) {
    const bench = mainlandRoadBenchAt(x, z);
    height += (bench.elevation - height) * bench.influence;
  }
  const inland = -shoreDistance;
  // An exposed beach is a low berm and a broad bank; the calm cove keeps the
  // short working bank its quays and landings stand on; a cliff is a narrow
  // rock toe and a face.
  const berm = 1.3 - coast.cliff * 0.95;
  const toeRun = 22 - coast.shelter * 12 - coast.cliff * 19;
  const faceRun = 26 - coast.shelter * 8 - coast.cliff * 18;
  // The berm never stands above the ground it fronts, and a channel below sea
  // level is never raised: it only eases up to the waterline at the mouth.
  const shore = Math.min(berm, inland * berm / toeRun) * clamp01(height / berm);
  const rise = mainlandSmoothstep(toeRun * 0.55, toeRun + faceRun, inland);
  const channelRise = mainlandSmoothstep(0, toeRun + faceRun, inland);
  return shore + (height - shore) * (rise + (channelRise - rise) * clamp01(-height));
}

/**
 * The ground a road is planned and graded against: shore-shaped natural
 * terrain before any road bench, blended into the retained starter relief
 * where a connector crosses both landform owners.
 */
export function mainlandRouteGroundAt(x: number, z: number): number {
  const mainland = mainlandShoreShapedHeight(x, z, signedDistanceToNevaCoast(x, z), false);
  const blend = mainlandBlendAt(x, z);
  if (blend >= 1) return mainland;
  const starter = Math.max(nevaBaseGroundHeight(x, z), sampleNevaLandforms(x, z).minimumElevation);
  return starter + (mainland - starter) * blend;
}

type RoadKnot = readonly [x: number, z: number, elevation?: number];
interface GradedRoute extends WorldRoute { elevations: readonly number[] }

function route(id: string, knots: readonly RoadKnot[], kind: WorldRoute["kind"] = "arterial"): GradedRoute {
  const controls = knots.map(([x, z]) => ({ x, z }));
  const points = smoothCenterline(controls, 4);
  // Connectors that cross into the starter district grade against both
  // landform owners; a mainland-only datum there raised a causeway.
  const terrain = points.map(point => mainlandRouteGroundAt(point.x, point.z));
  // Only retained working-ground connectors and physical landing lips need explicit datums.
  for (let i = 0; i < points.length; i++) {
    let nearest = Infinity;
    for (let k = 1; k < knots.length; k++) {
      if (knots[k - 1][2] === undefined || knots[k][2] === undefined) continue;
      const distance = segmentDistance(points[i].x, points[i].z, controls[k - 1], controls[k]);
      if (distance >= nearest) continue;
      nearest = distance;
      const t = segmentProjection(points[i].x, points[i].z, controls[k - 1], controls[k]);
      const y = knots[k - 1][2]! + (knots[k][2]! - knots[k - 1][2]!) * t;
      const weight = 1 - mainlandSmoothstep(5, 18, distance);
      terrain[i] += (y - terrain[i]) * weight;
    }
  }
  const elevations = terrain.map((height, i) => {
    let total = height * 4, weight = 4;
    for (let offset = 1; offset <= 3; offset++) {
      const w = 4 - offset;
      total += (terrain[Math.max(0, i - offset)] + terrain[Math.min(points.length - 1, i + offset)]) * w;
      weight += 2 * w;
    }
    return total / weight;
  });
  const grade = kind === "trail" ? 0.36 : kind === "lane" ? 0.25 : 0.22;
  for (let pass = 0; pass < 3; pass++) {
    elevations[0] = knots[0][2] ?? terrain[0];
    for (let i = 1; i < points.length; i++) {
      const rise = grade * Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      elevations[i] = Math.max(elevations[i - 1] - rise, Math.min(elevations[i - 1] + rise, elevations[i]));
    }
    elevations[elevations.length - 1] = knots[knots.length - 1][2] ?? terrain[terrain.length - 1];
    for (let i = points.length - 2; i >= 0; i--) {
      const rise = grade * Math.hypot(points[i].x - points[i + 1].x, points[i].z - points[i + 1].z);
      elevations[i] = Math.max(elevations[i + 1] - rise, Math.min(elevations[i + 1] + rise, elevations[i]));
    }
  }
  return { id, kind, scope: "regional", widthMeters: kind === "trail" ? 2.8 : kind === "lane" ? 4.2 : 4.6,
    points, elevations, sampledCenterline: true };
}

/** A plan step is a fixed knot, or "route" to let the offline router join its neighbours. */
export type MainlandRoutePlanStep = RoadKnot | "route";

export interface MainlandRoutePlan {
  id: string;
  kind: WorldRoute["kind"];
  /**
   * Authored topology only: endpoints, junctions, landing lips and retained
   * starter-district datums. The legs between them are found by the
   * least-cost router in `tools/world/mainlandRoadRouter.ts`.
   */
  steps: readonly MainlandRoutePlanStep[];
}

const HIGHRIDGE_YARD = mainlandVillageElevation("highridge");

/** Freight lanes find valleys, benches and gentle saddles; the cove is the short sea route. */
export const MAINLAND_ROUTE_PLANS: readonly MainlandRoutePlan[] = [
  { id: "mainland-farm-pinewatch", kind: "arterial", steps: [[-87, -60, 1.2], [-145, -48, 3], [-190, -45, 4],
    [-230, -28, 5.4], "route", [-395, 55, 6]] },
  { id: "mainland-village-highridge", kind: "arterial", steps: [[70, -68, 6.3], [62, -88, 6.3], [72, -104, 7.5],
    [100, -115], [103, -143], [91, -175], [84, -212], [63, -246], [22, -278], [-27, -283], [-72, -302],
    "route", [-340, -365, HIGHRIDGE_YARD]] },
  { id: "mainland-pinewatch-highridge", kind: "arterial", steps: [[-395, 55, 6], "route", [-425, -180],
    "route", [-340, -365, HIGHRIDGE_YARD]] },
  { id: "mainland-forest-road", kind: "arterial", steps: [[-425, -180], "route", [-680, -225], "route",
    [-625, 290], "route", [-565, 340, 2.4]] },
  { id: "mainland-reedhaven-landing", kind: "lane", steps: [[-565, 340, 2.4], [-537, 341, 2.2], [-514, 336, 1.6],
    [-489, 333, 0.45]] },
  { id: "mainland-pinewatch-landing", kind: "lane", steps: [[-395, 55, 6], [-386, 75, 3], [-384, 94, 0.45]] },
  { id: "mainland-forest-lake", kind: "trail", steps: [[-680, -225], "route", [-617, -180, 0.5]] },
  { id: "mainland-marsh-bank", kind: "trail", steps: [[-625, 290], "route", [-539, 158, 0.4]] },
  { id: "mainland-highridge-overlook", kind: "trail", steps: [[-340, -365, HIGHRIDGE_YARD], "route", [-542, -396]] }
];

/** Expands a plan with the router's generated knots for each routed leg. */
export function mainlandRouteKnots(plan: MainlandRoutePlan, legs = MAINLAND_ROUTED_LEGS[plan.id] ?? []): RoadKnot[] {
  const knots: RoadKnot[] = [];
  let leg = 0;
  for (const step of plan.steps) {
    if (step === "route") {
      for (const [x, z] of legs[leg++] ?? []) knots.push([x, z]);
    } else {
      knots.push(step);
    }
  }
  return knots;
}

export const MAINLAND_ROUTES: readonly GradedRoute[] = MAINLAND_ROUTE_PLANS.map(plan =>
  route(plan.id, mainlandRouteKnots(plan), plan.kind));

const ROAD_BENCH_CELL = 48;
const ROAD_BENCH_SEGMENTS = MAINLAND_ROUTES.flatMap(road => road.points.slice(1).map((b, index) => {
  const a = road.points[index], halfWidth = road.widthMeters * 0.5;
  const reach = halfWidth + 12;
  return { a, b, length: Math.hypot(b.x - a.x, b.z - a.z),
    startY: road.elevations[index], endY: road.elevations[index + 1], halfWidth,
    minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
    minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
}));
const ROAD_BENCH_CELLS = new Map<string, typeof ROAD_BENCH_SEGMENTS>();
for (const segment of ROAD_BENCH_SEGMENTS) {
  for (let gx = Math.floor(segment.minX / ROAD_BENCH_CELL); gx <= Math.floor(segment.maxX / ROAD_BENCH_CELL); gx++) {
    for (let gz = Math.floor(segment.minZ / ROAD_BENCH_CELL); gz <= Math.floor(segment.maxZ / ROAD_BENCH_CELL); gz++) {
      const key = `${gx}:${gz}`, bucket = ROAD_BENCH_CELLS.get(key) ?? [];
      bucket.push(segment);
      ROAD_BENCH_CELLS.set(key, bucket);
    }
  }
}

/** Narrow worked shoulders settle into nearby terrain; the roads do not manufacture mountain ridges. */
export function mainlandRoadBenchAt(x: number, z: number): { elevation: number; influence: number } {
  let influence = 0, elevationSum = 0, totalWeight = 0;
  const candidates = ROAD_BENCH_CELLS.get(`${Math.floor(x / ROAD_BENCH_CELL)}:${Math.floor(z / ROAD_BENCH_CELL)}`) ?? [];
  for (const segment of candidates) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const distance = segmentDistance(x, z, segment.a, segment.b);
    const t = segmentProjection(x, z, segment.a, segment.b);
    // Blend adjacent segment profiles across bends and forks. Selecting only the
    // nearest segment makes a diagonal height seam where two graded roads meet.
    const weight = Math.pow(1 - mainlandSmoothstep(0, segment.halfWidth + 12, distance), 6)
      * segment.length;
    elevationSum += (segment.startY + (segment.endY - segment.startY) * t) * weight;
    totalWeight += weight;
    influence = Math.max(influence,
      1 - mainlandSmoothstep(segment.halfWidth + 2.8, segment.halfWidth + 12, distance));
  }
  return { elevation: totalWeight > 0 ? elevationSum / totalWeight : 0, influence };
}

export function mainlandNaturalHeight(x: number, z: number, shoreDistance: number): number {
  return mainlandShoreShapedHeight(x, z, shoreDistance, true);
}

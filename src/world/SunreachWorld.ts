import { SUNREACH_OFFSET_X } from "./WorldIslands";
import type { WorldDrainageSample, WorldRegionId } from "./WorldIslands";
import { isInsideLoop, pointSegmentDistance, SUNREACH_ANCHORS, SUNREACH_COAST_LOOP } from "./WorldIslands";
import type { WorldPoint, WorldRoute } from "./WorldLayout";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function radialWeight(x: number, z: number, centerX: number, centerZ: number, radius: number, feather: number): number {
  return 1 - smoothstep(radius, radius + feather, Math.hypot(x - centerX, z - centerZ));
}

function distanceToPolyline(x: number, z: number, points: readonly Readonly<WorldPoint>[]): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index++) {
    distance = Math.min(distance, pointSegmentDistance(x, z, points[index], points[index + 1]));
  }
  return distance;
}

/** Positive in water, negative on Sunreach dry land. */
export function signedDistanceToSunreachCoast(x: number, z: number): number {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < SUNREACH_COAST_LOOP.length; index++) {
    distance = Math.min(
      distance,
      pointSegmentDistance(x, z, SUNREACH_COAST_LOOP[index], SUNREACH_COAST_LOOP[(index + 1) % SUNREACH_COAST_LOOP.length])
    );
  }
  return isInsideLoop(x, z, SUNREACH_COAST_LOOP) ? -distance : distance;
}

export const SUNREACH_WASH_PATH = [
  { x: 602 + SUNREACH_OFFSET_X, z: 12 },
  { x: 574 + SUNREACH_OFFSET_X, z: 37 },
  { x: 535 + SUNREACH_OFFSET_X, z: 63 },
  { x: 502 + SUNREACH_OFFSET_X, z: 78 },
  { x: 465 + SUNREACH_OFFSET_X, z: 68 },
  { x: 423 + SUNREACH_OFFSET_X, z: 62 },
  { x: 386 + SUNREACH_OFFSET_X, z: 58 }
] as const;

export const SUNREACH_ROUTES: readonly WorldRoute[] = [
  {
    id: "route.sunreach.cove-terraces",
    scope: "regional",
    kind: "arterial",
    widthMeters: 3.4,
    points: [
      { x: 355 + SUNREACH_OFFSET_X, z: 58 },
      { x: 363 + SUNREACH_OFFSET_X, z: 62 },
      { x: 373 + SUNREACH_OFFSET_X, z: 62 },
      { x: 392 + SUNREACH_OFFSET_X, z: 65 },
      { x: 397 + SUNREACH_OFFSET_X, z: 43 },
      { x: 420 + SUNREACH_OFFSET_X, z: 25 },
      { x: 455 + SUNREACH_OFFSET_X, z: 6 }
    ]
  },
  {
    id: "route.sunreach.terraces-scrub",
    scope: "regional",
    kind: "lane",
    widthMeters: 2.7,
    points: [
      { x: 455 + SUNREACH_OFFSET_X, z: 6 },
      { x: 470 + SUNREACH_OFFSET_X, z: 27 },
      { x: 492 + SUNREACH_OFFSET_X, z: 51 },
      { x: 515 + SUNREACH_OFFSET_X, z: 75 }
    ]
  },
  {
    id: "route.sunreach.scrub-ridge",
    scope: "regional",
    kind: "trail",
    widthMeters: 2.3,
    points: [
      { x: 515 + SUNREACH_OFFSET_X, z: 75 },
      { x: 544 + SUNREACH_OFFSET_X, z: 59 },
      { x: 568 + SUNREACH_OFFSET_X, z: 42 },
      { x: 590 + SUNREACH_OFFSET_X, z: 25 }
    ]
  },
  {
    id: "route.sunreach.scrub-reef",
    scope: "regional",
    kind: "trail",
    widthMeters: 2.2,
    points: [
      { x: 515 + SUNREACH_OFFSET_X, z: 75 },
      { x: 522 + SUNREACH_OFFSET_X, z: 111 },
      { x: 521 + SUNREACH_OFFSET_X, z: 146 },
      { x: 520 + SUNREACH_OFFSET_X, z: 180 }
    ]
  }
];

function sunreachMacroHeight(x: number, z: number): number {
  const shoreDistance = signedDistanceToSunreachCoast(x, z);
  if (shoreDistance > 0) {
    return -Math.min(13.5, shoreDistance * 0.075)
      - 0.55 * smoothstep(SUNREACH_SHORE_TOE_METERS, SUNREACH_SHORE_TRANSITION_METERS, shoreDistance);
  }
  const inland = -shoreDistance;
  const shoreRise = smoothstep(0, 24, inland) * 2.3;
  const ridge = radialWeight(x, z, 584 + SUNREACH_OFFSET_X, 22, 25, 76) * 12.4;
  const easternShoulder = radialWeight(x, z, 555 + SUNREACH_OFFSET_X, 54, 42, 75) * 5.4;
  const terraceRise = radialWeight(x, z, 455 + SUNREACH_OFFSET_X, 5, 30, 58) * 2.2;
  const coveLowland = radialWeight(x, z, 371 + SUNREACH_OFFSET_X, 58, 18, 38) * -1.7;
  const broadUndulation = Math.sin((x - SUNREACH_OFFSET_X) * 0.025 + z * 0.017) * 0.38
    + Math.cos((x - SUNREACH_OFFSET_X) * 0.012 - z * 0.021) * 0.32;
  return -0.12 + shoreRise + ridge + easternShoulder + terraceRise + coveLowland + broadUndulation;
}

// Join the existing land and seabed through sea level instead of giving the
// heightfield a vertical step that turns each crossed grid cell into a tooth.
const SUNREACH_SHORE_TRANSITION_METERS = 6;
// A straight toe spans a terrain-cell diagonal before the cliff/shelf blend.
// Its sea-level intersection therefore cannot inherit a curved cell contour.
const SUNREACH_SHORE_TOE_METERS = 2;

export function sunreachDrainageSample(x: number, z: number): WorldDrainageSample {
  const washDistance = distanceToPolyline(x, z, SUNREACH_WASH_PATH);
  const wash = 1 - smoothstep(2.2, 12.5, washDistance);
  const upperCatchment = Math.max(
    radialWeight(x, z, 584 + SUNREACH_OFFSET_X, 24, 28, 85),
    radialWeight(x, z, 540 + SUNREACH_OFFSET_X, 58, 35, 76) * 0.78
  );
  const catchment = clamp01(upperCatchment * 0.72 + wash * 0.5);
  const downstream = clamp01((610 + SUNREACH_OFFSET_X - x) / 245);
  const bendSignal = 0.5 + Math.sin((x - SUNREACH_OFFSET_X) * 0.052 + z * 0.071) * 0.5;
  const erosion = clamp01(wash * (0.35 + (1 - downstream) * 0.48 + bendSignal * 0.22));
  const deposition = clamp01(wash * (0.28 + downstream * 0.62 + (1 - bendSignal) * 0.2));
  const sampleStep = 1.5;
  const left = sunreachMacroHeight(x - sampleStep, z);
  const right = sunreachMacroHeight(x + sampleStep, z);
  const back = sunreachMacroHeight(x, z - sampleStep);
  const front = sunreachMacroHeight(x, z + sampleStep);
  const dx = (right - left) / (sampleStep * 2);
  const dz = (front - back) / (sampleStep * 2);
  const slope = clamp01(Math.hypot(dx, dz) / 0.62);
  const aspect = Math.atan2(-dx, -dz);
  const shoreDistance = signedDistanceToSunreachCoast(x, z);
  const saltExposure = clamp01(
    (1 - smoothstep(8, 62, Math.max(0, -shoreDistance)))
    * (0.42 + radialWeight(x, z, 605 + SUNREACH_OFFSET_X, 58, 34, 85) * 0.58)
  );
  const reefShelfInfluence = clamp01(
    radialWeight(x, z, 548 + SUNREACH_OFFSET_X, 194, 35, 72)
    * (shoreDistance > -18 ? 1 : 1 - smoothstep(18, 42, -shoreDistance))
  );
  return {
    islandId: "island.sunreach",
    catchment,
    wash,
    erosion,
    deposition,
    moisturePotential: clamp01(wash * 0.5 + deposition * 0.42 + catchment * 0.16 - saltExposure * 0.28),
    slope,
    aspect,
    saltExposure,
    reefShelfInfluence
  };
}

function terraceHeight(x: number, z: number, base: number): number {
  const localX = x - SUNREACH_ANCHORS.terraceFarm.x;
  const localZ = z - SUNREACH_ANCHORS.terraceFarm.z;
  const terraceEnvelope = 1 - smoothstep(26, 37, Math.hypot(localX * 0.84, localZ));
  if (terraceEnvelope <= 0) return base;
  const tier = localZ < -9 ? 4.15 : localZ < 9 ? 4.75 : 5.35;
  return base + (tier - base) * terraceEnvelope * 0.92;
}

function coveWorkingPadHeight(x: number, z: number, base: number): number {
  const distance = Math.hypot(x - SUNREACH_ANCHORS.coveMarket.x, z - SUNREACH_ANCHORS.coveMarket.z);
  const envelope = 1 - smoothstep(12, 18, distance);
  return base + (0.9 - base) * envelope;
}

export function sunreachNaturalTerrainHeight(x: number, z: number): number {
  const base = sunreachMacroHeight(x, z);
  const inland = -signedDistanceToSunreachCoast(x, z);
  if (inland < 0) return base;
  const drainage = sunreachDrainageSample(x, z);
  const washBed = base - drainage.wash * (0.65 + drainage.erosion * 0.8);
  const deposited = washBed + drainage.deposition * 0.18;
  const routeDistance = Math.min(...SUNREACH_ROUTES.map((route) => distanceToPolyline(x, z, route.points)));
  const farmDistance = Math.hypot((x - SUNREACH_ANCHORS.terraceFarm.x) * 0.84, z - SUNREACH_ANCHORS.terraceFarm.z);
  const coastRelease = smoothstep(18, 42, inland);
  const workingRelease = smoothstep(4.5, 22, routeDistance) * smoothstep(37, 52, farmDistance);
  // Dry shoulders and a second low crest frame the route to the exposed ridge.
  // The seasonal wash, productive terrace and cove remain their existing surfaces.
  const shoulder = (6 * radialWeight(x, z, 566 + SUNREACH_OFFSET_X, 4, 9, 68)
    + 3.2 * radialWeight(x, z, 500 + SUNREACH_OFFSET_X, 119, 8, 45)
    + 2.4 * radialWeight(x, z, 502 + SUNREACH_OFFSET_X, -37, 8, 38))
    * coastRelease * workingRelease * (1 - drainage.wash);
  const land = coveWorkingPadHeight(x, z, terraceHeight(x, z, deposited + shoulder));
  // The cove depression must not pull declared dry land below the sea. This
  // shoreward shelf also gives the retained landing route continuous support.
  const dryShelf = 0.025 + Math.min(8, inland) * 0.035;
  const shoreToe = inland * 0.075;
  return shoreToe + (Math.max(dryShelf, land) - shoreToe)
    * smoothstep(SUNREACH_SHORE_TOE_METERS, SUNREACH_SHORE_TRANSITION_METERS, inland);
}

export function sunreachRegionAt(x: number, z: number): WorldRegionId {
  if (Math.hypot(x - (373 + SUNREACH_OFFSET_X), z - 56) <= 54 || x < (405 + SUNREACH_OFFSET_X)) return "region.sunreach_cove";
  if (Math.hypot(x - (455 + SUNREACH_OFFSET_X), z - 5) <= 66 || (x < (495 + SUNREACH_OFFSET_X) && z < 65)) return "region.sunreach_terraces";
  if (x >= (555 + SUNREACH_OFFSET_X) || Math.hypot(x - (590 + SUNREACH_OFFSET_X), z - 25) <= 72) return "region.sunreach_ridge";
  return "region.sunreach_scrub";
}

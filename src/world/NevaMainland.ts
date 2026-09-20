import { nevaBaseGroundHeight, sampleNevaLandforms } from "./NevaLandforms";
import type { WorldPoint, WorldRoute } from "./WorldLayout";

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
    market: { x: -340, z: -365 }, npc: { x: -331, z: -365 }, elevation: 26
  }
} as const;

export const MAINLAND_BOUNDS = { minX: -890, maxX: 210, minZ: -780, maxZ: 710 } as const;

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
  { x: -735, z: 100, height: 29, radiusX: 115, radiusZ: 180 },
  { x: -430, z: 540, height: 38, radiusX: 150, radiusZ: 95 }
] as const;

type LandscapeKnot = readonly [x: number, z: number, elevation: number, width: number];
const RIDGE_SPINES: readonly (readonly LandscapeKnot[])[] = [
  [[-765, -285, 34, 125], [-730, -360, 55, 140], [-670, -445, 86, 165],
    [-560, -555, 105, 160], [-425, -610, 132, 165], [-315, -625, 83, 120],
    [-220, -585, 84, 130], [-120, -525, 102, 130], [-80, -425, 40, 115]],
  [[-805, -100, 13, 90], [-765, 15, 25, 105], [-735, 100, 29, 110],
    [-745, 220, 19, 100], [-715, 340, 12, 100]],
  [[-610, 555, 15, 100], [-520, 535, 30, 120], [-430, 540, 38, 120], [-340, 570, 22, 90]]
];
const RIDGE_SEGMENTS = RIDGE_SPINES.flatMap(spine => spine.slice(1).map((b, index) => {
  const a = spine[index], reach = Math.max(a[3], b[3]) * 1.38 + 0.000001;
  return { a, b, start: { x: a[0], z: a[1] }, end: { x: b[0], z: b[1] },
    minX: Math.min(a[0], b[0]) - reach, maxX: Math.max(a[0], b[0]) + reach,
    minZ: Math.min(a[1], b[1]) - reach, maxZ: Math.max(a[1], b[1]) + reach };
}));
const MAINLAND_SETTLEMENTS = Object.values(MAINLAND_VILLAGES);

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

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
  center: { x: -574, z: -184 }, radiusX: 40, radiusZ: 51
} as const;

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
  const lakeDistance = lake * MAINLAND_LAKE.radiusX;
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
  ridge: number;
  rolling: number;
  valley: number;
  height: number;
}

/** Inspectable macro causes in world metres; no detail finer than the mainland terrain grid. */
export function mainlandLandformAt(x: number, z: number): MainlandLandformSample {
  const biome = mainlandBiomeWeightsAt(x, z);
  const rolling = Math.sin(x * 0.013 + Math.sin(z * 0.008) * 0.6) * 2.8
    + Math.sin(z * 0.018 - x * 0.005) * 1.8
    + Math.cos((x + z) * 0.027) * 0.65;
  let ridge = 0;
  for (const segment of RIDGE_SEGMENTS) {
    if (x < segment.minX || x > segment.maxX || z < segment.minZ || z > segment.maxZ) continue;
    const { a, b } = segment;
    const t = segmentProjection(x, z, segment.start, segment.end);
    const centerX = a[0] + (b[0] - a[0]) * t, centerZ = a[1] + (b[1] - a[1]) * t;
    const dx = x - centerX, dz = z - centerZ;
    // The inhabited southern slope is long; the seaward northern face is steeper.
    const width = (a[3] + (b[3] - a[3]) * t)
      * (0.88 + mainlandSmoothstep(-60, 70, dz) * 0.5);
    const distance = Math.hypot(dx, dz);
    const skirt = Math.pow(Math.max(0, 1 - distance * distance / (width * width)), 2);
    ridge = Math.max(ridge, (a[2] + (b[2] - a[2]) * t) * skirt);
  }
  const northFoothills = mainlandSmoothstep(120, 390, -z) * 13;
  let height = 8 + northFoothills + rolling;
  height += Math.max(0, ridge - height);
  height += (2.8 + rolling * 0.18 - height) * biome.reedMarsh;
  const freshwater = mainlandWaterSample(x, z);
  const valley = 1 - mainlandSmoothstep(12, 72, -freshwater.signedDistance);
  if (valley > 0) {
    const bank = freshwater.signedDistance > 0 ? -Math.min(3.4, freshwater.signedDistance * 0.36)
      : Math.min(5, -freshwater.signedDistance * 0.1);
    height += (bank - height) * valley;
  }
  // Village foundations are local working terraces; the mountain/river form stays outside them.
  for (const village of MAINLAND_SETTLEMENTS) {
    if (Math.abs(x - village.market.x) > 85 || Math.abs(z - village.market.z) > 85) continue;
    const weight = 1 - mainlandSmoothstep(42, 85, Math.hypot(x - village.market.x, z - village.market.z));
    height += (village.elevation - height) * weight;
  }
  return { ridge, rolling, valley, height };
}

type RoadKnot = readonly [x: number, z: number, elevation?: number];
interface GradedRoute extends WorldRoute { elevations: readonly number[] }

function route(id: string, knots: readonly RoadKnot[], kind: WorldRoute["kind"] = "arterial"): GradedRoute {
  const controls = knots.map(([x, z]) => ({ x, z }));
  const points = smoothCenterline(controls, 4);
  const terrain = points.map(point => {
    const mainland = mainlandLandformAt(point.x, point.z).height;
    if (id !== "mainland-village-highridge") return mainland;
    // This connector crosses two landform owners. Grading only against the
    // mainland datum manufactured a raised causeway through the starter valley.
    const starter = Math.max(nevaBaseGroundHeight(point.x, point.z),
      sampleNevaLandforms(point.x, point.z).minimumElevation);
    return starter + (mainland - starter) * mainlandBlendAt(point.x, point.z);
  });
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

/** Freight lanes follow foothill contours and circle the lake head; the cove is the short sea route. */
export const MAINLAND_ROUTES: readonly GradedRoute[] = [
  route("mainland-farm-pinewatch", [[-87, -60, 1.2], [-145, -48, 3], [-190, -45, 4],
    [-230, -28, 5.4], [-275, -18], [-315, -2], [-342, 24], [-365, 43], [-395, 55, 6]]),
  route("mainland-village-highridge", [[70, -68, 6.3], [62, -88, 6.3], [72, -104, 7.5], [100, -115],
    [103, -143], [91, -175], [84, -212], [63, -246], [22, -278],
    [-27, -283], [-72, -302], [-118, -324], [-165, -326], [-206, -340],
    [-251, -355], [-298, -363], [-340, -365, 26]]),
  route("mainland-pinewatch-highridge", [[-395, 55, 6], [-397, 12], [-414, -28], [-435, -62],
    [-440, -110], [-425, -150], [-425, -180], [-435, -214], [-424, -251], [-399, -280],
    [-374, -307], [-354, -332], [-340, -365, 26]]),
  route("mainland-forest-road", [[-425, -180], [-450, -217], [-486, -250], [-532, -269],
    [-581, -270], [-631, -252], [-680, -225], [-703, -184], [-708, -137], [-698, -89],
    [-689, -40], [-692, 8], [-680, 55], [-665, 93], [-670, 133], [-650, 190],
    [-646, 237], [-625, 290], [-604, 310], [-580, 318], [-565, 340, 2.4]]),
  route("mainland-reedhaven-landing", [[-565, 340, 2.4], [-537, 341, 2.2], [-514, 336, 1.6], [-489, 333, 0.45]], "lane"),
  route("mainland-pinewatch-landing", [[-395, 55, 6], [-386, 75, 3], [-384, 94, 0.45]], "lane"),
  route("mainland-forest-lake", [[-680, -225], [-664, -207], [-643, -190], [-617, -180, 0.5]], "trail"),
  route("mainland-marsh-bank", [[-625, 290], [-607, 265], [-596, 236], [-574, 217],
    [-560, 190], [-539, 158, 0.4]], "trail"),
  route("mainland-highridge-overlook", [[-340, -365, 26], [-339, -400], [-350, -426], [-384, -435],
    [-422, -447], [-458, -440], [-492, -433], [-520, -413], [-542, -396]], "trail")
];

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
  if (shoreDistance > 0) return -Math.min(18, shoreDistance * 0.1);
  let height = mainlandLandformAt(x, z).height;
  const bench = mainlandRoadBenchAt(x, z);
  height += (bench.elevation - height) * bench.influence;
  return height * mainlandSmoothstep(0, 28, -shoreDistance);
}

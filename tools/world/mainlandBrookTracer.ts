/**
 * Offline drainage tracer for the Neva mainland brooks.
 *
 * Water on the mainland collects the way it does on real ground: rain on the
 * ranges runs down the gully floors, joins, and leaves the land at the forest
 * lake, the river or the sea. This tool floods a 4 m lattice of the natural
 * ground (`mainlandRouteGroundAt`, before roads and brooks) from those outlets
 * with a priority flood, which gives every cell the neighbour its water runs
 * to and fills closed hollows to their spill point. Accumulating the area
 * that drains through each cell finds the channels; a brook is kept only if
 * its network rises in the mountains. Village yards, building pads and work
 * sites are walls, so brooks run round them rather than through them.
 *
 * Each brook's course is smoothed and led square across every road it
 * meets, and its bed is graded to fall monotonically downstream, balancing
 * cut against fill along the ground, dropping under every routed road to
 * pass through a culvert, and meeting its trunk or the water level exactly. Run it after `world:plan-roads`;
 * the roads never depend on the brooks. The result is written to
 * `src/world/MainlandBrooks.generated.ts` with a terrain fingerprint; a unit
 * test fails when the terrain drifts from the brooks traced on it.
 *
 *   npm run world:trace-brooks             rewrite the generated courses
 *   npm run world:trace-brooks -- --check  exit 1 if they are stale
 *
 * (`tools/world/trace-mainland-brooks.ts` is the command entry.)
 */
import { fileURLToPath } from "node:url";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { MAINLAND_WORK_SITES, mainlandWorkSiteClearanceAt } from "../../src/world/MainlandWorkSites";
import { MAINLAND_BROOK_CULVERT_FACE_METERS } from "../../src/world/MainlandBrooks";
import { MAINLAND_ROAD_NETWORK } from "../../src/world/MainlandRoadNetwork.generated";
import {
  MAINLAND_VILLAGES,
  brookCoursesCrossingRoads,
  mainlandBlendAt,
  mainlandRouteGroundAt,
  mainlandWaterSample
} from "../../src/world/NevaMainland";
import { nevaCoveShelterAt } from "../../src/world/NevaCoastField";
import { fractalNoise } from "../../src/world/ProceduralNoise";
import { MAINLAND_BOUNDS, signedDistanceToNevaCoast } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Outlet = "lake" | "river" | "sea";
export interface TracedBrook {
  id: string;
  /** Where the brook ends: open water, or the id of the brook it joins. */
  outlet: Outlet | string;
  /** Downstream knots: x, z, bed elevation and catchment area in hectares. */
  knots: [number, number, number, number][];
}

const GRID_METERS = 4;
const CELL_AREA_HECTARES = (GRID_METERS * GRID_METERS) / 10_000;
/**
 * Catchment at which a gully floor carries a running brook, and how high a
 * network's highest source must rise, by where the water ends. The lake, the
 * river and the sheltered cove are where people live and work, so their
 * smaller feeders count; on the outer slopes only the bigger brooks that
 * cut down to the open sea are kept.
 */
const OUTLET_RULES = {
  inland: { hectares: 0.07, head: 12 },
  cove: { hectares: 0.1, head: 12 },
  open: { hectares: 0.3, head: 18 }
} as const;
const CHANNEL_HECTARES = Math.min(...Object.values(OUTLET_RULES).map(rule => rule.hectares));

/** The rules a network follows, by where it ends: a mouth's position decides the cove from the open sea. */
export function mainlandBrookOutletRule(outlet: Outlet, mouthX: number, mouthZ: number): { hectares: number; head: number } {
  if (outlet !== "sea") return OUTLET_RULES.inland;
  return nevaCoveShelterAt(mouthX, mouthZ) > COVE_MOUTH_SHELTER ? OUTLET_RULES.cove : OUTLET_RULES.open;
}
/** Cove shelter at a sea mouth above which the brook feeds the sheltered cove. */
const COVE_MOUTH_SHELTER = 0.5;
/** Short first-order channels read as wet hollows, not brooks. */
const MINIMUM_REACH_METERS = 70;
/** Mainland share below which the retained starter relief owns the ground. */
const MAINLAND_ONLY = 0.999;
/**
 * Walls: building pads and work sites keep this clear, and each village's
 * working square; a brook may run past a village's outskirts, never across
 * its market.
 */
const PAD_CLEARANCE_METERS = 12;
const VILLAGE_SQUARE_METERS = 30;
const WORK_SITE_CLEARANCE_METERS = 10;
/**
 * A road stands on its embankment in the flood, so water crosses it only
 * where the ground is lowest, as a culvert would be sited, and never runs
 * along it. The graded bed still follows the natural ground.
 */
const ROAD_EMBANKMENT_METERS = 1.5;
const ROAD_EMBANKMENT_VERGE_METERS = [2.5, 7] as const;
/** Flood gradient that keeps filled hollows draining toward their spill point. */
const FLAT_GRADE = 0.0005;
/**
 * Fine relief the water finds on a plain that the terrain field smooths
 * away. Without it a flat floods as a straight-sided fan from its spill
 * point and the brooks cross it as ruled lines.
 */
const MEANDER_METERS = 0.35;
const MEANDER_SCALE_METERS = 38;
const MEANDER_SALT = 0x6b0c;
/** Smoothing of the lattice course: moving-average half window in cells, and passes. */
const SMOOTH_HALF_WINDOW = 3;
const SMOOTH_PASSES = 2;
const KNOT_SPACING_METERS = 6;
/** A tributary ends where it first comes this close to its trunk, joining it this many knots downstream. */
const TRIBUTARY_JOIN_METERS = 6;
const TRIBUTARY_JOIN_DOWNSTREAM_KNOTS = 1;
/** A tributary's last stretch meets its trunk at least this steeply, never running alongside it. */
const TRIBUTARY_MIN_JOIN_DEGREES = 30;
/**
 * A brook is led square across a road, as a culvert is laid: straight along
 * the road's normal past each headwall face by this run, bending back into its
 * own course over the blend beyond.
 */
const SQUARE_RUN_METERS = 3;
const SQUARE_BLEND_METERS = 9;
/**
 * Cover over a culvert: under and beside a road the bed sits this far below
 * the road's graded surface, enough for the stone pipe and a skin of road
 * over it. Upstream of a road cut into a slope the brook drops to the inlet.
 */
const CULVERT_COVER_METERS = 1.25;
/** The capped bed runs this far past the headwall faces on both sides. */
const CULVERT_APRON_METERS = 1.8;
/** Upstream of a culvert the bed ramps down to its cap no steeper than this. */
const CULVERT_INLET_GRADE = 0.3;
/**
 * A brook meets the lake, the river or the sea at this height above the
 * shared water datum: its channel runs out across the shore to the waterline
 * and is never cut below it, where the water would flood the cut.
 */
const MOUTH_BED_METERS = 0.08;
/** Bed incision below the graded ground, growing with the catchment. */
const INCISION_BASE_METERS = 0.35;
const INCISION_GAIN_METERS = 0.18;
const INCISION_MAX_METERS = 0.95;

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
];

class MinHeap {
  private keys: number[] = [];
  private values: number[] = [];
  get size(): number { return this.keys.length; }
  push(value: number, key: number): void {
    const keys = this.keys, values = this.values;
    let i = keys.length;
    keys.push(key); values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      // Ties keep insertion order through the value, so the flood is deterministic.
      if (keys[parent] < key || (keys[parent] === key && values[parent] < value)) break;
      keys[i] = keys[parent]; values[i] = values[parent];
      i = parent;
    }
    keys[i] = key; values[i] = value;
  }
  pop(): number {
    const keys = this.keys, values = this.values;
    const top = values[0];
    const lastKey = keys.pop()!, lastValue = values.pop()!;
    if (keys.length > 0) {
      let i = 0;
      for (;;) {
        const left = i * 2 + 1, right = left + 1;
        if (left >= keys.length) break;
        let child = left;
        if (right < keys.length && (keys[right] < keys[left] || (keys[right] === keys[left] && values[right] < values[left]))) child = right;
        if (keys[child] > lastKey || (keys[child] === lastKey && values[child] > lastValue)) break;
        keys[i] = keys[child]; values[i] = values[child];
        i = child;
      }
      keys[i] = lastKey; values[i] = lastValue;
    }
    return top;
  }
}

interface Lattice {
  columns: number;
  rows: number;
  x(index: number): number;
  z(index: number): number;
  ground: Float64Array;
  /** 0 land, 1 wall, 2 lake, 3 river, 4 sea, 5 the starter district's edge. */
  kind: Uint8Array;
}

const OUTLET_KINDS: Readonly<Record<number, Outlet | "starter">> = { 2: "lake", 3: "river", 4: "sea", 5: "starter" };

function buildingDistance(x: number, z: number): number {
  let nearest = Infinity;
  for (const pad of MAINLAND_ARCHITECTURE_PADS) {
    const dx = x - pad.center.x, dz = z - pad.center.z;
    const localX = dx * Math.cos(pad.rotationY) - dz * Math.sin(pad.rotationY);
    const localZ = dx * Math.sin(pad.rotationY) + dz * Math.cos(pad.rotationY);
    nearest = Math.min(nearest, Math.hypot(Math.max(0, Math.abs(localX) - pad.envelope[0]),
      Math.max(0, Math.abs(localZ) - pad.envelope[1])));
  }
  return nearest;
}

function isWall(x: number, z: number): boolean {
  return buildingDistance(x, z) < PAD_CLEARANCE_METERS || mainlandWorkSiteClearanceAt(x, z) < WORK_SITE_CLEARANCE_METERS
    || Object.values(MAINLAND_VILLAGES).some(village =>
      Math.hypot(x - village.market.x, z - village.market.z) < VILLAGE_SQUARE_METERS);
}

function buildLattice(): Lattice {
  const columns = Math.floor((MAINLAND_BOUNDS.maxX - MAINLAND_BOUNDS.minX) / GRID_METERS) + 1;
  const rows = Math.floor((MAINLAND_BOUNDS.maxZ - MAINLAND_BOUNDS.minZ) / GRID_METERS) + 1;
  const x = (index: number): number => MAINLAND_BOUNDS.minX + (index % columns) * GRID_METERS;
  const z = (index: number): number => MAINLAND_BOUNDS.minZ + Math.floor(index / columns) * GRID_METERS;
  const ground = new Float64Array(columns * rows);
  const kind = new Uint8Array(columns * rows);
  for (let index = 0; index < columns * rows; index++) {
    const cx = x(index), cz = z(index);
    if (signedDistanceToNevaCoast(cx, cz) > 0) { kind[index] = 4; continue; }
    const fresh = mainlandWaterSample(cx, cz);
    if (fresh.signedDistance > 0) { kind[index] = fresh.habitat === "lake" ? 2 : 3; continue; }
    // Water that reaches the retained starter district is its own drainage's;
    // the edge takes it, and no brook is drawn to it.
    if (mainlandBlendAt(cx, cz) < MAINLAND_ONLY) { kind[index] = 5; continue; }
    if (isWall(cx, cz)) { kind[index] = 1; continue; }
    const road = WorldLayout.nearestRouteDistance(cx, cz);
    const embankment = 1 - smoothstep(road.halfWidth + ROAD_EMBANKMENT_VERGE_METERS[0],
      road.halfWidth + ROAD_EMBANKMENT_VERGE_METERS[1], road.distance);
    ground[index] = mainlandRouteGroundAt(cx, cz) + fractalNoise(cx, cz, MEANDER_SCALE_METERS, 2, MEANDER_SALT) * MEANDER_METERS
      + embankment * ROAD_EMBANKMENT_METERS;
  }
  return { columns, rows, x, z, ground, kind };
}

interface Drainage {
  receiver: Int32Array;
  /** Flooded elevation: the ground, with closed hollows filled to their spill point. */
  flooded: Float64Array;
  /** Cells in flood order, outlets first; every cell comes after its receiver. */
  order: Int32Array;
  area: Float64Array;
}

function drain(lattice: Lattice): Drainage {
  const { columns, rows, ground, kind } = lattice;
  const count = columns * rows;
  const receiver = new Int32Array(count).fill(-1);
  const flooded = new Float64Array(count);
  const visited = new Uint8Array(count);
  const order = new Int32Array(count);
  let ordered = 0;
  const heap = new MinHeap();
  // Every water cell that touches land is an outlet at the water level.
  for (let index = 0; index < count; index++) {
    if (kind[index] < 2) continue;
    const cx = index % columns, cz = Math.floor(index / columns);
    const shore = NEIGHBOURS.some(([dx, dz]) => {
      const nx = cx + dx, nz = cz + dz;
      return nx >= 0 && nz >= 0 && nx < columns && nz < rows && kind[nz * columns + nx] === 0;
    });
    visited[index] = 1;
    if (!shore) continue;
    flooded[index] = 0;
    heap.push(index, 0);
  }
  while (heap.size > 0) {
    const index = heap.pop();
    order[ordered++] = index;
    const cx = index % columns, cz = Math.floor(index / columns);
    for (const [dx, dz] of NEIGHBOURS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= columns || nz >= rows) continue;
      const next = nz * columns + nx;
      if (visited[next] || kind[next] !== 0) continue;
      visited[next] = 1;
      const run = Math.hypot(dx, dz) * GRID_METERS;
      flooded[next] = Math.max(ground[next], flooded[index] + FLAT_GRADE * run);
      receiver[next] = index;
      heap.push(next, flooded[next]);
    }
  }
  const area = new Float64Array(count);
  for (let i = ordered - 1; i >= 0; i--) {
    const index = order[i];
    if (kind[index] !== 0) continue;
    area[index] += CELL_AREA_HECTARES;
    if (receiver[index] >= 0) area[receiver[index]] += area[index];
  }
  return { receiver, flooded, order: order.subarray(0, ordered), area };
}

interface Reach {
  cells: number[];
  /** Index of the reach this one flows into, or -1 at open water. */
  into: number;
  outlet: Outlet | "starter";
}

/**
 * Channel reaches from each outlet upstream: at a confluence the tributary
 * with the larger catchment continues the stem, and every other one starts
 * a reach of its own that ends at the confluence cell.
 */
function channelReaches(lattice: Lattice, drainage: Drainage): Reach[] {
  const { kind } = lattice;
  const { receiver, area, order } = drainage;
  const upstream = new Map<number, number[]>();
  for (const index of order) {
    if (kind[index] !== 0 || area[index] < CHANNEL_HECTARES) continue;
    const next = receiver[index];
    const list = upstream.get(next) ?? [];
    list.push(index);
    upstream.set(next, list);
  }
  const reaches: Reach[] = [];
  const stack: { start: number; mouth: number; into: number; outlet: Outlet | "starter" }[] = [];
  for (const [mouth, feeders] of upstream) {
    if (kind[mouth] < 2) continue;
    for (const start of feeders) stack.push({ start, mouth, into: -1, outlet: OUTLET_KINDS[kind[mouth]] });
  }
  // Largest first, so ids follow the size of each brook.
  stack.sort((a, b) => area[a.start] - area[b.start] || b.start - a.start);
  while (stack.length > 0) {
    const { start, mouth, into, outlet } = stack.pop()!;
    const reachIndex = reaches.length;
    const upward: number[] = [];
    const branches: { start: number; mouth: number }[] = [];
    let cell = start;
    for (;;) {
      upward.push(cell);
      const feeders = (upstream.get(cell) ?? []).slice().sort((a, b) => area[b] - area[a] || a - b);
      if (feeders.length === 0) break;
      for (const feeder of feeders.slice(1)) branches.push({ start: feeder, mouth: cell });
      cell = feeders[0];
    }
    // The course runs downstream and ends on its mouth: the water's edge, or
    // the confluence cell on its trunk.
    reaches.push({ cells: [...upward.reverse(), mouth], into, outlet });
    branches.sort((a, b) => area[a.start] - area[b.start] || b.start - a.start);
    for (const branch of branches) stack.push({ ...branch, into: reachIndex, outlet });
  }
  return reaches;
}

function reachLength(cells: readonly number[], lattice: Lattice): number {
  let length = 0;
  for (let i = 1; i < cells.length; i++) {
    length += Math.hypot(lattice.x(cells[i]) - lattice.x(cells[i - 1]), lattice.z(cells[i]) - lattice.z(cells[i - 1]));
  }
  return length;
}

/** Moving-average smoothing that keeps both ends where they are. */
function smoothCourse(points: { x: number; z: number }[]): { x: number; z: number }[] {
  let current = points;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    current = current.map((point, i) => {
      if (i === 0 || i === current.length - 1) return point;
      const half = Math.min(SMOOTH_HALF_WINDOW, i, current.length - 1 - i);
      let sx = 0, sz = 0;
      for (let k = -half; k <= half; k++) { sx += current[i + k].x; sz += current[i + k].z; }
      return { x: sx / (half * 2 + 1), z: sz / (half * 2 + 1) };
    });
  }
  return current;
}

function resample(points: { x: number; z: number }[], spacing: number): { x: number; z: number; s: number }[] {
  const arc = [0];
  for (let i = 1; i < points.length; i++) arc.push(arc[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  const total = arc[arc.length - 1];
  const steps = Math.max(1, Math.round(total / spacing));
  const out: { x: number; z: number; s: number }[] = [];
  let segment = 1;
  for (let step = 0; step <= steps; step++) {
    const s = total * step / steps;
    while (segment < points.length - 1 && arc[segment] < s) segment++;
    const span = Math.max(1e-9, arc[segment] - arc[segment - 1]);
    const t = Math.max(0, Math.min(1, (s - arc[segment - 1]) / span));
    out.push({ x: points[segment - 1].x + (points[segment].x - points[segment - 1].x) * t,
      z: points[segment - 1].z + (points[segment].z - points[segment - 1].z) * t, s });
  }
  return out;
}

/** The point at an arc position along a resampled course. */
function pointOnCourse(points: readonly { x: number; z: number; s: number }[], s: number): { x: number; z: number } {
  let i = 1;
  while (i < points.length - 1 && points[i].s < s) i++;
  const a = points[i - 1], b = points[i], t = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-9, b.s - a.s)));
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Arc position on a resampled course of a point lying on it. */
function arcAt(points: readonly { x: number; z: number; s: number }[], at: { x: number; z: number }): number {
  let best = 0, bestDistance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const t = Math.max(0, Math.min(1, ((at.x - a.x) * (b.x - a.x) + (at.z - a.z) * (b.z - a.z)) / Math.max(1e-9, length * length)));
    const distance = Math.hypot(a.x + (b.x - a.x) * t - at.x, a.z + (b.z - a.z) * t - at.z);
    if (distance < bestDistance) { bestDistance = distance; best = a.s + length * t; }
  }
  return best;
}

/**
 * Leads a course square across every road it crosses: straight along the
 * road's normal for the culvert and a short run past each face, easing back
 * into the course beyond, so the water meets each headwall head on.
 */
function squareRoadCrossings(id: string, course: { x: number; z: number; s: number }[]): { x: number; z: number; s: number }[] {
  let points = resample(course, 1);
  for (let k = 0; ; k++) {
    const crossings = brookCoursesCrossingRoads([{ id, knots: points.map(point => [point.x, point.z]) }]);
    if (k >= crossings.length) break;
    const crossing = crossings[k];
    const across = { x: -crossing.road.z, z: crossing.road.x };
    const downstream = Math.sign(crossing.brook.x * across.x + crossing.brook.z * across.z) || 1;
    const at = arcAt(points, crossing.point), total = points[points.length - 1].s;
    const half = crossing.route.widthMeters * 0.5 + MAINLAND_BROOK_CULVERT_FACE_METERS + SQUARE_RUN_METERS;
    const blend = Math.min(SQUARE_BLEND_METERS, at - half - 1, total - at - half - 1);
    if (blend < 2) continue;
    points = resample(points.map(point => {
      const offset = point.s - at;
      const weight = 1 - smoothstep(half, half + blend, Math.abs(offset));
      if (weight <= 0) return point;
      const x = crossing.point.x + across.x * downstream * offset, z = crossing.point.z + across.z * downstream * offset;
      return { x: point.x + (x - point.x) * weight, z: point.z + (z - point.z) * weight };
    }), 1);
  }
  return resample(points, KNOT_SPACING_METERS);
}

function incision(hectares: number): number {
  return Math.min(INCISION_MAX_METERS, INCISION_BASE_METERS + INCISION_GAIN_METERS * Math.sqrt(hectares / CHANNEL_HECTARES));
}

/**
 * Bed graded to fall downstream: the mean of the ground cut down to its
 * running minimum and filled up to its running maximum, so cut and fill
 * balance, less an incision that deepens with the catchment. The mouth meets
 * the trunk bed or the waterline.
 */
function gradeBed(ground: number[], hectares: number[], mouth: number): number[] {
  const count = ground.length;
  const cut = new Array<number>(count), fill = new Array<number>(count);
  cut[0] = ground[0];
  for (let i = 1; i < count; i++) cut[i] = Math.min(cut[i - 1], ground[i]);
  fill[count - 1] = ground[count - 1];
  for (let i = count - 2; i >= 0; i--) fill[i] = Math.max(fill[i + 1], ground[i]);
  const bed = ground.map((_, i) => (cut[i] + fill[i]) * 0.5 - incision(hectares[i]));
  // Deeper incision downstream only lowers the bed further; a brook meets its
  // trunk or the water at the mouth and never dives below it.
  for (let i = 1; i < count; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
  for (let i = 0; i < count; i++) bed[i] = Math.max(bed[i], mouth);
  bed[count - 1] = mouth;
  return bed;
}

export function traceMainlandBrooks(): TracedBrook[] {
  const lattice = buildLattice();
  const drainage = drain(lattice);
  const reaches = channelReaches(lattice, drainage);
  const { area } = drainage;

  // Each network follows the rules of the water it ends in. Its reaches are
  // trimmed back from the source to that catchment, short first-order stubs
  // are dropped, and a network is kept only if its remaining brooks rise
  // high enough; a dropped stub never vouches for its network.
  const rootOf = (index: number): number => { while (reaches[index].into >= 0) index = reaches[index].into; return index; };
  const rules = reaches.map((_, index) => {
    const root = reaches[rootOf(index)];
    if (root.outlet === "starter") return null;
    const mouth = root.cells[root.cells.length - 1];
    return mainlandBrookOutletRule(root.outlet, lattice.x(mouth), lattice.z(mouth));
  });
  reaches.forEach((reach, index) => {
    const rule = rules[index];
    if (!rule) return;
    let first = 0;
    while (first < reach.cells.length - 2 && area[reach.cells[first]] < rule.hectares) first++;
    reach.cells = reach.cells.slice(first);
  });
  const children = reaches.map(() => [] as number[]);
  reaches.forEach((reach, index) => { if (reach.into >= 0) children[reach.into].push(index); });
  const stub = reaches.map((reach, index) => {
    const rule = rules[index];
    return !rule || area[reach.cells[0]] < rule.hectares
      || (children[index].length === 0 && reachLength(reach.cells, lattice) < MINIMUM_REACH_METERS);
  });
  const headHeight = new Array<number>(reaches.length).fill(0);
  for (let index = reaches.length - 1; index >= 0; index--) {
    const own = stub[index] ? 0 : lattice.ground[reaches[index].cells[0]];
    headHeight[index] = Math.max(own, ...children[index].map(child => headHeight[child]));
  }
  const kept = new Set<number>();
  reaches.forEach((_, index) => {
    const rule = rules[index];
    if (!rule || stub[index] || headHeight[rootOf(index)] < rule.head) return;
    kept.add(index);
  });
  // A kept reach needs its trunk kept, or it would end in the air.
  for (const index of [...kept]) {
    let into = reaches[index].into;
    while (into >= 0 && !kept.has(into)) { kept.add(into); into = reaches[into].into; }
  }

  const ids = new Map<number, string>();
  let next = 1;
  const graded: {
    id: string; index: number; into: number; junction: number; outlet: Outlet;
    points: { x: number; z: number; bed: number }[]; hectares: number[];
  }[] = [];
  const bedAt = new Map<number, { x: number; z: number; bed: number }[]>();
  // Along each graded course, its knots' arc positions and the stretches its
  // culverts' works occupy: the pipe and its aprons.
  const worksAt = new Map<number, { arc: number[]; works: { from: number; to: number }[] }>();
  for (let index = 0; index < reaches.length; index++) {
    if (!kept.has(index)) continue;
    const reach = reaches[index];
    const id = `brook-${String(next++).padStart(2, "0")}`;
    ids.set(index, id);
    const cells = reach.cells;
    const course = cells.map(cell => ({ x: lattice.x(cell), z: lattice.z(cell) }));
    // A tributary ends on its trunk's smoothed course, not on the lattice cell.
    let mouthBed = MOUTH_BED_METERS;
    if (reach.into >= 0) {
      const trunk = bedAt.get(reach.into)!;
      const end = course[course.length - 1];
      let best = trunk[0];
      for (const knot of trunk) if (Math.hypot(knot.x - end.x, knot.z - end.z) < Math.hypot(best.x - end.x, best.z - end.z)) best = knot;
      course[course.length - 1] = { x: best.x, z: best.z };
      mouthBed = best.bed;
    }
    let smooth = resample(smoothCourse(course), KNOT_SPACING_METERS);
    // A tributary joins where it first meets its trunk. The flow lattice can
    // run the two side by side for a stretch before the cells merge, which
    // would cut two overlapping channels.
    // It meets the trunk at an angle, aiming a knot downstream of the point it
    // first comes close to, as water joining a current does, never square on.
    if (reach.into >= 0) {
      const trunk = bedAt.get(reach.into)!;
      const nearest = (point: { x: number; z: number }): number => {
        let best = 0;
        trunk.forEach((knot, i) => {
          if (Math.hypot(knot.x - point.x, knot.z - point.z) < Math.hypot(trunk[best].x - point.x, trunk[best].z - point.z)) best = i;
        });
        return best;
      };
      let meet = smooth.findIndex((point, i) => i > 0 && i < smooth.length - 1
        && Math.hypot(trunk[nearest(point)].x - point.x, trunk[nearest(point)].z - point.z) < TRIBUTARY_JOIN_METERS);
      if (meet <= 0) meet = smooth.length - 1;
      let jointIndex = Math.min(trunk.length - 1, nearest(smooth[meet]) + TRIBUTARY_JOIN_DOWNSTREAM_KNOTS);
      // Never into a culvert's pipe or aprons, where the trunk's bed is held
      // at the pipe: the tributary joins just above them, from its point
      // nearest there.
      const { arc, works } = worksAt.get(reach.into)!;
      const blocked = works.find(work => arc[jointIndex] >= work.from - 0.01 && arc[jointIndex] <= work.to + 0.01);
      if (blocked) {
        jointIndex = Math.max(0, arc.findIndex(position => position >= blocked.from) - 1);
        const target = trunk[jointIndex];
        let closest = 1;
        for (let i = 1; i <= meet; i++) {
          if (Math.hypot(smooth[i].x - target.x, smooth[i].z - target.z) < Math.hypot(smooth[closest].x - target.x, smooth[closest].z - target.z)) closest = i;
        }
        meet = closest;
      }
      // An approach that would run alongside the trunk into the joint joins it
      // further up instead, so the two never cut side-by-side channels.
      if (!blocked && meet > 0) {
        const from = smooth[meet - 1];
        const earliest = nearest(from);
        const alongTrunk = (index: number): boolean => {
          const a = trunk[Math.max(0, index - 1)], b = trunk[Math.min(trunk.length - 1, index + 1)];
          const tx = b.x - a.x, tz = b.z - a.z, ax = trunk[index].x - from.x, az = trunk[index].z - from.z;
          const cosine = (tx * ax + tz * az) / Math.max(1e-6, Math.hypot(tx, tz) * Math.hypot(ax, az));
          return cosine > Math.cos((TRIBUTARY_MIN_JOIN_DEGREES * Math.PI) / 180);
        };
        while (jointIndex > earliest && alongTrunk(jointIndex)) jointIndex -= 1;
      }
      const joint = trunk[jointIndex];
      smooth = resample([...smooth.slice(0, meet), { x: joint.x, z: joint.z }], KNOT_SPACING_METERS);
      mouthBed = joint.bed;
    }
    smooth = squareRoadCrossings(id, smooth);
    // A brook passes under every road it meets: knots mark the ends and the
    // middle of each culvert, whose bed is capped below the road.
    // The culvert's works run along the course from the crossing until it
    // stands clear of the road deck by the headwall face and the apron,
    // measured against the road itself so a bend in it is covered too.
    const clearance = (s: number): number => {
      const point = pointOnCourse(smooth, s), road = WorldLayout.nearestRouteDistance(point.x, point.z);
      return road.distance - road.halfWidth;
    };
    const worksEdge = (from: number, side: -1 | 1): number => {
      const reach = MAINLAND_BROOK_CULVERT_FACE_METERS + CULVERT_APRON_METERS, total = smooth[smooth.length - 1].s;
      let inside = from;
      for (let step = 0.25; step <= 30; step += 0.25) {
        const s = Math.max(0, Math.min(total, from + side * step));
        if (clearance(s) < reach && s > 0 && s < total) { inside = s; continue; }
        let low = inside, high = s;
        for (let k = 0; k < 16; k++) { const mid = (low + high) / 2; if (clearance(mid) >= reach) high = mid; else low = mid; }
        return high;
      }
      return from + side * 30;
    };
    const culverts = brookCoursesCrossingRoads([{ id, knots: smooth.map(point => [point.x, point.z]) }]).map(crossing => {
      const s = arcAt(smooth, crossing.point);
      return { s, cap: crossing.roadElevation - CULVERT_COVER_METERS, from: worksEdge(s, -1), to: worksEdge(s, 1) };
    });
    for (const culvert of culverts) {
      for (const at of [culvert.from, culvert.s, culvert.to]) {
        if (at <= 0 || at >= smooth[smooth.length - 1].s || smooth.some(point => Math.abs(point.s - at) < 0.05)) continue;
        const i = smooth.findIndex(point => point.s > at);
        const a = smooth[i - 1], b = smooth[i], t = (at - a.s) / (b.s - a.s);
        smooth.splice(i, 0, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: at });
      }
    }
    const hectares = smooth.map(point => {
      const i = Math.min(cells.length - 2, Math.round(point.s / Math.max(1e-9, smooth[smooth.length - 1].s) * (cells.length - 1)));
      return area[cells[i]];
    });
    const ground = smooth.map(point => mainlandRouteGroundAt(point.x, point.z));
    const bed = gradeBed(ground, hectares, mouthBed);
    // Under a road the bed holds the culvert's cap. Upstream, the drop to the
    // inlet is spread back along the course: each step may fall at its own
    // grade or the inlet grade, whichever is steeper, so the bed eases down
    // to the apron instead of stepping at its edge, and only as far as needed.
    const uncapped = bed.slice();
    for (const culvert of culverts) {
      smooth.forEach((point, i) => { if (point.s >= culvert.from - 0.01 && point.s <= culvert.to + 0.01) bed[i] = Math.min(bed[i], culvert.cap); });
    }
    for (let i = bed.length - 2; i >= 0; i--) {
      const run = smooth[i + 1].s - smooth[i].s;
      const grade = Math.max(CULVERT_INLET_GRADE, (uncapped[i] - uncapped[i + 1]) / Math.max(1e-6, run));
      bed[i] = Math.min(bed[i], bed[i + 1] + run * grade);
    }
    for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
    const points = smooth.map((point, i) => ({ x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10, bed: bed[i] }));
    bedAt.set(index, points);
    worksAt.set(index, { arc: smooth.map(point => point.s), works: culverts.map(culvert => ({ from: culvert.from, to: culvert.to })) });
    let junction = -1;
    if (reach.into >= 0) {
      const trunk = bedAt.get(reach.into)!, end = points[points.length - 1];
      junction = 0;
      trunk.forEach((knot, i) => {
        if (Math.hypot(knot.x - end.x, knot.z - end.z) < Math.hypot(trunk[junction].x - end.x, trunk[junction].z - end.z)) junction = i;
      });
    }
    graded.push({ id, index, into: reach.into, junction, points,
      hectares: hectares.map(value => Math.round(value * 10) / 10), outlet: reach.outlet as Outlet });
  }
  // The network's beds fall all the way down: where a tributary had to drop
  // under a road just above its confluence, its trunk is lowered below the
  // junction to meet it, and every tributary ends exactly on its trunk's bed.
  const byIndex = new Map(graded.map(brook => [brook.index, brook]));
  for (let k = graded.length - 1; k >= 0; k--) {
    const brook = graded[k], beds = brook.points;
    for (let i = 1; i < beds.length; i++) beds[i].bed = Math.min(beds[i].bed, beds[i - 1].bed);
    if (brook.into >= 0) {
      const trunk = byIndex.get(brook.into)!.points[brook.junction];
      trunk.bed = Math.min(trunk.bed, beds[beds.length - 1].bed);
    }
  }
  for (const brook of graded) {
    const beds = brook.points;
    for (let i = 1; i < beds.length; i++) beds[i].bed = Math.min(beds[i].bed, beds[i - 1].bed);
    if (brook.into >= 0) beds[beds.length - 1].bed = byIndex.get(brook.into)!.points[brook.junction].bed;
  }
  return graded.map(brook => {
    const knots: [number, number, number, number][] = [];
    brook.points.forEach((point, i) => {
      const knot: [number, number, number, number] = [point.x, point.z, Math.round(point.bed * 100) / 100, brook.hectares[i]];
      // Rounding can land two culvert knots on one point; a course never repeats a point.
      const previous = knots[knots.length - 1];
      if (previous && previous[0] === knot[0] && previous[1] === knot[1]) {
        previous[2] = Math.min(previous[2], knot[2]);
        return;
      }
      knots.push(knot);
    });
    return { id: brook.id, outlet: brook.into >= 0 ? ids.get(brook.into)! : brook.outlet, knots };
  });
}

/** Hash of the tracing parameters and the ground over the whole lattice at a coarse stride. */
export function mainlandBrookFingerprint(): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    const text = value.toFixed(3);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const rule of Object.values(OUTLET_RULES)) { mix(rule.hectares); mix(rule.head); }
  for (const value of [GRID_METERS, COVE_MOUTH_SHELTER, MINIMUM_REACH_METERS,
    PAD_CLEARANCE_METERS, VILLAGE_SQUARE_METERS, TRIBUTARY_JOIN_METERS, TRIBUTARY_JOIN_DOWNSTREAM_KNOTS, TRIBUTARY_MIN_JOIN_DEGREES, ROAD_EMBANKMENT_METERS, ...ROAD_EMBANKMENT_VERGE_METERS, MEANDER_METERS, MEANDER_SCALE_METERS, MEANDER_SALT, WORK_SITE_CLEARANCE_METERS, FLAT_GRADE, SMOOTH_HALF_WINDOW, SMOOTH_PASSES,
    KNOT_SPACING_METERS, INCISION_BASE_METERS, INCISION_GAIN_METERS, INCISION_MAX_METERS,
    CULVERT_COVER_METERS, CULVERT_APRON_METERS, CULVERT_INLET_GRADE, MAINLAND_BROOK_CULVERT_FACE_METERS,
    SQUARE_RUN_METERS, SQUARE_BLEND_METERS, MOUTH_BED_METERS]) mix(value);
  // Beds are capped under the roads, so the brooks follow every generated road knot.
  for (const road of MAINLAND_ROAD_NETWORK) {
    for (const knot of road.knots) for (const value of knot) mix(value);
  }
  for (const [x, z] of MAINLAND_WORK_SITES.map(site => [site.center.x, site.center.z])) { mix(x); mix(z); }
  for (let x = MAINLAND_BOUNDS.minX; x <= MAINLAND_BOUNDS.maxX; x += 36) {
    for (let z = MAINLAND_BOUNDS.minZ; z <= MAINLAND_BOUNDS.maxZ; z += 36) {
      if (mainlandBlendAt(x, z) < MAINLAND_ONLY || signedDistanceToNevaCoast(x, z) > 0) continue;
      mix(mainlandRouteGroundAt(x, z));
    }
  }
  for (const pad of MAINLAND_ARCHITECTURE_PADS) { mix(pad.center.x); mix(pad.center.z); }
  return hash.toString(16).padStart(8, "0");
}

export const MAINLAND_BROOKS_GENERATED_PATH = fileURLToPath(new URL("../../src/world/MainlandBrooks.generated.ts", import.meta.url));

/** Source text of the generated courses module. */
export function renderMainlandBrooks(brooks: readonly TracedBrook[], fingerprint: string): string {
  const lines = [
    "// Generated by tools/world/mainlandBrookTracer.ts (npm run world:trace-brooks). Do not edit.",
    "// Downstream knots of every mainland brook: x, z, bed elevation, catchment hectares.",
    "",
    `export const MAINLAND_BROOK_FINGERPRINT = "${fingerprint}";`,
    "",
    "export const MAINLAND_BROOK_COURSES: readonly {",
    "  readonly id: string;",
    "  readonly outlet: string;",
    "  readonly knots: readonly (readonly [number, number, number, number])[];",
    "}[] = ["
  ];
  brooks.forEach((brook, index) => {
    const knots = brook.knots.map(knot => `[${knot.join(", ")}]`);
    const rows: string[] = [];
    for (let i = 0; i < knots.length; i += 5) rows.push(knots.slice(i, i + 5).join(", "));
    lines.push(`  { id: "${brook.id}", outlet: "${brook.outlet}", knots: [`);
    lines.push(`    ${rows.join(",\n    ")}`);
    lines.push(`  ] }${index < brooks.length - 1 ? "," : ""}`);
  });
  lines.push("];", "");
  return lines.join("\n");
}

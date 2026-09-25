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
 * Each brook's course is smoothed, and its bed is graded to fall
 * monotonically downstream, balancing cut against fill along the ground,
 * dropping under every routed road to pass through a culvert, and meeting
 * its trunk or the water level exactly. Run it after `world:route-roads`;
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
import { MAINLAND_ROUTE_FINGERPRINT } from "../../src/world/MainlandRoutes.generated";
import {
  brookCoursesCrossingRoads,
  mainlandBlendAt,
  mainlandRouteGroundAt,
  mainlandWaterSample
} from "../../src/world/NevaMainland";
import { fractalNoise } from "../../src/world/ProceduralNoise";
import { MAINLAND_BOUNDS, signedDistanceToNevaCoast } from "../../src/world/WorldIslands";

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
/** Catchment at which a gully floor carries a running brook. */
const CHANNEL_HECTARES = 0.15;
/** A network is a mountain brook only if one of its channel heads rises this high. */
const MOUNTAIN_HEAD_METERS = 16;
/** Short first-order channels read as wet hollows, not brooks. */
const MINIMUM_REACH_METERS = 70;
/** Mainland share below which the retained starter relief owns the ground. */
const MAINLAND_ONLY = 0.999;
/** Walls: building pads and work sites keep this clear. */
const PAD_CLEARANCE_METERS = 5;
const WORK_SITE_CLEARANCE_METERS = 4;
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
  return buildingDistance(x, z) < PAD_CLEARANCE_METERS || mainlandWorkSiteClearanceAt(x, z) < WORK_SITE_CLEARANCE_METERS;
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
    ground[index] = mainlandRouteGroundAt(cx, cz) + fractalNoise(cx, cz, MEANDER_SCALE_METERS, 2, MEANDER_SALT) * MEANDER_METERS;
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

function incision(hectares: number): number {
  return Math.min(INCISION_MAX_METERS, INCISION_BASE_METERS + INCISION_GAIN_METERS * Math.sqrt(hectares / CHANNEL_HECTARES));
}

/**
 * Bed graded to fall downstream: the mean of the ground cut down to its
 * running minimum and filled up to its running maximum, so cut and fill
 * balance, less an incision that deepens with the catchment. The mouth meets
 * the trunk bed or sits one incision below the water level.
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

  // Drop short first-order stubs, then keep the networks whose remaining
  // brooks rise in the mountains; a stub never vouches for its network.
  const children = reaches.map(() => [] as number[]);
  reaches.forEach((reach, index) => { if (reach.into >= 0) children[reach.into].push(index); });
  const stub = reaches.map((reach, index) => children[index].length === 0 && reachLength(reach.cells, lattice) < MINIMUM_REACH_METERS);
  const headHeight = new Array<number>(reaches.length).fill(0);
  for (let index = reaches.length - 1; index >= 0; index--) {
    const own = stub[index] ? 0 : lattice.ground[reaches[index].cells[0]];
    headHeight[index] = Math.max(own, ...children[index].map(child => headHeight[child]));
  }
  const kept = new Set<number>();
  reaches.forEach((_, index) => {
    let root = index;
    while (reaches[root].into >= 0) root = reaches[root].into;
    if (reaches[root].outlet === "starter" || headHeight[root] < MOUNTAIN_HEAD_METERS || stub[index]) return;
    kept.add(index);
  });
  // A kept reach needs its trunk kept, or it would end in the air.
  for (const index of [...kept]) {
    let into = reaches[index].into;
    while (into >= 0 && !kept.has(into)) { kept.add(into); into = reaches[into].into; }
  }

  const ids = new Map<number, string>();
  let next = 1;
  const brooks: TracedBrook[] = [];
  const bedAt = new Map<number, { x: number; z: number; bed: number }[]>();
  for (let index = 0; index < reaches.length; index++) {
    if (!kept.has(index)) continue;
    const reach = reaches[index];
    const id = `brook-${String(next++).padStart(2, "0")}`;
    ids.set(index, id);
    const cells = reach.cells;
    const course = cells.map(cell => ({ x: lattice.x(cell), z: lattice.z(cell) }));
    // A tributary ends on its trunk's smoothed course, not on the lattice cell.
    let mouthBed = -incision(area[cells[cells.length - 2]]);
    if (reach.into >= 0) {
      const trunk = bedAt.get(reach.into)!;
      const end = course[course.length - 1];
      let best = trunk[0];
      for (const knot of trunk) if (Math.hypot(knot.x - end.x, knot.z - end.z) < Math.hypot(best.x - end.x, best.z - end.z)) best = knot;
      course[course.length - 1] = { x: best.x, z: best.z };
      mouthBed = best.bed;
    }
    const smooth = resample(smoothCourse(course), KNOT_SPACING_METERS);
    // A brook passes under every road it meets: knots mark the ends and the
    // middle of each culvert, whose bed is capped below the road.
    const culverts = brookCoursesCrossingRoads([{ id, knots: smooth.map(point => [point.x, point.z]) }]).map(crossing => {
      const normal = { x: -crossing.road.z, z: crossing.road.x };
      const square = Math.max(0.35, Math.abs(crossing.brook.x * normal.x + crossing.brook.z * normal.z));
      let s = 0;
      for (let i = 1; i < smooth.length; i++) {
        const a = smooth[i - 1], b = smooth[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const t = ((crossing.point.x - a.x) * (b.x - a.x) + (crossing.point.z - a.z) * (b.z - a.z)) / Math.max(1e-9, length * length);
        if (t >= 0 && t <= 1 && Math.hypot(a.x + (b.x - a.x) * t - crossing.point.x, a.z + (b.z - a.z) * t - crossing.point.z) < 0.01) {
          s = a.s + length * t;
          break;
        }
      }
      return { s, cap: crossing.roadElevation - CULVERT_COVER_METERS,
        span: (crossing.route.widthMeters * 0.5 + MAINLAND_BROOK_CULVERT_FACE_METERS + CULVERT_APRON_METERS) / square };
    });
    for (const culvert of culverts) {
      for (const at of [culvert.s - culvert.span, culvert.s, culvert.s + culvert.span]) {
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
    const graded = bed.slice();
    for (const culvert of culverts) {
      smooth.forEach((point, i) => { if (Math.abs(point.s - culvert.s) <= culvert.span + 0.01) bed[i] = Math.min(bed[i], culvert.cap); });
    }
    for (let i = bed.length - 2; i >= 0; i--) {
      const run = smooth[i + 1].s - smooth[i].s;
      const grade = Math.max(CULVERT_INLET_GRADE, (graded[i] - graded[i + 1]) / Math.max(1e-6, run));
      bed[i] = Math.min(bed[i], bed[i + 1] + run * grade);
    }
    for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
    const knots = smooth.map((point, i) => [
      Math.round(point.x * 10) / 10, Math.round(point.z * 10) / 10,
      Math.round(bed[i] * 100) / 100, Math.round(hectares[i] * 10) / 10
    ] as [number, number, number, number]);
    bedAt.set(index, knots.map(([x, z, b]) => ({ x, z, bed: b })));
    brooks.push({ id, outlet: reach.into >= 0 ? ids.get(reach.into)! : reach.outlet as Outlet, knots });
  }
  return brooks;
}

/** Hash of the tracing parameters and the ground over the whole lattice at a coarse stride. */
export function mainlandBrookFingerprint(): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    const text = value.toFixed(3);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const value of [GRID_METERS, CHANNEL_HECTARES, MOUNTAIN_HEAD_METERS, MINIMUM_REACH_METERS,
    PAD_CLEARANCE_METERS, MEANDER_METERS, MEANDER_SCALE_METERS, MEANDER_SALT, WORK_SITE_CLEARANCE_METERS, FLAT_GRADE, SMOOTH_HALF_WINDOW, SMOOTH_PASSES,
    KNOT_SPACING_METERS, INCISION_BASE_METERS, INCISION_GAIN_METERS, INCISION_MAX_METERS,
    CULVERT_COVER_METERS, CULVERT_APRON_METERS, CULVERT_INLET_GRADE, MAINLAND_BROOK_CULVERT_FACE_METERS]) mix(value);
  // Beds are capped under the routed roads, so the brooks follow the routes.
  for (let i = 0; i < MAINLAND_ROUTE_FINGERPRINT.length; i++) mix(MAINLAND_ROUTE_FINGERPRINT.charCodeAt(i));
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

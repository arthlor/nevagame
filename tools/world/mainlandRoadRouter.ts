/**
 * Offline least-cost router for the Neva mainland roads.
 *
 * `MAINLAND_ROUTE_PLANS` owns road topology: endpoints, junctions, landing
 * lips and the retained starter-district datums. This tool finds each "route"
 * leg between them over the shore-shaped ground a road is graded against, the
 * way a surveyor would: along valley floors and benches, over the lowest
 * saddle, round wet ground and off steep side-slopes. The result is written to
 * `src/world/MainlandRoutes.generated.ts` with a terrain fingerprint, and a
 * unit test fails when the terrain drifts from the routes built for it.
 *
 *   npm run world:route-roads             rewrite the generated knots
 *   npm run world:route-roads -- --check  exit 1 if they are stale
 *
 * (`tools/world/route-mainland-roads.ts` is the command entry.)
 */
import { fileURLToPath } from "node:url";
import {
  MAINLAND_ROUTE_PLANS,
  mainlandRouteGroundAt,
  type MainlandRoutePlan
} from "../../src/world/NevaMainland";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

type Point = { x: number; z: number };
type Kind = MainlandRoutePlan["kind"];

const GRID_METERS = 4;
const SEARCH_MARGIN_METERS = 220;
/** Knight and king moves: sixteen headings, so the lattice never forces a zigzag. */
const MOVES: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]
];

/** Comfortable and hard grades per road class; the hard grade matches the grading clamp in `route()`. */
const GRADES: Readonly<Record<Kind, { comfortable: number; hard: number }>> = {
  arterial: { comfortable: 0.09, hard: 0.2 },
  lane: { comfortable: 0.11, hard: 0.23 },
  trail: { comfortable: 0.16, hard: 0.33 }
};
/** Dry margin kept from any water, except where a leg deliberately ends at a bank or lip. */
const WATER_MARGIN_METERS = 7;
const ENDPOINT_WATER_RELEASE_METERS = 26;
const SIMPLIFY_TOLERANCE_METERS = 4.5;
const MAX_KNOT_SPACING_METERS = 64;

interface Leg { from: Point; to: Point; kind: Kind }

/** Road half-width per class, matching `route()`; buildings keep this plus a verge clear. */
const HALF_WIDTH_METERS: Readonly<Record<Kind, number>> = { arterial: 2.3, lane: 2.1, trail: 1.4 };
const BUILDING_VERGE_METERS = 1.8;

/** Distance from a point to the nearest village building footprint. */
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

function planLegs(plan: MainlandRoutePlan): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    if (plan.steps[i] !== "route") continue;
    const before = plan.steps[i - 1], after = plan.steps[i + 1];
    if (!Array.isArray(before) || !Array.isArray(after)) throw new Error(`${plan.id}: "route" must sit between two knots`);
    legs.push({ from: { x: before[0], z: before[1] }, to: { x: after[0], z: after[1] }, kind: plan.kind });
  }
  return legs;
}

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
      if (keys[parent] <= key) break;
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
        let child = left;
        if (left >= keys.length) break;
        if (right < keys.length && keys[right] < keys[left]) child = right;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child]; values[i] = values[child];
        i = child;
      }
      keys[i] = lastKey; values[i] = lastValue;
    }
    return top;
  }
}

/** Turning cost in metres per unit of (1 - cos) between successive headings. */
const TURN_COST_METERS: Readonly<Record<Kind, number>> = { arterial: 9, lane: 7, trail: 4.5 };
/** No single lattice step may swing further than this; hairpins become broad bends. */
const MAX_TURN_COSINE = Math.cos((50 * Math.PI) / 180);
const HEADINGS = MOVES.length;

/**
 * A* over a 4 m lattice whose state includes the arriving heading, so bends
 * cost distance and a road cannot kink. Costs are metres of travel inflated by
 * grade, side-slope and wet ground.
 */
function routeLeg(leg: Leg): Point[] {
  const minX = Math.min(leg.from.x, leg.to.x) - SEARCH_MARGIN_METERS;
  const minZ = Math.min(leg.from.z, leg.to.z) - SEARCH_MARGIN_METERS;
  const width = Math.ceil((Math.max(leg.from.x, leg.to.x) + SEARCH_MARGIN_METERS - minX) / GRID_METERS) + 1;
  const depth = Math.ceil((Math.max(leg.from.z, leg.to.z) + SEARCH_MARGIN_METERS - minZ) / GRID_METERS) + 1;
  const cells = width * depth;
  const states = cells * (HEADINGS + 1);
  const raw = new Float64Array(cells).fill(Number.NaN);
  const smooth = new Float64Array(cells).fill(Number.NaN);
  const wet = new Int8Array(cells).fill(-1);
  const cost = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const worldX = (i: number): number => minX + (i % width) * GRID_METERS;
  const worldZ = (i: number): number => minZ + Math.floor(i / width) * GRID_METERS;
  const index = (p: Point): number =>
    Math.round((p.z - minZ) / GRID_METERS) * width + Math.round((p.x - minX) / GRID_METERS);
  const rawAt = (i: number): number => {
    if (Number.isNaN(raw[i])) raw[i] = mainlandRouteGroundAt(worldX(i), worldZ(i));
    return raw[i];
  };
  // Gully floors a culvert or a short fill would cross are not obstacles:
  // grade against the ground blurred over one lattice step.
  const heightAt = (i: number): number => {
    if (Number.isNaN(smooth[i])) {
      const x = i % width, z = Math.floor(i / width);
      let total = rawAt(i) * 4, weight = 4;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
        total += rawAt(nz * width + nx);
        weight += 1;
      }
      smooth[i] = total / weight;
    }
    return smooth[i];
  };
  const release = (x: number, z: number): number => Math.min(
    Math.hypot(x - leg.from.x, z - leg.from.z), Math.hypot(x - leg.to.x, z - leg.to.z));
  const blocked = (i: number): boolean => {
    if (wet[i] < 0) {
      const x = worldX(i), z = worldZ(i);
      const margin = release(x, z) < ENDPOINT_WATER_RELEASE_METERS ? 0.5 : WATER_MARGIN_METERS;
      wet[i] = WorldLayout.waterSignedDistance(x, z) > -margin
        || buildingDistance(x, z) < HALF_WIDTH_METERS[leg.kind] + BUILDING_VERGE_METERS ? 1 : 0;
    }
    return wet[i] === 1;
  };
  const grades = GRADES[leg.kind];
  const turnCost = TURN_COST_METERS[leg.kind];
  const start = index(leg.from), goal = index(leg.to);
  const goalX = worldX(goal), goalZ = worldZ(goal);
  const heap = new MinHeap();
  const startState = start * (HEADINGS + 1) + HEADINGS;
  cost[startState] = 0;
  heap.push(startState, 0);
  let goalState = -1;
  while (heap.size > 0) {
    const state = heap.pop();
    if (closed[state]) continue;
    closed[state] = 1;
    const current = Math.floor(state / (HEADINGS + 1)), heading = state % (HEADINGS + 1);
    if (current === goal) { goalState = state; break; }
    const cx = current % width, cz = Math.floor(current / width);
    const here = heightAt(current);
    for (let move = 0; move < HEADINGS; move++) {
      const [mx, mz] = MOVES[move];
      const length = Math.hypot(mx, mz) * GRID_METERS;
      let turn = 0;
      if (heading < HEADINGS) {
        const [px, pz] = MOVES[heading];
        const cosine = (px * mx + pz * mz) / (Math.hypot(px, pz) * Math.hypot(mx, mz));
        if (cosine < MAX_TURN_COSINE) continue;
        turn = (1 - cosine) * turnCost;
      }
      const nx = cx + mx, nz = cz + mz;
      if (nx < 1 || nz < 1 || nx >= width - 1 || nz >= depth - 1) continue;
      const next = nz * width + nx;
      const nextState = next * (HEADINGS + 1) + move;
      if (closed[nextState] || blocked(next)) continue;
      // A knight move also crosses the cell between; it must be dry too.
      if (Math.abs(mx) + Math.abs(mz) === 3 && blocked((cz + Math.trunc(mz / 2)) * width + cx + Math.trunc(mx / 2))) continue;
      const grade = Math.abs(heightAt(next) - here) / length;
      // Side-slope across the direction of travel sets how deep the bench cuts.
      const gx = (heightAt(next + 1) - heightAt(next - 1)) / (2 * GRID_METERS);
      const gz = (heightAt(next + width) - heightAt(next - width)) / (2 * GRID_METERS);
      const side = Math.abs((gx * -mz + gz * mx) / Math.hypot(mx, mz));
      const comfort = grade / grades.comfortable;
      const factor = 1 + comfort * comfort * 2.5
        + Math.max(0, grade - grades.hard) * 90
        + (side / 0.3) * (side / 0.3) * 1.4;
      const candidate = cost[state] + length * factor + turn;
      if (candidate >= cost[nextState]) continue;
      cost[nextState] = candidate;
      parent[nextState] = state;
      heap.push(nextState, candidate + Math.hypot(worldX(next) - goalX, worldZ(next) - goalZ));
    }
  }
  if (goalState < 0) throw new Error(`No dry route between ${JSON.stringify(leg.from)} and ${JSON.stringify(leg.to)}`);
  const path: Point[] = [];
  for (let state = goalState; state >= 0; state = parent[state]) {
    const cell = Math.floor(state / (HEADINGS + 1));
    path.push({ x: worldX(cell), z: worldZ(cell) });
  }
  path.reverse();
  path[0] = { ...leg.from };
  path[path.length - 1] = { ...leg.to };
  return path;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) return Math.hypot(p.x - a.x, p.z - a.z);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared));
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

/** Douglas-Peucker, then no knot gap longer than the spline can bend through. */
function simplify(path: readonly Point[]): Point[] {
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1, worstDistance = SIMPLIFY_TOLERANCE_METERS;
    for (let i = first + 1; i < last; i++) {
      const distance = perpendicularDistance(path[i], path[first], path[last]);
      if (distance > worstDistance) { worst = i; worstDistance = distance; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  const result: Point[] = [];
  let previous = 0;
  for (let i = 1; i < path.length; i++) {
    if (!keep[i]) continue;
    let arc = 0;
    for (let k = previous + 1; k <= i; k++) arc += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
    const splits = Math.floor(arc / MAX_KNOT_SPACING_METERS);
    for (let split = 1; split <= splits; split++) {
      const target = arc * split / (splits + 1);
      let walked = 0;
      for (let k = previous + 1; k <= i; k++) {
        const step = Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
        if (walked + step >= target) { result.push(path[k]); break; }
        walked += step;
      }
    }
    if (i < path.length - 1) result.push(path[i]);
    previous = i;
  }
  return result;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function routeMainlandRoads(): Record<string, [number, number][][]> {
  const legs: Record<string, [number, number][][]> = {};
  for (const plan of MAINLAND_ROUTE_PLANS) {
    const planned = planLegs(plan);
    if (planned.length === 0) continue;
    legs[plan.id] = planned.map(leg => simplify(routeLeg(leg)).map(p => [round(p.x), round(p.z)] as [number, number]));
  }
  return legs;
}

/**
 * Hash of the plans and the route ground over every leg's search box. The
 * routes are only valid for the terrain they were found on.
 */
export function mainlandRouteFingerprint(): string {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    const text = value.toFixed(3);
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const plan of MAINLAND_ROUTE_PLANS) {
    for (const step of plan.steps) {
      if (step === "route") { mix(-99999); continue; }
      mix(step[0]); mix(step[1]); mix(step[2] ?? -77777);
    }
    for (const leg of planLegs(plan)) {
      const minX = Math.min(leg.from.x, leg.to.x) - SEARCH_MARGIN_METERS, maxX = Math.max(leg.from.x, leg.to.x) + SEARCH_MARGIN_METERS;
      const minZ = Math.min(leg.from.z, leg.to.z) - SEARCH_MARGIN_METERS, maxZ = Math.max(leg.from.z, leg.to.z) + SEARCH_MARGIN_METERS;
      for (let x = minX; x <= maxX; x += 36) for (let z = minZ; z <= maxZ; z += 36) mix(mainlandRouteGroundAt(x, z));
    }
  }
  return hash.toString(16).padStart(8, "0");
}

export const MAINLAND_ROUTES_GENERATED_PATH = fileURLToPath(new URL("../../src/world/MainlandRoutes.generated.ts", import.meta.url));

/** Source text of the generated knots module. */
export function renderMainlandRoutes(legs: Record<string, [number, number][][]>, fingerprint: string): string {
  const lines = [
    "// Generated by tools/world/mainlandRoadRouter.ts (npm run world:route-roads). Do not edit.",
    "// Interior knots of every routed leg in MAINLAND_ROUTE_PLANS, in plan order.",
    "",
    `export const MAINLAND_ROUTE_FINGERPRINT = "${fingerprint}";`,
    "",
    "export const MAINLAND_ROUTED_LEGS: Readonly<Record<string, readonly (readonly (readonly [number, number])[])[]>> = {"
  ];
  const ids = Object.keys(legs);
  ids.forEach((id, idIndex) => {
    lines.push(`  "${id}": [`);
    legs[id].forEach((leg, legIndex) => {
      const knots = leg.map(([x, z]) => `[${x}, ${z}]`);
      const rows: string[] = [];
      for (let i = 0; i < knots.length; i += 8) rows.push(knots.slice(i, i + 8).join(", "));
      lines.push(`    [${rows.join(",\n      ")}]${legIndex < legs[id].length - 1 ? "," : ""}`);
    });
    lines.push(`  ]${idIndex < ids.length - 1 ? "," : ""}`);
  });
  lines.push("};", "");
  return lines.join("\n");
}

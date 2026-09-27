/**
 * Offline planner for the Neva mainland road network.
 *
 * `NevaMainland` names only the places roads serve
 * (`MAINLAND_ROAD_DESTINATIONS`: the two starter-district gateways with their
 * retained connectors, the villages, the work sites and the fishing banks) and
 * the short landing lanes with their fixed lips. This tool decides the rest,
 * the way a road network grows between settlements:
 *
 * 1. Travel cost between every pair of places over the ground a road is graded
 *    against: grade, side-slope, water, buildings and the starter district.
 * 2. Which places connect: the cheapest tree joining the villages and the
 *    starter district, plus a loop only where the tree's detour exceeds
 *    `LOOP_DETOUR_RATIO` and enough traffic would use it. Work sites and
 *    fishing banks branch off the network that results.
 * 3. Traffic between every pair of places, weighted by what each place is and
 *    assigned along that network, sets each link's class; a work site's track
 *    carries carts, a fishing bank's only walkers.
 * 4. Links are surveyed busiest first by a heading-aware least-cost search.
 *    Ground an earlier road already uses is cheaper and a strip beside it
 *    dearer, so a later road joins the trunk and leaves it at a junction
 *    instead of running beside it. Junctions lean forward, as traffic turns.
 *
 * The network is written to `src/world/MainlandRoadNetwork.generated.ts` with
 * a fingerprint of its inputs; `tests/unit/mainlandRoadNetwork.test.ts` fails
 * when the terrain or the destinations change without re-planning.
 *
 *   npm run world:plan-roads             rewrite the generated network
 *   npm run world:plan-roads -- --check  exit 1 if it is stale
 *
 * (`tools/world/plan-mainland-roads.ts` is the command entry.)
 */
import { fileURLToPath } from "node:url";
import {
  MAINLAND_LANDING_LANES,
  MAINLAND_ROAD_DESTINATIONS,
  MAINLAND_ROAD_ROLE_WEIGHTS,
  mainlandBlendAt,
  mainlandRouteGroundAt,
  smoothMainlandCenterline,
  type MainlandRoadDestination,
  type MainlandRoadKnot
} from "../../src/world/NevaMainland";
import { MAINLAND_ARCHITECTURE_PADS } from "../../src/world/MainlandSettlementLayout";
import { mainlandWorkSiteClearanceAt } from "../../src/world/MainlandWorkSites";
import { ROAD_CLASS_PROFILES, type RoadClassId } from "../../src/world/RoadClasses";
import { MAINLAND_BOUNDS } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";

type Point = { x: number; z: number };
type Kind = RoadClassId;

const GRID_METERS = 4;
/** Knight and king moves: sixteen headings, so the lattice never forces a zigzag. */
const MOVES: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]
];
const HEADINGS = MOVES.length;
/** Comfortable and hard grades per class; the hard grade matches the grading clamp in `NevaMainland`. */
const GRADES: Readonly<Record<Kind, { comfortable: number; hard: number }>> = {
  arterial: { comfortable: 0.09, hard: 0.2 },
  lane: { comfortable: 0.11, hard: 0.23 },
  trail: { comfortable: 0.16, hard: 0.33 }
};
/** Turning cost in metres per unit of (1 - cos) between successive headings. */
const TURN_COST_METERS: Readonly<Record<Kind, number>> = { arterial: 9, lane: 7, trail: 4.5 };
/** No single lattice step may swing further than this; hairpins become broad bends. */
const MAX_TURN_COSINE = Math.cos((50 * Math.PI) / 180);
/**
 * Dry margin kept from any water, except where a link deliberately ends at a
 * bank or lip: a cart road keeps off the wet shore; a footpath may walk it.
 */
const WATER_MARGIN_METERS: Readonly<Record<Kind, number>> = { arterial: 11, lane: 9, trail: 5 };
const ENDPOINT_RELEASE_METERS = 26;
const BUILDING_VERGE_METERS = 1.8;
/** Share of the starter district's own ground the mainland roads may not enter. */
const STARTER_DISTRICT_BLEND = 0.5;
/** Riding ground an earlier road already uses costs this share of breaking new ground. */
const ROAD_FOLLOW_FACTOR = 0.45;
/** Band beside an earlier road, off its surface, that a new road pays extra to run along. */
const ROAD_BESIDE_METERS: readonly [number, number] = [3, 12];
const ROAD_BESIDE_COST = 0.9;
/** A loop is built only where the tree makes a journey this much longer than a direct road. */
const LOOP_DETOUR_RATIO = 1.4;
/** ... and only if the traffic it would carry is at least this share of the busiest link. */
const LOOP_TRAFFIC_SHARE = 0.12;
/** A hub link carrying at least this share of the busiest link's traffic is a cart road. */
const ARTERIAL_TRAFFIC_SHARE = 0.15;
/** A branch leaves its trunk here, measured along the trunk behind where it clears the trunk. */
const JUNCTION_LEAN_METERS = 3.5;
/** A branch counts as clear of its trunk once it is this far from the trunk's centre line. */
const JUNCTION_CLEAR_METERS = 6;
/** Two roads leaving a place closer in heading than this share the first stretch and fork later. */
const MIN_ARM_DEGREES = 40;
/** A stretch of survey on new ground shorter than this is not a road of its own. */
const MIN_ROAD_METERS = 12;
/** A fork on a road leaving a place stands at least this far out from the place's knot. */
const PLACE_FORK_METERS = 9;
/** Junctions on one road closer than this merge into one crossing. */
const JUNCTION_MERGE_METERS = 7;
const SIMPLIFY_TOLERANCE_METERS = 4.5;
const MAX_KNOT_SPACING_METERS = 64;

/** Links of the last plan with their traffic, for the command's report. */
export let lastPlannedLinks: readonly { a: string; b: string; kind: RoadClassId; traffic: number; cost: number }[] = [];

export interface PlannedRoad {
  id: string;
  kind: Kind;
  knots: MainlandRoadKnot[];
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

function segmentProjection(p: Point, a: Point, b: Point): { t: number; distance: number; point: Point } {
  const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSquared));
  const point = { x: a.x + dx * t, z: a.z + dz * t };
  return { t, distance: Math.hypot(p.x - point.x, p.z - point.z), point };
}

/** Distance to building footprints, as the router has always kept villages clear. */
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

/** The 4 m survey lattice over the whole mainland, sampled lazily. */
class SurveyLattice {
  readonly minX: number;
  readonly minZ: number;
  readonly width: number;
  readonly depth: number;
  readonly cells: number;
  private readonly raw: Float64Array;
  private readonly smooth: Float64Array;
  private readonly water: Float64Array;
  private readonly clearance: Float64Array;
  private readonly starter: Float64Array;
  /** Index + 1 of the road whose surface covers a cell, or 0. */
  readonly roadAt: Int32Array;
  /** 1 where a cell lies beside a road, off its surface. */
  readonly besideRoad: Uint8Array;

  constructor() {
    this.minX = MAINLAND_BOUNDS.minX;
    this.minZ = MAINLAND_BOUNDS.minZ;
    this.width = Math.ceil((MAINLAND_BOUNDS.maxX - this.minX) / GRID_METERS) + 1;
    this.depth = Math.ceil((MAINLAND_BOUNDS.maxZ - this.minZ) / GRID_METERS) + 1;
    this.cells = this.width * this.depth;
    this.raw = new Float64Array(this.cells).fill(Number.NaN);
    this.smooth = new Float64Array(this.cells).fill(Number.NaN);
    this.water = new Float64Array(this.cells).fill(Number.NaN);
    this.clearance = new Float64Array(this.cells).fill(Number.NaN);
    this.starter = new Float64Array(this.cells).fill(Number.NaN);
    this.roadAt = new Int32Array(this.cells);
    this.besideRoad = new Uint8Array(this.cells);
  }

  x(i: number): number { return this.minX + (i % this.width) * GRID_METERS; }
  z(i: number): number { return this.minZ + Math.floor(i / this.width) * GRID_METERS; }
  index(p: Point): number {
    const column = Math.max(0, Math.min(this.width - 1, Math.round((p.x - this.minX) / GRID_METERS)));
    const row = Math.max(0, Math.min(this.depth - 1, Math.round((p.z - this.minZ) / GRID_METERS)));
    return row * this.width + column;
  }

  private rawAt(i: number): number {
    if (Number.isNaN(this.raw[i])) this.raw[i] = mainlandRouteGroundAt(this.x(i), this.z(i));
    return this.raw[i];
  }

  /** Gully floors a culvert or a short fill would cross are not obstacles: the ground blurred over one step. */
  heightAt(i: number): number {
    if (Number.isNaN(this.smooth[i])) {
      const x = i % this.width, z = Math.floor(i / this.width);
      let total = this.rawAt(i) * 4, weight = 4;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.width || nz >= this.depth) continue;
        total += this.rawAt(nz * this.width + nx);
        weight += 1;
      }
      this.smooth[i] = total / weight;
    }
    return this.smooth[i];
  }

  /**
   * Whether a road of this class may occupy a cell. Buildings and work sites
   * always keep a verge clear. Water keeps a margin and the starter district
   * is closed, except within `ENDPOINT_RELEASE_METERS` of a link's own ends,
   * where a landing lip or a gateway connector meets them.
   */
  blocked(i: number, kind: Kind, released: boolean): boolean {
    if (Number.isNaN(this.water[i])) {
      const x = this.x(i), z = this.z(i);
      this.water[i] = WorldLayout.waterSignedDistance(x, z);
      this.clearance[i] = Math.min(buildingDistance(x, z), mainlandWorkSiteClearanceAt(x, z));
      this.starter[i] = mainlandBlendAt(x, z);
    }
    if (this.clearance[i] < ROAD_CLASS_PROFILES[kind].widthMeters * 0.5 + BUILDING_VERGE_METERS) return true;
    if (this.water[i] > -(released ? 0.5 : WATER_MARGIN_METERS[kind])) return true;
    return !released && this.starter[i] < STARTER_DISTRICT_BLEND;
  }

  /** Marks a planned road's surface and the band beside it. */
  paint(points: readonly Point[], roadIndex: number, kind: Kind): void {
    const surface = ROAD_CLASS_PROFILES[kind].widthMeters * 0.5 + GRID_METERS * 0.55;
    const reach = ROAD_BESIDE_METERS[1];
    for (let k = 1; k < points.length; k++) {
      const a = points[k - 1], b = points[k];
      const minColumn = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach - this.minX) / GRID_METERS));
      const maxColumn = Math.min(this.width - 1, Math.ceil((Math.max(a.x, b.x) + reach - this.minX) / GRID_METERS));
      const minRow = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach - this.minZ) / GRID_METERS));
      const maxRow = Math.min(this.depth - 1, Math.ceil((Math.max(a.z, b.z) + reach - this.minZ) / GRID_METERS));
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const i = row * this.width + column;
          const distance = segmentProjection({ x: this.x(i), z: this.z(i) }, a, b).distance;
          if (distance <= surface) {
            if (this.roadAt[i] === 0) this.roadAt[i] = roadIndex + 1;
          } else if (distance >= ROAD_BESIDE_METERS[0] && distance <= reach) {
            this.besideRoad[i] = 1;
          }
        }
      }
    }
  }
}

function slopeFactor(lattice: SurveyLattice, from: number, to: number, mx: number, mz: number, length: number, kind: Kind): number {
  const grades = GRADES[kind];
  const grade = Math.abs(lattice.heightAt(to) - lattice.heightAt(from)) / length;
  const width = lattice.width;
  const edge = (i: number) => i % width === 0 || i % width === width - 1 || i < width || i >= lattice.cells - width;
  let side = 0;
  if (!edge(to)) {
    // Side-slope across the direction of travel sets how deep the bench cuts.
    const gx = (lattice.heightAt(to + 1) - lattice.heightAt(to - 1)) / (2 * GRID_METERS);
    const gz = (lattice.heightAt(to + width) - lattice.heightAt(to - width)) / (2 * GRID_METERS);
    side = Math.abs((gx * -mz + gz * mx) / Math.hypot(mx, mz));
  }
  const comfort = grade / grades.comfortable;
  return 1 + comfort * comfort * 2.5 + Math.max(0, grade - grades.hard) * 90 + (side / 0.3) * (side / 0.3) * 1.4;
}

/** Cost from one place to every lattice cell, without turning cost: how far apart places are. */
function travelCostField(lattice: SurveyLattice, from: MainlandRoadDestination, kind: Kind): Float64Array {
  const cost = new Float64Array(lattice.cells).fill(Infinity);
  const closed = new Uint8Array(lattice.cells);
  const start = lattice.index({ x: from.knot[0], z: from.knot[1] });
  const heap = new MinHeap();
  cost[start] = 0;
  heap.push(start, 0);
  const origin = { x: from.knot[0], z: from.knot[1] };
  while (heap.size > 0) {
    const current = heap.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    const cx = current % lattice.width, cz = Math.floor(current / lattice.width);
    for (const [mx, mz] of MOVES) {
      const nx = cx + mx, nz = cz + mz;
      if (nx < 1 || nz < 1 || nx >= lattice.width - 1 || nz >= lattice.depth - 1) continue;
      const next = nz * lattice.width + nx;
      if (closed[next]) continue;
      const released = Math.hypot(lattice.x(next) - origin.x, lattice.z(next) - origin.z) < ENDPOINT_RELEASE_METERS;
      // Other places release their own ground when this field reaches them.
      const nearPlace = MAINLAND_ROAD_DESTINATIONS.some(place =>
        Math.hypot(lattice.x(next) - place.knot[0], lattice.z(next) - place.knot[1]) < ENDPOINT_RELEASE_METERS);
      if (lattice.blocked(next, kind, released || nearPlace)) continue;
      const length = Math.hypot(mx, mz) * GRID_METERS;
      const candidate = cost[current] + length * slopeFactor(lattice, current, next, mx, mz, length, kind);
      if (candidate < cost[next]) {
        cost[next] = candidate;
        heap.push(next, candidate);
      }
    }
  }
  return cost;
}

interface Link { a: string; b: string; cost: number; kind: Kind; traffic: number; spur: boolean }

/** Tree plus loops between the hubs, then each branch to the nearest hub for traffic. */
function planTopology(lattice: SurveyLattice): Link[] {
  const places = MAINLAND_ROAD_DESTINATIONS;
  const hubs = places.filter(place => place.role === "gateway" || place.role === "village");
  const fields = new Map(places.map(place => [place.id, travelCostField(lattice, place, "arterial")]));
  const costBetween = (a: MainlandRoadDestination, b: MainlandRoadDestination): number =>
    fields.get(a.id)![lattice.index({ x: b.knot[0], z: b.knot[1] })];
  const weight = (place: MainlandRoadDestination) => place.weight ?? MAINLAND_ROAD_ROLE_WEIGHTS[place.role];

  // The two gateways are already joined through the starter district.
  const gateways = hubs.filter(place => place.role === "gateway");
  const links: Link[] = [];
  const parent = new Map(hubs.map(hub => [hub.id, hub.id]));
  const find = (id: string): string => parent.get(id) === id ? id : find(parent.get(id)!);
  for (let i = 1; i < gateways.length; i++) parent.set(find(gateways[i].id), find(gateways[0].id));

  const candidates: Link[] = [];
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      const cost = costBetween(hubs[i], hubs[j]);
      if (Number.isFinite(cost)) candidates.push({ a: hubs[i].id, b: hubs[j].id, cost, kind: "arterial", traffic: 0, spur: false });
    }
  }
  candidates.sort((p, q) => p.cost - q.cost || p.a.localeCompare(q.a) || p.b.localeCompare(q.b));
  for (const candidate of candidates) {
    const ra = find(candidate.a), rb = find(candidate.b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    links.push(candidate);
  }

  // Journeys over the network, including the starter district's own roads between the gateways.
  const gatewayCost = gateways.length > 1
    ? gateways.slice(1).map(gateway => Math.hypot(gateway.knot[0] - gateways[0].knot[0], gateway.knot[1] - gateways[0].knot[1]) * 1.3)
    : [];
  const networkCost = (from: string, to: string, extra: readonly Link[] = []): number => {
    const edges = [...links, ...extra, ...gateways.slice(1).map((gateway, index) =>
      ({ a: gateways[0].id, b: gateway.id, cost: gatewayCost[index] }))];
    const best = new Map<string, number>([[from, 0]]);
    const open = [from];
    while (open.length > 0) {
      open.sort((p, q) => best.get(p)! - best.get(q)!);
      const current = open.shift()!;
      for (const edge of edges) {
        const other = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
        if (!other) continue;
        const candidate = best.get(current)! + edge.cost;
        if (candidate < (best.get(other) ?? Infinity)) {
          best.set(other, candidate);
          if (!open.includes(other)) open.push(other);
        }
      }
    }
    return best.get(to) ?? Infinity;
  };

  // Hub-to-hub traffic along the network sets which links are busiest.
  const pathLinks = (from: string, to: string): Link[] => {
    const best = new Map<string, { cost: number; via: Link | null; previous: string | null }>([[from, { cost: 0, via: null, previous: null }]]);
    const open = [from];
    while (open.length > 0) {
      open.sort((p, q) => best.get(p)!.cost - best.get(q)!.cost);
      const current = open.shift()!;
      for (const link of links) {
        const other = link.a === current ? link.b : link.b === current ? link.a : null;
        if (!other) continue;
        const candidate = best.get(current)!.cost + link.cost;
        if (candidate < (best.get(other)?.cost ?? Infinity)) {
          best.set(other, { cost: candidate, via: link, previous: current });
          if (!open.includes(other)) open.push(other);
        }
      }
      for (let g = 1; g < gateways.length; g++) {
        const other = current === gateways[0].id ? gateways[g].id : current === gateways[g].id ? gateways[0].id : null;
        if (!other) continue;
        const candidate = best.get(current)!.cost + gatewayCost[g - 1];
        if (candidate < (best.get(other)?.cost ?? Infinity)) {
          best.set(other, { cost: candidate, via: null, previous: current });
          if (!open.includes(other)) open.push(other);
        }
      }
    }
    const result: Link[] = [];
    for (let node: string | null = to; node && node !== from;) {
      const step = best.get(node);
      if (!step) break;
      if (step.via) result.push(step.via);
      node = step.previous;
    }
    return result;
  };
  // A branch's traffic enters the network at the hub it is cheapest to reach.
  const entries = new Map(places.map(place => [place.id, hubs.includes(place) ? place
    : hubs.reduce((best, hub) => costBetween(place, hub) < costBetween(place, best) ? hub : best)]));
  const assignTraffic = (): void => {
    for (const link of links) link.traffic = 0;
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const from = places[i], to = places[j];
        const demand = weight(from) * weight(to);
        for (const link of pathLinks(entries.get(from.id)!.id, entries.get(to.id)!.id)) link.traffic += demand;
      }
    }
  };
  assignTraffic();

  // Loops where the tree forces a long way round and enough traffic would use a direct road.
  for (;;) {
    const busiest = Math.max(...links.map(link => link.traffic));
    let chosen: Link | null = null;
    let chosenBenefit = 0;
    for (const candidate of candidates) {
      if (links.includes(candidate)) continue;
      const detour = networkCost(candidate.a, candidate.b) / candidate.cost;
      if (detour < LOOP_DETOUR_RATIO) continue;
      links.push(candidate);
      assignTraffic();
      const traffic = candidate.traffic;
      links.pop();
      if (traffic < busiest * LOOP_TRAFFIC_SHARE) continue;
      const benefit = traffic * (detour - 1);
      if (benefit > chosenBenefit) { chosen = candidate; chosenBenefit = benefit; }
    }
    assignTraffic();
    if (!chosen) break;
    links.push(chosen);
    assignTraffic();
  }

  const busiest = Math.max(...links.map(link => link.traffic));
  for (const link of links) link.kind = link.traffic >= busiest * ARTERIAL_TRAFFIC_SHARE ? "arterial" : "lane";
  links.sort((p, q) => (p.kind === q.kind ? 0 : p.kind === "arterial" ? -1 : 1) || q.traffic - p.traffic || p.cost - q.cost);

  // Branches: a work site's track carries carts; a fishing bank's is a footpath.
  const branches = places
    .filter(place => place.role === "work" || place.role === "fishing")
    .map((place): Link => ({
      a: place.id, b: "", cost: 0, kind: place.role === "work" ? "lane" : "trail",
      traffic: weight(place), spur: true
    }))
    .sort((p, q) => (p.kind === q.kind ? 0 : p.kind === "lane" ? -1 : 1) || p.a.localeCompare(q.a));
  return [...links, ...branches];
}

interface Road { id: string; kind: Kind; knots: MainlandRoadKnot[]; fixed: boolean }

/** A* with the arriving heading in the state, toward a place or onto any road. */
function survey(lattice: SurveyLattice, from: Point, to: Point | null, kind: Kind, ends: readonly Point[]): number[] {
  const states = lattice.cells * (HEADINGS + 1);
  const cost = new Float64Array(states).fill(Infinity);
  const parent = new Int32Array(states).fill(-1);
  const closed = new Uint8Array(states);
  const start = lattice.index(from);
  const goal = to ? lattice.index(to) : -1;
  const goalX = to?.x ?? 0, goalZ = to?.z ?? 0;
  const released = (i: number) => ends.some(end =>
    Math.hypot(lattice.x(i) - end.x, lattice.z(i) - end.z) < ENDPOINT_RELEASE_METERS);
  const turnCost = TURN_COST_METERS[kind];
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
    if (current === goal || (goal < 0 && current !== start && lattice.roadAt[current] > 0)) { goalState = state; break; }
    const cx = current % lattice.width, cz = Math.floor(current / lattice.width);
    for (let move = 0; move < HEADINGS; move++) {
      const [mx, mz] = MOVES[move];
      let turn = 0;
      if (heading < HEADINGS) {
        const [px, pz] = MOVES[heading];
        const cosine = (px * mx + pz * mz) / (Math.hypot(px, pz) * Math.hypot(mx, mz));
        if (cosine < MAX_TURN_COSINE) continue;
        turn = (1 - cosine) * turnCost;
      }
      const nx = cx + mx, nz = cz + mz;
      if (nx < 1 || nz < 1 || nx >= lattice.width - 1 || nz >= lattice.depth - 1) continue;
      const next = nz * lattice.width + nx;
      const x = lattice.x(next), z = lattice.z(next);
      const nextState = next * (HEADINGS + 1) + move;
      if (closed[nextState]) continue;
      const nextReleased = released(next);
      if (lattice.blocked(next, kind, nextReleased)) continue;
      // A knight move also crosses the cell between; it must be passable too.
      if (Math.abs(mx) + Math.abs(mz) === 3) {
        const between = (cz + Math.trunc(mz / 2)) * lattice.width + cx + Math.trunc(mx / 2);
        if (lattice.blocked(between, kind, released(between))) continue;
      }
      const length = Math.hypot(mx, mz) * GRID_METERS;
      let factor = slopeFactor(lattice, current, next, mx, mz, length, kind);
      const onRoad = lattice.roadAt[current] > 0 && lattice.roadAt[next] > 0;
      if (onRoad) factor *= ROAD_FOLLOW_FACTOR;
      else if (lattice.besideRoad[next] && !nextReleased) factor += ROAD_BESIDE_COST;
      const candidate = cost[state] + length * factor + turn;
      if (candidate >= cost[nextState]) continue;
      cost[nextState] = candidate;
      parent[nextState] = state;
      const heuristic = to ? Math.hypot(x - goalX, z - goalZ) * ROAD_FOLLOW_FACTOR : 0;
      heap.push(nextState, candidate + heuristic);
    }
  }
  if (goalState < 0) throw new Error(`No dry road from ${JSON.stringify(from)} to ${to ? JSON.stringify(to) : "the network"}`);
  const path: number[] = [];
  for (let state = goalState; state >= 0; state = parent[state]) path.push(Math.floor(state / (HEADINGS + 1)));
  return path.reverse();
}

/**
 * The fewest knots whose smoothed centre line still keeps the class's verge
 * clear of every building and work site: a simplification that cut a corner
 * past a market stall is retried with a tighter tolerance.
 */
function simplifyClear(path: readonly Point[], kind: Kind, ends: readonly Point[]): Point[] {
  const verge = ROAD_CLASS_PROFILES[kind].widthMeters * 0.5 + BUILDING_VERGE_METERS * 0.5;
  let knots: Point[] = [...path];
  for (const tolerance of [SIMPLIFY_TOLERANCE_METERS, 2.5, 1.2, 0]) {
    knots = simplify(path, tolerance);
    const line = smoothMainlandCenterline([...ends.slice(0, 1), ...knots, ...ends.slice(1)]);
    // The place a link ends at (a market square, a work site's front) is its own business.
    const clear = line.every(point => ends.some(end => Math.hypot(point.x - end.x, point.z - end.z) < 4)
      || Math.min(buildingDistance(point.x, point.z), mainlandWorkSiteClearanceAt(point.x, point.z)) >= verge);
    if (clear) break;
  }
  return knots;
}

/** Douglas-Peucker, then no knot gap longer than the spline can bend through. */
function simplify(path: readonly Point[], tolerance: number = SIMPLIFY_TOLERANCE_METERS): Point[] {
  if (path.length <= 2) return [...path];
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let worst = -1, worstDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const distance = segmentProjection(path[i], path[first], path[last]).distance;
      if (distance > worstDistance) { worst = i; worstDistance = distance; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  const result: Point[] = [path[0]];
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
    result.push(path[i]);
    previous = i;
  }
  return result;
}

const round = (value: number): number => Math.round(value * 10) / 10;
const knotPoint = (knot: MainlandRoadKnot): Point => ({ x: knot[0], z: knot[1] });
const sameKnot = (a: MainlandRoadKnot, b: MainlandRoadKnot) => a[0] === b[0] && a[1] === b[1];

/** The centre line a road's knots make, as `NevaMainland` smooths it. */
function roadLine(road: Road): Point[] {
  return smoothMainlandCenterline(road.knots.map(knotPoint));
}

/** Nearest point of a road's centre line, with the knot segment it falls in. */
function projectOntoRoad(road: Road, p: Point): { point: Point; distance: number; segment: number; tangent: Point } {
  const line = roadLine(road);
  let best = { point: line[0], distance: Infinity, index: 0 };
  for (let k = 1; k < line.length; k++) {
    const projection = segmentProjection(p, line[k - 1], line[k]);
    if (projection.distance < best.distance) best = { point: projection.point, distance: projection.distance, index: k };
  }
  const a = line[best.index - 1], b = line[best.index];
  const length = Math.max(1e-6, Math.hypot(b.x - a.x, b.z - a.z));
  // The knot segment is the one whose control span contains the projection.
  let segment = 0, nearest = Infinity;
  for (let k = 1; k < road.knots.length; k++) {
    const distance = segmentProjection(best.point, knotPoint(road.knots[k - 1]), knotPoint(road.knots[k])).distance;
    if (distance < nearest) { nearest = distance; segment = k; }
  }
  return { point: best.point, distance: best.distance, segment, tangent: { x: (b.x - a.x) / length, z: (b.z - a.z) / length } };
}

/** Unit directions of a road's arms leaving a knot, measured six metres out, where the square ends. */
function armsAt(road: Road, node: Point): Point[] {
  const line = roadLine(road);
  const index = line.findIndex(point => Math.hypot(point.x - node.x, point.z - node.z) < 0.01);
  if (index < 0) return [];
  const arms: Point[] = [];
  for (const step of [-1, 1]) {
    let k = index + step;
    while (k >= 0 && k < line.length && Math.hypot(line[k].x - node.x, line[k].z - node.z) < 6) k += step;
    if (k < 0 || k >= line.length) continue;
    const length = Math.hypot(line[k].x - node.x, line[k].z - node.z);
    arms.push({ x: (line[k].x - node.x) / length, z: (line[k].z - node.z) / length });
  }
  return arms;
}

/** Adds a junction knot to a road, keeping retained datums continuous. */
function insertJunction(road: Road, point: Point): MainlandRoadKnot {
  const x = round(point.x), z = round(point.z);
  for (const existing of road.knots) {
    if (Math.hypot(existing[0] - x, existing[1] - z) < 2.5) return existing;
  }
  const { segment } = projectOntoRoad(road, point);
  const before = road.knots[segment - 1], after = road.knots[segment];
  let knot: MainlandRoadKnot = [x, z];
  if (before[2] !== undefined && after[2] !== undefined) {
    const t = segmentProjection(point, knotPoint(before), knotPoint(after)).t;
    knot = [x, z, round(before[2] + (after[2] - before[2]) * t)];
  }
  road.knots.splice(segment, 0, knot);
  return knot;
}

/** Plans the whole mainland network: pinned lanes and gateways first, then every link. */
export function planMainlandRoadNetwork(): PlannedRoad[] {
  const lattice = new SurveyLattice();
  const roads: Road[] = [];
  const place = (id: string) => MAINLAND_ROAD_DESTINATIONS.find(candidate => candidate.id === id)!;
  const addRoad = (road: Road): void => {
    roads.push(road);
    lattice.paint(roadLine(road), roads.length - 1, road.kind);
  };
  // Retained connectors into the starter district and the landing lanes are pinned.
  for (const gateway of MAINLAND_ROAD_DESTINATIONS) {
    if (!gateway.approach) continue;
    addRoad({ id: `mainland-${gateway.id}-gateway`, kind: "arterial", knots: [...gateway.approach, gateway.knot], fixed: true });
  }
  for (const lane of MAINLAND_LANDING_LANES) addRoad({ id: lane.id, kind: lane.kind, knots: [...lane.knots], fixed: true });

  const links = planTopology(lattice);
  lastPlannedLinks = links.map(({ a, b, kind, traffic, cost }) => ({ a, b, kind, traffic, cost }));
  for (const link of links) {
    const from = place(link.a);
    const origin = knotPoint(from.knot);
    const target = link.spur ? null : place(link.b);
    const ends = target ? [origin, knotPoint(target.knot)] : [origin];
    const path = survey(lattice, origin, target ? knotPoint(target.knot) : null, link.kind, ends)
      .map(i => ({ x: lattice.x(i), z: lattice.z(i), road: lattice.roadAt[i] - 1 }));
    path[0] = { ...origin, road: path[0].road };
    if (target) path[path.length - 1] = { ...knotPoint(target.knot), road: path[path.length - 1].road };

    // Split the survey where it rides earlier roads; each stretch on new ground is a road.
    const nodeAt = (p: Point) => MAINLAND_ROAD_DESTINATIONS.find(candidate =>
      Math.hypot(candidate.knot[0] - p.x, candidate.knot[1] - p.z) < 0.01);
    const runs: { start: number; end: number }[] = [];
    let runStart = -1;
    for (let k = 0; k < path.length; k++) {
      const riding = path[k].road >= 0 && !(k === 0 || (target && k === path.length - 1));
      if (!riding && runStart < 0) runStart = k;
      if (riding && runStart >= 0) { runs.push({ start: runStart, end: k }); runStart = -1; }
    }
    if (runStart >= 0) runs.push({ start: runStart, end: path.length - 1 });

    let piece = 0;
    for (const run of runs) {
      // A few cells off a road beside a place or a trunk are not a road of their own.
      let surveyed = 0;
      for (let k = run.start + 1; k <= run.end; k++) surveyed += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
      if (surveyed < MIN_ROAD_METERS) continue;
      // Ends of a run are either a place or the road it leaves or joins.
      const endKnots: [MainlandRoadKnot | null, MainlandRoadKnot | null] = [null, null];
      const pointsOfRun = path.slice(run.start, run.end + 1).map(({ x, z }) => ({ x, z }));
      let body = pointsOfRun;
      for (const side of [0, 1] as const) {
        const boundary = side === 0 ? run.start : run.end;
        const endPoint = path[boundary];
        const node = nodeAt(endPoint);
        const trunkIndex = side === 0 ? path[Math.max(0, run.start - 1)].road : path[Math.min(path.length - 1, run.end)].road;
        if (node && (side === 0 ? run.start === 0 : run.end === path.length - 1)) {
          // A road that would leave a place alongside one already there shares
          // that arm and forks from it once clear, instead of fanning out beside it.
          const nodePoint = knotPoint(node.knot);
          const ordered = side === 0 ? body : [...body].reverse();
          const ahead = ordered.find(p => Math.hypot(p.x - nodePoint.x, p.z - nodePoint.z) >= 6);
          const alongside = ahead && roads.find(road => road.knots.some(knot => sameKnot(knot, node.knot))
            && armsAt(road, nodePoint).some(arm => {
              const length = Math.hypot(ahead.x - nodePoint.x, ahead.z - nodePoint.z);
              return ((ahead.x - nodePoint.x) * arm.x + (ahead.z - nodePoint.z) * arm.z) / length
                > Math.cos(MIN_ARM_DEGREES * Math.PI / 180);
            }));
          const clear = alongside ? ordered.findIndex(p => Math.hypot(p.x - nodePoint.x, p.z - nodePoint.z) > 4
            && projectOntoRoad(alongside, p).distance >= JUNCTION_CLEAR_METERS) : -1;
          if (!alongside || clear < 0) {
            endKnots[side] = node.knot;
            continue;
          }
          const projection = projectOntoRoad(alongside, ordered[clear]);
          const back = Math.hypot(nodePoint.x - projection.point.x, nodePoint.z - projection.point.z);
          const lean = Math.min(JUNCTION_LEAN_METERS, back * 0.5) / Math.max(back, 1e-6);
          const junction = projectOntoRoad(alongside, {
            x: projection.point.x + (nodePoint.x - projection.point.x) * lean,
            z: projection.point.z + (nodePoint.z - projection.point.z) * lean
          }).point;
          endKnots[side] = insertJunction(alongside, junction);
          const trimmed = ordered.slice(clear);
          body = side === 0 ? trimmed : trimmed.reverse();
          continue;
        }
        if (trunkIndex < 0) continue;
        const trunk = roads[trunkIndex];
        // Walk into the run until it clears the trunk, then lean the junction back along the trunk.
        const ordered = side === 0 ? body : [...body].reverse();
        let clear = ordered.findIndex(p => projectOntoRoad(trunk, p).distance >= JUNCTION_CLEAR_METERS);
        if (clear < 0) clear = ordered.length - 1;
        const clearPoint = ordered[clear];
        const projection = projectOntoRoad(trunk, clearPoint);
        // Travel along the trunk before leaving it (or after joining it) sets the lean.
        const rideFrom = side === 0 ? Math.max(0, run.start - 4) : Math.min(path.length - 1, run.end + 4);
        const ride = { x: path[side === 0 ? run.start : run.end].x - path[rideFrom].x, z: path[side === 0 ? run.start : run.end].z - path[rideFrom].z };
        const rideLength = Math.hypot(ride.x, ride.z);
        let lean = 0;
        if (rideLength > 8) {
          const along = (ride.x * projection.tangent.x + ride.z * projection.tangent.z) / rideLength;
          lean = Math.sign(along) * (side === 0 ? -1 : 1) * JUNCTION_LEAN_METERS;
        }
        let junction = projectOntoRoad(trunk, {
          x: projection.point.x + projection.tangent.x * lean,
          z: projection.point.z + projection.tangent.z * lean
        }).point;
        // A fork stands clear of a place's square, out along the trunk.
        for (const knot of trunk.knots) {
          if (!nodeAt(knotPoint(knot))) continue;
          const away = Math.hypot(junction.x - knot[0], junction.z - knot[1]);
          if (away >= PLACE_FORK_METERS) continue;
          const line = roadLine(trunk);
          const at = line.findIndex(point => point.x === knot[0] && point.z === knot[1]);
          const nearest = line.reduce((best, point, index) =>
            Math.hypot(point.x - junction.x, point.z - junction.z) < Math.hypot(line[best].x - junction.x, line[best].z - junction.z) ? index : best, 0);
          const step = nearest >= at ? 1 : -1;
          let k = at;
          while (k + step >= 0 && k + step < line.length && Math.hypot(line[k].x - knot[0], line[k].z - knot[1]) < PLACE_FORK_METERS) k += step;
          junction = line[k];
        }
        // A nearby junction on the same trunk is reused, so a crossing is one junction.
        const existing = trunk.knots.find(knot =>
          Math.hypot(knot[0] - junction.x, knot[1] - junction.z) < JUNCTION_MERGE_METERS
          && !nodeAt(knotPoint(knot))
          && roads.some(other => other !== trunk && other.knots.some(k => sameKnot(k, knot))));
        endKnots[side] = existing ?? insertJunction(trunk, junction);
        const trimmed = ordered.slice(clear);
        body = side === 0 ? trimmed : trimmed.reverse();
      }
      if (!endKnots[0] || !endKnots[1]) continue;
      const inner = simplifyClear(body, link.kind, [knotPoint(endKnots[0]), knotPoint(endKnots[1])])
        .map(p => [round(p.x), round(p.z)] as MainlandRoadKnot);
      const knots: MainlandRoadKnot[] = [];
      if (endKnots[0]) knots.push(endKnots[0]);
      for (const knot of inner) {
        if (knots.some(existing => Math.hypot(existing[0] - knot[0], existing[1] - knot[1]) < 3)) continue;
        if (endKnots[1] && Math.hypot(endKnots[1][0] - knot[0], endKnots[1][1] - knot[1]) < 3) continue;
        knots.push(knot);
      }
      if (endKnots[1]) knots.push(endKnots[1]);
      if (knots.length < 2) continue;
      const length = knots.slice(1).reduce((total, knot, k) => total + Math.hypot(knot[0] - knots[k][0], knot[1] - knots[k][1]), 0);
      if (length < 10) continue;
      piece++;
      const id = `mainland-${link.a}-${link.spur ? "road" : link.b}${piece > 1 ? `-${piece}` : ""}`;
      addRoad({ id, kind: link.kind, knots, fixed: false });
    }
  }
  return mergeContinuations(roads);
}

/** Joins a gateway's retained connector to the road that carries on from it. */
function mergeContinuations(roads: Road[]): PlannedRoad[] {
  const result = roads.map(road => ({ ...road, knots: [...road.knots] }));
  for (const gateway of MAINLAND_ROAD_DESTINATIONS) {
    if (!gateway.approach) continue;
    const connector = result.find(road => road.id === `mainland-${gateway.id}-gateway`);
    if (!connector) continue;
    const onward = result.filter(road => road !== connector
      && (sameKnot(road.knots[0], gateway.knot) || sameKnot(road.knots[road.knots.length - 1], gateway.knot)));
    if (onward.length !== 1 || onward[0].kind !== connector.kind) continue;
    const next = onward[0];
    const knots = sameKnot(next.knots[0], gateway.knot) ? next.knots : [...next.knots].reverse();
    connector.knots.push(...knots.slice(1));
    connector.id = next.id;
    result.splice(result.indexOf(next), 1);
  }
  return result.map(({ id, kind, knots }) => ({ id, kind, knots }));
}

/** Hash of the destinations, lanes and the route ground over the mainland. */
export function mainlandRoadNetworkFingerprint(): string {
  let hash = 0x811c9dc5;
  const mix = (value: number | string): void => {
    const text = typeof value === "number" ? value.toFixed(3) : value;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const place of MAINLAND_ROAD_DESTINATIONS) {
    mix(place.id); mix(place.role); mix(place.weight ?? MAINLAND_ROAD_ROLE_WEIGHTS[place.role]);
    for (const knot of [...(place.approach ?? []), place.knot]) { mix(knot[0]); mix(knot[1]); mix(knot[2] ?? -77777); }
  }
  for (const lane of MAINLAND_LANDING_LANES) {
    mix(lane.id); mix(lane.kind);
    for (const knot of lane.knots) { mix(knot[0]); mix(knot[1]); mix(knot[2] ?? -77777); }
  }
  for (const kind of Object.keys(ROAD_CLASS_PROFILES) as Kind[]) mix(ROAD_CLASS_PROFILES[kind].widthMeters);
  for (let x = MAINLAND_BOUNDS.minX; x <= MAINLAND_BOUNDS.maxX; x += 36) {
    for (let z = MAINLAND_BOUNDS.minZ; z <= MAINLAND_BOUNDS.maxZ; z += 36) mix(mainlandRouteGroundAt(x, z));
  }
  return hash.toString(16).padStart(8, "0");
}

export const MAINLAND_ROAD_NETWORK_GENERATED_PATH = fileURLToPath(new URL("../../src/world/MainlandRoadNetwork.generated.ts", import.meta.url));

/** Source text of the generated network module. */
export function renderMainlandRoadNetwork(roads: readonly PlannedRoad[], fingerprint: string): string {
  const lines = [
    "// Generated by tools/world/mainlandRoadNetwork.ts (npm run world:plan-roads). Do not edit.",
    "// Every mainland road in survey order: trunks before the roads that branch from them.",
    "// A knot shared by two roads is a junction; a third number is a retained datum.",
    "",
    `export const MAINLAND_ROAD_NETWORK_FINGERPRINT = "${fingerprint}";`,
    "",
    "export const MAINLAND_ROAD_NETWORK: readonly {",
    "  readonly id: string;",
    "  readonly kind: \"arterial\" | \"lane\" | \"trail\";",
    "  readonly knots: readonly (readonly [number, number] | readonly [number, number, number])[];",
    "}[] = ["
  ];
  roads.forEach((road, index) => {
    const knots = road.knots.map(knot => knot[2] === undefined ? `[${knot[0]}, ${knot[1]}]` : `[${knot[0]}, ${knot[1]}, ${knot[2]}]`);
    const rows: string[] = [];
    for (let i = 0; i < knots.length; i += 8) rows.push(knots.slice(i, i + 8).join(", "));
    lines.push(`  { id: "${road.id}", kind: "${road.kind}", knots: [${rows.join(",\n      ")}] }${index < roads.length - 1 ? "," : ""}`);
  });
  lines.push("];", "");
  return lines.join("\n");
}

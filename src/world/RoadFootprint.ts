import polygonClipping, { type MultiPolygon, type Pair, type Polygon } from "polygon-clipping";
import { roadTransverseStations } from "./RoadProfile";
import type { CompiledWorldRoute, WorldPoint, WorldRouteJunction, WorldRouteKind, WorldRouteProfile } from "./WorldLayout";

export type RoadPolygon = Polygon;
export type RoadPolygons = MultiPolygon;
export type RoadPlanPoint = Pair;

export interface RoadFootprintBridge {
  center: WorldPoint;
  halfSpan: number;
  deckWidth: number;
  gatewayDepthMeters?: number;
  gatewayInsetMeters?: number;
  gatewaySlabCount?: number;
  gatewaySlabGapMeters?: number;
}

export interface RoadGatewayPlan { polygon: RoadPolygon; sideIndex: number; slabIndex: number; colorToken: "stone_warm_01" | "stone_golden_01" }

/** One plan owns the preserved bridge slabs and their exact subtraction from soil. */
export function roadGatewayPlan(bridge: RoadFootprintBridge): readonly RoadGatewayPlan[] {
  if (bridge.gatewayDepthMeters === undefined || bridge.gatewaySlabCount === undefined || bridge.gatewayInsetMeters === undefined || bridge.gatewaySlabGapMeters === undefined) return [];
  const count = Math.max(2, Math.floor(bridge.gatewaySlabCount));
  const width = (bridge.deckWidth - bridge.gatewaySlabGapMeters * (count - 1)) / count;
  const plans: RoadGatewayPlan[] = [];
  for (const [sideIndex, side] of [-1, 1].entries()) for (let slabIndex = 0; slabIndex < count; slabIndex++) {
    const edgeX = bridge.center.x + side * bridge.halfSpan;
    const zStart = -bridge.deckWidth / 2 + slabIndex * (width + bridge.gatewaySlabGapMeters), zEnd = zStart + width;
    const irregular = Math.sin((slabIndex + 1) * 2.7 + sideIndex * 1.9);
    const nearX = edgeX + side * bridge.gatewayInsetMeters, farX = edgeX + side * bridge.gatewayDepthMeters;
    const nearZStart = bridge.center.z + zStart + 0.035 + irregular * 0.025, nearZEnd = bridge.center.z + zEnd - 0.035 + irregular * 0.018;
    const ring: Pair[] = [[nearX, nearZStart], [nearX, nearZEnd], [farX, nearZEnd + Math.cos(slabIndex * 1.1 + sideIndex) * 0.028], [farX, nearZStart + Math.sin(slabIndex * 1.4 + sideIndex) * 0.035]].map(([x, z]): Pair => [Math.fround(x), Math.fround(z)]);
    ring.push(ring[0]); plans.push({ polygon: [ring], sideIndex, slabIndex, colorToken: (slabIndex + sideIndex) % 2 === 0 ? "stone_warm_01" : "stone_golden_01" });
  }
  return plans;
}

export interface RoadFootprintOptions {
  routes: readonly CompiledWorldRoute[];
  junctions: readonly WorldRouteJunction[];
  profiles: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>>;
  bridge?: RoadFootprintBridge;
}

export interface RoadFootprintSample {
  /** Signed boundary distances are positive inside their nested footprint. */
  packedSignedDistance: number;
  shoulderSignedDistance: number;
  coverageSignedDistance: number;
  packed: number;
  shoulder: number;
  coverage: number;
  junctionTraffic: number;
  routeIndex: number | null;
  classCode: number;
  frameAcross: number;
  frameAlong: number;
  tangent: Readonly<WorldPoint>;
}

const CELL_METERS = 8;
const DISTANCE_REACH_METERS = 8;
const JUNCTION_TRACK_FADE_METERS = 3.5;
const EPSILON = 1e-9;
const KIND_RANK: Readonly<Record<WorldRouteKind, number>> = { arterial: 0, lane: 1, trail: 2 };
type Edge = readonly [Pair, Pair];

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function distanceSquared(x: number, z: number, edge: Edge): number {
  const [a, b] = edge;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(EPSILON, dx * dx + dz * dz)));
  return (x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2;
}

export function routeStationOffset(routeId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < routeId.length; index++) { hash ^= routeId.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return Math.round(((hash >>> 0) / 0xffffffff) * 1000);
}

function canonicalPolygons(polygons: MultiPolygon): MultiPolygon {
  const rings = polygons.map(polygon => polygon.map(ring => {
    const open = ring.slice(0, -1);
    if (!open.length) return [];
    let first = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i][0] < open[first][0] || (open[i][0] === open[first][0] && open[i][1] < open[first][1])) first = i;
    }
    const ordered = [...open.slice(first), ...open.slice(0, first)].map(([x, z]): Pair => [x, z]);
    ordered.push([...ordered[0]]);
    return ordered;
  }));
  return rings.sort((a, b) => a[0][0][0] - b[0][0][0] || a[0][0][1] - b[0][0][1]);
}

function union(polygons: readonly MultiPolygon[]): MultiPolygon {
  const nonempty = polygons.filter(value => value.length);
  return nonempty.length ? canonicalPolygons(polygonClipping.union(...nonempty as [MultiPolygon, ...MultiPolygon[]])) : [];
}

function intersect(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  return a.length && b.length ? canonicalPolygons(polygonClipping.intersection(a, b)) : [];
}

function difference(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  return a.length && b.length ? canonicalPolygons(polygonClipping.difference(a, b)) : a;
}

function circle(center: WorldPoint, radius: number, segments = 12): MultiPolygon {
  const ring: Pair[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
    // Exact cardinal contacts avoid 1e-16 slivers at a disk/ribbon tangent.
    ring.push([Math.fround(center.x + (Math.abs(dx) < 1e-10 ? 0 : dx)), Math.fround(center.z + (Math.abs(dz) < 1e-10 ? 0 : dz))]);
  }
  ring.push([...ring[0]]);
  return [[ring]];
}

/** The same bounded offset join is used by the polygons and the source ribbon. */
export function roadOffsetJoin(route: CompiledWorldRoute, sampleIndex: number): { normal: WorldPoint; miterScale: number } {
  const sample = route.samples[sampleIndex];
  const previous = route.samples[Math.max(0, sampleIndex - 1)]?.tangent ?? sample.tangent;
  const next = route.samples[Math.min(route.samples.length - 1, sampleIndex + 1)]?.tangent ?? sample.tangent;
  const x = -previous.z - next.z, z = previous.x + next.x;
  const length = Math.hypot(x, z);
  const normal = length > 0.0001 ? { x: x / length, z: z / length } : { x: -next.z, z: next.x };
  const denominator = Math.abs(normal.x * -next.z + normal.z * next.x);
  return { normal, miterScale: Math.min(1.28, Math.max(0.86, 1 / Math.max(0.72, denominator))) };
}

export function roadHalfWidths(route: CompiledWorldRoute): readonly [number, number, number] {
  const packed = route.halfWidth;
  const shoulder = packed + route.shoulderWidthMeters;
  return [packed, shoulder, shoulder + route.terrainFeatherMeters * 0.78];
}

function foldedSection(left: Pair, right: Pair, nextLeft: Pair, nextRight: Pair): boolean {
  const ring = [left, right, nextRight, nextLeft];
  const turns = ring.map((a, i) => {
    const b = ring[(i + 1) % 4], c = ring[(i + 2) % 4];
    return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  });
  return !(turns.every(value => value > EPSILON) || turns.every(value => value < -EPSILON));
}

function routeSpans(route: CompiledWorldRoute, halfWidth: number, stations: readonly number[]): MultiPolygon[] {
  const sections = route.samples.map((sample, index) => {
    const join = roadOffsetJoin(route, index);
    const dx = join.normal.x * halfWidth * join.miterScale;
    const dz = join.normal.z * halfWidth * join.miterScale;
    return [[Math.fround(sample.point.x - dx), Math.fround(sample.point.z - dz)], [Math.fround(sample.point.x + dx), Math.fround(sample.point.z + dz)]] as [Pair, Pair];
  });
  const pieces: MultiPolygon[] = [];
  for (let i = 1; i < sections.length; i++) {
    const [left, right] = sections[i - 1], [nextLeft, nextRight] = sections[i];
    if (!foldedSection(left, right, nextLeft, nextRight)) {
      pieces.push([[[left, right, nextRight, nextLeft, left]]]);
      continue;
    }
    // A folded full-width diagonal can claim ground that none of the actual
    // transverse cells covers. That false claim would cut a hole in later
    // spans and neighbouring roads. Compile only the same cells we emit.
    const localStations = stations.filter(across => Math.abs(across) <= halfWidth + EPSILON);
    const rings = [i - 1, i].map(index => {
      const sample = route.samples[index], join = roadOffsetJoin(route, index);
      return localStations.map((across): Pair => [
        Math.fround(sample.point.x + join.normal.x * across * join.miterScale),
        Math.fround(sample.point.z + join.normal.z * across * join.miterScale)
      ]);
    });
    const cells: MultiPolygon[] = [];
    for (let column = 1; column < localStations.length; column++) {
      const a = rings[0][column - 1], b = rings[0][column], c = rings[1][column], d = rings[1][column - 1];
      for (const triangle of [[a, b, c], [a, c, d]]) {
        const [p, q, r] = triangle;
        const area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        if (Math.abs(area) > 1e-10) cells.push([[[...triangle, triangle[0]]]]);
      }
    }
    pieces.push(union(cells));
  }
  return pieces;
}

function routeCorridor(route: CompiledWorldRoute, halfWidth: number, stations: readonly number[]): MultiPolygon {
  const pieces = routeSpans(route, halfWidth, stations);
  // Full endpoint disks union into the ribbon; their exposed halves are caps.
  const start = route.samples[0].point, end = route.samples.at(-1)!.point;
  if (Math.hypot(start.x - end.x, start.z - end.z) > EPSILON) for (const index of [0, route.samples.length - 1]) pieces.push(circle(route.samples[index].point, halfWidth, 16));
  return union(pieces);
}

/** Only shared authored knots establish a new junction; proximity never invents a connection. */
export function deriveRoadJunctions(options: RoadFootprintOptions): readonly WorldRouteJunction[] {
  const nodes = new Map<string, { center: WorldPoint; routes: Set<string>; junctions: WorldRouteJunction[] }>();
  const keyAt = (point: WorldPoint): string => `${point.x}:${point.z}`;
  for (const junction of options.junctions) {
    const key = keyAt(junction.center);
    const node = nodes.get(key) ?? { center: junction.center, routes: new Set<string>(), junctions: [] };
    junction.routeIds.forEach(id => node.routes.add(id));
    node.junctions.push(junction);
    nodes.set(key, node);
  }
  for (const route of options.routes) {
    for (const point of route.route.points) {
      const key = keyAt(point);
      const node = nodes.get(key) ?? { center: point, routes: new Set<string>(), junctions: [] };
      node.routes.add(route.route.id);
      nodes.set(key, node);
    }
  }
  // A declared endpoint can land on the middle of another route's linear
  // span (Sunreach's terrace walks). It is an exact contact, not a proximity join.
  const endpointKeys = new Set(options.routes.flatMap(({ route }) => [keyAt(route.points[0]), keyAt(route.points[route.points.length - 1])]));
  const segmentNodes = new Map<string, Array<{ routeId: string; segment: CompiledWorldRoute["segments"][number] }>>();
  for (const route of options.routes) for (const segment of route.segments) {
    const reference = { routeId: route.route.id, segment };
    for (let x = Math.floor(segment.minX / CELL_METERS); x <= Math.floor(segment.maxX / CELL_METERS); x++) for (let z = Math.floor(segment.minZ / CELL_METERS); z <= Math.floor(segment.maxZ / CELL_METERS); z++) {
      const key = `${x}:${z}`, values = segmentNodes.get(key) ?? []; values.push(reference); segmentNodes.set(key, values);
    }
  }
  for (const node of nodes.values()) {
    if (!node.junctions.length && !endpointKeys.has(keyAt(node.center))) continue;
    for (const { routeId, segment } of segmentNodes.get(`${Math.floor(node.center.x / CELL_METERS)}:${Math.floor(node.center.z / CELL_METERS)}`) ?? []) {
      if (node.routes.has(routeId)) continue;
      const t = ((node.center.x - segment.start.x) * segment.dx + (node.center.z - segment.start.z) * segment.dz) / segment.lengthSquared;
      if (t < 0 || t > 1) continue;
      if (Math.hypot(node.center.x - segment.start.x - segment.dx * t, node.center.z - segment.start.z - segment.dz * t) < 1e-7) node.routes.add(routeId);
    }
  }
  const routeById = new Map(options.routes.map(route => [route.route.id, route]));
  return [...nodes.entries()].flatMap(([key, node]): WorldRouteJunction[] => {
    if (node.junctions.length) {
      const owners = [...node.junctions].sort((a, b) => b.radiusMeters - a.radiusMeters || a.id.localeCompare(b.id));
      return [{ ...owners[0], routeIds: [...node.routes].sort(), radiusMeters: Math.max(...owners.map(j => j.radiusMeters)), blendLengthMeters: Math.max(...owners.map(j => j.blendLengthMeters)) }];
    }
    if (node.routes.size < 2) return [];
    const widest = Math.max(...[...node.routes].map(id => routeById.get(id)!.halfWidth));
    return [{ id: `road-knot:${key}`, center: node.center, radiusMeters: Math.max(1, widest + 0.4), blendLengthMeters: 0.7, surface: "field", routeIds: [...node.routes].sort() }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Static polygon boundaries indexed once, shared by surface queries and clipping. */
export class RoadFootprintRegion {
  public readonly polygons: MultiPolygon;
  private readonly rows = new Map<number, Edge[]>();
  private readonly cells = new Map<string, Edge[]>();
  public constructor(polygons: MultiPolygon) {
    this.polygons = polygons;
    for (const polygon of polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      const edge: Edge = [ring[i - 1], ring[i]];
      const minX = Math.min(edge[0][0], edge[1][0]), maxX = Math.max(edge[0][0], edge[1][0]);
      const minZ = Math.min(edge[0][1], edge[1][1]), maxZ = Math.max(edge[0][1], edge[1][1]);
      for (let row = Math.floor(minZ / CELL_METERS); row <= Math.floor(maxZ / CELL_METERS); row++) {
        const values = this.rows.get(row) ?? []; values.push(edge); this.rows.set(row, values);
      }
      for (let x = Math.floor((minX - DISTANCE_REACH_METERS) / CELL_METERS); x <= Math.floor((maxX + DISTANCE_REACH_METERS) / CELL_METERS); x++) {
        for (let z = Math.floor((minZ - DISTANCE_REACH_METERS) / CELL_METERS); z <= Math.floor((maxZ + DISTANCE_REACH_METERS) / CELL_METERS); z++) {
          const key = `${x}:${z}`, values = this.cells.get(key) ?? []; values.push(edge); this.cells.set(key, values);
        }
      }
    }
  }
  public contains(x: number, z: number): boolean {
    let inside = false;
    for (const [a, b] of this.rows.get(Math.floor(z / CELL_METERS)) ?? []) {
      if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  public signedDistance(x: number, z: number): number {
    let nearest = Infinity;
    for (const edge of this.cells.get(`${Math.floor(x / CELL_METERS)}:${Math.floor(z / CELL_METERS)}`) ?? []) nearest = Math.min(nearest, distanceSquared(x, z, edge));
    return (this.contains(x, z) ? 1 : -1) * Math.sqrt(nearest);
  }
  public clipTriangle(triangle: readonly [Pair, Pair, Pair], clip?: MultiPolygon): MultiPolygon {
    if (!this.polygons.length) return [];
    const minX = Math.min(...triangle.map(p => p[0])), maxX = Math.max(...triangle.map(p => p[0]));
    const minZ = Math.min(...triangle.map(p => p[1])), maxZ = Math.max(...triangle.map(p => p[1]));
    const edges = this.cells.get(`${Math.floor((minX + maxX) * 0.5 / CELL_METERS)}:${Math.floor((minZ + maxZ) * 0.5 / CELL_METERS)}`) ?? [];
    const crossing = (a: Pair, b: Pair, c: Pair): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const insideTriangle = (point: Pair): boolean => {
      const signs = triangle.map((a, i) => crossing(a, triangle[(i + 1) % 3], point));
      return signs.every(value => value > EPSILON) || signs.every(value => value < -EPSILON);
    };
    const touchesBoundary = edges.some(([a, b]) => {
      if (Math.max(a[0], b[0]) < minX - EPSILON || Math.min(a[0], b[0]) > maxX + EPSILON || Math.max(a[1], b[1]) < minZ - EPSILON || Math.min(a[1], b[1]) > maxZ + EPSILON) return false;
      if (insideTriangle(a) || insideTriangle(b)) return true;
      return triangle.some((c, i) => {
        const d = triangle[(i + 1) % 3];
        return crossing(a, b, c) * crossing(a, b, d) < -EPSILON * EPSILON && crossing(c, d, a) * crossing(c, d, b) < -EPSILON * EPSILON;
      });
    });
    const source: MultiPolygon = [[[...triangle, triangle[0]]]];
    if (clip) return canonicalPolygons(polygonClipping.intersection(source, clip, this.polygons));
    if (!touchesBoundary) {
      const inside = triangle.map(([x, z]) => this.contains(x, z) || Math.abs(this.signedDistance(x, z)) < EPSILON);
      if (inside.every(Boolean)) return source;
      if (inside.every(value => !value)) return [];
      // Vertex-only contacts can cut a triangle through two corners.
    }
    return intersect(source, this.polygons);
  }
}

/** Only a folded span needs individual cell ownership; normal ribbons stay linear. */
export function partitionRoadTriangles(triangles: readonly (readonly [Pair, Pair, Pair])[], owner?: RoadFootprintRegion | null): readonly MultiPolygon[] {
  // Successive cuts of a folded span can produce nearly identical 1e-15
  // intersections. A micron grid keeps those local cuts deterministic, well
  // below Float32 mesh precision and the five-millimetre profile tolerance.
  const snap = (polygons: MultiPolygon): MultiPolygon => polygons.flatMap(polygon => {
    const rings = polygon.map(ring => {
      const points = ring.slice(0, -1).map(([x, z]): Pair => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6]).filter((point, i, all) => !i || point[0] !== all[i - 1][0] || point[1] !== all[i - 1][1]);
      if (points.length && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1]) points.pop();
      if (points.length < 3) return [];
      points.push(points[0]); return points;
    });
    return rings[0].length ? [rings.filter(ring => ring.length)] : [];
  });
  let claimed: MultiPolygon = [];
  return triangles.map(triangle => {
    const source: MultiPolygon = [[[...triangle, triangle[0]]]];
    const owned = snap(owner ? intersect(source, owner.polygons) : source);
    const unique = snap(difference(owned, claimed));
    claimed = snap(union([claimed, owned]));
    return unique;
  });
}

export interface CompiledRoadFootprint {
  readonly junctions: readonly WorldRouteJunction[];
  readonly routeRegions: readonly RoadFootprintRegion[];
  readonly sharedRouteRegions: readonly RoadFootprintRegion[];
  readonly sharedRemainderRegion: RoadFootprintRegion;
  readonly routeSpanRegions: readonly (readonly (RoadFootprintRegion | null)[])[];
  readonly routeFoldedSpans: readonly (readonly boolean[])[];
  readonly routeCapRegions: readonly (readonly RoadFootprintRegion[])[];
  readonly sharedRegion: RoadFootprintRegion;
  readonly packedRegion: RoadFootprintRegion;
  readonly shoulderRegion: RoadFootprintRegion;
  readonly coverageRegion: RoadFootprintRegion;
  readonly gatewayRegion: RoadFootprintRegion;
  readonly sourceCorridorAreaSquareMeters: number;
  coverageAt(x: number, z: number): number;
  sample(x: number, z: number): RoadFootprintSample;
}

function coverageFromDistances(shoulder: number, outer: number): number {
  // Folded cells can share a boundary across nested layers. The closed
  // shoulder owns full opacity there, even when the outer distance is zero.
  if (shoulder >= 0) return 1;
  if (outer <= 0) return 0;
  return smoothstep(0, 1, outer / Math.max(EPSILON, outer - shoulder));
}

const footprintCache = new WeakMap<readonly CompiledWorldRoute[], Map<string, CompiledRoadFootprint>>();

/** Once-per-world Boolean compilation; no render frame or traversal query rebuilds it. */
export function compileRoadFootprint(options: RoadFootprintOptions): CompiledRoadFootprint {
  const bridgeKey = options.bridge ? [options.bridge.center, options.bridge.halfSpan, options.bridge.deckWidth, options.bridge.gatewayDepthMeters, options.bridge.gatewayInsetMeters, options.bridge.gatewaySlabCount, options.bridge.gatewaySlabGapMeters] : null;
  const key = JSON.stringify([options.junctions, options.profiles, bridgeKey]);
  const cache = footprintCache.get(options.routes) ?? new Map<string, CompiledRoadFootprint>();
  const cached = cache.get(key);
  if (cached) return cached;
  const junctions = deriveRoadJunctions(options);
  const stations = options.routes.map(route => roadTransverseStations(options.profiles[route.route.kind], route.halfWidth));
  const corridors = options.routes.map((route, index) => roadHalfWidths(route).map(width => routeCorridor(route, width, stations[index])));
  const routeSpanRegions: Array<Array<RoadFootprintRegion | null>> = [];
  const routeFoldedSpans: boolean[][] = [];
  const routeCapRegions: RoadFootprintRegion[][] = [];
  for (const [routeIndex, route] of options.routes.entries()) {
    const outer = roadHalfWidths(route)[2], spans = routeSpans(route, outer, stations[routeIndex]);
    const spanCells = new Map<string, number[]>(), owned: Array<RoadFootprintRegion | null> = [];
    for (const [index, span] of spans.entries()) {
      const points = span.flat(2), xs = points.map(point => point[0]), zs = points.map(point => point[1]);
      const minX = Math.floor(Math.min(...xs) / CELL_METERS), maxX = Math.floor(Math.max(...xs) / CELL_METERS), minZ = Math.floor(Math.min(...zs) / CELL_METERS), maxZ = Math.floor(Math.max(...zs) / CELL_METERS);
      const previous = new Set<number>();
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) for (const candidate of spanCells.get(`${x}:${z}`) ?? []) previous.add(candidate);
      const overlaps = [...previous].filter(candidate => intersect(span, spans[candidate]).some(polygon => {
        let area = 0; for (const ring of polygon) for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
        return Math.abs(area) > 1e-7;
      }));
      owned.push(overlaps.length ? new RoadFootprintRegion(difference(span, union(overlaps.map(candidate => spans[candidate])))) : null);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}:${z}`, values = spanCells.get(key) ?? []; values.push(index); spanCells.set(key, values);
      }
    }
    const folded = route.samples.slice(1).map((_, index) => {
      const a = roadOffsetJoin(route, index), b = roadOffsetJoin(route, index + 1);
      const p = route.samples[index].point, q = route.samples[index + 1].point;
      const left: Pair = [Math.fround(p.x - a.normal.x * outer * a.miterScale), Math.fround(p.z - a.normal.z * outer * a.miterScale)], right: Pair = [Math.fround(p.x + a.normal.x * outer * a.miterScale), Math.fround(p.z + a.normal.z * outer * a.miterScale)];
      const nextLeft: Pair = [Math.fround(q.x - b.normal.x * outer * b.miterScale), Math.fround(q.z - b.normal.z * outer * b.miterScale)], nextRight: Pair = [Math.fround(q.x + b.normal.x * outer * b.miterScale), Math.fround(q.z + b.normal.z * outer * b.miterScale)];
      return foldedSection(left, right, nextLeft, nextRight);
    });
    for (const [index, value] of folded.entries()) if (value && !owned[index]) owned[index] = new RoadFootprintRegion(spans[index]);
    routeSpanRegions.push(owned);
    routeFoldedSpans.push(folded);
    const body = union(spans), caps: RoadFootprintRegion[] = [];
    let claimedCaps = body;
    for (const index of [0, route.samples.length - 1]) {
      const disk = circle(route.samples[index].point, outer, 16);
      caps.push(new RoadFootprintRegion(difference(disk, claimedCaps)));
      claimedCaps = union([claimedCaps, disk]);
    }
    routeCapRegions.push(caps);
  }
  const additions: MultiPolygon[][] = [[], [], []];
  const junctionEnvelopes: MultiPolygon[] = [];
  for (const junction of junctions) {
    const packedRadius = Math.max(0.72, junction.radiusMeters * 0.74);
    additions[0].push(circle(junction.center, packedRadius));
    additions[1].push(circle(junction.center, packedRadius + 0.25));
    additions[2].push(circle(junction.center, packedRadius + 0.55));
    junctionEnvelopes.push(circle(junction.center, junction.radiusMeters + junction.blendLengthMeters));
  }
  let layers = [0, 1, 2].map(layer => union([...corridors.map(route => route[layer]), ...additions[layer]]));
  if (options.bridge) {
    const { center, halfSpan, deckWidth } = options.bridge;
    const x0 = center.x - halfSpan, x1 = center.x + halfSpan, z0 = center.z - deckWidth / 2, z1 = center.z + deckWidth / 2;
    const deck: MultiPolygon = [[[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]]];
    layers = layers.map(layer => difference(layer, deck));
  }
  const gatewayPolygons = options.bridge ? union(roadGatewayPlan(options.bridge).map(plan => [plan.polygon])) : [];
  layers = layers.map(layer => union([layer, gatewayPolygons]));
  const sharedPolygons = difference(intersect(layers[2], union(junctionEnvelopes)), gatewayPolygons);
  const order = options.routes.map((route, index) => ({ route, index })).sort((a, b) => KIND_RANK[a.route.route.kind] - KIND_RANK[b.route.route.kind] || a.route.route.id.localeCompare(b.route.route.id));
  const routeRegions = new Array<RoadFootprintRegion>(options.routes.length);
  const sharedRouteRegions = new Array<RoadFootprintRegion>(options.routes.length);
  const owned = options.routes.map((): MultiPolygon[] => []);
  let claimed = gatewayPolygons;
  // A neighbouring verge cannot take ownership of a road's packed core.
  // Resolve each nested layer before advancing to the next, applying class
  // and route-ID priority only where the same layer genuinely overlaps.
  for (const layer of [0, 1, 2]) for (const { index } of order) {
    owned[index].push(difference(corridors[index][layer], claimed));
    claimed = union([claimed, corridors[index][layer]]);
  }
  for (const { index } of order) {
    const owner = union(owned[index]);
    routeRegions[index] = new RoadFootprintRegion(difference(intersect(owner, layers[2]), sharedPolygons));
    sharedRouteRegions[index] = new RoadFootprintRegion(intersect(owner, sharedPolygons));
  }
  const sharedRegion = new RoadFootprintRegion(sharedPolygons);
  const sharedRemainderRegion = new RoadFootprintRegion(difference(sharedPolygons, claimed));
  const packedRegion = new RoadFootprintRegion(layers[0]);
  const shoulderRegion = new RoadFootprintRegion(layers[1]);
  const coverageRegion = new RoadFootprintRegion(layers[2]);
  const gatewayRegion = new RoadFootprintRegion(gatewayPolygons);
  const segmentCells = new Map<string, Array<{ routeIndex: number; segmentIndex: number }>>();
  const routeCells = new Map<string, number[]>();
  const stationOffsets = options.routes.map(route => routeStationOffset(route.route.id));
  for (const { route, index: routeIndex } of order) for (const [segmentIndex, segment] of route.segments.entries()) {
    const reach = roadHalfWidths(route)[2] + DISTANCE_REACH_METERS;
    const reference = { routeIndex, segmentIndex };
    for (let x = Math.floor((segment.minX - reach) / CELL_METERS); x <= Math.floor((segment.maxX + reach) / CELL_METERS); x++) {
      for (let z = Math.floor((segment.minZ - reach) / CELL_METERS); z <= Math.floor((segment.maxZ + reach) / CELL_METERS); z++) {
        const key = `${x}:${z}`, segments = segmentCells.get(key) ?? [], routes = routeCells.get(key) ?? [];
        segments.push(reference); segmentCells.set(key, segments);
        if (!routes.includes(routeIndex)) routes.push(routeIndex);
        routeCells.set(key, routes);
      }
    }
  }
  const defaultTangent = Object.freeze({ x: 1, z: 0 });
  const result: CompiledRoadFootprint = {
    junctions, routeRegions, sharedRouteRegions, sharedRemainderRegion, routeSpanRegions, routeFoldedSpans, routeCapRegions, sharedRegion, packedRegion, shoulderRegion, coverageRegion, gatewayRegion,
    sourceCorridorAreaSquareMeters: layers[2].reduce((total, polygon) => total + polygon.reduce((sum, ring) => {
      let area = 0; for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
      return sum + area / 2;
    }, 0), 0),
    coverageAt(x, z) { return coverageFromDistances(shoulderRegion.signedDistance(x, z), coverageRegion.signedDistance(x, z)); },
    sample(x, z) {
      const packedSignedDistance = packedRegion.signedDistance(x, z), shoulderSignedDistance = shoulderRegion.signedDistance(x, z), coverageSignedDistance = coverageRegion.signedDistance(x, z);
      const coverage = coverageFromDistances(shoulderSignedDistance, coverageSignedDistance);
      const packed = smoothstep(-0.16, 0.12, packedSignedDistance) * coverage;
      const sharedDistance = sharedRegion.signedDistance(x, z);
      let routeIndex: number | null = null;
      let frameAcross = 0, frameAlong = 0, tangent: Readonly<WorldPoint> = defaultTangent;
      const cellKey = `${Math.floor(x / CELL_METERS)}:${Math.floor(z / CELL_METERS)}`;
      if (coverageSignedDistance > -EPSILON && sharedDistance < -EPSILON) {
        for (const index of routeCells.get(cellKey) ?? []) if (routeRegions[index].contains(x, z)) { routeIndex = index; break; }
      }
      let nearestSquared = Infinity;
      if (coverageSignedDistance > -EPSILON) for (const reference of segmentCells.get(cellKey) ?? []) {
        if (sharedDistance < -EPSILON && routeIndex !== reference.routeIndex) continue;
        const segment = options.routes[reference.routeIndex].segments[reference.segmentIndex];
        const t = Math.max(0, Math.min(1, ((x - segment.start.x) * segment.dx + (z - segment.start.z) * segment.dz) / segment.lengthSquared));
        const dx = x - segment.start.x - segment.dx * t, dz = z - segment.start.z - segment.dz * t;
        const squared = dx * dx + dz * dz;
        if (squared >= nearestSquared - EPSILON) continue;
        nearestSquared = squared; routeIndex = reference.routeIndex;
        frameAcross = dx * -segment.tangent.z + dz * segment.tangent.x;
        frameAlong = stationOffsets[reference.routeIndex] + segment.cumulativeStart + segment.length * t;
        tangent = segment.tangent;
      }
      return { packedSignedDistance, shoulderSignedDistance, coverageSignedDistance, packed, shoulder: (1 - packed) * coverage, coverage, junctionTraffic: smoothstep(-JUNCTION_TRACK_FADE_METERS, 0, sharedDistance), routeIndex, classCode: sharedDistance >= -EPSILON || routeIndex === null ? 3 : KIND_RANK[options.routes[routeIndex].route.kind], frameAcross, frameAlong, tangent };
    }
  };
  cache.set(key, result); footprintCache.set(options.routes, cache);
  return result;
}

import * as THREE from "three";
import { roadTransverseStations } from "./RoadProfile";
export { roadTransverseStations, sampleRoadCrossSection } from "./RoadProfile";
export type { RoadCrossSectionInput, RoadCrossSectionSample } from "./RoadProfile";
import { compileRoadFootprint, routeStationOffset, roadOffsetJoin, roadGatewayPlan, partitionRoadTriangles, RoadFootprintRegion, type CompiledRoadFootprint, type RoadPlanPoint, type RoadPolygon, type RoadPolygons } from "./RoadFootprint";
import { PALETTE_HEX } from "../render/materials/PaletteTokens";
import type {
  CompiledWorldRoute,
  WorldPoint,
  WorldRouteJunction,
  WorldRouteKind,
  WorldRouteProfile
} from "./WorldLayout";

export interface OrganicRoadGeometryOptions {
  footprint?: CompiledRoadFootprint;
  routes: readonly CompiledWorldRoute[];
  junctions: readonly WorldRouteJunction[];
  profiles: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>>;
  bridge: {
    center: WorldPoint;
    halfSpan: number;
    deckWidth: number;
    entrySurfaceY: number;
    westDeckEdge: WorldPoint;
    eastDeckEdge: WorldPoint;
    gatewayDepthMeters: number;
    gatewayInsetMeters: number;
    gatewayOverlapMeters?: number;
    gatewaySlabCount: number;
    gatewaySlabGapMeters: number;
  };
  heightAt: (x: number, z: number) => number;
  isBridgeDeck: (x: number, z: number) => boolean;
}

/**
 * Class code each road vertex carries in its `roadClass` attribute: the three
 * route kinds, then shared surfaces (junctions, the bridge gateway) that carry
 * no wheel tracks of their own.
 */
export const ROAD_CLASS_CODES: Readonly<Record<WorldRouteKind | "shared", number>> = Object.freeze({
  arterial: 0, lane: 1, trail: 2, shared: 3
});

function paletteColor(token: keyof typeof PALETTE_HEX): THREE.Color { return new THREE.Color(PALETTE_HEX[token]); }
function clamp01(value: number): number { return THREE.MathUtils.clamp(value, 0, 1); }
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
export { routeStationOffset } from "./RoadFootprint";

interface SourceVertex { x: number; y: number; z: number; color: readonly [number, number, number]; across: number; along: number; classCode: number }

interface RoadInterfaceStitchResult {
  indices: number[];
  gatewayVertexStart: number;
  roadTriangleCount: number;
  junctionTriangleCount: number;
  adjustedVertexCount: number;
  insertedVertexCount: number;
  repairedInterfaceDiagonals: number;
  maximumHeightLiftMeters: number;
  maximumHeightLiftPoint: { x: number; z: number; from: number; to: number } | null;
}

/** Match ownership interfaces without resampling the terrain on Boolean cuts. */
function stitchRoadInterfaces(
  positions: number[], colors: number[], frames: number[], classes: number[],
  indices: readonly number[], roadTriangleCount: number, junctionTriangleCount: number, gatewayVertexStart: number, sampledHeights: ReadonlyMap<string, number>
): RoadInterfaceStitchResult {
  interface Node { x: number; z: number; height: number; sampledHeight?: number; gatewayHeight?: number }
  interface Edge { a: number; b: number; count: number; gateway: boolean; cuts: Array<{ node: Node; amount: number }> }
  const originalVertexCount = positions.length / 3;
  const keyAt = (index: number): string => `${positions[index * 3]},${positions[index * 3 + 2]}`;
  const nodes = new Map<string, Node>();
  for (let index = 0; index < originalVertexCount; index++) {
    const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2], key = keyAt(index);
    const node = nodes.get(key) ?? { x, z, height: y };
    node.height = Math.max(node.height, y);
    const sampledHeight = sampledHeights.get(key);
    if (sampledHeight !== undefined && Math.fround(sampledHeight) === y) node.sampledHeight = y;
    if (index >= gatewayVertexStart) node.gatewayHeight = y;
    nodes.set(key, node);
  }
  const edgeKey = (a: number, b: number): string => { const ka = keyAt(a), kb = keyAt(b); return ka < kb ? `${ka}/${kb}` : `${kb}/${ka}`; };
  const storedArea = (a: number, b: number, c: number): number => (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) - (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]);
  const collectEdges = (): Map<string, Edge> => {
    const result = new Map<string, Edge>();
    for (let offset = 0; offset < indices.length; offset += 3) {
      // Canonical contacts may collapse a previously nonzero cut face. A
      // zero-footprint triangle cannot contribute gates or cut chains.
      if (Math.abs(storedArea(indices[offset], indices[offset + 1], indices[offset + 2])) <= 1e-10) continue;
      for (let corner = 0; corner < 3; corner++) {
      const a = indices[offset + corner], b = indices[offset + (corner + 1) % 3];
      if (keyAt(a) === keyAt(b)) continue;
      const key = edgeKey(a, b), edge = result.get(key);
      if (edge) { edge.count++; edge.gateway ||= a >= gatewayVertexStart && b >= gatewayVertexStart; }
      else result.set(key, { a, b, count: 1, gateway: a >= gatewayVertexStart && b >= gatewayVertexStart, cuts: [] });
      }
    }
    return result;
  };
  let edges = collectEdges();
  const ulp = (value: number): number => 2 ** Math.max(-149, Math.floor(Math.log2(Math.abs(value))) - 23);
  const boundary = new Set<Node>();
  for (const edge of edges.values()) if (edge.count === 1) for (const index of [edge.a, edge.b]) boundary.add(nodes.get(keyAt(index))!);
  const representatives: Node[] = [], representativeCells = new Map<string, Node[]>(), canonical = new Map<Node, Node>();
  // Independently rounded cuts can differ by one ULP in one coordinate while
  // denoting the same interface contact. Collapse that numerical wedge before
  // interpolating heights. Per-axis bounds avoid widening the tolerance along
  // Z merely because a distant island's X coordinates have a larger ULP.
  for (const node of [...boundary].sort((a, b) => Number(b.gatewayHeight !== undefined) - Number(a.gatewayHeight !== undefined) || Number(b.sampledHeight !== undefined) - Number(a.sampledHeight !== undefined) || a.x - b.x || a.z - b.z)) {
    const column = Math.floor(node.x / 2), row = Math.floor(node.z / 2);
    let representative: Node | undefined;
    for (let x = column - 1; x <= column + 1 && !representative; x++) for (let z = row - 1; z <= row + 1 && !representative; z++) {
      representative = representativeCells.get(`${x},${z}`)?.find(candidate => Math.abs(candidate.x - node.x) <= Math.max(ulp(candidate.x), ulp(node.x)) && Math.abs(candidate.z - node.z) <= Math.max(ulp(candidate.z), ulp(node.z)));
    }
    if (!representative) {
      representative = node; representatives.push(node);
      const key = `${column},${row}`, values = representativeCells.get(key) ?? []; values.push(node); representativeCells.set(key, values);
    }
    representative.height = Math.max(representative.height, node.height);
    if (node.sampledHeight !== undefined) representative.sampledHeight = node.sampledHeight;
    if (node.gatewayHeight !== undefined) representative.gatewayHeight = node.gatewayHeight;
    canonical.set(node, representative);
  }
  for (let index = 0; index < originalVertexCount; index++) {
    const node = nodes.get(keyAt(index))!, representative = canonical.get(node);
    if (representative) { positions[index * 3] = representative.x; positions[index * 3 + 2] = representative.z; }
  }
  for (const node of boundary) nodes.delete(`${node.x},${node.z}`);
  for (const representative of representatives) nodes.set(`${representative.x},${representative.z}`, representative);
  edges = collectEdges();
  // Only unmatched edges can be ownership gates or T-junctions. Index their
  // endpoint nodes locally rather than comparing every road vertex/triangle.
  const cellSize = 2, cells = new Map<string, Set<Node>>();
  for (const edge of edges.values()) if (edge.count === 1) for (const index of [edge.a, edge.b]) {
    const node = nodes.get(keyAt(index))!, key = `${Math.floor(node.x / cellSize)},${Math.floor(node.z / cellSize)}`;
    const cell = cells.get(key) ?? new Set<Node>(); cell.add(node); cells.set(key, cell);
  }
  for (const edge of edges.values()) {
    const ax = positions[edge.a * 3], az = positions[edge.a * 3 + 2], bx = positions[edge.b * 3], bz = positions[edge.b * 3 + 2];
    const dx = bx - ax, dz = bz - az, lengthSquared = dx * dx + dz * dz;
    // Both the endpoint and its independently clipped neighbour have been
    // rounded. Their combined positional uncertainty is one Float32 ULP.
    const tolerance = Math.hypot(Math.max(ulp(ax), ulp(bx)), Math.max(ulp(az), ulp(bz)));
    const candidates = new Set<Node>();
    for (let column = Math.floor((Math.min(ax, bx) - tolerance) / cellSize); column <= Math.floor((Math.max(ax, bx) + tolerance) / cellSize); column++) {
      for (let row = Math.floor((Math.min(az, bz) - tolerance) / cellSize); row <= Math.floor((Math.max(az, bz) + tolerance) / cellSize); row++) {
        for (const node of cells.get(`${column},${row}`) ?? []) candidates.add(node);
      }
    }
    for (const node of candidates) {
      if ((node.x === ax && node.z === az) || (node.x === bx && node.z === bz)) continue;
      const amount = ((node.x - ax) * dx + (node.z - az) * dz) / lengthSquared;
      if (amount <= 0 || amount >= 1 || Math.hypot(node.x - ax - amount * dx, node.z - az - amount * dz) > tolerance) continue;
      const height = positions[edge.a * 3 + 1] + amount * (positions[edge.b * 3 + 1] - positions[edge.a * 3 + 1]);
      node.height = Math.max(node.height, height);
      if (edge.gateway) node.gatewayHeight = height;
      else edge.cuts.push({ node, amount });
    }
    edge.cuts.sort((a, b) => a.amount - b.amount);
  }
  let maximumHeightLiftMeters = 0, adjustedVertexCount = 0;
  const adjustedNodes = new Set<number>();
  let maximumHeightLiftPoint: RoadInterfaceStitchResult["maximumHeightLiftPoint"] = null;
  for (let index = 0; index < gatewayVertexStart; index++) {
    const node = nodes.get(keyAt(index))!, y = Math.fround(node.gatewayHeight ?? node.sampledHeight ?? node.height);
    if (y - positions[index * 3 + 1] > maximumHeightLiftMeters) {
      maximumHeightLiftMeters = y - positions[index * 3 + 1];
      maximumHeightLiftPoint = { x: node.x, z: node.z, from: positions[index * 3 + 1], to: y };
    }
    if (y !== positions[index * 3 + 1]) { adjustedVertexCount++; adjustedNodes.add(index); }
    positions[index * 3 + 1] = y;
  }
  const newIndices: number[] = [];
  let newRoadTriangleCount = 0, newJunctionTriangleCount = 0;
  const insertionCache = new Map<string, number>();
  for (let offset = 0; offset < indices.length; offset += 3) {
    const original = indices.slice(offset, offset + 3), contour: number[] = [];
    if (Math.abs(storedArea(original[0], original[1], original[2])) <= 1e-10) continue;
    for (let corner = 0; corner < 3; corner++) {
      const a = original[corner], b = original[(corner + 1) % 3], edge = edges.get(edgeKey(a, b));
      contour.push(a);
      if (!edge?.cuts.length) continue;
      const cuts = edge.a === a ? edge.cuts : [...edge.cuts].reverse();
      for (const cut of cuts) {
        const amount = edge.a === a ? cut.amount : 1 - cut.amount;
        const color = [0, 1, 2, 3].map(component => Math.fround(colors[a * 4 + component] + amount * (colors[b * 4 + component] - colors[a * 4 + component])));
        const frame = [0, 1].map(component => Math.fround(frames[a * 2 + component] + amount * (frames[b * 2 + component] - frames[a * 2 + component])));
        const y = Math.fround(cut.node.gatewayHeight ?? cut.node.sampledHeight ?? cut.node.height), cacheKey = [cut.node.x, y, cut.node.z, ...color, ...frame, classes[a]].join(',');
        let inserted = insertionCache.get(cacheKey);
        if (inserted === undefined) {
          inserted = positions.length / 3; positions.push(cut.node.x, y, cut.node.z); colors.push(...color); frames.push(...frame); classes.push(classes[a]); insertionCache.set(cacheKey, inserted);
        }
        if (keyAt(contour.at(-1)!) !== keyAt(inserted)) contour.push(inserted);
      }
    }
    if (contour.length > 1 && keyAt(contour[0]) === keyAt(contour.at(-1)!)) contour.pop();
    // Independently rounded T nodes may make an edge locally reflex. Resolve
    // the complete stored boundary once; flipping sequential fan children
    // would turn a crossed child into an overlapping source sliver.
    const triangles = contour.length === 3 ? [[0, 1, 2]] : THREE.ShapeUtils.triangulateShape(contour.map(index => new THREE.Vector2(positions[index * 3], positions[index * 3 + 2])), []);
    // Earcut can omit exactly collinear boundary points. Their heights may
    // carry a joined crown, so retain them by splitting only a truly collinear
    // triangle edge; unlike a rounded off-edge fan, this cannot overlap.
    const used = new Set(triangles.flat());
    for (let corner = 0; corner < contour.length; corner++) if (!used.has(corner)) {
      const point = contour[corner];
      let retained = false;
      for (let triangleIndex = 0; triangleIndex < triangles.length && !retained; triangleIndex++) {
        const triangle = triangles[triangleIndex];
        for (let edge = 0; edge < 3; edge++) {
          const a = contour[triangle[edge]], b = contour[triangle[(edge + 1) % 3]], dx = positions[b * 3] - positions[a * 3], dz = positions[b * 3 + 2] - positions[a * 3 + 2];
          const distanceAlong = (positions[point * 3] - positions[a * 3]) * dx + (positions[point * 3 + 2] - positions[a * 3 + 2]) * dz;
          if (storedArea(a, b, point) !== 0 || distanceAlong <= 0 || distanceAlong >= dx * dx + dz * dz) continue;
          const third = triangle[(edge + 2) % 3];
          triangles.splice(triangleIndex, 1, [triangle[edge], corner, third], [corner, triangle[(edge + 1) % 3], third]);
          used.add(corner); retained = true; break;
        }
      }
    }
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map(index => contour[index]);
      const area = (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) - (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]);
      if (Math.abs(area) <= 1e-10) continue;
      if (area > 0) newIndices.push(a, c, b); else newIndices.push(a, b, c);
      if (offset < roadTriangleCount * 3) newRoadTriangleCount++;
      else if (offset < (roadTriangleCount + junctionTriangleCount) * 3) newJunctionTriangleCount++;
    }
  }
  // Welding a clipped ownership contact can leave a needle triangle beside
  // its neighbour. Improve only internal diagonals in that edited shared
  // junction neighbourhood: all authored stations, heights and boundaries
  // remain fixed, and ordinary source-plane triangulation stays untouched.
  let repairedInterfaceDiagonals = 0;
  const areaAt = (a: number, b: number, c: number): number => (positions[b * 3] - positions[a * 3]) * (positions[c * 3 + 2] - positions[a * 3 + 2]) - (positions[b * 3 + 2] - positions[a * 3 + 2]) * (positions[c * 3] - positions[a * 3]);
  const quality = (a: number, b: number, c: number): number => {
    const lengthSquared = (a: number, b: number): number => (positions[b * 3] - positions[a * 3]) ** 2 + (positions[b * 3 + 2] - positions[a * 3 + 2]) ** 2;
    return Math.abs(areaAt(a, b, c)) / Math.max(lengthSquared(a, b), lengthSquared(b, c), lengthSquared(c, a));
  };
  for (let pass = 0; pass < 5; pass++) {
    const sharedEdges = new Map<string, Array<{ offset: number; a: number; b: number; third: number }>>();
    for (let offset = 0; offset < (newRoadTriangleCount + newJunctionTriangleCount) * 3; offset += 3) {
      for (let corner = 0; corner < 3; corner++) {
        const a = newIndices[offset + corner], b = newIndices[offset + (corner + 1) % 3], third = newIndices[offset + (corner + 2) % 3];
        const key = edgeKey(a, b), values = sharedEdges.get(key) ?? []; values.push({ offset, a, b, third }); sharedEdges.set(key, values);
      }
    }
    const visited = new Set<number>();
    let flipped = false;
    for (const values of sharedEdges.values()) {
      if (values.length !== 2) continue;
      const [first, second] = values;
      if (visited.has(first.offset) || visited.has(second.offset)) continue;
      const { a, b } = first, c = first.third, d = second.third;
      // An internal diagonal may change only within one attribute frame. Road
      // owners meeting with different route frames retain their authored seam.
      const sameDatum = (left: number, right: number): boolean => classes[left] === classes[right]
        && frames[left * 2] === frames[right * 2] && frames[left * 2 + 1] === frames[right * 2 + 1]
        && [0, 1, 2, 3].every(component => colors[left * 4 + component] === colors[right * 4 + component]);
      const secondA = keyAt(a) === keyAt(second.a) ? second.a : second.b;
      const secondB = secondA === second.a ? second.b : second.a;
      if (!sameDatum(a, secondA) || !sameDatum(b, secondB) || classes[a] !== classes[c] || classes[a] !== classes[d]) continue;
      if (![a, b, c, d].some(index => adjustedNodes.has(index) || index >= originalVertexCount)) continue;
      if (areaAt(a, b, c) * areaAt(a, b, d) >= 0 || areaAt(c, d, a) * areaAt(c, d, b) >= 0) continue;
      const before = Math.min(quality(a, b, c), quality(a, b, d)), after = Math.min(quality(c, d, a), quality(c, d, b));
      if (before >= 0.02 || after <= before * 1.2) continue;
      const write = (offset: number, a: number, b: number, c: number): void => {
        newIndices[offset] = a; newIndices[offset + 1] = areaAt(a, b, c) < 0 ? b : c; newIndices[offset + 2] = areaAt(a, b, c) < 0 ? c : b;
      };
      write(first.offset, c, d, a); write(second.offset, d, c, b);
      visited.add(first.offset); visited.add(second.offset); repairedInterfaceDiagonals++; flipped = true;
    }
    if (!flipped) break;
  }
  // Keep explicit bridge slabs in the inspectable contiguous range they had
  // before stitching; newly inserted earth vertices precede that range.
  const insertedVertexCount = positions.length / 3 - originalVertexCount;
  if (insertedVertexCount) for (const [values, stride] of [[positions, 3], [colors, 4], [frames, 2], [classes, 1]] as const) {
    const gateway = values.splice(gatewayVertexStart * stride, (originalVertexCount - gatewayVertexStart) * stride); values.push(...gateway);
  }
  const remap = (index: number): number => index < gatewayVertexStart ? index : index < originalVertexCount ? index + insertedVertexCount : index - originalVertexCount + gatewayVertexStart;
  return { indices: newIndices.map(remap), gatewayVertexStart: gatewayVertexStart + insertedVertexCount, roadTriangleCount: newRoadTriangleCount, junctionTriangleCount: newJunctionTriangleCount, adjustedVertexCount, insertedVertexCount, repairedInterfaceDiagonals, maximumHeightLiftMeters, maximumHeightLiftPoint };
}

export function buildOrganicRoadGeometry(options: OrganicRoadGeometryOptions): THREE.BufferGeometry {
  const footprint = options.footprint ?? compileRoadFootprint({ routes: options.routes, junctions: options.junctions, profiles: options.profiles, bridge: options.bridge });
  const positions: number[] = [], colors: number[] = [], frames: number[] = [], classes: number[] = [], indices: number[] = [];
  const cache = new Map<string, number>();
  const sharedTriangles: Array<[SourceVertex, SourceVertex, SourceVertex]> = [];
  const gatewayPlans = roadGatewayPlan(options.bridge);
  const gatewayTriangles = gatewayPlans.flatMap(plan => {
    const vertices = plan.polygon[0].slice(0, -1).map(([x, z]): SourceVertex => ({ x, y: options.isBridgeDeck(x, z) ? options.bridge.entrySurfaceY : options.heightAt(x, z), z, color: [0, 0, 0], across: 0, along: 0, classCode: ROAD_CLASS_CODES.shared }));
    return [[vertices[0], vertices[1], vertices[2]], [vertices[0], vertices[2], vertices[3]]] as Array<[SourceVertex, SourceVertex, SourceVertex]>;
  });
  const gatewayHeightAt = (x: number, z: number, fallback: number): number => {
    for (const [a, b, c] of gatewayTriangles) {
      const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
      const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) >= -0.0001) return a.y * wa + b.y * wb + c.y * wc;
    }
    return fallback;
  };
  const road = paletteColor("path_dust_01"), shoulder = paletteColor("soil_warm_01");
  const coordinateKey = (x: number, z: number): string => `${Math.fround(x)},${Math.fround(z)}`;
  const heightCache = new Map<string, number>();
  const heightAt = (x: number, z: number): number => {
    const key = coordinateKey(x, z), cached = heightCache.get(key);
    if (cached !== undefined) return cached;
    const height = options.heightAt(Math.fround(x), Math.fround(z)); heightCache.set(key, height); return height;
  };
  const appendVertex = (vertex: SourceVertex, opacity?: number): number => {
    const x = Math.fround(vertex.x), y = Math.fround(vertex.y), z = Math.fround(vertex.z);
    const alpha = opacity ?? footprint.coverageAt(x, z);
    const values = [x, y, z, ...vertex.color, alpha, vertex.across, vertex.along, vertex.classCode].map(Math.fround);
    const key = values.join(",");
    const found = cache.get(key); if (found !== undefined) return found;
    const index = positions.length / 3;
    positions.push(x, y, z); colors.push(values[3], values[4], values[5], values[6]); frames.push(values[7], values[8]); classes.push(values[9]);
    cache.set(key, index);
    return index;
  };
  const appendTriangle = (vertices: readonly [SourceVertex, SourceVertex, SourceVertex], opacity?: number): boolean => {
    const [a, b, c] = vertices;
    const area = (Math.fround(b.x) - Math.fround(a.x)) * (Math.fround(c.z) - Math.fround(a.z)) - (Math.fround(b.z) - Math.fround(a.z)) * (Math.fround(c.x) - Math.fround(a.x));
    if (Math.abs(area) <= 1e-10) return false;
    const ids = vertices.map(vertex => appendVertex(vertex, opacity));
    if (area > 0) indices.push(ids[0], ids[2], ids[1]); else indices.push(...ids);
    return true;
  };
  const triangulate = (polygon: RoadPolygon, vertexAt: (point: RoadPlanPoint) => SourceVertex, onTriangle: (triangle: [SourceVertex, SourceVertex, SourceVertex]) => void): void => {
    // Interpolate attributes on the source plane before quantization, then
    // triangulate the contour actually stored by the renderer/collider.
    const rings = polygon.map(ring => ring.slice(0, -1).map(point => {
      const vertex = vertexAt(point); return { ...vertex, x: Math.fround(vertex.x), z: Math.fround(vertex.z) };
    }).filter((vertex, index, all) => !index || vertex.x !== all[index - 1].x || vertex.z !== all[index - 1].z));
    for (const ring of rings) if (ring.length > 1 && ring[0].x === ring.at(-1)!.x && ring[0].z === ring.at(-1)!.z) ring.pop();
    if (rings[0].length < 3) return;
    const retained = [rings[0], ...rings.slice(1).filter(ring => ring.length >= 3)];
    const vectors = retained.map(ring => ring.map(vertex => new THREE.Vector2(vertex.x, vertex.z)));
    const flat = retained.flat();
    for (const triangle of THREE.ShapeUtils.triangulateShape(vectors[0], vectors.slice(1))) onTriangle(triangle.map(index => flat[index]) as [SourceVertex, SourceVertex, SourceVertex]);
  };
  let roadTriangleCount = 0, junctionTriangleCount = 0, gatewayTriangleCount = 0, maximumMiterScale = 0, roundedCapCount = 0;
  let sourceTriangleCount = 0, maximumStationCount = 9;
  const rgb = (color: THREE.Color): [number, number, number] => [color.r, color.g, color.b];

  for (const [routeIndex, route] of options.routes.entries()) {
    const profile = options.profiles[route.route.kind];
    const stations = roadTransverseStations(profile, route.halfWidth);
    maximumStationCount = Math.max(maximumStationCount, stations.length);
    const region = footprint.routeRegions[routeIndex];
    const sharedRouteRegion = footprint.sharedRouteRegions[routeIndex];
    const classCode = ROAD_CLASS_CODES[route.route.kind], stationOffset = routeStationOffset(route.route.id);
    const emit = (triangle: [SourceVertex, SourceVertex, SourceVertex], clip?: RoadPolygons, preclipped = false): void => {
      sourceTriangleCount++;
      const plan = triangle.map(vertex => [vertex.x, vertex.z] as RoadPlanPoint) as [RoadPlanPoint, RoadPlanPoint, RoadPlanPoint];
      const [a, b, c] = triangle;
      const determinant = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(determinant) <= 1e-12) return;
      const vertexAt = ([x, z]: RoadPlanPoint): SourceVertex => {
        const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / determinant;
        const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / determinant;
        const wc = 1 - wa - wb;
        // The original stations sample canonical support. A Boolean cut then
        // interpolates their plane, so near-collinear cuts cannot create a
        // vertical fold by resampling different relief along the same edge.
        let y = a.y * wa + b.y * wb + c.y * wc;
        if (options.isBridgeDeck(Math.fround(x), Math.fround(z))) y = options.bridge.entrySurfaceY;
        if (Math.abs(footprint.gatewayRegion.signedDistance(x, z)) < 0.0001) y = gatewayHeightAt(x, z, y);
        return { x, y, z, color: a.color.map((value, component) => value * wa + b.color[component] * wb + c.color[component] * wc) as [number, number, number], across: a.across * wa + b.across * wb + c.across * wc, along: a.along * wa + b.along * wb + c.along * wc, classCode };
      };
      const appendOwned = (sourcePlan: [RoadPlanPoint, RoadPlanPoint, RoadPlanPoint], sourceClip?: RoadPolygons): void => {
        for (const polygon of region.clipTriangle(sourcePlan, sourceClip)) triangulate(polygon, vertexAt, clipped => { if (appendTriangle(clipped)) roadTriangleCount++; });
        for (const polygon of sharedRouteRegion.clipTriangle(sourcePlan, sourceClip)) triangulate(polygon, vertexAt, clipped => {
          sharedTriangles.push(clipped.map(vertex => ({ ...vertex, across: 0, along: 0, classCode: ROAD_CLASS_CODES.shared })) as [SourceVertex, SourceVertex, SourceVertex]);
        });
      };
      if (preclipped) for (const polygon of clip ?? []) triangulate(polygon, vertexAt, vertices => appendOwned(vertices.map(vertex => [vertex.x, vertex.z]) as [RoadPlanPoint, RoadPlanPoint, RoadPlanPoint]));
      else appendOwned(plan, clip);
    };
    const rings = route.samples.map((sample, sampleIndex) => {
      const join = roadOffsetJoin(route, sampleIndex);
      maximumMiterScale = Math.max(maximumMiterScale, join.miterScale);
      return stations.map((across): SourceVertex => {
        const x = Math.fround(sample.point.x + join.normal.x * across * join.miterScale);
        const z = Math.fround(sample.point.z + join.normal.z * across * join.miterScale);
        const loose = smoothstep(route.halfWidth * 0.86, route.halfWidth + profile.shoulderWidthMeters, Math.abs(across));
        return { x, y: options.isBridgeDeck(x, z) ? options.bridge.entrySurfaceY : heightAt(x, z), z, color: rgb(road.clone().lerp(shoulder, loose * 0.28)), across, along: stationOffset + sample.distanceAlongRoute, classCode };
      });
    });
    for (let row = 1; row < rings.length; row++) {
      const triangles: Array<[SourceVertex, SourceVertex, SourceVertex]> = [];
      for (let column = 1; column < stations.length; column++) {
        const a = rings[row - 1][column - 1], b = rings[row - 1][column], c = rings[row][column], d = rings[row][column - 1];
        triangles.push([a, b, c], [a, c, d]);
      }
      const span = footprint.routeSpanRegions[routeIndex][row - 1];
      const partitions = footprint.routeFoldedSpans[routeIndex][row - 1] ? partitionRoadTriangles(triangles.map(triangle => triangle.map(vertex => [vertex.x, vertex.z]) as [RoadPlanPoint, RoadPlanPoint, RoadPlanPoint]), span) : null;
      for (const [index, triangle] of triangles.entries()) emit(triangle, partitions?.[index] ?? span?.polygons, partitions !== null);
    }
    const isClosed = Math.hypot(route.samples[0].point.x - route.samples.at(-1)!.point.x, route.samples[0].point.z - route.samples.at(-1)!.point.z) < 1e-7;
    for (const [capIndex, sampleIndex] of isClosed ? [] : [[0, 0], [1, route.samples.length - 1]]) {
      const sample = route.samples[sampleIndex];
      if (options.isBridgeDeck(sample.point.x, sample.point.z)) continue;
      roundedCapCount++;
      const center: SourceVertex = { x: Math.fround(sample.point.x), y: heightAt(sample.point.x, sample.point.z), z: Math.fround(sample.point.z), color: rgb(road), across: 0, along: stationOffset + sample.distanceAlongRoute, classCode };
      const capRings: SourceVertex[][] = [];
      // The same world-aligned disk as the footprint, clipped at the exact end row.
      for (const radius of stations.filter(value => value > 0)) {
        const arc: SourceVertex[] = [];
        for (let step = 0; step < 16; step++) {
          const angle = step / 16 * Math.PI * 2;
          const cos = Math.cos(angle) * radius, sin = Math.sin(angle) * radius;
          const dx = Math.abs(cos) < 1e-10 ? 0 : cos, dz = Math.abs(sin) < 1e-10 ? 0 : sin;
          const x = Math.fround(sample.point.x + dx), z = Math.fround(sample.point.z + dz);
          arc.push({ x, y: heightAt(x, z), z, color: rgb(shoulder), across: dx * sample.normal.x + dz * sample.normal.z, along: center.along + dx * sample.tangent.x + dz * sample.tangent.z, classCode });
        }
        capRings.push(arc);
      }
      // Subtract every body span and the other cap before clipping to the route
      // owner: exposed arcs behind a curved end row also remain filled.
      for (let ring = 0; ring < capRings.length; ring++) for (let step = 0; step < 16; step++) {
        const arc = capRings[ring], next = (step + 1) % 16, clip = footprint.routeCapRegions[routeIndex][capIndex].polygons;
        if (!ring) emit([center, arc[step], arc[next]], clip);
        else { const previous = capRings[ring - 1]; emit([previous[step], arc[step], arc[next]], clip); emit([previous[step], arc[next], previous[next]], clip); }
      }
    }
  }

  const junctionColor = rgb(road.clone().lerp(shoulder, 0.2));
  const sharedVertex = ([x, z]: RoadPlanPoint): SourceVertex => ({ x, y: gatewayHeightAt(x, z, options.isBridgeDeck(Math.fround(x), Math.fround(z)) ? options.bridge.entrySurfaceY : heightAt(x, z)), z, color: junctionColor, across: 0, along: 0, classCode: ROAD_CLASS_CODES.shared });
  // Junctions reuse the clipped crowned cells on each deterministic ribbon
  // owner. Both sides of every body gate therefore have the same cut stations.
  const recolorShared = (vertex: SourceVertex): SourceVertex => ({ ...vertex, color: junctionColor });
  for (const triangle of sharedTriangles) if (appendTriangle([recolorShared(triangle[0]), recolorShared(triangle[1]), recolorShared(triangle[2])])) junctionTriangleCount++;
  // Only the compact apron beyond all ribbons needs a separate fill. Clipping
  // small grid triangles avoids giant polygon fans flattening a crowned edge.
  const remainder = footprint.sharedRemainderRegion;
  const gridStep = 0.5;
  for (const polygon of remainder.polygons) {
    const points = polygon[0];
    const minX = Math.floor(Math.min(...points.map(p => p[0])) / gridStep), maxX = Math.ceil(Math.max(...points.map(p => p[0])) / gridStep);
    const minZ = Math.floor(Math.min(...points.map(p => p[1])) / gridStep), maxZ = Math.ceil(Math.max(...points.map(p => p[1])) / gridStep);
    const localRegion = new RoadFootprintRegion([polygon]);
    for (let column = minX; column < maxX; column++) for (let row = minZ; row < maxZ; row++) {
      const a: RoadPlanPoint = [column * gridStep, row * gridStep], b: RoadPlanPoint = [(column + 1) * gridStep, row * gridStep], c: RoadPlanPoint = [(column + 1) * gridStep, (row + 1) * gridStep], d: RoadPlanPoint = [column * gridStep, (row + 1) * gridStep];
      for (const triangle of [[a, b, c], [a, c, d]] as Array<[RoadPlanPoint, RoadPlanPoint, RoadPlanPoint]>) {
        for (const clipped of localRegion.clipTriangle(triangle)) triangulate(clipped, sharedVertex, vertices => { if (appendTriangle(vertices)) junctionTriangleCount++; });
      }
    }
  }

  const gatewayVertexStart = positions.length / 3;
  for (const plan of gatewayPlans) {
    const color = rgb(paletteColor(plan.colorToken));
    const vertices = plan.polygon[0].slice(0, -1).map(([x, z]): SourceVertex => ({ x, y: options.isBridgeDeck(x, z) ? options.bridge.entrySurfaceY : heightAt(x, z), z, color, across: 0, along: 0, classCode: ROAD_CLASS_CODES.shared }));
    for (const ids of [[0, 1, 2], [0, 2, 3]]) if (appendTriangle(ids.map(index => vertices[index]) as [SourceVertex, SourceVertex, SourceVertex], 1)) gatewayTriangleCount++;
  }
  const stitched = stitchRoadInterfaces(positions, colors, frames, classes, indices, roadTriangleCount, junctionTriangleCount, gatewayVertexStart, heightCache);
  roadTriangleCount = stitched.roadTriangleCount; junctionTriangleCount = stitched.junctionTriangleCount;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setAttribute("roadFrame", new THREE.Float32BufferAttribute(frames, 2));
  geometry.setAttribute("roadClass", new THREE.Float32BufferAttribute(classes, 1));
  geometry.setIndex(stitched.indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData = {
    routeProfiles: options.routes.map(route => ({ ...options.profiles[route.route.kind], id: route.route.id, scope: route.route.scope, kind: route.route.kind, widthMeters: route.route.widthMeters, totalLength: route.totalLength })),
    compiledRouteCount: options.routes.length, roadTriangleCount, junctionTriangleCount, bridgeGatewayTriangleCount: gatewayTriangleCount,
    bridgeGatewayBandCount: gatewayPlans.length, bridgeGatewayVertexStart: stitched.gatewayVertexStart, bridgeGatewayVertexCount: positions.length / 3 - stitched.gatewayVertexStart, bridgeGatewayHeight: options.bridge.entrySurfaceY,
    interfaceStitching: { adjustedVertexCount: stitched.adjustedVertexCount, insertedVertexCount: stitched.insertedVertexCount, repairedInterfaceDiagonals: stitched.repairedInterfaceDiagonals, maximumHeightLiftMeters: stitched.maximumHeightLiftMeters, maximumHeightLiftPoint: stitched.maximumHeightLiftPoint },
    maximumMiterScale, roundedCapCount, transverseBaseStationCount: 9, maximumTransverseStationCount: maximumStationCount, sourceTriangleCount,
    junctionPatchCount: footprint.sharedRegion.polygons.length, junctionSurfaceKinds: footprint.junctions.map(junction => junction.surface),
    footprintAreaSquareMeters: footprint.sourceCorridorAreaSquareMeters
  };
  return geometry;
}

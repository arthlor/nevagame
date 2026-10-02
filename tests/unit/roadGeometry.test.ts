import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BRIDGE_WORLD_PROFILE,
  COMPILED_WORLD_ROUTES,
  TERRAIN_RESOLUTION,
  TERRAIN_SIZE_METERS,
  WORLD_LAYOUT_V5,
  WORLD_PATHS,
  WORLD_ROUTE_JUNCTIONS,
  WORLD_ROUTE_NETWORK,
  WORLD_ROUTE_PROFILES,
  WorldLayout
} from "../../src/world/WorldLayout";
import { buildOrganicRoadGeometry, roadTransverseStations, sampleRoadCrossSection } from "../../src/world/RoadGeometry";
import { compileRoadFootprint, roadOffsetJoin } from "../../src/world/RoadFootprint";
import { ROAD_WHEEL_GAUGE_METERS } from "../../src/world/RoadClasses";

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function vertex(positions: PositionAttribute, index: number): [number, number, number] {
  return [positions.getX(index), positions.getY(index), positions.getZ(index)];
}

function triangleAreaSquared(
  positions: PositionAttribute,
  a: number,
  b: number,
  c: number
): number {
  const first = vertex(positions, a);
  const second = vertex(positions, b);
  const third = vertex(positions, c);
  const ab = [second[0] - first[0], second[1] - first[1], second[2] - first[2]];
  const ac = [third[0] - first[0], third[1] - first[1], third[2] - first[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  return cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2;
}

function authoredRoadGeometry(): THREE.BufferGeometry {
  const center = WORLD_LAYOUT_V5.anchors.bridge;
  const halfSpan = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
  return buildOrganicRoadGeometry({
    routes: COMPILED_WORLD_ROUTES,
    junctions: WORLD_ROUTE_JUNCTIONS,
    profiles: WORLD_ROUTE_PROFILES,
    bridge: {
      center,
      halfSpan,
      deckWidth: BRIDGE_WORLD_PROFILE.deckWidth,
      entrySurfaceY: BRIDGE_WORLD_PROFILE.entrySurfaceY,
      westDeckEdge: { x: center.x - halfSpan, z: center.z },
      eastDeckEdge: { x: center.x + halfSpan, z: center.z },
      gatewayDepthMeters: BRIDGE_WORLD_PROFILE.gatewayDepthMeters,
      gatewayInsetMeters: BRIDGE_WORLD_PROFILE.gatewayInsetMeters,
      gatewaySlabCount: BRIDGE_WORLD_PROFILE.gatewaySlabCount,
      gatewaySlabGapMeters: BRIDGE_WORLD_PROFILE.gatewaySlabGapMeters
    },
    heightAt: (x, z) => WorldLayout.terrainHeight(x, z),
    isBridgeDeck: (x, z) => WorldLayout.isBridgeDeck(x, z)
  });
}

/**
 * Reconstructs the collider plane a road must sit on. Each island has its own
 * terrain patch with its own origin and grid step — Neva is 600 m / 384, and
 * Sunreach is 360 m / 256 — so the plane has to be rebuilt on the patch that
 * actually owns the point. Read the canonical heightfield rather than raw
 * height samples: patch-edge vertices are stitched to adjacent coarse grids.
 */
function baseTerrainPlaneSampler(): (x: number, z: number) => number {
  const heightfields = new Map<string, Float32Array>();
  return (x, z) => {
    const patch = WorldLayout.terrainPatchAt(x, z);
    const size = patch?.sizeMeters ?? TERRAIN_SIZE_METERS;
    const resolution = patch?.resolution ?? TERRAIN_RESOLUTION;
    const centerX = patch?.center.x ?? 0;
    const centerZ = patch?.center.z ?? 0;
    const step = size / resolution;
    const minimumX = centerX - size * 0.5;
    const minimumZ = centerZ - size * 0.5;
    const patchId = patch?.id ?? "terrain.neva";
    let heightfield = heightfields.get(patchId);
    if (!heightfield) {
      heightfield = WorldLayout.terrainBaseHeightfieldForPatch(patchId);
      heightfields.set(patchId, heightfield);
    }
    const height = (column: number, row: number): number => {
      // Heightfield rows run along X and columns along Z in Rapier.
      return heightfield![column * (resolution + 1) + row];
    };
    const column = THREE.MathUtils.clamp(Math.floor((x - minimumX) / step), 0, resolution - 1);
    const row = THREE.MathUtils.clamp(Math.floor((z - minimumZ) / step), 0, resolution - 1);
    const u = (x - minimumX - column * step) / step;
    const v = (z - minimumZ - row * step) / step;
    const a = height(column, row);
    const b = height(column, row + 1);
    const c = height(column + 1, row + 1);
    const d = height(column + 1, row);
    return u + v <= 1
      ? a + u * (d - a) + v * (b - a)
      : c + (1 - u) * (b - c) + (1 - v) * (d - c);
  };
}

function float32SpatialRadius(values: readonly number[]): number {
  const ulp = (value: number): number => 2 ** Math.max(-149, Math.floor(Math.log2(Math.abs(value))) - 23);
  const x = Math.max(...values.filter((_, index) => index % 2 === 0).map(ulp));
  const z = Math.max(...values.filter((_, index) => index % 2 === 1).map(ulp));
  return Math.hypot(x * 0.5, z * 0.5);
}

function indexedRoadSurface(geometry: THREE.BufferGeometry) {
  type Triangle = [number[], number[], number[]];
  const cells = new Map<string, Triangle[]>();
  const centroids: Array<[number, number, number]> = [];
  const positions = geometry.getAttribute("position");
  const indices = geometry.getIndex()!;
  const cellSize = TERRAIN_SIZE_METERS / TERRAIN_RESOLUTION;
  let area = 0;
  for (let offset = 0; offset < indices.count; offset += 3) {
    const triangle: Triangle = [
      vertex(positions, indices.getX(offset)),
      vertex(positions, indices.getX(offset + 1)),
      vertex(positions, indices.getX(offset + 2))
    ];
    const [a, b, c] = triangle;
    centroids.push([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]);
    area += Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) * 0.5;
    const radius = float32SpatialRadius([a[0], a[2], b[0], b[2], c[0], c[2]]) * 2;
    const firstX = Math.floor((Math.min(a[0], b[0], c[0]) - radius) / cellSize);
    const lastX = Math.floor((Math.max(a[0], b[0], c[0]) + radius) / cellSize);
    const firstZ = Math.floor((Math.min(a[2], b[2], c[2]) - radius) / cellSize);
    const lastZ = Math.floor((Math.max(a[2], b[2], c[2]) + radius) / cellSize);
    for (let x = firstX; x <= lastX; x++) {
      for (let z = firstZ; z <= lastZ; z++) {
        const key = `${x}:${z}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(triangle);
        cells.set(key, bucket);
      }
    }
  }
  return {
    area,
    centroids,
    heightAt(x: number, z: number): number {
      let highest = Number.NEGATIVE_INFINITY;
      let nearest = Number.NEGATIVE_INFINITY;
      for (const [a, b, c] of cells.get(`${Math.floor(x / cellSize)}:${Math.floor(z / cellSize)}`) ?? []) {
        const determinant = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / determinant;
        const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / determinant;
        const wc = 1 - wa - wb;
        if (Math.min(wa, wb, wc) >= 0) {
          highest = Math.max(highest, a[1] * wa + b[1] * wb + c[1] * wc);
          continue;
        }
        // Added cuts round to Float32 and can move a contour by half an ULP
        // per axis. Bound membership in metres, rather than barycentric units
        // whose spatial meaning varies arbitrarily with a triangle's altitude.
        const radius = float32SpatialRadius([x, z, a[0], a[2], b[0], b[2], c[0], c[2]]);
        let nearestDistance = Infinity, nearestHeight = Number.NEGATIVE_INFINITY;
        for (const [start, end] of [[a, b], [b, c], [c, a]]) {
          const dx = end[0] - start[0], dz = end[2] - start[2];
          const t = THREE.MathUtils.clamp(((x - start[0]) * dx + (z - start[2]) * dz) / (dx * dx + dz * dz), 0, 1);
          const distance = Math.hypot(x - start[0] - t * dx, z - start[2] - t * dz);
          if (distance < nearestDistance) { nearestDistance = distance; nearestHeight = start[1] + t * (end[1] - start[1]); }
        }
        if (nearestDistance <= radius) nearest = Math.max(nearest, nearestHeight);
      }
      // A real triangle interior owns support. The bounded edge fallback is
      // only for a contour gap caused by stored Float32 cut coordinates.
      return Number.isFinite(highest) ? highest : nearest;
    }
  };
}

describe("Organic road geometry", () => {
  it("samples an actual face interior before an unrelated nearby rounded edge", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      400, 0, 0, 401, 0, 0, 400, 0, 1,
      400, 2, -0.00003, 401, 2, -0.00003, 400, 2, -0.000001
    ], 3));
    geometry.setIndex([0, 2, 1, 3, 5, 4]);
    const x = 400.25, z = 0.000001;
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    const support = ray.intersectObject(mesh)[0];
    expect(support.point.y).toBe(0);
    expect(indexedRoadSurface(geometry).heightAt(x, z)).toBe(support.point.y);
    geometry.dispose(); material.dispose();
  });
  it("fills free route-end caps continuously across their diameter", () => {
    const geometry = authoredRoadGeometry();
    const surface = indexedRoadSurface(geometry);
    let checked = 0;
    try {
      for (const route of COMPILED_WORLD_ROUTES) {
        for (const [sampleIndex, sign] of [[0, -1], [route.samples.length - 1, 1]]) {
          const sample = route.samples[sampleIndex];
          const joined = WORLD_ROUTE_JUNCTIONS.some((junction) =>
            junction.routeIds.includes(route.route.id)
            && Math.hypot(sample.point.x - junction.center.x, sample.point.z - junction.center.z)
              <= junction.radiusMeters + junction.blendLengthMeters * 0.72
          );
          if (joined || WorldLayout.isBridgeDeck(sample.point.x, sample.point.z)) continue;
          const radius = route.halfWidth + route.shoulderWidthMeters;
          for (const forward of [0.05, 0.15, 0.3]) for (const side of [-0.3, 0, 0.3]) {
            const x = sample.point.x + sample.tangent.x * sign * radius * forward + sample.normal.x * radius * side;
            const z = sample.point.z + sample.tangent.z * sign * radius * forward + sample.normal.z * radius * side;
            expect(Number.isFinite(surface.heightAt(x, z)), `${route.route.id} end ${sampleIndex} at ${x}, ${z}`).toBe(true);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(100);
    } finally { geometry.dispose(); }
  });

  it("does not inflate collapsed interface faces into overlapping source bubbles", () => {
    const geometry = authoredRoadGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    // Rounded ownership contacts formerly produced a closed, eight-face fan
    // with no footprint boundary and five source interiors at this point.
    for (const [x, z] of [[-396.66542561848956, 55.167948404947914], [-21.798885345458984, 20.874632517496746], [85.93096923828125, 54.4818229675293]]) {
      ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
      const hits = ray.intersectObject(mesh);
      expect(hits, `source interiors at ${x},${z}`).toHaveLength(1);
      expect(Number.isFinite(hits[0].point.y)).toBe(true);
    }
    geometry.dispose(); material.dispose();
  });

  it("paves the wedge between roads that meet", () => {
    const geometry = authoredRoadGeometry();
    const surface = indexedRoadSurface(geometry);
    const junction = WORLD_ROUTE_JUNCTIONS.find((candidate) => candidate.routeIds.length >= 3
      && candidate.id.startsWith("mainland-junction:"));
    if (!junction) throw new Error("No multi-road mainland junction");
    let pavedOffRoad = 0;
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const x = junction.center.x + Math.cos(angle) * 3.4;
      const z = junction.center.z + Math.sin(angle) * 3.4;
      if (WorldLayout.nearestRouteDistance(x, z).distance < 1.1) continue;
      if (Number.isFinite(surface.heightAt(x, z))) pavedOffRoad++;
    }
    expect(pavedOffRoad).toBeGreaterThan(0);
    geometry.dispose();
  });

  it("samples a smooth nonnegative crown, shoulder and feather; wheel tracks never cut the collider", () => {
    const profile = WORLD_ROUTE_PROFILES.arterial;
    const halfWidth = profile.widthMeters * 0.5;
    const sampleAt = (lateralDistanceMeters: number) => sampleRoadCrossSection({
      profile,
      halfWidthMeters: halfWidth,
      lateralDistanceMeters
    });
    const center = sampleAt(0);
    const leftTrack = sampleAt(-ROAD_WHEEL_GAUGE_METERS * 0.5);
    const rightTrack = sampleAt(ROAD_WHEEL_GAUGE_METERS * 0.5);
    const shoulder = sampleAt(halfWidth + profile.shoulderWidthMeters);
    const feather = sampleAt(halfWidth + profile.shoulderWidthMeters + profile.terrainFeatherMeters);

    expect(center.surfaceOffsetMeters).toBeCloseTo(profile.crownMeters, 4);
    expect(leftTrack).toEqual(rightTrack);
    // The crown falls steadily to the edge: no groove under either wheel track.
    let previous = Infinity;
    for (let lateral = 0; lateral <= halfWidth; lateral += 0.05) {
      const offset = sampleAt(lateral).surfaceOffsetMeters;
      expect(offset).toBeLessThanOrEqual(previous + 1e-9);
      previous = offset;
    }
    expect(shoulder.surfaceOffsetMeters).toBe(0);
    expect(feather.surfaceOffsetMeters).toBe(0);
    for (const sample of [center, leftTrack, shoulder, feather]) {
      expect(sample.surfaceOffsetMeters).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every road vertex its own across/along frame and class, exact through terrain conformity", () => {
    const geometry = WorldLayout.buildPathGeometry();
    try {
      const positions = geometry.getAttribute("position");
      const frames = geometry.getAttribute("roadFrame");
      const context = geometry.getAttribute("roadContext");
      expect(frames.itemSize).toBe(2);
      expect(context.itemSize).toBe(3);
      expect(geometry.getAttribute("roadClass")).toBeUndefined();
      expect(WorldLayout.buildPathCollisionGeometry().getAttribute("roadFrame")).toBeUndefined();
      const farm = COMPILED_WORLD_ROUTES.find((route) => route.route.id === "farm-village")!;
      let checked = 0;
      for (let index = 0; index < positions.count && checked < 400; index++) {
        const classCode = Math.round(context.getX(index) * 3);
        if (classCode !== 0) continue;
        const x = positions.getX(index), z = positions.getZ(index);
        const route = WorldLayout.nearestRouteDistance(x, z);
        if (route.route.id !== "farm-village" || route.distance > route.halfWidth) continue;
        // Away from bends and junctions, the across coordinate is the true offset.
        const sample = farm.samples.reduce((best, candidate) =>
          Math.hypot(candidate.point.x - x, candidate.point.z - z) < Math.hypot(best.point.x - x, best.point.z - z) ? candidate : best);
        const signed = (x - route.point.x) * sample.normal.x + (z - route.point.z) * sample.normal.z;
        if (WORLD_ROUTE_JUNCTIONS.some((junction) => Math.hypot(x - junction.center.x, z - junction.center.z) < 12)) continue;
        expect(Math.abs(frames.getX(index)), `${x},${z}`).toBeCloseTo(Math.abs(signed), 1);
        expect(Math.sign(frames.getX(index)) === Math.sign(signed) || Math.abs(signed) < 0.05, `${x},${z}`).toBe(true);
        checked++;
      }
      expect(checked).toBeGreaterThan(100);
    } finally { geometry.dispose(); }
  });

  it("compiles one deterministic centerline network with route-relative samples", () => {
    expect(COMPILED_WORLD_ROUTES).toHaveLength(WORLD_ROUTE_NETWORK.length);
    expect(WorldLayout.compiledRouteNetwork()).toBe(COMPILED_WORLD_ROUTES);

    for (const [routeIndex, compiledRoute] of COMPILED_WORLD_ROUTES.entries()) {
      expect(compiledRoute.samples.map((sample) => sample.point)).toEqual(WORLD_PATHS[routeIndex]);
      expect(compiledRoute.totalLength).toBeGreaterThan(0);
      expect(compiledRoute.corridorRadiusMeters).toBeCloseTo(
        compiledRoute.halfWidth
          + WORLD_ROUTE_PROFILES[compiledRoute.route.kind].shoulderWidthMeters
          + WORLD_ROUTE_PROFILES[compiledRoute.route.kind].terrainFeatherMeters,
        8
      );
      for (let index = 0; index < compiledRoute.samples.length; index++) {
        const sample = compiledRoute.samples[index];
        expect(Math.hypot(sample.tangent.x, sample.tangent.z)).toBeCloseTo(1, 5);
        expect(Math.hypot(sample.normal.x, sample.normal.z)).toBeCloseTo(1, 5);
        expect(sample.distanceAlongRoute).toBeGreaterThanOrEqual(
          index === 0 ? 0 : compiledRoute.samples[index - 1].distanceAlongRoute
        );
      }
    }
  });

  it("builds finite non-degenerate triangles with bounded joins, caps, and shoulders", () => {
    const first = WorldLayout.buildPathGeometry();
    const second = WorldLayout.buildPathGeometry();
    expect(Array.from(first.getAttribute("position").array)).toEqual(
      Array.from(second.getAttribute("position").array)
    );
    expect(Array.from(first.getIndex()!.array)).toEqual(Array.from(second.getIndex()!.array));
    expect(first.getAttribute("normal").count).toBe(first.getAttribute("position").count);
    expect(first.getAttribute("color").count).toBe(first.getAttribute("position").count);
    expect(first.getAttribute("color").itemSize).toBe(4);
    const roadColors = first.getAttribute("color");
    const opacities = Array.from({ length: roadColors.count }, (_, index) => roadColors.getW(index));
    expect(opacities.reduce((minimum, opacity) => Math.min(minimum, opacity), Infinity)).toBeLessThan(0.1);
    expect(opacities.reduce((maximum, opacity) => Math.max(maximum, opacity), -Infinity)).toBe(1);
    expect(Array.from(first.getAttribute("normal").array)).toEqual(
      Array.from(second.getAttribute("normal").array)
    );
    expect(first.userData.maximumMiterScale).toBeLessThanOrEqual(1.28);
    expect(first.userData.roundedCapCount).toBeGreaterThan(0);
    expect(first.userData.roadTriangleCount).toBeGreaterThan(0);
    expect(first.userData.transverseBaseStationCount).toBe(9);
    expect(first.userData.maximumTransverseStationCount).toBeGreaterThanOrEqual(9);
    expect(first.userData.junctionPatchCount).toBeGreaterThan(0);
    expect(first.userData.junctionTriangleCount).toBeGreaterThanOrEqual(first.userData.terrainConformity.sourceJunctionTriangleCount);

    const positions = first.getAttribute("position");
    const junction = WORLD_ROUTE_JUNCTIONS[0];
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < positions.count; index++) {
      const distance = Math.hypot(positions.getX(index) - junction.center.x, positions.getZ(index) - junction.center.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    expect(nearestDistance).toBeLessThan(junction.radiusMeters);
    expect(roadColors.getW(nearest)).toBe(1);
    for (let index = 0; index < positions.count * 3; index++) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    const triangles = first.getIndex()!;
    for (let index = 0; index < triangles.count; index += 3) {
      const a = triangles.getX(index);
      const b = triangles.getX(index + 1);
      const c = triangles.getX(index + 2);
      // Exact plane intersections can produce valid sub-millimetre triangles;
      // reject float32 degeneracy, not a world-space minimum facet size.
      expect(triangleAreaSquared(positions, a, b, c)).toBeGreaterThan(0);
      const firstVertex = vertex(positions, a);
      const secondVertex = vertex(positions, b);
      const thirdVertex = vertex(positions, c);
      const ab = [
        secondVertex[0] - firstVertex[0],
        secondVertex[1] - firstVertex[1],
        secondVertex[2] - firstVertex[2]
      ];
      const ac = [
        thirdVertex[0] - firstVertex[0],
        thirdVertex[1] - firstVertex[1],
        thirdVertex[2] - firstVertex[2]
      ];
      expect(ab[2] * ac[0] - ab[0] * ac[2]).toBeGreaterThan(0);
    }
    first.dispose();
    second.dispose();
  }, 60000);

  it("keeps the bridge deck empty, gateways unchanged and retained authored nodes on canonical heights", () => {
    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const triangles = geometry.getIndex()!;
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const halfSpan = BRIDGE_WORLD_PROFILE.spanLength * 0.5;
    const halfDeckWidth = BRIDGE_WORLD_PROFILE.deckWidth * 0.5;

    for (let index = 0; index < triangles.count; index += 3) {
      const indices = [triangles.getX(index), triangles.getX(index + 1), triangles.getX(index + 2)];
      const fullyInsideDeck = indices.every((vertexIndex) => {
        const x = positions.getX(vertexIndex);
        const z = positions.getZ(vertexIndex);
        return Math.abs(x - bridge.x) < halfSpan && Math.abs(z - bridge.z) < halfDeckWidth;
      });
      expect(fullyInsideDeck).toBe(false);
    }

    const gatewayStart = geometry.userData.bridgeGatewayVertexStart as number;
    const gatewayCount = geometry.userData.bridgeGatewayVertexCount as number;
    const gatewayIndices = geometry.getIndex()!;
    expect(gatewayCount).toBe(BRIDGE_WORLD_PROFILE.gatewaySlabCount * 2 * 4);
    for (let index = gatewayStart; index < gatewayStart + gatewayCount; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      expect(WorldLayout.isBridgeDeck(x, z)).toBe(false);
      expect(y).toBeCloseTo(WorldLayout.terrainHeight(x, z), 5);
    }
    expect(geometry.userData.bridgeGatewayHeight).toBeCloseTo(
      BRIDGE_WORLD_PROFILE.entrySurfaceY,
      5
    );
    for (let index = 0; index < gatewayIndices.count; index += 3) {
      const triangle = [gatewayIndices.getX(index), gatewayIndices.getX(index + 1), gatewayIndices.getX(index + 2)];
      if (!triangle.every((vertexIndex) => vertexIndex >= gatewayStart && vertexIndex < gatewayStart + gatewayCount)) continue;
      const first = vertex(positions, triangle[0]);
      const second = vertex(positions, triangle[1]);
      const third = vertex(positions, triangle[2]);
      const ab = [second[0] - first[0], second[1] - first[1], second[2] - first[2]];
      const ac = [third[0] - first[0], third[1] - first[1], third[2] - first[2]];
      expect(ab[2] * ac[0] - ab[0] * ac[2]).toBeGreaterThan(0);
    }

    const authored = authoredRoadGeometry();
    const authoredPositions = authored.getAttribute("position");
    const footprint = compileRoadFootprint({ routes: COMPILED_WORLD_ROUTES, junctions: WORLD_ROUTE_JUNCTIONS, profiles: WORLD_ROUTE_PROFILES,
      bridge: { center: bridge, halfSpan, deckWidth: BRIDGE_WORLD_PROFILE.deckWidth, gatewayDepthMeters: BRIDGE_WORLD_PROFILE.gatewayDepthMeters, gatewayInsetMeters: BRIDGE_WORLD_PROFILE.gatewayInsetMeters, gatewaySlabCount: BRIDGE_WORLD_PROFILE.gatewaySlabCount, gatewaySlabGapMeters: BRIDGE_WORLD_PROFILE.gatewaySlabGapMeters } });
    const nodeKey = (x: number, z: number): string => `${Math.fround(x)},${Math.fround(z)}`;
    const canonicalNodes = new Set<string>();
    for (const [routeIndex, route] of COMPILED_WORLD_ROUTES.entries()) {
      // Self-overlapping/folded routes replace some original nodes with cuts
      // of an earlier plane at the same coordinate. Their retained plane and
      // disjoint coverage are checked independently in roadFootprint.test.ts.
      if (footprint.routeFoldedSpans[routeIndex].some(Boolean) || footprint.routeSpanRegions[routeIndex].some(Boolean)) continue;
      const stations = roadTransverseStations(WORLD_ROUTE_PROFILES[route.route.kind], route.halfWidth);
      const addNode = (x: number, z: number): void => {
        const owner = footprint.routeRegions[routeIndex], sharedOwner = footprint.sharedRouteRegions[routeIndex];
        // A source node touching an ownership boundary may have only a
        // zero-area contact after clipping; the other owner's plane can then
        // occupy the same coordinate. Check retained interior sample nodes.
        if (Math.max(owner.signedDistance(x, z), sharedOwner.signedDistance(x, z)) > 0.00001) canonicalNodes.add(nodeKey(x, z));
      };
      for (const [sampleIndex, sample] of route.samples.entries()) {
        const join = roadOffsetJoin(route, sampleIndex);
        for (const across of stations) addNode(Math.fround(sample.point.x + join.normal.x * across * join.miterScale), Math.fround(sample.point.z + join.normal.z * across * join.miterScale));
      }
      for (const [capIndex, sample] of [route.samples[0], route.samples.at(-1)!].entries()) {
        const addCapNode = (x: number, z: number): void => { if (footprint.routeCapRegions[routeIndex][capIndex].signedDistance(x, z) > 0.00001) addNode(x, z); };
        addCapNode(Math.fround(sample.point.x), Math.fround(sample.point.z));
        for (const radius of stations.filter(value => value > 0)) for (let step = 0; step < 16; step++) {
          const angle = step / 16 * Math.PI * 2;
          addCapNode(Math.fround(sample.point.x + Math.cos(angle) * radius), Math.fround(sample.point.z + Math.sin(angle) * radius));
        }
      }
    }
    for (const polygon of footprint.sharedRemainderRegion.polygons) {
      const xs = polygon[0].map(point => point[0]), zs = polygon[0].map(point => point[1]);
      for (let x = Math.floor(Math.min(...xs) * 2) / 2; x <= Math.ceil(Math.max(...xs) * 2) / 2; x += 0.5) {
        for (let z = Math.floor(Math.min(...zs) * 2) / 2; z <= Math.ceil(Math.max(...zs) * 2) / 2; z += 0.5) if (footprint.sharedRemainderRegion.contains(x, z)) canonicalNodes.add(nodeKey(x, z));
      }
    }
    const stone = new THREE.BufferGeometry();
    stone.setAttribute("position", authoredPositions);
    const gatewayOffset = (authored.userData.roadTriangleCount + authored.userData.junctionTriangleCount) * 3;
    stone.setIndex(Array.from(authored.getIndex()!.array).slice(gatewayOffset));
    const stoneSurface = indexedRoadSurface(stone);
    const checkedAuthoredNodes = new Map<string, { x: number; z: number; y: number; error: number }>();
    for (let index = 0; index < authoredPositions.count; index++) {
      const x = authoredPositions.getX(index);
      const y = authoredPositions.getY(index);
      const z = authoredPositions.getZ(index);
      if (!WorldLayout.isBridgeDeck(x, z)) {
        const stoneHeight = stoneSurface.heightAt(x, z);
        // The soil boundary follows the preserved slab plane, whose four
        // corners intentionally do not reproduce the road crown between them.
        if (Number.isFinite(stoneHeight)) expect(y).toBeCloseTo(stoneHeight, 5);
        else if (canonicalNodes.has(nodeKey(x, z))) {
          const key = nodeKey(x, z), error = Math.abs(y - WorldLayout.terrainHeight(x, z));
          // A folded span can also cut another source plane at this X/Z.
          // Verify the retained directly authored node, while the cut remains
          // covered by the separate source-plane interpolation regression.
          if (error < (checkedAuthoredNodes.get(key)?.error ?? Infinity)) checkedAuthoredNodes.set(key, { x, z, y, error });
        }
      } else {
        expect(y).toBeGreaterThan(0.5);
      }
    }
    for (const { x, z, y } of checkedAuthoredNodes.values()) expect(y, `authored sample at ${x},${z}`).toBeCloseTo(WorldLayout.terrainHeight(x, z), 5);
    expect(checkedAuthoredNodes.size).toBeGreaterThan(10000);
    stone.dispose();
    authored.dispose();
    geometry.dispose();
  }, 60000);

  it("keeps junction feathering cosmetic and joined cores opaque", () => {
    const render = WorldLayout.buildPathGeometry();
    const collision = WorldLayout.buildPathCollisionGeometry();
    expect(render.getAttribute("position").array).toEqual(collision.getAttribute("position").array);
    expect(render.index?.array).toEqual(collision.index?.array);
    const positions = render.getAttribute("position");
    const colors = render.getAttribute("color");
    expect(Object.keys(collision.attributes)).toEqual(["position"]);
    const context = render.getAttribute("roadContext");
    expect(context.count).toBe(positions.count);
    expect(context.itemSize).toBe(3);
    expect(context.normalized).toBe(true);
    expect(context.array).toBeInstanceOf(Uint8Array);
    expect(collision.getAttribute("roadContext")).toBeUndefined();
    let looseShoulder = 0;
    let softened = 0;
    let coreSamples = 0;
    const useSamples = { arterial: 0, lane: 0, trail: 0, shared: 0, junction: 0 };
    for (let index = 0; index < positions.count; index++) {
      const alpha = colors.getW(index);
      for (const component of [context.getX(index), context.getY(index), context.getZ(index)]) {
        expect(component).toBeGreaterThanOrEqual(0);
        expect(component).toBeLessThanOrEqual(1);
      }
      const classCode = Math.round(context.getX(index) * 3);
      expect(Math.abs(context.getX(index) * 3 - classCode)).toBeLessThan(0.01);
      useSamples[(["arterial", "lane", "trail", "shared"] as const)[classCode]]++;
      if (context.getZ(index) > 0.5) useSamples.junction++;
      if (context.getY(index) > 0.8) looseShoulder++;
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThanOrEqual(1);
      const footprint = WorldLayout.roadFootprintSample(positions.getX(index), positions.getZ(index));
      expect(Math.abs(alpha - footprint.coverage)).toBeLessThanOrEqual(0.5 / 255 + 1e-7);
      if (alpha > 0 && alpha < 0.8) softened++;
      for (const junction of WORLD_ROUTE_JUNCTIONS) {
        if (Math.hypot(positions.getX(index) - junction.center.x,
          positions.getZ(index) - junction.center.z) < Math.max(0.72, junction.radiusMeters * 0.74) * 0.68) {
          expect(alpha).toBeCloseTo(1);
          coreSamples++;
        }
      }
    }
    expect(looseShoulder).toBeGreaterThan(0);
    expect(softened).toBeGreaterThan(0);
    expect(coreSamples).toBeGreaterThan(0);
    expect(useSamples.arterial).toBeGreaterThan(0);
    expect(useSamples.lane).toBeGreaterThan(0);
    expect(useSamples.trail).toBeGreaterThan(0);
    expect(useSamples.shared).toBeGreaterThan(0);
    expect(useSamples.junction).toBeGreaterThan(0);
    render.dispose();
    collision.dispose();
  }, 60000);

  it("removes buried road faces without changing the existing road-plus-base collision envelope", () => {
    const authored = authoredRoadGeometry();
    const conformed = WorldLayout.buildPathGeometry();
    const before = indexedRoadSurface(authored);
    const after = indexedRoadSurface(conformed);
    const baseHeightAt = baseTerrainPlaneSampler();
    let maximumHeightChange = 0;
    let maximumHeightChangeAt: [number, number] = [0, 0];
    let maximumBurial = 0;
    let maximumAddedHeight = 0;
    let maximumAddedHeightAt: [number, number] = [0, 0];
    for (const [x, , z] of before.centroids) {
      const base = baseHeightAt(x, z);
      const change = Math.abs(
        Math.max(base, before.heightAt(x, z)) - Math.max(base, after.heightAt(x, z))
      );
      if (change > maximumHeightChange) {
        maximumHeightChange = change;
        maximumHeightChangeAt = [x, z];
      }
    }
    const roadCount = conformed.userData.roadTriangleCount + conformed.userData.junctionTriangleCount;
    for (const [index, [x, y, z]] of after.centroids.entries()) {
      const base = baseHeightAt(x, z);
      const previousEnvelope = Math.max(base, before.heightAt(x, z));
      if (y - previousEnvelope > maximumAddedHeight) { maximumAddedHeight = y - previousEnvelope; maximumAddedHeightAt = [x, z]; }
      // Gateway slabs are intentionally separate from the ground ribbon.
      if (index < roadCount) maximumBurial = Math.max(maximumBurial, base - y);
    }
    // At mainland coordinates near 600 m, Float32 road X/Z vertices round by
    // several ten-thousandths of a metre before barycentric interpolation.
    expect(maximumHeightChange, `at ${maximumHeightChangeAt.join(", ")}`).toBeLessThan(0.0001);
    // Terrain-grid conformity may lift the ribbon by a sub-millimetre drape
    // where Sunreach's coarser patch grid (360 m / 256) resamples sloped
    // ground (measured 0.85 mm at 1323, 150); traversal still resolves from
    // these exact conformed triangles, so the gameplay envelope is unchanged.
    expect(maximumAddedHeight, `at ${maximumAddedHeightAt.join(", ")}`).toBeLessThan(0.001);
    expect(maximumBurial).toBeLessThan(0.00002);
    // Multi-patch terrain conformity resamples sloped ground per island grid;
    // the resulting sub-cm² area delta (measured 0.00067 on 10,871 m²) is
    // grid drape, not added or removed road.
    expect(Math.abs(after.area - before.area)).toBeLessThan(0.005);
    authored.dispose();
    conformed.dispose();
  }, 60000);

  it("resolves traversal support from the exact base triangles and conformed road triangles", () => {
    const geometry = WorldLayout.buildPathGeometry();
    const road = indexedRoadSurface(geometry);
    const baseHeightAt = baseTerrainPlaneSampler();
    const stride = Math.max(1, Math.floor(road.centroids.length / 96));
    for (let index = 0; index < road.centroids.length; index += stride) {
      const [x, , z] = road.centroids[index];
      if (WorldLayout.isBridgeDeck(x, z) || WorldLayout.isPierDeck(x, z) || WorldLayout.isInterior(x, z)) continue;
      const roadHeight = road.heightAt(x, z);
      const expectedHeight = Math.max(baseHeightAt(x, z), roadHeight);
      const sample = WorldLayout.traversalSurfaceSample(x, z);
      expect(sample.height).toBeCloseTo(expectedHeight, 5);
      expect(sample.source).toBe("road");
      expect(Math.hypot(sample.normal.x, sample.normal.y, sample.normal.z)).toBeCloseTo(1, 6);
    }

    const openTerrain = WorldLayout.traversalSurfaceSample(-145, -125);
    expect(openTerrain.height).toBeCloseTo(baseHeightAt(-145, -125), 6);
    expect(openTerrain.source).toBe("terrain");

    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    expect(WorldLayout.traversalSurfaceSample(bridge.x, bridge.z).source).toBe("bridge");
    expect(WorldLayout.traversalSurfaceSample(bridge.x, bridge.z).normal).toEqual({ x: 0, y: 1, z: 0 });
    geometry.dispose();
  }, 60000);

  it("keeps the coarse base heightfield on terrain and leaves the bridge deck to its asset collider", () => {
    const heightfield = WorldLayout.terrainBaseHeightfield();
    const stride = TERRAIN_RESOLUTION + 1;
    const bridge = WORLD_LAYOUT_V5.anchors.bridge;
    const centerColumn = Math.round((bridge.z / TERRAIN_SIZE_METERS + 0.5) * TERRAIN_RESOLUTION);
    const centerRow = Math.round((bridge.x / TERRAIN_SIZE_METERS + 0.5) * TERRAIN_RESOLUTION);
    const sampledX = (centerRow / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
    const sampledZ = (centerColumn / TERRAIN_RESOLUTION - 0.5) * TERRAIN_SIZE_METERS;
    expect(heightfield[centerRow * stride + centerColumn]).toBeCloseTo(
      WorldLayout.terrainBaseHeight(sampledX, sampledZ),
      5
    );
    expect(heightfield[centerRow * stride + centerColumn]).toBeLessThan(
      BRIDGE_WORLD_PROFILE.entrySurfaceY - 2
    );
  });

  it("exposes continuous, typed junction aprons for farm and landmark branches", () => {
    // The compact-square market adds a second village-market apron joining the
    // crossing to the stall counter on the court's south lip. Forks where one
    // road leaves another are small field or gateway aprons.
    const authored = WORLD_ROUTE_JUNCTIONS.filter((junction) => !junction.id.startsWith("mainland-"));
    expect(Object.fromEntries(authored.map((junction) => [junction.id, junction.surface]))).toEqual({
      "starter-farm-field": "field",
      "starter-farm-yard": "farm-yard",
      "farm-foothill-gateway": "landmark-gateway",
      "village-market": "village-market",
      "harbor-road-fork": "landmark-gateway",
      "village-market-apron": "village-market",
      "village-commons": "farm-yard",
      "river-crossing": "landmark-gateway",
      "bridge-west-fork": "landmark-gateway",
      "headland-walk-fork": "field",
      "lighthouse-gateway": "landmark-gateway",
      "harbor-market-gateway": "landmark-gateway",
      "harbor-landing-fork": "field"
    });
    expect(WORLD_ROUTE_JUNCTIONS.filter((junction) => junction.id.startsWith("mainland-junction:"))
      .every((junction) => junction.surface === "landmark-gateway")).toBe(true);
    // Passing places are single-road aprons on cart roads.
    const passing = WORLD_ROUTE_JUNCTIONS.filter((junction) => junction.id.startsWith("mainland-passing:"));
    expect(passing.length).toBeGreaterThan(0);
    expect(passing.every((junction) => junction.surface === "field" && junction.routeIds.length === 1
      && WORLD_ROUTE_NETWORK.find((route) => route.id === junction.routeIds[0])?.kind === "arterial")).toBe(true);
    for (const junction of WORLD_ROUTE_JUNCTIONS) {
      expect(junction.blendLengthMeters).toBeGreaterThan(0);
      expect(WorldLayout.pathInfluence(junction.center.x, junction.center.z)).toBeGreaterThan(0.9);
      // The compiled nested boundary follows the actual road outlines, so its
      // loose shoulder need not reach an arbitrary radial apron distance.
      let shoulderSamples = 0;
      const reach = junction.radiusMeters + junction.blendLengthMeters;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        const x = junction.center.x + Math.cos(angle) * reach;
        const z = junction.center.z + Math.sin(angle) * reach;
        const sample = WorldLayout.roadFootprintSample(x, z);
        expect(WorldLayout.pathShoulderInfluence(x, z)).toBeCloseTo(sample.shoulder, 8);
        if (sample.shoulder > 0) shoulderSamples++;
      }
      expect(shoulderSamples).toBeGreaterThan(0);
    }
  });
});

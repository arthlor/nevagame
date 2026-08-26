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
import { sampleRoadCrossSection } from "../../src/world/RoadGeometry";

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

describe("Organic road geometry", () => {
  it("samples a deterministic nonnegative crown, paired ruts, shoulder, and feather", () => {
    const profile = WORLD_ROUTE_PROFILES.arterial;
    const sampleAt = (lateralDistanceMeters: number) => sampleRoadCrossSection({
      routeId: "farm-village",
      routeKind: "arterial",
      profile,
      halfWidthMeters: 1.9,
      lateralDistanceMeters,
      distanceAlongRouteMeters: 37.5
    });
    const center = sampleAt(0);
    const leftRut = sampleAt(-1.9 * 0.34);
    const rightRut = sampleAt(1.9 * 0.34);
    const shoulder = sampleAt(1.9 + profile.shoulderWidthMeters);
    const feather = sampleAt(1.9 + profile.shoulderWidthMeters + profile.terrainFeatherMeters);

    expect(center.surfaceOffsetMeters).toBeCloseTo(profile.crownMeters, 4);
    expect(leftRut).toEqual(rightRut);
    expect(leftRut.wheelWearMeters).toBeGreaterThan(0);
    expect(leftRut.surfaceOffsetMeters).toBeLessThan(center.surfaceOffsetMeters);
    expect(shoulder.surfaceOffsetMeters).toBe(0);
    expect(feather.surfaceOffsetMeters).toBe(0);
    for (const sample of [center, leftRut, shoulder, feather]) {
      expect(sample.surfaceOffsetMeters).toBeGreaterThanOrEqual(0);
    }
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
    expect(Math.min(...opacities)).toBeLessThan(0.1);
    expect(Math.max(...opacities)).toBe(1);
    expect(Array.from(first.getAttribute("normal").array)).toEqual(
      Array.from(second.getAttribute("normal").array)
    );
    expect(first.userData.maximumMiterScale).toBeLessThanOrEqual(1.28);
    expect(first.userData.roundedCapCount).toBeGreaterThan(0);
    expect(first.userData.roadTriangleCount).toBeGreaterThan(0);
    expect(first.userData.junctionTriangleCount).toBe(
      WORLD_ROUTE_JUNCTIONS.length * first.userData.junctionCoreSegmentCount
        + first.userData.junctionArmCount * 2
    );
    expect(first.userData.junctionCoreSegmentCount).toBe(20);
    expect(first.userData.junctionArmCount).toBeGreaterThan(WORLD_ROUTE_JUNCTIONS.length);

    const positions = first.getAttribute("position");
    for (let index = 0; index < positions.count * 3; index++) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    const triangles = first.getIndex()!;
    for (let index = 0; index < triangles.count; index += 3) {
      const a = triangles.getX(index);
      const b = triangles.getX(index + 1);
      const c = triangles.getX(index + 2);
      expect(triangleAreaSquared(positions, a, b, c)).toBeGreaterThan(0.00000001);
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
  });

  it("keeps the bridge deck empty and every terrain-owned road vertex on the canonical height", () => {
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

    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      if (!WorldLayout.isBridgeDeck(x, z)) {
        expect(y).toBeCloseTo(WorldLayout.terrainHeight(x, z), 5);
      } else {
        expect(y).toBeGreaterThan(0.5);
      }
    }
    geometry.dispose();
  });

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
    expect(WORLD_ROUTE_JUNCTIONS.map((junction) => junction.surface)).toEqual([
      "field",
      "farm-yard",
      "village-market",
      "landmark-gateway",
      "landmark-gateway",
      "landmark-gateway"
    ]);
    for (const junction of WORLD_ROUTE_JUNCTIONS) {
      expect(junction.blendLengthMeters).toBeGreaterThan(0);
      expect(WorldLayout.pathInfluence(junction.center.x, junction.center.z)).toBeGreaterThan(0.9);
      expect(WorldLayout.pathShoulderInfluence(
        junction.center.x + junction.radiusMeters + junction.blendLengthMeters * 0.75,
        junction.center.z
      )).toBeGreaterThan(0);
    }
  });
});

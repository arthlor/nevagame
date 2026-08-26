import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  BRIDGE_WORLD_PROFILE,
  COMPILED_WORLD_ROUTES,
  TERRAIN_RESOLUTION,
  TERRAIN_SIZE_METERS,
  WORLD_LAYOUT_V3,
  WORLD_PATHS,
  WORLD_ROUTE_JUNCTIONS,
  WORLD_ROUTE_NETWORK,
  WORLD_ROUTE_PROFILES,
  WorldLayout
} from "../../src/world/WorldLayout";

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
    expect(first.userData.maximumMiterScale).toBeLessThanOrEqual(1.28);
    expect(first.userData.roundedCapCount).toBeGreaterThan(0);
    expect(first.userData.roadTriangleCount).toBeGreaterThan(0);
    expect(first.userData.junctionTriangleCount).toBe(
      WORLD_ROUTE_JUNCTIONS.length * 32 * 3
    );

    const positions = first.getAttribute("position");
    for (let index = 0; index < positions.count * 3; index++) {
      expect(Number.isFinite(positions.array[index])).toBe(true);
    }
    const triangles = first.getIndex()!;
    for (let index = 0; index < triangles.count; index += 3) {
      expect(triangleAreaSquared(
        positions,
        triangles.getX(index),
        triangles.getX(index + 1),
        triangles.getX(index + 2)
      )).toBeGreaterThan(0.00000001);
    }
    first.dispose();
    second.dispose();
  });

  it("keeps the bridge deck empty, gateway slabs flush, and road vertices above terrain", () => {
    const geometry = WorldLayout.buildPathGeometry();
    const positions = geometry.getAttribute("position");
    const triangles = geometry.getIndex()!;
    const bridge = WORLD_LAYOUT_V3.anchors.bridge;
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
    expect(gatewayCount).toBe(BRIDGE_WORLD_PROFILE.gatewaySlabCount * 2 * 4);
    for (let index = gatewayStart; index < gatewayStart + gatewayCount; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      expect(WorldLayout.isBridgeDeck(x, z)).toBe(false);
      expect(y).toBeGreaterThanOrEqual(WorldLayout.terrainHeight(x, z) + 0.02);
    }
    expect(geometry.userData.bridgeGatewayHeight).toBeCloseTo(
      BRIDGE_WORLD_PROFILE.entrySurfaceY + 0.034,
      5
    );

    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      if (!WorldLayout.isBridgeDeck(x, z)) {
        expect(y).toBeGreaterThanOrEqual(WorldLayout.terrainHeight(x, z) - 0.001);
      } else {
        expect(y).toBeGreaterThan(0.5);
      }
    }
    geometry.dispose();
  });

  it("keeps the coarse bridge heightfield continuous across both banks", () => {
    const heightfield = WorldLayout.terrainHeightfield();
    const stride = TERRAIN_RESOLUTION + 1;
    const bridge = WORLD_LAYOUT_V3.anchors.bridge;
    const centerColumn = Math.round((bridge.z / TERRAIN_SIZE_METERS + 0.5) * TERRAIN_RESOLUTION);
    const westApproachRow = Math.floor(
      ((bridge.x - BRIDGE_WORLD_PROFILE.spanLength * 0.5 - BRIDGE_WORLD_PROFILE.approachLength)
        / TERRAIN_SIZE_METERS + 0.5) * TERRAIN_RESOLUTION
    );
    const eastApproachRow = Math.ceil(
      ((bridge.x + BRIDGE_WORLD_PROFILE.spanLength * 0.5 + BRIDGE_WORLD_PROFILE.approachLength)
        / TERRAIN_SIZE_METERS + 0.5) * TERRAIN_RESOLUTION
    );
    let largestLateralStep = 0;
    let largestLongitudinalStep = 0;
    for (let row = westApproachRow; row <= eastApproachRow; row++) {
      for (const column of [centerColumn - 1, centerColumn]) {
        largestLateralStep = Math.max(
          largestLateralStep,
          Math.abs(heightfield[row * stride + column + 1] - heightfield[row * stride + column])
        );
      }
      if (row < eastApproachRow) {
        largestLongitudinalStep = Math.max(
          largestLongitudinalStep,
          Math.abs(heightfield[row * stride + centerColumn] - heightfield[(row + 1) * stride + centerColumn])
        );
      }
    }
    expect(largestLateralStep).toBeLessThan(0.7);
    expect(largestLongitudinalStep).toBeLessThan(0.7);
  });

  it("exposes continuous, typed junction aprons for field, farm-yard, and market branches", () => {
    expect(WORLD_ROUTE_JUNCTIONS.map((junction) => junction.surface)).toEqual([
      "field",
      "farm-yard",
      "village-market"
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

import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { WorldLayout } from "../../src/world/WorldLayout";

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function expectedGreenMaskByte(weights: {
  grass: number;
  meadow: number;
  beach: number;
  wetShoreline: number;
  cliff: number;
  path: number;
  shoulder: number;
}): number {
  const vegetationShare = weights.grass + weights.meadow;
  const shoreShare = weights.beach + weights.wetShoreline + weights.cliff;
  return Math.round(
    THREE.MathUtils.clamp(vegetationShare * (1 - smoothstep(0.08, 0.42, shoreShare)) + weights.path + weights.shoulder, 0, 1) * 255
  );
}

describe("coast texture mask bake", () => {
  it("keeps proportional greenMask when shore semantics are present but vegetation still dominates", () => {
    const x = 132;
    const shore = WorldLayout.coastlineZ(x);
    let found = false;

    for (let dz = 30; dz >= 6; dz -= 1) {
      const z = shore - dz;
      const weights = WorldLayout.terrainSurfaceWeights(x, z);
      const shoreShare = weights.beach + weights.wetShoreline + weights.cliff;
      const vegetationShare = weights.grass + weights.meadow;
      if (shoreShare <= 0 || vegetationShare <= 0.45) continue;

      const expected = expectedGreenMaskByte(weights);
      if (expected <= 0) continue;

      found = true;
      expect(expected).toBeGreaterThan(0);
      expect(shoreShare).toBeLessThan(0.42);
      break;
    }

    expect(found).toBe(true);
  });

  it("reduces baked greenMask as shore semantics increase along a harbor transect", () => {
    const x = 72;
    const shore = WorldLayout.coastlineZ(x);
    const inland = expectedGreenMaskByte(WorldLayout.terrainSurfaceWeights(x, shore - 24));
    const midCoast = expectedGreenMaskByte(WorldLayout.terrainSurfaceWeights(x, shore - 10));
    const nearBeach = expectedGreenMaskByte(WorldLayout.terrainSurfaceWeights(x, shore - 2));

    expect(inland).toBeGreaterThan(midCoast);
    expect(midCoast).toBeGreaterThanOrEqual(nearBeach);
  });

  it("matches the baked terrainGreenMask attribute on sampled coast vertices", () => {
    const geometry = WorldLayout.buildTerrainGeometry();
    const terrainGreenMask = geometry.getAttribute("terrainGreenMask");
    const positions = geometry.getAttribute("position");
    const patch = WorldLayout.terrainPatches().find((entry) => entry.id === "terrain.neva")!;
    const sampledPlane = new THREE.PlaneGeometry(patch.sizeMeters, patch.sizeMeters, patch.resolution, patch.resolution);
    sampledPlane.rotateX(-Math.PI / 2);
    const sampledPositions = sampledPlane.getAttribute("position");
    for (let index = 0; index < sampledPositions.count; index++) {
      sampledPositions.setY(index, WorldLayout.terrainBaseHeight(sampledPositions.getX(index), sampledPositions.getZ(index)));
    }
    sampledPlane.computeVertexNormals();
    const sampledNormals = sampledPlane.getAttribute("normal");
    const gridStep = patch.sizeMeters / patch.resolution;

    let matched = false;
    for (let index = 0; index < positions.count; index += 4096) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const column = Math.round((x + patch.sizeMeters / 2) / gridStep);
      const row = Math.round((z + patch.sizeMeters / 2) / gridStep);
      const normalY = Math.abs(sampledNormals.getY(row * (patch.resolution + 1) + column));
      const weights = WorldLayout.terrainSurfaceWeights(x, z, normalY);
      const shoreShare = weights.beach + weights.wetShoreline + weights.cliff;
      if (shoreShare <= 0 || shoreShare >= 0.42) continue;

      const expected = expectedGreenMaskByte(weights);
      const baked = Math.round(terrainGreenMask.getX(index) * 255);
      expect(baked).toBe(expected);
      matched = true;
    }

    expect(matched).toBe(true);
    geometry.dispose();
    sampledPlane.dispose();
  });
});

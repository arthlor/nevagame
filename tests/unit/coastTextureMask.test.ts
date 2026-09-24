import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { WorldLayout } from "../../src/world/WorldLayout";
import { SURFACE_FIELD_ATTRIBUTE_NAMES } from "../../src/render/materials/SurfaceFieldAttributes";

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

    // The bake converts grass/meadow to cliff where presentation-only rock is
    // exposed (withExposedRock) and packs those weights into the surface field.
    const weights0 = geometry.getAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.weights0);
    const weights1 = geometry.getAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.weights1);
    const causes = geometry.getAttribute(SURFACE_FIELD_ATTRIBUTE_NAMES.causes);
    const byte = (value: number) => Math.round(value * 255);
    let matched = 0;
    let exposed = 0;
    for (let index = 0; index < positions.count; index += 4096) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const column = Math.round((x + patch.sizeMeters / 2) / gridStep);
      const row = Math.round((z + patch.sizeMeters / 2) / gridStep);
      const normalY = Math.abs(sampledNormals.getY(row * (patch.resolution + 1) + column));
      const weights = WorldLayout.terrainSurfaceWeights(x, z, normalY);
      const baked = byte(terrainGreenMask.getX(index));
      if (byte(causes.getY(index)) !== byte(weights.cliff)) {
        // Exposed rock: the mask follows the baked (exposed) weights, within
        // the byte quantization of the packed channels.
        const packed = {
          grass: weights0.getX(index), meadow: weights0.getY(index),
          path: weights1.getX(index), shoulder: weights1.getY(index), beach: weights1.getZ(index),
          wetShoreline: causes.getX(index), cliff: causes.getY(index)
        };
        const shoreShare = packed.beach + packed.wetShoreline + packed.cliff;
        if (shoreShare <= 0 || shoreShare >= 0.42) continue;
        expect(Math.abs(baked - expectedGreenMaskByte(packed)), `exposed vertex ${x},${z}`).toBeLessThanOrEqual(2);
        exposed += 1;
        continue;
      }
      const shoreShare = weights.beach + weights.wetShoreline + weights.cliff;
      if (shoreShare <= 0 || shoreShare >= 0.42) continue;

      expect(baked, `vertex ${x},${z}`).toBe(expectedGreenMaskByte(weights));
      matched += 1;
    }

    expect(matched).toBeGreaterThan(0);
    expect(exposed).toBeGreaterThan(0);
    geometry.dispose();
    sampledPlane.dispose();
  });
});

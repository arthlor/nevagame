import * as THREE from "three";

import type { TerrainSurfaceSample } from "../../world/WorldLayout";

export const SURFACE_FIELD_ATTRIBUTE_NAMES = Object.freeze({
  weights0: "surfaceWeights0",
  weights1: "surfaceWeights1",
  causes: "surfaceCauses"
});

function clamp01(value: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

/**
 * Writes the presentation-only surface field at the geometry's world-space
 * vertices. WorldLayout remains the semantic owner; this module only packs its
 * result for shared terrain, road, and cultivated-ground materials.
 */
export function attachSurfaceFieldAttributes(
  geometry: THREE.BufferGeometry,
  sampleAt: (x: number, z: number, sampledNormalY?: number) => TerrainSurfaceSample
): void {
  const positions = geometry.getAttribute("position");
  if (!positions) {
    throw new Error("[SurfaceFieldAttributes] A position attribute is required");
  }
  const normals = geometry.getAttribute("normal");
  const samples = new Array<TerrainSurfaceSample>(positions.count);

  for (let index = 0; index < positions.count; index += 1) {
    const sampledNormalY = normals ? Math.abs(normals.getY(index)) : undefined;
    samples[index] = sampleAt(positions.getX(index), positions.getZ(index), sampledNormalY);
  }

  writeSurfaceFieldAttributes(geometry, samples);
}

/** Packs already-sampled semantic values without evaluating WorldLayout again. */
export function writeSurfaceFieldAttributes(
  geometry: THREE.BufferGeometry,
  samples: readonly TerrainSurfaceSample[]
): void {
  const positions = geometry.getAttribute("position");
  if (!positions) {
    throw new Error("[SurfaceFieldAttributes] A position attribute is required");
  }
  if (samples.length !== positions.count) {
    throw new Error(
      `[SurfaceFieldAttributes] Expected ${positions.count} samples, received ${samples.length}`
    );
  }
  const weights0 = new Float32Array(positions.count * 4);
  const weights1 = new Float32Array(positions.count * 4);
  const causes = new Float32Array(positions.count * 4);

  for (let index = 0; index < positions.count; index += 1) {
    const sample = samples[index];
    const weights = sample.weights;
    const offset = index * 4;

    weights0[offset] = clamp01(weights.grass);
    weights0[offset + 1] = clamp01(weights.meadow);
    weights0[offset + 2] = clamp01(weights.drySoil);
    weights0[offset + 3] = clamp01(weights.dampSoil);

    weights1[offset] = clamp01(weights.path);
    weights1[offset + 1] = clamp01(weights.shoulder);
    weights1[offset + 2] = clamp01(weights.beach);
    weights1[offset + 3] = clamp01(weights.riverbed);

    causes[offset] = clamp01(weights.wetShoreline);
    causes[offset + 1] = clamp01(weights.cliff);
    causes[offset + 2] = clamp01(sample.farmInfluence);
    causes[offset + 3] = clamp01(sample.shorelineWetness);
  }

  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.weights0,
    new THREE.BufferAttribute(weights0, 4)
  );
  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.weights1,
    new THREE.BufferAttribute(weights1, 4)
  );
  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.causes,
    new THREE.BufferAttribute(causes, 4)
  );
}

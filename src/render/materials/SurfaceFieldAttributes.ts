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
 * Every surface-field channel is a clamped 0..1 weight, so a normalized byte
 * carries it with 1/255 precision. The terrain mesh alone has ~885k vertices;
 * keeping three float vec4s per vertex here cost ~36 bytes of vertex fetch
 * bandwidth per vertex for no visible precision.
 */
function quantize01(value: number): number {
  return Math.round(clamp01(value) * 255);
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
  const weights0 = new Uint8Array(positions.count * 4);
  const weights1 = new Uint8Array(positions.count * 4);
  const causes = new Uint8Array(positions.count * 4);

  for (let index = 0; index < positions.count; index += 1) {
    const sample = samples[index];
    const weights = sample.weights;
    const offset = index * 4;

    weights0[offset] = quantize01(weights.grass);
    weights0[offset + 1] = quantize01(weights.meadow);
    weights0[offset + 2] = quantize01(weights.drySoil);
    weights0[offset + 3] = quantize01(weights.dampSoil);

    weights1[offset] = quantize01(weights.path);
    weights1[offset + 1] = quantize01(weights.shoulder);
    weights1[offset + 2] = quantize01(weights.beach);
    weights1[offset + 3] = quantize01(weights.riverbed);

    causes[offset] = quantize01(weights.wetShoreline);
    causes[offset + 1] = quantize01(weights.cliff);
    causes[offset + 2] = quantize01(sample.farmInfluence);
    causes[offset + 3] = quantize01(sample.shorelineWetness);
  }

  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.weights0,
    new THREE.Uint8BufferAttribute(weights0, 4, true)
  );
  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.weights1,
    new THREE.Uint8BufferAttribute(weights1, 4, true)
  );
  geometry.setAttribute(
    SURFACE_FIELD_ATTRIBUTE_NAMES.causes,
    new THREE.Uint8BufferAttribute(causes, 4, true)
  );
}

import * as THREE from "three";

/**
 * Neva's vegetation is a handful of GLBs repeated a few hundred times through
 * one shared palette material, so every oak in a stand rendered at the exact
 * same green. That uniformity is the strongest "placeholder art" signal in a
 * wide gameplay camera, and it cannot be fixed with per-mesh material clones:
 * the static batcher keys on material identity, so a clone per tree would undo
 * batching entirely.
 *
 * Instead one variant material per source material derives a deterministic
 * per-instance seed from the instance's own world origin, which is available
 * both for plain meshes (`modelMatrix`) and for `BatchedMesh` instances
 * (`batchingMatrix`). Instances therefore stay in a single batch and still
 * shade differently.
 */
export const VEGETATION_TINT_PROGRAM_CACHE_KEY = "neva-vegetation-instance-tint-v1";

/** Value spread and warm/olive drift, both held inside the authored palette family. */
export const VEGETATION_TINT_STRENGTH = Object.freeze({
  value: 0.085,
  warmth: 0.5
});

const variantCache = new Map<string, THREE.Material>();

function patchVegetationTintShader(shader: {
  vertexShader: string;
  fragmentShader: string;
}): void {
  const vertexAnchor = "#include <begin_vertex>";
  const fragmentCommon = "#include <common>";
  const fragmentAnchor = "#include <color_fragment>";
  for (const [source, marker] of [
    [shader.vertexShader, vertexAnchor],
    [shader.fragmentShader, fragmentCommon],
    [shader.fragmentShader, fragmentAnchor]
  ] as const) {
    if (source.split(marker).length - 1 !== 1) {
      throw new Error(
        `[VegetationTintMaterial] Three.js r174 shader chunk drift: expected exactly one ${marker}`
      );
    }
  }

  shader.vertexShader = shader.vertexShader.replace(
    vertexAnchor,
    `${vertexAnchor}
  mat4 nevaInstanceMatrix = modelMatrix;
  #ifdef USE_BATCHING
    nevaInstanceMatrix = modelMatrix * batchingMatrix;
  #endif
  #ifdef USE_INSTANCING
    nevaInstanceMatrix = nevaInstanceMatrix * instanceMatrix;
  #endif
  vNevaInstanceOrigin = nevaInstanceMatrix[3].xz;`
  );
  shader.vertexShader = `varying vec2 vNevaInstanceOrigin;\n${shader.vertexShader}`;

  shader.fragmentShader = shader.fragmentShader.replace(
    fragmentCommon,
    `${fragmentCommon}
varying vec2 vNevaInstanceOrigin;
uniform float nevaTintValueStrength;
uniform float nevaTintWarmthStrength;
float nevaInstanceHash(vec2 origin, float salt) {
  return fract(sin(dot(origin + salt, vec2(127.1, 311.7))) * 43758.5453);
}`
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    fragmentAnchor,
    `${fragmentAnchor}
  float nevaTintValue = nevaInstanceHash(vNevaInstanceOrigin, 0.0);
  float nevaTintWarmth = nevaInstanceHash(vNevaInstanceOrigin, 17.31);
  diffuseColor.rgb *= mix(1.0 - nevaTintValueStrength, 1.0 + nevaTintValueStrength, nevaTintValue);
  diffuseColor.rgb = mix(
    diffuseColor.rgb,
    diffuseColor.rgb * vec3(1.14, 1.02, 0.8),
    nevaTintWarmth * nevaTintWarmthStrength
  );`
  );
}

/**
 * Returns the shared per-instance tinted variant of `source`. Materials that
 * are not palette-style standard materials are returned untouched so texture
 * or multi-material assets keep their authored appearance.
 */
export function vegetationInstanceTintMaterial(source: THREE.Material): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const cached = variantCache.get(source.uuid);
  if (cached) return cached;

  const variant = source.clone();
  variant.name = `${source.name || "vegetation"}_instance_tint`;
  variant.onBeforeCompile = (shader) => {
    patchVegetationTintShader(shader);
    shader.uniforms.nevaTintValueStrength = { value: VEGETATION_TINT_STRENGTH.value };
    shader.uniforms.nevaTintWarmthStrength = { value: VEGETATION_TINT_STRENGTH.warmth };
  };
  // Three keys programs on the resolved parameter set, not on the material
  // instance, so without a distinct key this variant would silently reuse the
  // untinted program compiled for `source`.
  variant.customProgramCacheKey = () => VEGETATION_TINT_PROGRAM_CACHE_KEY;
  variant.needsUpdate = true;
  variantCache.set(source.uuid, variant);
  return variant;
}

/** Test/teardown hook: drops the shared variants and their GPU programs. */
export function disposeVegetationTintMaterials(): void {
  for (const material of variantCache.values()) material.dispose();
  variantCache.clear();
}

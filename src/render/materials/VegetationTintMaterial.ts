import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { groundCoverWindStrength } from "../scene/groundCoverWind";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";
import { PALETTE_SPECS } from "./PaletteTokens";
import { paletteTokenForLoadedMaterial } from "./PaletteMaterials";

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
export const VEGETATION_TINT_PROGRAM_CACHE_KEY = "neva-vegetation-instance-tint-v2-wind";

/** Value spread and warm/olive drift, both held inside the authored palette family. */
export const VEGETATION_TINT_STRENGTH = Object.freeze({
  value: 0.085,
  warmth: 0.5
});

const variantCache = new Map<string, THREE.Material>();
const depthCache = new Map<string, THREE.MeshDepthMaterial>();

function patchVegetationWindVertex(source: string, weighted: boolean): string {
  source = source.replace(
    "#include <begin_vertex>",
    `#include <begin_vertex>
  mat4 nevaInstanceMatrix = modelMatrix;
  #ifdef USE_BATCHING
    nevaInstanceMatrix = modelMatrix * batchingMatrix;
  #endif
  #ifdef USE_INSTANCING
    nevaInstanceMatrix = nevaInstanceMatrix * instanceMatrix;
  #endif
  vNevaInstanceOrigin = nevaInstanceMatrix[3].xz;
  // Canopy sway. The trunk stays planted and motion ramps into the upper
  // canopy, so a tree bends rather than sliding. Phase comes from the same
  // per-instance origin the tint uses, so neighbouring trees never move in
  // lockstep and no extra attribute is needed.
  float nevaCanopy = clamp(
    (position.y - nevaWindTrunkHold) / max(0.001, nevaWindCanopySpan),
    0.0,
    1.0
  );
  nevaCanopy *= nevaCanopy;
  ${weighted ? "nevaCanopy = clamp(_neva_wind, 0.0, 1.0);" : ""}
  float nevaWindPhase =
    fract(sin(dot(vNevaInstanceOrigin, vec2(127.1, 311.7))) * 43758.5453) * 6.283185;
  float nevaWave = sin(nevaWindTime * 0.9 + nevaWindPhase);
  float nevaGust = sin(nevaWindTime * 0.31 + nevaWindPhase * 2.7);
  float nevaBend = nevaWindAmplitude * nevaWindStrength * nevaCanopy
    * (0.7 * nevaWave + 0.3 * nevaGust);
  vec2 nevaWindHeading = normalize(nevaWindDir + vec2(0.0001, 0.0001));
  transformed.xz += nevaWindHeading * nevaBend;
  transformed.xz += vec2(-nevaWindHeading.y, nevaWindHeading.x)
    * nevaBend * 0.22 * sin(nevaWindTime * 1.6 + nevaWindPhase * 3.3);`
  );
  source = `${weighted ? "attribute float _neva_wind;" : ""}
varying vec2 vNevaInstanceOrigin;
uniform float nevaWindTime;
uniform vec2 nevaWindDir;
uniform float nevaWindStrength;
uniform float nevaWindAmplitude;
uniform float nevaWindTrunkHold;
uniform float nevaWindCanopySpan;
${source}`;

  return source;
}

function windUniforms() {
  const wind = CANONICAL_RENDER_CONFIG.vegetationWind;
  return {
    nevaWindTime: { value: 0 }, nevaWindDir: { value: new THREE.Vector2(0, 1) },
    nevaWindStrength: { value: 0 }, nevaWindAmplitude: { value: wind.amplitudeMeters },
    nevaWindTrunkHold: { value: wind.trunkHoldMeters }, nevaWindCanopySpan: { value: wind.canopySpanMeters }
  };
}

function patchVegetationTintShader(shader: {
  vertexShader: string;
  fragmentShader: string;
}, weighted: boolean): void {
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

  shader.vertexShader = patchVegetationWindVertex(shader.vertexShader, weighted);

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
export function vegetationInstanceTintMaterial(source: THREE.Material, weighted = false): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) return source;
  const token = paletteTokenForLoadedMaterial(source);
  const paletteSpec = token ? PALETTE_SPECS[token] : null;
  // Static imports must be semantically mapped before runtime. Unknown vendor
  // materials keep their authored shader instead of receiving a guessed tint.
  if (!paletteSpec) return source;
  const key = `${source.uuid}:${weighted}`;
  const cached = variantCache.get(key);
  if (cached) return cached;

  const variant = source.clone();
  const tintFoliage = paletteSpec.family === "foliage";
  variant.name = `${source.name || "vegetation"}_instance_tint`;
  variant.onBeforeCompile = (shader) => {
    const wind = CANONICAL_RENDER_CONFIG.vegetationWind;
    patchVegetationTintShader(shader, weighted);
    // Wind remains shared across the whole tree, while chromatic variation is
    // restricted to catalog-declared foliage. Bark and other structural
    // materials therefore retain their source/palette color exactly.
    shader.uniforms.nevaTintValueStrength = {
      value: tintFoliage ? VEGETATION_TINT_STRENGTH.value : 0
    };
    shader.uniforms.nevaTintWarmthStrength = {
      value: tintFoliage ? VEGETATION_TINT_STRENGTH.warmth * (weighted ? 0.3 : 1) : 0
    };
    shader.uniforms.nevaWindTime = { value: 0 };
    shader.uniforms.nevaWindDir = { value: new THREE.Vector2(0, 1) };
    shader.uniforms.nevaWindStrength = { value: 0 };
    shader.uniforms.nevaWindAmplitude = { value: weighted ? wind.coastalAmplitudeMeters : wind.amplitudeMeters };
    shader.uniforms.nevaWindTrunkHold = { value: wind.trunkHoldMeters };
    shader.uniforms.nevaWindCanopySpan = { value: wind.canopySpanMeters };
    variant.userData.nevaVegetationWindShader = shader;
  };
  // Three keys programs on the resolved parameter set, not on the material
  // instance, so without a distinct key this variant would silently reuse the
  // untinted program compiled for `source`.
  variant.customProgramCacheKey = () => weighted ? `${VEGETATION_TINT_PROGRAM_CACHE_KEY}:coastal` : VEGETATION_TINT_PROGRAM_CACHE_KEY;
  variant.needsUpdate = true;
  variantCache.set(key, variant);
  return variant;
}

/** New coastal foliage has the same weighted deformation in color and shadow draws. */
export function coastalVegetationDepthMaterial(source: THREE.Material): THREE.MeshDepthMaterial {
  const existing = depthCache.get(source.uuid);
  if (existing) return existing;
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = patchVegetationWindVertex(shader.vertexShader, true);
    Object.assign(shader.uniforms, windUniforms());
    shader.uniforms.nevaWindAmplitude.value = CANONICAL_RENDER_CONFIG.vegetationWind.coastalAmplitudeMeters;
    material.userData.nevaVegetationWindShader = shader;
  };
  material.customProgramCacheKey = () => "neva-coastal-weighted-depth-v1";
  depthCache.set(source.uuid, material);
  return material;
}

/**
 * Drives canopy sway on every shared vegetation variant from the same weather
 * signal the ground cover uses, so a gust moves the grass and the canopy above
 * it together. A few uniform writes per frame over a handful of shared
 * materials - no per-instance work.
 *
 * Coastal depth variants use the same exported weights and shared weather signal.
 * Existing vegetation retains its established shadow treatment.
 */
export function updateVegetationWind(
  signal: Readonly<WeatherMotionSignal>,
  timeSeconds: number,
  motionScale: number
): void {
  const strength = groundCoverWindStrength(signal) * motionScale;
  for (const material of [...variantCache.values(), ...depthCache.values()]) {
    const shader = material.userData.nevaVegetationWindShader as
      | { uniforms: Record<string, { value: unknown }> }
      | undefined;
    if (!shader) continue;
    shader.uniforms.nevaWindTime!.value = timeSeconds;
    (shader.uniforms.nevaWindDir!.value as THREE.Vector2).set(signal.directionX, signal.directionZ);
    shader.uniforms.nevaWindStrength!.value = strength;
  }
}

/** Test/teardown hook: drops the shared variants and their GPU programs. */
export function disposeVegetationTintMaterials(): void {
  for (const material of variantCache.values()) material.dispose();
  variantCache.clear();
  for (const material of depthCache.values()) material.dispose();
  depthCache.clear();
}

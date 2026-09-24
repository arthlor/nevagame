import { MAINLAND_LAKE } from "../../world/NevaMainland";
import { runSync } from "../../utils/CooperativeTask";
import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { cloudShadowUniforms } from "../atmosphere/CloudShadows";
import { aerialPerspectiveUniforms } from "../atmosphere/AerialPerspective";
import {
  createWaterDepthTexture,
  waterFieldGrid,
  waterFieldUvTransform,
  writeWaterDepthTexel
} from "./waterField";
import { WATER_FIELD_UV_GLSL, WATER_SWASH_GLSL } from "./waveGlsl";
import { WATER_WAVE_CONFIG } from "./WaterSurface";

export { createWaterDepthTexture, writeWaterDepthTexel };

/** R: signed water-column depth, G: bed elevation, B: shore distance, A: coastal contact weight. */
export function createWaterDepthMap(bounds: THREE.Vector4, width: number, height: number): THREE.DataTexture {
  return runSync(waterDepthMapSteps(bounds, width, height));
}

export function* waterDepthMapSteps(bounds: THREE.Vector4, width: number, height: number): Generator<void, THREE.DataTexture, void> {
  const data = new Uint16Array(width * height * 4);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    if (column % 32 === 0) yield;
    const x = bounds.x + column / (width - 1) * bounds.z;
    const z = bounds.y + row / (height - 1) * bounds.w;
    const offset = (row * width + column) * 4;
    writeWaterDepthTexel(data, offset, x, z, WorldLayout.waterSignedDistance(x, z));
  }
  return createWaterDepthTexture(data, width, height);
}

/**
 * Uniform transform for a field texture baked over `bounds`. Consumers
 * without a texture get an identity that samples the (absent) map harmlessly.
 */
function fieldUvFor(depthMap: THREE.Texture | null, bounds: THREE.Vector4): THREE.Vector4 {
  const image = depthMap?.image as { width?: number; height?: number } | undefined;
  const columns = image?.width ?? 2;
  const rows = image?.height ?? 2;
  return waterFieldUvTransform(waterFieldGrid(bounds, columns, rows));
}

export function createCoastalUniforms(depthMap: THREE.Texture | null, bounds: THREE.Vector4) {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.optics;
  return {
    ...cloudShadowUniforms,
    ...aerialPerspectiveUniforms,
    uCoastalFieldEnabled: { value: depthMap ? 1 : 0 },
    uWaterDepthMap: { value: depthMap },
    uWaterFieldUv: { value: fieldUvFor(depthMap, bounds) },
    uCoastTime: { value: 0 },
    uCoastReducedMotion: { value: 0 },
    // The shared run-up. FacetedWater drives the height from the sea state
    // each frame, so the water sheet and the terrain's wet line move as one.
    uSwashPeriod: { value: WATER_WAVE_CONFIG.swash.periodSeconds },
    uSwashRunup: { value: WATER_WAVE_CONFIG.swash.runupMeters },
    uSwashReach: { value: new THREE.Vector2(
      WATER_WAVE_CONFIG.swash.maxExcursionMeters,
      WATER_WAVE_CONFIG.swash.gradientProbeMeters
    ) },
    uCoastalFoamStrength: { value: config.foamStrength },
    uWaterAbsorption: { value: new THREE.Vector3(...config.absorptionPerMeter) },
    uFreshwaterAbsorptionScale: { value: new THREE.Vector3(...config.freshwaterAbsorptionScale) },
    uRoughTurbidity: { value: config.roughTurbidity },
    uLakeBounds: { value: new THREE.Vector4(MAINLAND_LAKE.center.x, MAINLAND_LAKE.center.z,
      MAINLAND_LAKE.radiusX, MAINLAND_LAKE.radiusZ) },
    uLakeRippleScale: { value: config.lakeRippleScale },
    uLakeCurrentScale: { value: config.lakeCurrentScale },
    uRefractionPixels: { value: config.refractionPixels },
    uCausticStrength: { value: config.causticStrength },
    uCausticDepthFade: { value: new THREE.Vector2(...config.causticDepthFadeMeters) },
    uCausticSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uCausticSunStrength: { value: 0 },
    uSceneCaptureEnabled: { value: 0 }, uOpaqueColor: { value: null as THREE.Texture | null },
    uOpaqueDepth: { value: null as THREE.DepthTexture | null },
    uOpticsViewport: { value: new THREE.Vector2(1, 1) },
    uOpticsInverseProjection: { value: new THREE.Matrix4() },
    // Shared SSR capture state (single owner: this object is spread into every
    // water material, never redeclared there, so RendererPipeline updates
    // reach the shaders). Tuning lives in VisualRenderConfig water optics.
    uOpticsProjection: { value: new THREE.Matrix4() },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uSsrEnabled: { value: 0 },
    uSsrStrength: { value: config.ssrStrength },
    uSssStrength: { value: config.sssStrength },
    uBoatFoamStrength: { value: config.boatFoamStrength }
  };
}
export type CoastalUniforms = ReturnType<typeof createCoastalUniforms>;

export const COASTAL_FIELD_GLSL = /* glsl */ `
uniform sampler2D uWaterDepthMap;
uniform int uCoastalFieldEnabled;
uniform float uCoastTime;
uniform float uCoastReducedMotion;
uniform float uSwashPeriod;
uniform float uSwashRunup;
uniform vec2 uSwashReach;
uniform float uCoastalFoamStrength;
${WATER_FIELD_UV_GLSL}
${WATER_SWASH_GLSL}
vec4 nevaOpticsField(vec2 xz) {
  if (uCoastalFieldEnabled == 0) return vec4(0.0);
  return texture2D(uWaterDepthMap, nevaWaterFieldUv(xz));
}
/**
 * Alongshore tangent, from a world-space gradient of the canonical shore
 * distance. Screen-space derivatives of world position collapse wherever the
 * surface is near edge-on to the camera, which is most of a shoreline seen
 * from a jetty; sampling the field a fixed distance either side is stable.
 */
vec2 nevaShoreTangent(vec2 xz) {
  const float offsetMeters = 1.5;
  float dx = nevaOpticsField(xz + vec2(offsetMeters, 0.0)).b
    - nevaOpticsField(xz - vec2(offsetMeters, 0.0)).b;
  float dz = nevaOpticsField(xz + vec2(0.0, offsetMeters)).b
    - nevaOpticsField(xz - vec2(0.0, offsetMeters)).b;
  vec2 gradient = vec2(dx, dz);
  float gradientLength = length(gradient);
  if (gradientLength < 0.0001) return vec2(1.0, 0.0);
  vec2 waterward = gradient / gradientLength;
  return vec2(-waterward.y, waterward.x);
}
float nevaCoastTime() {
  return uCoastTime * mix(1.0, 0.25, uCoastReducedMotion);
}
/**
 * What the swash leaves on the ground it reaches, for a dry surface at
 * elevation y. Returns (foam lace, wetness, current run-up level).
 *
 * The water itself draws the advancing sheet (it is lifted by the same
 * nevaSwashLevel), so the ground only carries what a retreating sheet leaves
 * behind: sand stays dark up to the highest reach of the sets, is darkest
 * where the water has only just drawn back, and a thin broken line of foam
 * trails the backwash edge. Because both read one level, the wet line and the
 * water's edge cannot disagree.
 */
float nevaCoastHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float nevaCoastNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nevaCoastHash(cell), nevaCoastHash(cell + vec2(1.0, 0.0)), u.x),
    mix(nevaCoastHash(cell + vec2(0.0, 1.0)), nevaCoastHash(cell + vec2(1.0)), u.x), u.y);
}

vec3 nevaCoastalWash(vec2 xz, float y, float contact) {
  float time = nevaCoastTime();
  float depthGradient = 0.05;
  float level = nevaSwashLevel(xz, time, uSwashPeriod, uSwashRunup, contact);
  float earlier = nevaSwashLevel(xz, time - 1.2, uSwashPeriod, uSwashRunup, contact);
  float reach = uSwashRunup * contact;
  if (contact > 0.0005) {
    // The same reach cap as the water sheet, from the same bed gradient.
    float depth = nevaOpticsField(xz).r;
    float depthX = nevaOpticsField(xz + vec2(uSwashReach.y, 0.0)).r;
    float depthZ = nevaOpticsField(xz + vec2(0.0, uSwashReach.y)).r;
    depthGradient = length(vec2(depthX - depth, depthZ - depth)) / uSwashReach.y;
    level = nevaSwashLift(level, depthGradient, uSwashReach.x);
    earlier = nevaSwashLift(earlier, depthGradient, uSwashReach.x);
    reach = nevaSwashLift(reach, depthGradient, uSwashReach.x);
  }
  // Retained damp sand below the highest reach, plus the freshly drained band.
  float retained = (1.0 - smoothstep(reach * 0.55, reach + 0.06, y)) * 0.72;
  float drained = (1.0 - smoothstep(level, max(level, earlier) + 0.03, y)) * step(0.0005, contact);
  float wet = max(retained, drained);
  // Backwash lace: the edge is falling, so foam trails a little above it.
  // Its width is measured across the beach in metres (height over the
  // smooth bed gradient), so a faceted terrain triangle cannot stretch it,
  // and it is broken by drifting noise: a periodic breakup drew regular
  // white dashes along the waterline.
  float backwash = smoothstep(0.0, 0.015, earlier - level);
  float laceHeight = mix(level, earlier, 0.55);
  float laceMeters = abs(y - laceHeight) / max(depthGradient, 0.012);
  float lace = (1.0 - smoothstep(0.04, 0.32, laceMeters)) * backwash;
  float breakup = nevaCoastNoise(xz * 1.3 + vec2(time * 0.05, 0.0)) * 0.65
    + nevaCoastNoise(xz * 3.7 - vec2(0.0, time * 0.08)) * 0.35;
  lace *= smoothstep(0.42, 0.72, breakup) * step(0.0005, contact);
  return vec3(lace * uCoastalFoamStrength, wet, level);
}
`;

/** ShaderMaterial output follows the same linear -> tone map -> display path as Standard. */
export const WATER_OUTPUT_GLSL = /* glsl */ `
#ifdef TONE_MAPPING
  outColor.rgb = toneMapping(outColor.rgb);
#endif
  outColor = linearToOutputTexel(outColor);
`;

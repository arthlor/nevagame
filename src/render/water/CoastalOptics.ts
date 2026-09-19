import { runSync } from "../../utils/CooperativeTask";
import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import type { ShoreProjection } from "../../world/WorldGeographyTypes";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { cloudShadowUniforms } from "../atmosphere/CloudShadows";
import { aerialPerspectiveUniforms } from "../atmosphere/AerialPerspective";

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

/** Both standalone depth builds and the paired startup bake use this encoding. */
export function writeWaterDepthTexel(
  data: Uint16Array, offset: number, x: number, z: number,
  signedDistance: number, projection?: ShoreProjection
): void {
  const bed = WorldLayout.terrainBaseSurfaceHeight(x, z);
  data[offset] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(WorldLayout.waterSurfaceElevation(x, z) - bed, -128, 128));
  data[offset + 1] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(bed, -128, 128));
  data[offset + 2] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(signedDistance, -128, 128));
  data[offset + 3] = THREE.DataUtils.toHalfFloat(WorldLayout.coastalContactWeightAt(x, z, projection));
}

export function createWaterDepthTexture(data: Uint16Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = "canonical_water_depth_shore";
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createCoastalUniforms(depthMap: THREE.Texture | null, bounds: THREE.Vector4) {
  const config = CANONICAL_RENDER_CONFIG.waterSurface.optics;
  return {
    ...cloudShadowUniforms,
    ...aerialPerspectiveUniforms,
    uCoastalFieldEnabled: { value: depthMap ? 1 : 0 }, uWaterDepthMap: { value: depthMap }, uOpticsBounds: { value: bounds },
    uCoastTime: { value: 0 }, uCoastReducedMotion: { value: 0 },
    uSwashPeriod: { value: config.swashPeriodSeconds },
    uSwashReach: { value: config.swashReachMeters },
    uCoastalFoamStrength: { value: config.foamStrength },
    uWaterAbsorption: { value: new THREE.Vector3(...config.absorptionPerMeter) },
    uRefractionPixels: { value: config.refractionPixels },
    uRippleNormalStrength: { value: config.rippleNormalStrength },
    uCausticStrength: { value: config.causticStrength },
    uCausticDepthFade: { value: new THREE.Vector2(...config.causticDepthFadeMeters) },
    uCausticSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uCausticSunStrength: { value: 0 },
    uDistantSlope: { value: new THREE.Vector3(...config.distantSlope) },
    uSceneCaptureEnabled: { value: 0 }, uOpaqueColor: { value: null as THREE.Texture | null },
    uOpaqueDepth: { value: null as THREE.DepthTexture | null },
    uOpticsViewport: { value: new THREE.Vector2(1, 1) },
    uOpticsInverseProjection: { value: new THREE.Matrix4() },
    // Shared SSR capture state (single owner: this object is spread into both
    // water materials, never redeclared there, so RendererPipeline updates
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
uniform vec4 uOpticsBounds;
uniform float uCoastTime;
uniform float uCoastReducedMotion;
uniform float uSwashPeriod;
uniform float uSwashReach;
uniform float uCoastalFoamStrength;
vec4 nevaOpticsField(vec2 xz) {
  if (uCoastalFieldEnabled == 0) return vec4(0.0);
  return texture2D(uWaterDepthMap, clamp((xz - uOpticsBounds.xy) / uOpticsBounds.zw, 0.0, 1.0));
}
// Advancing breaker, spread and retreat; the same phase wets the exposed sand.
vec2 nevaShoreTangent(vec2 xz, float shoreDistance) {
  vec2 screenDx = dFdx(xz);
  vec2 screenDy = dFdy(xz);
  float distanceDx = dFdx(shoreDistance);
  float distanceDy = dFdy(shoreDistance);
  float determinant = screenDx.x * screenDy.y - screenDx.y * screenDy.x;
  if (abs(determinant) < 0.00001) return vec2(1.0, 0.0);
  vec2 gradient = vec2(
    (distanceDx * screenDy.y - screenDx.y * distanceDy) / determinant,
    (screenDx.x * distanceDy - distanceDx * screenDy.x) / determinant
  );
  float gradientLength = length(gradient);
  if (gradientLength < 0.0001) return vec2(1.0, 0.0);
  vec2 waterward = gradient / gradientLength;
  return vec2(-waterward.y, waterward.x);
}
vec3 nevaCoastalWash(vec2 xz, float shoreDistance) {
  float time = uCoastTime * mix(1.0, 0.25, uCoastReducedMotion);
  vec2 tangent = nevaShoreTangent(xz, shoreDistance);
  float alongShore = dot(xz, tangent);
  float phase = fract(time / uSwashPeriod + alongShore * 0.012
    + sin(alongShore * 0.071 + shoreDistance * 0.043) * 0.065);
  float front = mix(7.0, -uSwashReach, smoothstep(0.0, 0.72, phase));
  front += smoothstep(0.76, 1.0, phase) * 1.6;
  float width = mix(0.22, 0.8, smoothstep(0.16, 0.8, phase));
  float packet = 0.5 + 0.3 * sin(alongShore * 0.83 + shoreDistance * 0.31 + phase * 2.0)
    + 0.2 * sin(alongShore * 2.17 - shoreDistance * 0.76);
  float broken = smoothstep(0.22, 0.68, packet);
  front += sin(alongShore * 1.13 + phase * 1.7) * 0.18;
  float foam = (1.0 - smoothstep(width * 0.25, width, abs(shoreDistance - front)))
    * smoothstep(0.03, 0.24, phase) * (1.0 - smoothstep(0.8, 1.0, phase)) * broken;
  float wet = smoothstep(front - 0.7, front + 0.5, shoreDistance);
  float retained = (1.0 - smoothstep(0.3, uSwashReach + 1.2, max(0.0, -shoreDistance))) * 0.62;
  return vec3(foam * uCoastalFoamStrength, max(wet, retained), phase);
}
`;

/** ShaderMaterial output follows the same linear -> tone map -> display path as Standard. */
export const WATER_OUTPUT_GLSL = /* glsl */ `
#ifdef TONE_MAPPING
  outColor.rgb = toneMapping(outColor.rgb);
#endif
  outColor = linearToOutputTexel(outColor);
`;

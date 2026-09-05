import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import { harborCoastInfluence } from "../../world/HarborCoast";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

/** R: signed water-column depth, G: bed elevation, B: shore distance, A: coastal art weight. */
export function createWaterDepthMap(bounds: THREE.Vector4, width: number, height: number): THREE.DataTexture {
  const data = new Uint16Array(width * height * 4);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const x = bounds.x + column / (width - 1) * bounds.z;
    const z = bounds.y + row / (height - 1) * bounds.w;
    const bed = WorldLayout.terrainBaseSurfaceHeight(x, z);
    const offset = (row * width + column) * 4;
    data[offset] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(WorldLayout.waterSurfaceElevation(x, z) - bed, -128, 128));
    data[offset + 1] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(bed, -128, 128));
    data[offset + 2] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(WorldLayout.waterSignedDistance(x, z), -128, 128));
    data[offset + 3] = THREE.DataUtils.toHalfFloat(harborCoastInfluence(x, z));
  }
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
    uCoastalFieldEnabled: { value: depthMap ? 1 : 0 }, uWaterDepthMap: { value: depthMap }, uOpticsBounds: { value: bounds },
    uCoastTime: { value: 0 }, uCoastReducedMotion: { value: 0 },
    uSwashPeriod: { value: config.swashPeriodSeconds },
    uSwashReach: { value: config.swashReachMeters },
    uCoastalFoamStrength: { value: config.foamStrength },
    uWaterAbsorption: { value: new THREE.Vector3(...config.absorptionPerMeter) },
    uRefractionPixels: { value: config.refractionPixels },
    uRippleNormalStrength: { value: config.rippleNormalStrength },
    uSceneCaptureEnabled: { value: 0 }, uOpaqueColor: { value: null as THREE.Texture | null },
    uOpaqueDepth: { value: null as THREE.DepthTexture | null },
    uOpticsViewport: { value: new THREE.Vector2(1, 1) },
    uOpticsInverseProjection: { value: new THREE.Matrix4() }
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
vec3 nevaCoastalWash(vec2 xz, float shoreDistance) {
  float time = uCoastTime * mix(1.0, 0.25, uCoastReducedMotion);
  float phase = fract(time / uSwashPeriod + xz.x * 0.013 + sin(xz.x * 0.071) * 0.065);
  float front = mix(7.0, -uSwashReach, smoothstep(0.0, 0.72, phase));
  front += smoothstep(0.76, 1.0, phase) * 1.6;
  float width = mix(0.22, 0.8, smoothstep(0.16, 0.8, phase));
  float packet = 0.5 + 0.3 * sin(xz.x * 0.83 + xz.y * 0.31 + phase * 2.0)
    + 0.2 * sin(xz.x * 2.17 - xz.y * 0.76);
  float broken = smoothstep(0.22, 0.68, packet);
  front += sin(xz.x * 1.13 + phase * 1.7) * 0.18;
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

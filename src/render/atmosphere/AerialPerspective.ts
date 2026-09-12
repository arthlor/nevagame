import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import type { LightingFrame } from "../lighting/LightingRig";

export const aerialPerspectiveUniforms = {
  nevaAerialEnabled: { value: 0 },
  nevaAerialZenith: { value: new THREE.Color() },
  nevaAerialHorizon: { value: new THREE.Color() },
  nevaAerialFogColor: { value: new THREE.Color() },
  nevaAerialDensity: { value: new THREE.Vector4() },
  nevaAerialRange: { value: new THREE.Vector3() }
};

export function updateAerialPerspective(frame: LightingFrame, visibility: number, enabled: boolean): void {
  const config = CANONICAL_RENDER_CONFIG.atmosphere;
  const haze = config.aerialPerspective;
  aerialPerspectiveUniforms.nevaAerialEnabled.value = enabled ? 1 : 0;
  aerialPerspectiveUniforms.nevaAerialZenith.value.copy(frame.skyTopColor);
  aerialPerspectiveUniforms.nevaAerialHorizon.value.copy(frame.skyHorizonColor);
  aerialPerspectiveUniforms.nevaAerialFogColor.value.copy(frame.fogColor);
  aerialPerspectiveUniforms.nevaAerialDensity.value.set(
    config.horizonHaze,
    THREE.MathUtils.lerp(haze.clearMistDensity, haze.poorVisibilityMistDensity,
      1 - THREE.MathUtils.smoothstep(visibility, haze.mistVisibilityFull, haze.mistVisibilityStart)),
    1 / haze.mistHeightMeters,
    frame.fogFar
  );
  aerialPerspectiveUniforms.nevaAerialRange.value.set(haze.nearFadeStartMeters, haze.nearFadeEndMeters, haze.boundaryFadeStart);
}

/** Integral of an exponential height layer along a world-space segment, in meters. */
export function meanHeightDensity(eyeHeight: number, surfaceHeight: number, scaleHeight: number): number {
  const lower = Math.max(0, Math.min(eyeHeight, surfaceHeight));
  const delta = Math.abs(surfaceHeight - eyeHeight) / scaleHeight;
  const average = delta < 0.001 ? 1 - delta * 0.5 + delta * delta / 6 : (1 - Math.exp(-delta)) / delta;
  return Math.exp(-lower / scaleHeight) * average;
}

/** One flat-world, analytic segment model for opaque surfaces and both water meshes. */
export const AERIAL_PERSPECTIVE_GLSL = /* glsl */ `
uniform float nevaAerialEnabled;
uniform vec3 nevaAerialZenith;
uniform vec3 nevaAerialHorizon;
uniform vec3 nevaAerialFogColor;
uniform vec4 nevaAerialDensity;
uniform vec3 nevaAerialRange;
vec4 nevaAerialSegment(vec3 worldPosition) {
  if (nevaAerialEnabled < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
  vec3 segment = worldPosition - cameraPosition;
  float distanceMeters = length(segment);
  vec3 ray = segment / max(0.001, distanceMeters);
  float lowerHeight = max(0.0, min(cameraPosition.y, worldPosition.y));
  float deltaHeight = abs(segment.y) * nevaAerialDensity.z;
  float averageDensity = deltaHeight < 0.001
    ? 1.0 - deltaHeight * 0.5 + deltaHeight * deltaHeight / 6.0
    : (1.0 - exp(-deltaHeight)) / deltaHeight;
  averageDensity *= exp(-lowerHeight * nevaAerialDensity.z);
  float nearFade = smoothstep(nevaAerialRange.x, nevaAerialRange.y, distanceMeters);
  float opticalDepth = distanceMeters * nearFade
    * (nevaAerialDensity.x + nevaAerialDensity.y * averageDensity);
  float transmittance = exp(-opticalDepth);
  // The finite authored world still disappears before its terrain/culling edge.
  float boundaryFade = smoothstep(nevaAerialDensity.w * nevaAerialRange.z, nevaAerialDensity.w, distanceMeters);
  transmittance = min(transmittance, 1.0 - boundaryFade);
  float upper = 1.0 - exp(-max(0.0, ray.y) * 3.1);
  vec3 skyRadiance = mix(nevaAerialHorizon, nevaAerialZenith, upper);
  vec3 inscatter = mix(nevaAerialFogColor, skyRadiance, boundaryFade);
  return vec4(inscatter * (1.0 - transmittance), transmittance);
}
vec3 nevaAerialPerspective(vec3 radiance, vec3 worldPosition) {
  vec4 aerial = nevaAerialSegment(worldPosition);
  return radiance * aerial.a + aerial.rgb;
}
`;

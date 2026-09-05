import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";

/**
 * Shared CPU↔GPU wave math for water presentation.
 *
 * WATER_WAVE_CONFIG in WaterSurface.ts remains the single numeric owner for
 * amplitudes, frequencies, speeds, and gains (driven into shader uniforms by
 * FacetedWater). This module owns the two structural constants that were
 * previously magic numbers duplicated in both the GLSL and the CPU mirror
 * (band phases and the detail-axis mix), plus the shared GLSL chunk so the
 * vertex displacement and the analytic normal cannot drift apart.
 *
 * Wave timing is presentation only; buoyancy samples height via WaterSurface.
 * Static headwater elevation consumes the canonical versioned world layout.
 */

/** Phase offsets per wave band, in radians. Must match the CPU mirror. */
export const WAVE_BAND_PHASES = Object.freeze({
  primary: 0.0,
  cross: 1.7,
  detail: 4.1,
});

/** Detail-axis blend between travel and cross directions. Must match CPU. */
export const WAVE_DETAIL_AXIS = Object.freeze({
  along: 0.72,
  across: 0.28,
});

/**
 * Uniform declarations consumed by the shared wave functions below.
 * FacetedWater (and later ShoreFoam) interpolate this into the vertex shader
 * instead of redeclaring the uniforms by hand.
 */
export const WATER_PROFILE_UNIFORMS_GLSL = /* glsl */ `
  uniform sampler2D uWaterProfileMap;
  uniform vec4 uWaterProfileBounds;
`;

export const WATER_PROFILE_FUNCTION_GLSL = /* glsl */ `
  vec4 profileAt(vec2 worldPosition) {
    vec2 uv = (worldPosition - uWaterProfileBounds.xy) / uWaterProfileBounds.zw;
    return texture(uWaterProfileMap, clamp(uv, vec2(0.0), vec2(1.0)));
  }
`;

/** These are derived world data, not a second set of authored elevations. */
export function createHeadwaterUniforms() {
  const { bounds, elevationKnots } = NEVA_HEADWATERS;
  return {
    uHeadwaterBounds: { value: new Float32Array([bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ]) },
    uHeadwaterElevations: { value: new Float32Array(elevationKnots.flatMap((knot) => [knot.z, knot.elevation])) }
  };
}

export const WATER_HEADWATER_UNIFORMS_GLSL = /* glsl */ `
  uniform vec4 uHeadwaterBounds;
  uniform vec2 uHeadwaterElevations[${NEVA_HEADWATERS.elevationKnots.length}];
`;

/** The piecewise smoothstep and derivative mirror NevaHeadwaters exactly. */
export const WATER_HEADWATER_FUNCTION_GLSL = /* glsl */ `
  bool nevaHeadwaterContains(vec2 p) {
    return p.x >= uHeadwaterBounds.x && p.x <= uHeadwaterBounds.z
      && p.y >= uHeadwaterBounds.y && p.y <= uHeadwaterBounds.w;
  }

  vec2 nevaHeadwaterElevationAndGrade(vec2 p) {
    if (!nevaHeadwaterContains(p)) return vec2(0.0);
    if (p.y <= uHeadwaterElevations[0].x) return vec2(uHeadwaterElevations[0].y, 0.0);
    for (int i = 1; i < ${NEVA_HEADWATERS.elevationKnots.length}; i++) {
      vec2 upper = uHeadwaterElevations[i];
      if (p.y <= upper.x) {
        vec2 lower = uHeadwaterElevations[i - 1];
        float span = upper.x - lower.x;
        float t = clamp((p.y - lower.x) / span, 0.0, 1.0);
        float eased = t * t * (3.0 - 2.0 * t);
        return vec2(mix(lower.y, upper.y, eased), (upper.y - lower.y) * 6.0 * t * (1.0 - t) / span);
      }
    }
    return vec2(0.0);
  }

  // The fixed, locally refined base owns the steep reach in every tier. A
  // moving grid cannot reproduce the same curved-grade chords at its rim.
  bool nevaHeadwaterOwnsSurface(vec2 p) {
    return nevaHeadwaterContains(p) && p.y <= uHeadwaterElevations[${NEVA_HEADWATERS.elevationKnots.length - 1}].x;
  }

  float nevaHeadwaterDetailWeight(vec2 p) {
    if (!nevaHeadwaterContains(p)) return 1.0;
    return smoothstep(uHeadwaterElevations[${NEVA_HEADWATERS.elevationKnots.length - 1}].x, uHeadwaterBounds.w, p.y);
  }

  vec3 nevaWaterSurfaceNormal(vec3 waveNormal, float grade) {
    vec2 gradient = -waveNormal.xz / max(0.0001, waveNormal.y);
    gradient.y += grade;
    return normalize(vec3(-gradient.x, 1.0, -gradient.y));
  }
`;

export const WATER_WAVE_UNIFORMS_GLSL = /* glsl */ `
  ${WATER_PROFILE_UNIFORMS_GLSL}
  uniform float uTime;
  uniform float uRoughness;
  uniform float uWindSpeed;
  uniform vec2 uWindDirection;
  uniform vec3 uPrimaryAmplitude;
  uniform vec3 uPrimaryFrequency;
  uniform vec3 uPrimarySpeed;
  uniform vec3 uCrossAmplitude;
  uniform vec3 uCrossFrequency;
  uniform vec3 uCrossSpeed;
  uniform vec3 uDetailAmplitude;
  uniform vec3 uDetailFrequency;
  uniform vec3 uDetailSpeed;
  uniform vec3 uRoughnessGain;
  uniform float uOceanWindGain;
`;

export const WATER_NOISE_GLSL = /* glsl */ `
  vec2 nevaNoiseHash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float nevaGradientNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(nevaNoiseHash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(nevaNoiseHash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(nevaNoiseHash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(nevaNoiseHash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  vec3 nevaScrollingDetailNormal(vec2 worldPos, float time, float scrollSpeed, float normalStrength) {
    vec2 uv = worldPos * 0.075 + vec2(time * scrollSpeed * 0.08, time * scrollSpeed * 0.045);
    vec2 e = vec2(0.2, 0.0);
    float h = nevaGradientNoise(uv);
    float hx = nevaGradientNoise(uv + e.xy);
    float hz = nevaGradientNoise(uv + e.yx);
    vec2 nGrad = (vec2(hx - h, hz - h) / e.x) * normalStrength;
    return normalize(vec3(-nGrad.x, 1.0, -nGrad.y));
  }
`;

/**
 * Regional wave field shared by water vertex shaders.
 *
 * waveHeight() is the exact previous FacetedWater formulation, unchanged.
 * waveHeightAndNormal() evaluates height plus the analytic gradient in one
 * pass: height is Σ A·sin(φ), so dH/d(axis) is Σ A·freq·cos(φ) reprojected
 * onto world X/Z through the travel/cross/detail axes, scaled by the same
 * roughnessScale. Regional weights and travel direction are treated as
 * locally constant, matching the CPU mirror in WaterSurface.waterNormal().
 */
export const WATER_WAVE_FUNCTION_GLSL = /* glsl */ `
  ${WATER_PROFILE_FUNCTION_GLSL}

  float weightedValue(vec3 values, vec3 weights) {
    return dot(values, weights);
  }

  float bandHeight(
    vec3 amplitude,
    vec3 frequency,
    vec3 speed,
    vec3 weights,
    float projectedPosition,
    float phase
  ) {
    return sin(
      projectedPosition * weightedValue(frequency, weights)
      + uTime * weightedValue(speed, weights)
      + phase
    ) * weightedValue(amplitude, weights);
  }

  float waveHeight(vec2 worldPosition, vec4 profile) {
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction = normalize(mix(localDirection, uWindDirection, oceanWeight));
    vec2 crossDirection = vec2(-direction.y, direction.x);
    float primaryPosition = dot(worldPosition, direction);
    float crossPosition = dot(worldPosition, crossDirection);
    float detailPosition = dot(worldPosition, direction * ${WAVE_DETAIL_AXIS.along.toFixed(2)} + crossDirection * ${WAVE_DETAIL_AXIS.across.toFixed(2)});
    float roughnessScale = 1.0
      + uRoughness * weightedValue(uRoughnessGain, weights)
      + uWindSpeed * oceanWeight * uOceanWindGain;
    return (
      bandHeight(uPrimaryAmplitude, uPrimaryFrequency, uPrimarySpeed, weights, primaryPosition, ${WAVE_BAND_PHASES.primary.toFixed(1)})
      + bandHeight(uCrossAmplitude, uCrossFrequency, uCrossSpeed, weights, crossPosition, ${WAVE_BAND_PHASES.cross.toFixed(1)})
      + bandHeight(uDetailAmplitude, uDetailFrequency, uDetailSpeed, weights, detailPosition, ${WAVE_BAND_PHASES.detail.toFixed(1)})
    ) * roughnessScale;
  }

  void waveHeightAndNormal(vec2 worldPosition, vec4 profile, out float height, out vec3 normal) {
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction = normalize(mix(localDirection, uWindDirection, oceanWeight));
    vec2 crossDirection = vec2(-direction.y, direction.x);
    vec2 detailDirection = direction * ${WAVE_DETAIL_AXIS.along.toFixed(2)} + crossDirection * ${WAVE_DETAIL_AXIS.across.toFixed(2)};
    float primaryPosition = dot(worldPosition, direction);
    float crossPosition = dot(worldPosition, crossDirection);
    float detailPosition = dot(worldPosition, detailDirection);
    float roughnessScale = 1.0
      + uRoughness * weightedValue(uRoughnessGain, weights)
      + uWindSpeed * oceanWeight * uOceanWindGain;
    float primaryFrequency = weightedValue(uPrimaryFrequency, weights);
    float primarySpeed = weightedValue(uPrimarySpeed, weights);
    float primaryAmplitude = weightedValue(uPrimaryAmplitude, weights);
    float primaryPhase = primaryPosition * primaryFrequency + uTime * primarySpeed + ${WAVE_BAND_PHASES.primary.toFixed(1)};
    float crossFrequency = weightedValue(uCrossFrequency, weights);
    float crossSpeed = weightedValue(uCrossSpeed, weights);
    float crossAmplitude = weightedValue(uCrossAmplitude, weights);
    float crossPhase = crossPosition * crossFrequency + uTime * crossSpeed + ${WAVE_BAND_PHASES.cross.toFixed(1)};
    float detailFrequency = weightedValue(uDetailFrequency, weights);
    float detailSpeed = weightedValue(uDetailSpeed, weights);
    float detailAmplitude = weightedValue(uDetailAmplitude, weights);
    float detailPhase = detailPosition * detailFrequency + uTime * detailSpeed + ${WAVE_BAND_PHASES.detail.toFixed(1)};
    height = (
      sin(primaryPhase) * primaryAmplitude
      + sin(crossPhase) * crossAmplitude
      + sin(detailPhase) * detailAmplitude
    ) * roughnessScale;
    float dPrimary = cos(primaryPhase) * primaryFrequency * primaryAmplitude;
    float dCross = cos(crossPhase) * crossFrequency * crossAmplitude;
    float dDetail = cos(detailPhase) * detailFrequency * detailAmplitude;
    vec2 gradient = (direction * dPrimary + crossDirection * dCross + detailDirection * dDetail) * roughnessScale;
    normal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
  }

  ${WATER_NOISE_GLSL}
`;

import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";

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
 * Cross-band axis, as the same travel/cross blend. Two wave trains crossing
 * at exactly ninety degrees interfere on a square lattice and read as a
 * woven plaid; a real wind sea meets the swell at an oblique angle. Sixty-odd
 * degrees keeps the two trains clearly distinct without the regular grid.
 */
export const WAVE_CROSS_AXIS = Object.freeze({
  along: 0.46,
  across: 0.89,
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
  const { bounds, elevationKnots, fall } = NEVA_HEADWATERS;
  return {
    uHeadwaterBounds: { value: new Float32Array([bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ]) },
    uHeadwaterElevations: { value: new Float32Array(elevationKnots.flatMap((knot) => [knot.z, knot.elevation])) },
    uHeadwaterFallBand: { value: new Float32Array([fall.lipZ, fall.landingZ]) },
    uHeadwaterLandingXZ: { value: new Float32Array([WorldLayout.riverCenterX(fall.landingZ), fall.landingZ]) }
  };
}

export const WATER_HEADWATER_UNIFORMS_GLSL = /* glsl */ `
  uniform vec4 uHeadwaterBounds;
  uniform vec2 uHeadwaterElevations[${NEVA_HEADWATERS.elevationKnots.length}];
  uniform vec2 uHeadwaterFallBand;
  uniform vec2 uHeadwaterLandingXZ;
`;

/** The piecewise smoothstep and derivative mirror NevaHeadwaters exactly. */
export const WATER_HEADWATER_FUNCTION_GLSL = /* glsl */ `
  bool nevaHeadwaterContains(vec2 p) {
    return p.x >= uHeadwaterBounds.x && p.x <= uHeadwaterBounds.z
      && p.y >= uHeadwaterBounds.y && p.y <= uHeadwaterBounds.w;
  }

  // The authored falling segment owns its own sheet; horizontal water discards
  // here so nothing draws a second surface over the drop.
  bool nevaInsideHeadwaterFallBand(vec2 p) {
    return nevaHeadwaterContains(p)
      && p.y > uHeadwaterFallBand.x && p.y < uHeadwaterFallBand.y;
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

/**
 * Static bed depth for the vertex stage.
 *
 * The fragment stage reads the same canonical map through
 * `COASTAL_FIELD_GLSL`, but that chunk's shore functions use `dFdx`/`dFdy`
 * and so cannot be compiled into a vertex shader. This declares only the
 * sampler, its bounds and an unfiltered lookup. It is interpolated into the
 * vertex stage alone, so neither stage declares the uniforms twice.
 */
export const WATER_BED_UNIFORMS_GLSL = /* glsl */ `
  uniform sampler2D uWaterDepthMap;
  uniform int uCoastalFieldEnabled;
  uniform vec4 uOpticsBounds;
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
  uniform vec3 uPrimaryOrbit;
  uniform vec3 uCrossAmplitude;
  uniform vec3 uCrossFrequency;
  uniform vec3 uCrossSpeed;
  uniform vec3 uCrossOrbit;
  uniform vec3 uDetailAmplitude;
  uniform vec3 uDetailFrequency;
  uniform vec3 uDetailSpeed;
  uniform vec3 uDetailOrbit;
  uniform vec3 uRoughnessGain;
  uniform float uOceanWindGain;
  uniform float uSteepnessCeiling;
  uniform float uShoalGain;
  uniform float uShoalPeak;
  uniform float uShoalDeep;
  uniform float uShoalDamp;
  uniform float uShoalFreshwater;
  uniform vec2 uCrestWander;
  ${WATER_BED_UNIFORMS_GLSL}
`;

export const WATER_BED_FUNCTION_GLSL = /* glsl */ `
  // R channel: still-water column depth over the canonical bed, in metres.
  float nevaBedWaterDepth(vec2 worldPosition) {
    if (uCoastalFieldEnabled == 0) return 64.0;
    vec2 uv = clamp((worldPosition - uOpticsBounds.xy) / uOpticsBounds.zw, 0.0, 1.0);
    return texture(uWaterDepthMap, uv).r;
  }

  /**
   * Shoaling response, as (amplitude factor, orbit factor).
   *
   * A wave train feels the bed before it reaches the beach: it shortens,
   * grows and steepens over the shelf, then dies in the swash zone. The damp term
   * always applies, so displacement reaches zero before the waterline on
   * every body of water and waves cannot punch through the sand; only the
   * shelf gain is suppressed for freshwater, which has no ocean swell to
   * transform. The orbit steepens faster than the amplitude grows, which is
   * what peaks a crest up before it breaks.
   */
  vec2 nevaWaveShoaling(float depth, float riverWeight) {
    float damp = smoothstep(0.0, uShoalDamp, depth);
    float shelf = 1.0 - smoothstep(uShoalPeak, uShoalDeep, depth);
    float gain = uShoalGain * shelf * mix(1.0, uShoalFreshwater, riverWeight);
    return vec2((1.0 + gain) * damp, (1.0 + gain * 1.45) * damp);
  }
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

  float nevaNoise01(vec2 p) {
    return clamp(0.5 + nevaGradientNoise(p), 0.0, 1.0);
  }

  // Value and exact derivatives share four corner hashes. Finite differences
  // evaluated three whole noise cells per normal and introduced directional bias.
  vec3 nevaNoiseValueGradient(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 du = 6.0 * f * (1.0 - f);
    vec2 g00 = nevaNoiseHash2(i), g10 = nevaNoiseHash2(i + vec2(1.0, 0.0));
    vec2 g01 = nevaNoiseHash2(i + vec2(0.0, 1.0)), g11 = nevaNoiseHash2(i + vec2(1.0));
    float a = dot(g00, f), b = dot(g10, f - vec2(1.0, 0.0));
    float c = dot(g01, f - vec2(0.0, 1.0)), d = dot(g11, f - vec2(1.0));
    float lower = mix(a, b, u.x), upper = mix(c, d, u.x);
    vec2 gradient = mix(mix(g00, g10, u.x), mix(g01, g11, u.x), u.y);
    gradient += du * vec2(mix(b - a, d - c, u.y), upper - lower);
    return vec3(mix(lower, upper, u.y), gradient);
  }

  vec3 nevaScrollingDetailNormal(vec2 worldPos, float time, float scrollSpeed, float normalStrength) {
    vec2 uv = worldPos * 0.075 + vec2(time * scrollSpeed * 0.08, time * scrollSpeed * 0.045);
    vec2 nGrad = nevaNoiseValueGradient(uv).yz * normalStrength;
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
  ${WATER_BED_FUNCTION_GLSL}

  float weightedValue(vec3 values, vec3 weights) {
    return dot(values, weights);
  }

  /**
   * The travel frame for a point: primary, cross and detail axes.
   *
   * The cross band sits off-perpendicular so the two trains do not weave a
   * square plaid. All three axes are unit length, so a band's frequency means
   * the same thing on whichever axis it rides.
   */
  void nevaWaveAxes(vec2 localDirection, float oceanWeight,
    out vec2 primaryAxis, out vec2 crossAxis, out vec2 detailAxis) {
    primaryAxis = normalize(mix(localDirection, uWindDirection, oceanWeight));
    vec2 perpendicular = vec2(-primaryAxis.y, primaryAxis.x);
    crossAxis = normalize(primaryAxis * ${WAVE_CROSS_AXIS.along.toFixed(2)} + perpendicular * ${WAVE_CROSS_AXIS.across.toFixed(2)});
    detailAxis = normalize(primaryAxis * ${WAVE_DETAIL_AXIS.along.toFixed(2)} + perpendicular * ${WAVE_DETAIL_AXIS.across.toFixed(2)});
  }

  /**
   * Crest wander, as a phase offset and its gradient.
   *
   * Straight, evenly spaced crest lines are the giveaway that a sea is a sum
   * of sines. Adding a slow phase warp across the fronts bends and bunches
   * them the way a real swell arrives. This warps the phase rather than
   * rotating the travel heading: a rotation's effect on the phase is levered
   * by how far the point sits from the world origin, so it would leave the
   * wavelength intact near the origin and distort it badly a kilometre out.
   * A phase offset's gradient is bounded by uCrestWander.x * uCrestWander.y
   * everywhere, so the band keeps its identity across the whole map.
   */
  void nevaCrestWander(vec2 worldPosition, vec2 travelAxis, out float warp, out vec2 gradient) {
    vec2 across = vec2(-travelAxis.y, travelAxis.x);
    float along = dot(worldPosition, across) * uCrestWander.x;
    warp = sin(along) * uCrestWander.y;
    gradient = across * (cos(along) * uCrestWander.x * uCrestWander.y);
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
    vec2 direction, crossDirection, detailDirection;
    nevaWaveAxes(localDirection, oceanWeight, direction, crossDirection, detailDirection);
    float primaryPosition = dot(worldPosition, direction);
    float crossPosition = dot(worldPosition, crossDirection);
    float detailPosition = dot(worldPosition, detailDirection);
    float warp;
    vec2 warpGradient;
    nevaCrestWander(worldPosition, direction, warp, warpGradient);
    float roughnessScale = 1.0
      + uRoughness * weightedValue(uRoughnessGain, weights)
      + uWindSpeed * oceanWeight * uOceanWindGain;
    // Shore foam quads ride this height, so they have to shoal with the water
    // they sit on; without the damp term they float above a shoaled surface.
    float shoal = nevaWaveShoaling(nevaBedWaterDepth(worldPosition), riverWeight).x;
    return (
      bandHeight(uPrimaryAmplitude, uPrimaryFrequency, uPrimarySpeed, weights, primaryPosition, ${WAVE_BAND_PHASES.primary.toFixed(1)} + warp)
      + bandHeight(uCrossAmplitude, uCrossFrequency, uCrossSpeed, weights, crossPosition, ${WAVE_BAND_PHASES.cross.toFixed(1)} + warp)
      + bandHeight(uDetailAmplitude, uDetailFrequency, uDetailSpeed, weights, detailPosition, ${WAVE_BAND_PHASES.detail.toFixed(1)} + warp)
    ) * roughnessScale * shoal;
  }

  /**
   * Trochoidal (Gerstner) evaluation of the same three bands.
   *
   * Each band moves its water in an orbit rather than straight up and down:
   * the surface slides back toward the crest it is building, which sharpens
   * crests and broadens troughs — the shape an actual wave has, and the shape
   * a stack of sines can never make. The orbit is the horizontal radius in
   * metres (orbitGain * amplitude, so 1 is the physical circle).
   *
   * Outputs, all evaluated from the *undisplaced* lattice position:
   *   height     vertical displacement, identical to waveHeight() at orbit 0
   *   offset     horizontal displacement to add to the world position
   *   normal     exact surface normal of the displaced surface
   *   fold       1 - horizontal Jacobian: 0 where the surface is stretched or
   *              flat, rising toward 1 as a crest compresses into a cusp.
   *              This is the physical whitecap signal; foam belongs where the
   *              surface is actually folding, not wherever a roughness dial
   *              happens to be turned up.
   *
   * At orbit 0 the Jacobian is the identity and the normal reduces exactly to
   * the previous vec3(-gradient.x, 1, -gradient.y) heightfield form, so the
   * former surface is a strict special case of this one.
   */
  void waveGerstner(
    vec2 worldPosition, vec4 profile, float depth,
    out float height, out vec2 offset, out vec3 normal, out float fold
  ) {
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction, crossDirection, detailDirection;
    nevaWaveAxes(localDirection, oceanWeight, direction, crossDirection, detailDirection);

    vec2 shoal = nevaWaveShoaling(depth, riverWeight);
    float roughnessScale = 1.0
      + uRoughness * weightedValue(uRoughnessGain, weights)
      + uWindSpeed * oceanWeight * uOceanWindGain;
    float amplitudeScale = roughnessScale * shoal.x;

    vec3 frequency = vec3(
      weightedValue(uPrimaryFrequency, weights),
      weightedValue(uCrossFrequency, weights),
      weightedValue(uDetailFrequency, weights)
    );
    vec3 amplitude = vec3(
      weightedValue(uPrimaryAmplitude, weights),
      weightedValue(uCrossAmplitude, weights),
      weightedValue(uDetailAmplitude, weights)
    ) * amplitudeScale;
    vec3 orbit = vec3(
      weightedValue(uPrimaryOrbit, weights),
      weightedValue(uCrossOrbit, weights),
      weightedValue(uDetailOrbit, weights)
    ) * amplitude * shoal.y;

    // Σ orbit·wavenumber is the trochoid's steepness, and the phase warp
    // raises the effective wavenumber, so it counts toward the sum. Past 1
    // the surface folds through itself and the CPU inversion stops
    // contracting, so the whole set is scaled back together — which preserves
    // the relative weight of the bands instead of flattening whichever one
    // happens to be evaluated last.
    float steepness = dot(orbit, frequency + uCrestWander.x * uCrestWander.y);
    if (steepness > uSteepnessCeiling) orbit *= uSteepnessCeiling / steepness;

    float warp;
    vec2 warpGradient;
    nevaCrestWander(worldPosition, direction, warp, warpGradient);
    vec3 phase = vec3(
      dot(worldPosition, direction) * frequency.x + uTime * weightedValue(uPrimarySpeed, weights) + ${WAVE_BAND_PHASES.primary.toFixed(1)},
      dot(worldPosition, crossDirection) * frequency.y + uTime * weightedValue(uCrossSpeed, weights) + ${WAVE_BAND_PHASES.cross.toFixed(1)},
      dot(worldPosition, detailDirection) * frequency.z + uTime * weightedValue(uDetailSpeed, weights) + ${WAVE_BAND_PHASES.detail.toFixed(1)}
    ) + warp;
    vec3 sinPhase = sin(phase);
    vec3 cosPhase = cos(phase);

    height = dot(amplitude, sinPhase);
    offset = (direction * orbit.x * cosPhase.x)
      + (crossDirection * orbit.y * cosPhase.y)
      + (detailDirection * orbit.z * cosPhase.z);

    // Each band's phase gradient is its own axis scaled by frequency, plus the
    // shared warp gradient. Vertical slope follows from it directly; the
    // horizontal Jacobian is the outer product of the orbit's own axis with
    // that gradient, so once the warp is in play the matrix stops being
    // symmetric and both off-diagonal terms have to be carried separately.
    vec2 gradientPrimary = direction * frequency.x + warpGradient;
    vec2 gradientCross = crossDirection * frequency.y + warpGradient;
    vec2 gradientDetail = detailDirection * frequency.z + warpGradient;
    vec2 gradient = gradientPrimary * (amplitude.x * cosPhase.x)
      + gradientCross * (amplitude.y * cosPhase.y)
      + gradientDetail * (amplitude.z * cosPhase.z);
    vec3 compress = orbit * sinPhase;
    float jxx = -(direction.x * gradientPrimary.x * compress.x
      + crossDirection.x * gradientCross.x * compress.y
      + detailDirection.x * gradientDetail.x * compress.z);
    float jxz = -(direction.x * gradientPrimary.y * compress.x
      + crossDirection.x * gradientCross.y * compress.y
      + detailDirection.x * gradientDetail.y * compress.z);
    float jzx = -(direction.y * gradientPrimary.x * compress.x
      + crossDirection.y * gradientCross.x * compress.y
      + detailDirection.y * gradientDetail.x * compress.z);
    float jzz = -(direction.y * gradientPrimary.y * compress.x
      + crossDirection.y * gradientCross.y * compress.y
      + detailDirection.y * gradientDetail.y * compress.z);

    vec3 tangentX = vec3(1.0 + jxx, gradient.x, jzx);
    vec3 tangentZ = vec3(jxz, gradient.y, 1.0 + jzz);
    normal = normalize(cross(tangentZ, tangentX));
    fold = clamp(1.0 - ((1.0 + jxx) * (1.0 + jzz) - jxz * jzx), 0.0, 1.0);
  }

  void waveHeightAndNormal(vec2 worldPosition, vec4 profile, out float height, out vec3 normal) {
    float riverWeight = profile.g;
    float oceanWeight = profile.b;
    float seaWeight = max(0.0, 1.0 - riverWeight - oceanWeight);
    vec3 weights = vec3(riverWeight, seaWeight, oceanWeight);
    float localAngle = profile.a * 6.28318530718 - 3.14159265359;
    vec2 localDirection = vec2(cos(localAngle), sin(localAngle));
    vec2 direction, crossDirection, detailDirection;
    nevaWaveAxes(localDirection, oceanWeight, direction, crossDirection, detailDirection);
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

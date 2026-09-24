import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { WorldLayout } from "../../world/WorldLayout";
import { WATER_BAND_COUNT } from "./WaterSurface";

/**
 * Shared GPU wave math for water presentation.
 *
 * `WATER_WAVE_CONFIG` in WaterSurface.ts is the single numeric owner; these
 * chunks are the GPU half of the same field, written expression for
 * expression against the CPU mirror there so buoyancy and the drawn surface
 * agree. Wave timing is presentation only.
 */

/**
 * Field lookup. The profile and depth textures share one lattice, and this
 * transform lands every lattice node on a texel centre (see
 * `waterFieldUvTransform`). Declared once per shader stage.
 */
export const WATER_FIELD_UV_GLSL = /* glsl */ `
  uniform vec4 uWaterFieldUv;
  vec2 nevaWaterFieldUv(vec2 worldPosition) {
    return worldPosition * uWaterFieldUv.xy + uWaterFieldUv.zw;
  }
`;

export const WATER_PROFILE_UNIFORMS_GLSL = /* glsl */ `
  uniform sampler2D uWaterProfileMap;
`;

/** (river weight, ocean weight, unit travel direction). */
export const WATER_PROFILE_FUNCTION_GLSL = /* glsl */ `
  vec4 nevaWaterProfile(vec2 worldPosition) {
    vec4 raw = texture(uWaterProfileMap, nevaWaterFieldUv(worldPosition));
    vec2 direction = raw.ba * 2.0 - 1.0;
    float directionLength = length(direction);
    direction = directionLength > 0.0001 ? direction / directionLength : vec2(0.0, 1.0);
    return vec4(raw.r, raw.g, direction);
  }
`;

/**
 * Swash level: the run-up of each arriving set, in metres above still water.
 * Only sines, so it is identical to `swashLevel()` in WaterSurface.ts, and it
 * needs no textures, so the terrain's wet-sand treatment can share it.
 */
export const WATER_SWASH_GLSL = /* glsl */ `
  float nevaSwashCycle(float phase) {
    float p = fract(phase);
    return p < 0.32 ? smoothstep(0.0, 0.32, p) : 1.0 - smoothstep(0.32, 1.0, p);
  }

  float nevaSwashLevel(vec2 xz, float time, float period, float runup, float contact) {
    if (contact <= 0.0 || runup <= 0.0) return 0.0;
    float offset = 0.31 * sin(xz.x * 0.019 + xz.y * 0.011)
      + 0.21 * sin(xz.y * 0.027 - xz.x * 0.013 + 1.7)
      + 0.09 * sin(xz.x * 0.061 + xz.y * 0.047 + 4.1);
    float a = nevaSwashCycle(time / period + offset);
    float b = nevaSwashCycle(time / (period * 1.37) + offset * 1.6 + 0.43);
    return runup * contact * (0.68 * a + 0.32 * b);
  }

  // The reach cap: the lift may not carry the sheet further up the beach than
  // reach metres, so a gentle shelf gets a proportionally thin run-up.
  float nevaSwashLift(float level, float depthGradient, float reach) {
    return min(level, depthGradient * reach);
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

  // The dedicated, locally refined headwater surface owns the elevated reach.
  // The camera-centred LOD surface stays flat at sea level and yields here.
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
 * Bed/field uniforms for the vertex stage. The fragment stage reads the same
 * map through `COASTAL_FIELD_GLSL`, whose shore functions use derivatives and
 * so cannot compile here; this declares only what displacement needs.
 */
export const WATER_BED_UNIFORMS_GLSL = /* glsl */ `
  uniform sampler2D uWaterDepthMap;
  uniform int uCoastalFieldEnabled;
  uniform float uSwashPeriod;
  uniform float uSwashRunup;
  ${WATER_FIELD_UV_GLSL}
`;

export const WATER_WAVE_UNIFORMS_GLSL = /* glsl */ `
  ${WATER_PROFILE_UNIFORMS_GLSL}
  uniform float uTime;
  uniform float uRoughness;
  uniform float uWindSpeed;
  /** Regional amplitude (river, sea, ocean) per band. */
  uniform vec3 uBandAmplitude[${WATER_BAND_COUNT}];
  /** Per band: (wave vector x, wave vector z, angular speed, phase offset). */
  uniform vec4 uBandWave[${WATER_BAND_COUNT}];
  uniform float uBandOrbit[${WATER_BAND_COUNT}];
  uniform vec3 uRoughnessGain;
  uniform float uOceanWindGain;
  uniform float uSteepnessCeiling;
  uniform vec2 uLodSamples;
  uniform float uShoalGain;
  uniform float uShoalPeak;
  uniform float uShoalDeep;
  uniform float uShoalDamp;
  uniform float uShoalFreshwater;
  uniform float uBreakingDepthRatio;
  uniform vec2 uSwashReach;
  uniform vec2 uCrestWander;
  uniform vec2 uSwashFade;
  ${WATER_BED_UNIFORMS_GLSL}
`;

export const WATER_BED_FUNCTION_GLSL = /* glsl */ `
  // R: still-water column depth, G: bed elevation, B: signed shore distance,
  // A: coastal contact weight.
  vec4 nevaBedField(vec2 worldPosition) {
    if (uCoastalFieldEnabled == 0) return vec4(64.0, -64.0, 64.0, 0.0);
    return texture(uWaterDepthMap, nevaWaterFieldUv(worldPosition));
  }

  float nevaBedWaterDepth(vec2 worldPosition) {
    return nevaBedField(worldPosition).r;
  }

  /**
   * Shoaling response, as (amplitude factor, orbit damp, surf energy).
   *
   * A wave train feels the bed before the beach: it grows over the shelf,
   * then dies in the swash zone. The damp term always applies, so
   * displacement reaches zero before the waterline and crests cannot punch
   * through the sand. The share of the wave the damp removes is handed back
   * as surf energy: a real wave does not fade at the beach, it breaks.
   */
  vec3 nevaWaveShoaling(float depth, float riverWeight) {
    float damp = smoothstep(0.0, uShoalDamp, depth);
    float shelf = 1.0 - smoothstep(uShoalPeak, uShoalDeep, depth);
    float gain = uShoalGain * shelf * mix(1.0, uShoalFreshwater, riverWeight);
    float surf = (1.0 - damp) * smoothstep(0.0, 0.08, depth) * (1.0 + gain);
    return vec3((1.0 + gain) * damp, damp, surf);
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

  /**
   * Fade a detail field out as it approaches its own Nyquist limit. Each
   * field has a known world-space period; once a pixel spans more than about
   * half of it only a beat pattern reaches the screen, so every field is
   * faded against its own period and is gone before it aliases.
   */
  float nevaDetailFade(float featureMeters, float footprint) {
    return 1.0 - smoothstep(featureMeters * 0.25, featureMeters * 0.5, footprint);
  }
`;

/**
 * The regional wave field, evaluated at an undisplaced lattice point.
 *
 * Trochoidal (Gerstner) plane-wave bands: each moves its water in an orbit
 * rather than straight up and down, which rounds troughs and lifts crests.
 * Wave vector, speed and heading are constants; only height varies across
 * the map, so no region, bed or wind change can shear a crest.
 * `cellMeters` is the lattice spacing at this vertex; a band the lattice
 * cannot resolve is faded out of the geometry and reported instead as slope
 * variance, so the shading can treat it as roughness.
 *
 * Outputs:
 *   height         vertical displacement (waves + swash)
 *   offset         horizontal displacement
 *   normal         exact normal of the displaced, resolved surface
 *   fold           1 - horizontal Jacobian: rises toward 1 as a crest folds
 *   surf           breaking energy handed back by the shoaling damp
 *   slopeVariance  (unresolved, resolved) Σ ½(A·k)² of the full bands
 *   weights        (river, sea, ocean)
 *   flow           unit baked local direction (the current on a river)
 */
export const WATER_WAVE_FUNCTION_GLSL = /* glsl */ `
  ${WATER_PROFILE_FUNCTION_GLSL}
  ${WATER_BED_FUNCTION_GLSL}
  ${WATER_SWASH_GLSL}

  void nevaWaveField(
    vec2 p, float cellMeters,
    out float height, out vec2 offset, out vec3 normal, out float fold, out float surf,
    out vec2 slopeVariance, out vec3 weights, out vec2 flow
  ) {
    vec4 profile = nevaWaterProfile(p);
    float river = profile.x;
    float ocean = profile.y;
    float sea = max(0.0, 1.0 - river - ocean);
    weights = vec3(river, sea, ocean);
    flow = profile.zw;
    vec4 bed = nevaBedField(p);

    // Crest wander: a slow phase warp across the swell's fixed heading, with
    // a bounded gradient.
    vec2 perpendicular = normalize(vec2(-uBandWave[0].y, uBandWave[0].x));
    float acrossPhase = dot(p, perpendicular) * uCrestWander.x;
    float warp = sin(acrossPhase) * uCrestWander.y;
    vec2 warpGradient = perpendicular * (cos(acrossPhase) * uCrestWander.x * uCrestWander.y);

    vec3 shoal = nevaWaveShoaling(bed.r, river);
    float roughnessScale = 1.0
      + uRoughness * dot(uRoughnessGain, weights)
      + uWindSpeed * ocean * uOceanWindGain;
    float amplitudeScale = roughnessScale * shoal.x;
    // Marine surf only: a river bank has a current, not an arriving swell.
    surf = shoal.z * roughnessScale * (sea + ocean);

    // Depth-limited breaking: the summed crest height may not exceed a share
    // of the still-water depth; what the cap removes breaks as surf.
    float fullSum = 0.0;
    for (int i = 0; i < ${WATER_BAND_COUNT}; i++) fullSum += dot(uBandAmplitude[i], weights) * amplitudeScale;
    float breakLimit = uBreakingDepthRatio * max(bed.r, 0.0);
    // Smooth saturation toward the limit, (1 + r⁴)^(-1/4): a hard min() put a
    // kink in the crest height along one depth contour, drawn as a crease.
    float breakRatio = fullSum / max(breakLimit, 0.000001);
    float breakScale = pow(1.0 + breakRatio * breakRatio * breakRatio * breakRatio, -0.25);
    surf += (1.0 - breakScale) * smoothstep(0.02, 0.15, bed.r) * roughnessScale * (sea + ocean);

    float bandK[${WATER_BAND_COUNT}];
    float bandA[${WATER_BAND_COUNT}];
    float bandQ[${WATER_BAND_COUNT}];
    float bandPhase[${WATER_BAND_COUNT}];
    vec2 bandAxis[${WATER_BAND_COUNT}];
    float steepness = 0.0;
    float warpCeiling = uCrestWander.x * uCrestWander.y;
    slopeVariance = vec2(0.0);
    for (int i = 0; i < ${WATER_BAND_COUNT}; i++) {
      vec4 wave = uBandWave[i];
      float k = length(wave.xy);
      bandAxis[i] = wave.xy / k;
      bandK[i] = k;
      float wavelength = 6.28318530718 / max(k, 0.0001);
      float lod = 1.0 - smoothstep(wavelength / uLodSamples.x, wavelength / uLodSamples.y, cellMeters);
      float fullAmplitude = dot(uBandAmplitude[i], weights) * amplitudeScale * breakScale;
      bandA[i] = fullAmplitude * lod;
      // The orbit carries the damp twice (once through the amplitude), so the
      // horizontal motion dies before the vertical near the beach.
      bandQ[i] = uBandOrbit[i] * bandA[i] * shoal.y;
      // k·x − ωt: crests travel along the band's fixed world heading.
      bandPhase[i] = dot(p, wave.xy) - uTime * wave.z + wave.w + warp;
      float slope = fullAmplitude * k;
      slopeVariance += 0.5 * slope * slope * vec2(1.0 - lod, lod);
      steepness += bandQ[i] * (k + warpCeiling);
    }
    // Past the ceiling the surface folds through itself; scale the set
    // together so the bands keep their relative weight.
    if (steepness > uSteepnessCeiling) {
      float scale = uSteepnessCeiling / steepness;
      for (int i = 0; i < ${WATER_BAND_COUNT}; i++) bandQ[i] *= scale;
    }

    height = 0.0;
    offset = vec2(0.0);
    vec2 gradient = vec2(0.0);
    float jxx = 0.0;
    float jxz = 0.0;
    float jzx = 0.0;
    float jzz = 0.0;
    for (int i = 0; i < ${WATER_BAND_COUNT}; i++) {
      float s = sin(bandPhase[i]);
      float c = cos(bandPhase[i]);
      vec2 axis = bandAxis[i];
      height += bandA[i] * s;
      offset += axis * (bandQ[i] * c);
      // Phase gradient: the band's own axis scaled by k, plus the warp.
      vec2 phaseGradient = axis * bandK[i] + warpGradient;
      gradient += phaseGradient * (bandA[i] * c);
      float compress = bandQ[i] * s;
      jxx -= axis.x * phaseGradient.x * compress;
      jxz -= axis.x * phaseGradient.y * compress;
      jzx -= axis.y * phaseGradient.x * compress;
      jzz -= axis.y * phaseGradient.y * compress;
    }

    // Surf breaks on the swell's crests: the returned energy is gathered into
    // breaker lines that ride each crest shoreward and dissolve at the beach,
    // with a little aerated water left between them. The energy saturates
    // first: storm gain otherwise lifted even the trough share to full foam
    // and a whole bank read as one milky sheet with no breaker lines.
    surf = min(surf, 1.0);
    surf *= mix(0.12, 1.0, smoothstep(0.6, 0.97, 0.5 + 0.5 * sin(bandPhase[0] + 0.35)));

    // Swash run-up: marine shores only, fading out seaward of the swash zone,
    // and capped by the reach the local beach gradient allows.
    float swashLevel = nevaSwashLevel(p, uTime, uSwashPeriod, uSwashRunup, bed.a);
    if (swashLevel > 0.0) {
      float depthX = nevaBedField(p + vec2(uSwashReach.y, 0.0)).r;
      float depthZ = nevaBedField(p + vec2(0.0, uSwashReach.y)).r;
      float depthGradient = length(vec2(depthX - bed.r, depthZ - bed.r)) / uSwashReach.y;
      height += nevaSwashLift(swashLevel, depthGradient, uSwashReach.x)
        * (sea + ocean) * (1.0 - smoothstep(uSwashFade.x, uSwashFade.y, bed.r));
    }

    vec3 tangentX = vec3(1.0 + jxx, gradient.x, jzx);
    vec3 tangentZ = vec3(jxz, gradient.y, 1.0 + jzz);
    normal = normalize(cross(tangentZ, tangentX));
    fold = clamp(1.0 - ((1.0 + jxx) * (1.0 + jzz) - jxz * jzx), 0.0, 1.0);
  }

  ${WATER_NOISE_GLSL}
`;

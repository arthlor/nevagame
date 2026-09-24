import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import { NEVA_HEADWATERS, headwaterGradientAt } from "../../world/NevaHeadwaters";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { createWaterFieldSample, WaterFieldStore, type WaterFieldSample } from "./waterField";
import {
  waterSpatialProfile,
  type WaterRegion,
  type WaterRegionWeights,
  type WaterSpatialProfile,
  type WaterSpatialQueries
} from "./waterProfile";

export { waterSpatialProfile };
export type { WaterRegion, WaterRegionWeights, WaterSpatialProfile, WaterSpatialQueries };

export interface WaterConditions {
  seaRoughness: number;
  /**
   * Part of the weather record. The wave field deliberately ignores it: the
   * bands keep fixed headings so the sea never swings when the wind turns.
   */
  windDirectionDeg: number;
  windSpeed: number;
  /** 0..1 rainfall; presentation only (rain rings on the surface). */
  precipitation?: number;
}

export interface WaterSample {
  height: number;
  normal: THREE.Vector3;
  region: WaterRegion;
  weights: WaterRegionWeights;
}

/** Regional triple: river, sea, ocean. */
type Regional = readonly [number, number, number];

export interface WaterWaveBand {
  readonly id: string;
  /** Vertical amplitude in metres, per region (river, sea, ocean). */
  readonly amplitude: Regional;
  /** Wavenumber k = 2π/λ in radians per metre — one value everywhere. */
  readonly wavenumber: number;
  /**
   * World travel heading in degrees: 0 travels toward +Z, 90 toward +X. One
   * fixed heading everywhere, so every band is a true plane wave.
   */
  readonly headingDeg: number;
  /**
   * Trochoidal (Gerstner) orbit gain. A deep-water particle traces a circle
   * whose radius is the wave's own amplitude, so the horizontal displacement
   * is `orbitGain · amplitude` metres and `1` is physically exact; below 1
   * the crests stay rounder.
   */
  readonly orbitGain: number;
  /** Constant phase offset, radians. */
  readonly phase: number;
}

/**
 * The single numeric owner for CPU buoyancy and GPU water displacement.
 *
 * Three gentle Gerstner bands — a long swell, a shorter swell crossing it
 * and the local wind sea — each a true plane wave: one wavenumber, one speed
 * and one world heading everywhere. Only their height varies, with region,
 * depth and weather. That is what keeps the sea stable. A wavenumber, speed
 * or heading that varied across the map (a baked travel direction, the wind
 * direction, a regional blend) put a spatial gradient into the phase
 * k(x)·x − ω(x)·t, which squeezed crests into dense bands wherever the field
 * turned, swung the whole sea when the wind shifted, and grew without bound
 * with play time. Height is safe to vary: it scales a wave, it cannot shear it.
 *
 * Ripples smaller than the wind sea are not geometry but the shading's
 * detail normals. Each band is drawn only where the lattice resolves it
 * (`lodSamplesPerWavelength`) and handed to the shading as slope variance
 * (roughness) beyond that.
 */
export const WATER_WAVE_CONFIG = Object.freeze({
  bands: Object.freeze([
    {
      id: "swell",
      // Rivers and the lake carry no geometric waves: their life is the
      // current-borne detail in the shading.
      amplitude: [0, 0.2, 0.34],
      wavenumber: 0.16,
      // Toward the main southern coast (its shoreward direction is 160–175°).
      headingDeg: 165,
      orbitGain: 0.8,
      phase: 0
    },
    {
      id: "cross-swell",
      amplitude: [0, 0.08, 0.14],
      wavenumber: 0.27,
      // Off-perpendicular: two trains crossing at exactly ninety degrees
      // interfere on a square lattice and read as a woven plaid.
      headingDeg: 128,
      orbitGain: 0.7,
      phase: 1.7
    },
    {
      id: "wind-sea",
      amplitude: [0, 0.035, 0.05],
      wavenumber: 0.45,
      headingDeg: 192,
      orbitGain: 0.6,
      phase: 4.1
    }
  ] as const satisfies readonly WaterWaveBand[]),
  /** Amplitude gain at full sea roughness, per region. */
  roughnessGain: [0.3, 0.9, 1.3] as const,
  oceanWindGainPerMeterSecond: 0.018,
  /**
   * Band speeds follow deep-water dispersion, ω = tempo·√(g·k), so the long
   * swell genuinely outruns the wind sea. The tempo holds the whole set back
   * to a cozy pace while preserving the ratios.
   */
  dispersionTempo: 0.62,
  /**
   * Crest wander: a slow phase warp across the fronts bends the crest lines
   * out of parallel, the way a real swell arrives. It runs across the
   * swell's fixed heading and its gradient is bounded by
   * radiansPerMeter·radians everywhere, so a band keeps its wavelength across
   * the whole map.
   */
  crestWander: {
    radiansPerMeter: 0.013,
    radians: 0.8
  },
  /**
   * Total trochoidal steepness ceiling, Σ orbit·(k + warp). Past 1 the
   * surface folds through itself; well below it crests stay rounded — a
   * trochoid near its cusp draws sharp fins and pyramids — and the CPU
   * inversion converges quickly.
   */
  steepnessCeiling: 0.45,
  /**
   * A band is fully drawn while the lattice has at least `full` cells per
   * wavelength and gone by `gone`. With too few cells the interpolated
   * normal draws zig-zag creases across the triangles, so a band is handed
   * to the shading as roughness well before that.
   */
  lodSamplesPerWavelength: { full: 9, gone: 6 },
  /**
   * Shoaling: a wave train feels the bed before the beach, growing over the
   * shelf, then dying in the swash zone. `dampMeters` is the depth below
   * which displacement is gone, so crests cannot punch through the sand; that
   * removed energy returns as surf foam. The orbit carries the damp twice
   * (once through the amplitude), so horizontal motion dies first.
   */
  shoaling: {
    gain: 0.6,
    peakMeters: 1.1,
    deepMeters: 7,
    dampMeters: 0.55,
    freshwaterScale: 0.25,
    /**
     * Depth-limited breaking: a wave cannot stand taller than about 0.78 of
     * the water it runs through, so the summed crest height is capped at this
     * share of the still-water depth. Without it the shelf gain built walls of
     * water over the shallows; what the cap removes breaks as surf.
     */
    breakingDepthRatio: 0.39
  },
  /**
   * Swash: the waterline itself moves. Each arriving set pushes a thin sheet
   * up the beach and draws it back, so the sea level over the swash zone rises
   * and falls by up to `runupMeters` (scaled by the shore's contact weight
   * and the sea state). The terrain reads the same level for its wet sand, so
   * water and wet line cannot disagree.
   */
  swash: {
    runupMeters: 0.13,
    roughnessGain: 0.9,
    periodSeconds: 9.5,
    /**
     * Still-water depth over which the lift fades out seaward. The lift is
     * held uniform across the whole waterline zone: a lift that varied inside
     * one lattice triangle there would tilt it, and its intersection with the
     * beach would zig-zag at triangle scale instead of following the contour.
     */
    fadeDepthMeters: [0.9, 2.8] as const,
    /**
     * Longest horizontal run-up a set may travel. On a nearly flat shelf a
     * fixed lift spread a thin sheet tens of metres over the sand, nearly
     * coplanar with it; the lift is capped by the local bed gradient times
     * this reach.
     */
    maxExcursionMeters: 3.5,
    /** Spacing of the bed-gradient probe, half a field texel. */
    gradientProbeMeters: 1.5
  }
});

export const WATER_BAND_COUNT = WATER_WAVE_CONFIG.bands.length;
const GRAVITY = 9.81;

/** Angular speed (rad/s) of a band, from deep-water dispersion. */
export function bandAngularSpeed(band: WaterWaveBand): number {
  return WATER_WAVE_CONFIG.dispersionTempo * Math.sqrt(GRAVITY * band.wavenumber);
}

/** Unit world travel direction (x, z) of a band. */
export function bandDirection(band: WaterWaveBand): [number, number] {
  const radians = THREE.MathUtils.degToRad(band.headingDeg);
  return [Math.sin(radians), Math.cos(radians)];
}

/** Finest lattice spacing, which is the resolution the CPU mirror reproduces. */
export function finestWaterCellMeters(): number {
  return CANONICAL_RENDER_CONFIG.waterSurface.lod.finestCellMeters;
}

/** Share of a band the lattice can draw at this cell size (1 = full). */
export function bandLodWeight(frequency: number, cellMeters: number): number {
  const wavelength = (Math.PI * 2) / Math.max(1e-4, frequency);
  const { full, gone } = WATER_WAVE_CONFIG.lodSamplesPerWavelength;
  return 1 - smoothstep(wavelength / full, wavelength / gone, cellMeters);
}

/**
 * Worst-case displacement the wave field can apply, in metres. Frustum and
 * node bounds are authored against the undisplaced lattice, so they are
 * widened by whatever the vertex shader can add — horizontally as well as
 * vertically — derived from the config rather than written as a literal.
 */
export function maxWaveDisplacement(): { vertical: number; horizontal: number } {
  const peak = (values: Regional) => Math.max(...values);
  const roughnessCeiling = 1 + peak(WATER_WAVE_CONFIG.roughnessGain)
    + 25 * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
  const { gain } = WATER_WAVE_CONFIG.shoaling;
  let vertical = 0;
  let horizontal = 0;
  for (const band of WATER_WAVE_CONFIG.bands) {
    const amplitude = peak(band.amplitude) * roughnessCeiling * (1 + gain);
    vertical += amplitude;
    horizontal += amplitude * band.orbitGain;
  }
  const { runupMeters, roughnessGain } = WATER_WAVE_CONFIG.swash;
  vertical += runupMeters * (1 + roughnessGain);
  return { vertical, horizontal };
}

/**
 * Run-up lift after the reach cap: a set cannot push the sheet further up
 * the beach than `maxExcursionMeters`, so on a gentle shelf the lift is the
 * bed gradient times that reach. Term for term with `nevaSwashLift`.
 */
export function swashLift(level: number, depthGradient: number): number {
  return Math.min(level, depthGradient * WATER_WAVE_CONFIG.swash.maxExcursionMeters);
}

/** Run-up height at full contact for the given sea state. */
export function swashRunupMeters(seaRoughness: number): number {
  const { runupMeters, roughnessGain } = WATER_WAVE_CONFIG.swash;
  return runupMeters * (1 + THREE.MathUtils.clamp(seaRoughness, 0, 1) * roughnessGain);
}

/**
 * Shared swash level (metres above still water) at a world point. The GLSL
 * `nevaSwashLevel` in `waveGlsl.ts` is this exact expression; only sines, so
 * the two agree to float precision.
 */
export function swashLevel(x: number, z: number, timeSeconds: number, runup: number, contact: number): number {
  if (contact <= 0 || runup <= 0) return 0;
  const offset = 0.31 * Math.sin(x * 0.019 + z * 0.011)
    + 0.21 * Math.sin(z * 0.027 - x * 0.013 + 1.7)
    + 0.09 * Math.sin(x * 0.061 + z * 0.047 + 4.1);
  const period = WATER_WAVE_CONFIG.swash.periodSeconds;
  const a = swashCycle(timeSeconds / period + offset);
  const b = swashCycle(timeSeconds / (period * 1.37) + offset * 1.6 + 0.43);
  return runup * contact * (0.68 * a + 0.32 * b);
}

/** One run-up: a quick uprush over the first third, a longer backwash. */
function swashCycle(phase: number): number {
  const p = phase - Math.floor(phase);
  return p < 0.32 ? smoothstep(0, 0.32, p) : 1 - smoothstep(0.32, 1, p);
}


/**
 * `WATER_WAVE_CONFIG` expressed as shader uniforms.
 *
 * Every displacing material (the LOD surface, the headwater surface and the
 * boat wakes) takes these from one factory, so a band parameter reaches every
 * surface or none. The bed/field uniforms are not here: the water
 * surfaces receive them from `createCoastalUniforms`, the single owner the
 * render pipeline updates.
 */
export function createWaveUniforms() {
  const { shoaling } = WATER_WAVE_CONFIG;
  return {
    uTime: { value: 0 },
    uRoughness: { value: DEFAULT_CONDITIONS.seaRoughness },
    uWindSpeed: { value: 0 },
    uBandAmplitude: { value: WATER_WAVE_CONFIG.bands.map((band) => new THREE.Vector3(...band.amplitude)) },
    /** Per band: (wave vector x, wave vector z, angular speed, phase offset). */
    uBandWave: {
      value: WATER_WAVE_CONFIG.bands.map((band) => {
        const [x, z] = bandDirection(band);
        return new THREE.Vector4(x * band.wavenumber, z * band.wavenumber, bandAngularSpeed(band), band.phase);
      })
    },
    uBandOrbit: { value: WATER_WAVE_CONFIG.bands.map((band) => band.orbitGain) },
    uRoughnessGain: { value: new THREE.Vector3(...WATER_WAVE_CONFIG.roughnessGain) },
    uOceanWindGain: { value: WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond },
    uSteepnessCeiling: { value: WATER_WAVE_CONFIG.steepnessCeiling },
    uLodSamples: { value: new THREE.Vector2(
      WATER_WAVE_CONFIG.lodSamplesPerWavelength.full,
      WATER_WAVE_CONFIG.lodSamplesPerWavelength.gone
    ) },
    uShoalGain: { value: shoaling.gain },
    uShoalPeak: { value: shoaling.peakMeters },
    uShoalDeep: { value: shoaling.deepMeters },
    uShoalDamp: { value: shoaling.dampMeters },
    uShoalFreshwater: { value: shoaling.freshwaterScale },
    uBreakingDepthRatio: { value: shoaling.breakingDepthRatio },
    uCrestWander: { value: new THREE.Vector2(
      WATER_WAVE_CONFIG.crestWander.radiansPerMeter,
      WATER_WAVE_CONFIG.crestWander.radians
    ) },
    uSwashFade: { value: new THREE.Vector2(...WATER_WAVE_CONFIG.swash.fadeDepthMeters) },
    uSwashReach: { value: new THREE.Vector2(
      WATER_WAVE_CONFIG.swash.maxExcursionMeters,
      WATER_WAVE_CONFIG.swash.gradientProbeMeters
    ) }
  };
}

const DEFAULT_CONDITIONS: WaterConditions = Object.freeze({
  seaRoughness: 0.2,
  windDirectionDeg: 0,
  windSpeed: 0
});

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function resolvedConditions(conditions?: Partial<WaterConditions>): WaterConditions {
  return {
    seaRoughness: THREE.MathUtils.clamp(conditions?.seaRoughness ?? DEFAULT_CONDITIONS.seaRoughness, 0, 1),
    windDirectionDeg: conditions?.windDirectionDeg ?? DEFAULT_CONDITIONS.windDirectionDeg,
    windSpeed: Math.max(0, conditions?.windSpeed ?? DEFAULT_CONDITIONS.windSpeed)
  };
}

/**
 * Scratch for one resolved point: the regional blend the GPU also computes,
 * held in flat typed arrays so a buoyancy query allocates nothing.
 */
const N = WATER_BAND_COUNT;
/** Per-band constants, resolved once: world axis and angular speed. */
const BAND_CONSTANTS = WATER_WAVE_CONFIG.bands.map((band) => {
  const [x, z] = bandDirection(band);
  return { x, z, speed: bandAngularSpeed(band) };
});
/** Crest wander runs across the swell's heading. */
const WANDER_AXIS = (() => {
  const [x, z] = bandDirection(WATER_WAVE_CONFIG.bands[0]);
  return { x: -z, z: x };
})();
const scratch = {
  field: createWaterFieldSample(),
  axisX: new Float64Array(N),
  axisZ: new Float64Array(N),
  k: new Float64Array(N),
  speed: new Float64Array(N),
  amplitude: new Float64Array(N),
  orbit: new Float64Array(N),
  phase: new Float64Array(N),
  weights: [0, 0, 0] as [number, number, number],
  swash: 0
};

function sampleField(x: number, z: number): WaterFieldSample {
  return WaterFieldStore.canonical().sample(x, z, scratch.field);
}

/**
 * Resolve every band at a point — the CPU mirror of `nevaResolveWaves` in
 * waveGlsl.ts, at the finest lattice spacing. Region weights, travel frame
 * and bed depth are treated as locally constant across the displacement, the
 * same approximation the shader makes per vertex.
 */
function resolveBands(x: number, z: number, conditions: WaterConditions, timeSeconds: number): void {
  const field = sampleField(x, z);
  const river = field.river;
  const ocean = field.ocean;
  const sea = Math.max(0, 1 - river - ocean);
  const w = scratch.weights;
  w[0] = river; w[1] = sea; w[2] = ocean;

  // Shoaling at the still-water depth.
  const { gain, peakMeters, deepMeters, dampMeters, freshwaterScale } = WATER_WAVE_CONFIG.shoaling;
  const depth = field.depth;
  const damp = smoothstep(0, dampMeters, depth);
  const shelf = 1 - smoothstep(peakMeters, deepMeters, depth);
  const shelfGain = gain * shelf * THREE.MathUtils.lerp(1, freshwaterScale, river);
  const amplitudeShoal = (1 + shelfGain) * damp;

  const roughnessScale = 1
    + conditions.seaRoughness * (WATER_WAVE_CONFIG.roughnessGain[0] * river
      + WATER_WAVE_CONFIG.roughnessGain[1] * sea + WATER_WAVE_CONFIG.roughnessGain[2] * ocean)
    + conditions.windSpeed * ocean * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
  const cell = finestWaterCellMeters();
  const warpCeiling = WATER_WAVE_CONFIG.crestWander.radiansPerMeter * WATER_WAVE_CONFIG.crestWander.radians;
  // Depth-limited breaking (nevaWaveField): cap the summed crest height.
  let fullSum = 0;
  for (const band of WATER_WAVE_CONFIG.bands) {
    fullSum += (band.amplitude[0] * river + band.amplitude[1] * sea + band.amplitude[2] * ocean)
      * roughnessScale * amplitudeShoal;
  }
  const breakLimit = WATER_WAVE_CONFIG.shoaling.breakingDepthRatio * Math.max(0, depth);
  // Smooth saturation toward the limit (see nevaWaveField): never above it,
  // and without the kink a hard min() drew as a crease along a depth contour.
  const breakRatio = fullSum / Math.max(breakLimit, 1e-6);
  const breakScale = Math.pow(1 + breakRatio ** 4, -0.25);
  let steepness = 0;
  for (let index = 0; index < N; index += 1) {
    const band = WATER_WAVE_CONFIG.bands[index]!;
    const constants = BAND_CONSTANTS[index]!;
    const k = band.wavenumber;
    const amplitude = (band.amplitude[0] * river + band.amplitude[1] * sea + band.amplitude[2] * ocean)
      * roughnessScale * amplitudeShoal * breakScale * bandLodWeight(k, cell);
    // The orbit carries the damp twice (once through the amplitude), so the
    // horizontal motion dies before the vertical and never drags the sheet
    // across the sand.
    const orbit = band.orbitGain * amplitude * damp;
    scratch.axisX[index] = constants.x;
    scratch.axisZ[index] = constants.z;
    scratch.k[index] = k;
    scratch.speed[index] = constants.speed;
    scratch.amplitude[index] = amplitude;
    scratch.orbit[index] = orbit;
    scratch.phase[index] = band.phase;
    steepness += orbit * (k + warpCeiling);
  }
  if (steepness > WATER_WAVE_CONFIG.steepnessCeiling) {
    const scale = WATER_WAVE_CONFIG.steepnessCeiling / steepness;
    for (let index = 0; index < N; index += 1) scratch.orbit[index]! *= scale;
  }
  // The authored headwater reach keeps its shape: the trochoid may lift it
  // but not slide it off the channel (nevaHeadwaterDetailWeight on the GPU).
  const detail = headwaterDetailWeight(x, z);
  if (detail < 1) for (let index = 0; index < N; index += 1) scratch.orbit[index]! *= detail;

  // Run-up is marine only: a river bank has a current, not an arriving set.
  const marine = sea + ocean;
  const [fadeStart, fadeEnd] = WATER_WAVE_CONFIG.swash.fadeDepthMeters;
  const level = swashLevel(x, z, timeSeconds, swashRunupMeters(conditions.seaRoughness), field.contact);
  let lift = 0;
  if (level > 0) {
    const probe = WATER_WAVE_CONFIG.swash.gradientProbeMeters;
    const store = WaterFieldStore.canonical();
    const depthX = store.sample(x + probe, z, gradientSample).depth;
    const depthZ = store.sample(x, z + probe, gradientSample).depth;
    lift = swashLift(level, Math.hypot(depthX - depth, depthZ - depth) / probe);
  }
  scratch.swash = lift * marine * (1 - smoothstep(fadeStart, fadeEnd, depth));
}

/** CPU mirror of nevaHeadwaterDetailWeight: 0 across the elevated reach, 1 outside. */
function headwaterDetailWeight(x: number, z: number): number {
  const bounds = NEVA_HEADWATERS.bounds;
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return 1;
  const knots = NEVA_HEADWATERS.elevationKnots;
  return smoothstep(knots[knots.length - 1]!.z, bounds.maxZ, z);
}

/** Crest-wander phase at a lattice point (fixed frame, like the shader). */
function crestWarp(latticeX: number, latticeZ: number): number {
  const { radiansPerMeter, radians } = WATER_WAVE_CONFIG.crestWander;
  return Math.sin((latticeX * WANDER_AXIS.x + latticeZ * WANDER_AXIS.z) * radiansPerMeter) * radians;
}

function bandPhase(index: number, latticeX: number, latticeZ: number, timeSeconds: number, warp: number): number {
  // k·x − ωt: crests travel along the band's fixed world heading.
  return (latticeX * scratch.axisX[index]! + latticeZ * scratch.axisZ[index]!) * scratch.k[index]!
    - timeSeconds * scratch.speed[index]! + scratch.phase[index]! + warp;
}

/**
 * Invert the trochoid: the lattice point whose displaced position lands on
 * world (x, z). The GPU moves water horizontally, so buoyancy has to ask what
 * surface is drawn *here*, not what the lattice point beneath it carries.
 * Fixed-point iteration converges because the steepness ceiling keeps the
 * displacement contractive; five passes hold the rough end of the range.
 */
function latticePointFor(x: number, z: number, timeSeconds: number, out: { x: number; z: number }): void {
  let lx = x;
  let lz = z;
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const warp = crestWarp(lx, lz);
    let ox = 0;
    let oz = 0;
    for (let index = 0; index < N; index += 1) {
      const swing = scratch.orbit[index]! * Math.cos(bandPhase(index, lx, lz, timeSeconds, warp));
      ox += scratch.axisX[index]! * swing;
      oz += scratch.axisZ[index]! * swing;
    }
    lx = x - ox;
    lz = z - oz;
  }
  out.x = lx;
  out.z = lz;
}

const lattice = { x: 0, z: 0 };
const gradientSample = createWaterFieldSample();

/** CPU mirror of the drawn water surface elevation. */
export function waterHeight(
  x: number,
  z: number,
  timeSeconds: number,
  inputConditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
): number {
  const conditions = resolvedConditions(inputConditions);
  resolveBands(x, z, conditions, timeSeconds);
  latticePointFor(x, z, timeSeconds, lattice);
  const warp = crestWarp(lattice.x, lattice.z);
  let height = scratch.swash;
  for (let index = 0; index < N; index += 1) {
    height += Math.sin(bandPhase(index, lattice.x, lattice.z, timeSeconds, warp)) * scratch.amplitude[index]!;
  }
  return WorldLayout.waterSurfaceElevation(x, z) + height;
}

/**
 * Analytic surface normal for the same field waterHeight() evaluates.
 *
 * Each band contributes A·k·cos(φ) of vertical slope along its phase gradient
 * and, because the water also moves horizontally, a term in the horizontal
 * Jacobian; the normal is the cross product of the two displaced tangents,
 * which reduces to the heightfield form when the orbit is zero. Presentation
 * only; buoyancy reads height. The headwater grade adds the canonical static
 * surface derivative.
 */
export function waterNormal(
  x: number,
  z: number,
  timeSeconds: number,
  inputConditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
): THREE.Vector3 {
  const conditions = resolvedConditions(inputConditions);
  resolveBands(x, z, conditions, timeSeconds);
  latticePointFor(x, z, timeSeconds, lattice);
  const { radiansPerMeter, radians } = WATER_WAVE_CONFIG.crestWander;
  const acrossPhase = (lattice.x * WANDER_AXIS.x + lattice.z * WANDER_AXIS.z) * radiansPerMeter;
  const warp = Math.sin(acrossPhase) * radians;
  const warpGradient = Math.cos(acrossPhase) * radiansPerMeter * radians;
  let dhdx = 0;
  let dhdz = 0;
  let jxx = 0;
  let jzz = 0;
  let jxz = 0;
  let jzx = 0;
  for (let index = 0; index < N; index += 1) {
    const phase = bandPhase(index, lattice.x, lattice.z, timeSeconds, warp);
    const gradientX = scratch.axisX[index]! * scratch.k[index]! + WANDER_AXIS.x * warpGradient;
    const gradientZ = scratch.axisZ[index]! * scratch.k[index]! + WANDER_AXIS.z * warpGradient;
    const weight = Math.cos(phase) * scratch.amplitude[index]!;
    dhdx += weight * gradientX;
    dhdz += weight * gradientZ;
    const compress = scratch.orbit[index]! * Math.sin(phase);
    jxx -= scratch.axisX[index]! * gradientX * compress;
    jxz -= scratch.axisX[index]! * gradientZ * compress;
    jzx -= scratch.axisZ[index]! * gradientX * compress;
    jzz -= scratch.axisZ[index]! * gradientZ * compress;
  }
  const bounds = NEVA_HEADWATERS.bounds;
  if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) {
    dhdz += headwaterGradientAt(z);
  }
  const tangentX = new THREE.Vector3(1 + jxx, dhdx, jzx);
  const tangentZ = new THREE.Vector3(jxz, dhdz, 1 + jzz);
  return tangentZ.cross(tangentX).normalize();
}

/** Region and weights at a point, from the same baked field the shaders read. */
export function waterRegionAt(x: number, z: number): { region: WaterRegion; weights: WaterRegionWeights } {
  const field = sampleField(x, z);
  const weights = { river: field.river, sea: Math.max(0, 1 - field.river - field.ocean), ocean: field.ocean };
  const region: WaterRegion = weights.river >= weights.sea && weights.river >= weights.ocean
    ? "river"
    : weights.ocean > weights.sea ? "ocean" : "sea";
  return { region, weights };
}

export class WaterSurface {
  public static height(
    x: number,
    z: number,
    timeSeconds: number,
    conditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
  ): number {
    return waterHeight(x, z, timeSeconds, conditions);
  }

  public static sample(
    x: number,
    z: number,
    timeSeconds: number,
    conditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
  ): WaterSample {
    const height = waterHeight(x, z, timeSeconds, conditions);
    const normal = waterNormal(x, z, timeSeconds, conditions);
    const { region, weights } = waterRegionAt(x, z);
    return { height, normal, region, weights };
  }
}

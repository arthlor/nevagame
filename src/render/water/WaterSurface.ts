import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import type { MarineSample } from "../../world/WorldIslands";
import type { ShoreProjection } from "../../world/WorldGeographyTypes";
import { NEVA_HEADWATERS, headwaterGradientAt } from "../../world/NevaHeadwaters";
import { mainlandWaterSample } from "../../world/NevaMainland";
import { WAVE_BAND_PHASES, WAVE_CROSS_AXIS, WAVE_DETAIL_AXIS } from "./waveGlsl";

export type WaterRegion = "river" | "sea" | "ocean";

export interface WaterConditions {
  seaRoughness: number;
  windDirectionDeg: number;
  windSpeed: number;
}

export interface WaterRegionWeights {
  river: number;
  sea: number;
  ocean: number;
}

export interface WaterSpatialProfile {
  region: WaterRegion;
  weights: WaterRegionWeights;
  signedWaterDistance: number;
  coastDistance: number;
  localDirection: THREE.Vector2;
}

/** One texel's canonical queries, shared only while its two water maps are baked. */
export interface WaterSpatialQueries {
  marine: MarineSample;
  shore?: ShoreProjection;
}

export interface WaterSample {
  height: number;
  normal: THREE.Vector3;
  region: WaterRegion;
  weights: WaterRegionWeights;
}

interface WaterWaveBand {
  amplitude: readonly [number, number, number];
  frequency: readonly [number, number, number];
  speed: readonly [number, number, number];
  /**
   * Trochoidal (Gerstner) orbit gain. A deep-water particle traces a circle
   * whose radius is the wave's own amplitude, so the horizontal displacement
   * is `orbitGain * amplitude` metres and `1` is physically exact. Values
   * above 1 stretch the orbit to sharpen crests and broaden troughs beyond
   * what this gentle a sea would do on its own; `0` is the former
   * vertical-only sine. Expressing the gain against the physical orbit keeps
   * the displacement tied to the wave's real size — a raw steepness ratio
   * would have slid several metres sideways on a half-metre wave.
   */
  orbitGain: readonly [number, number, number];
}

/**
 * The single numeric owner for CPU buoyancy and GPU water displacement.
 *
 * Bands carry a real sea's structure: a swell, a shorter wind sea crossing
 * it, and a chop band.
 *
 * What makes a sea read is steepness (height over wavelength), not height.
 * The earlier set was a ~13 cm swell on a 95 m wavelength — a slope of about
 * 0.3%, which is a millpond, and raising only its height changed the geometry
 * without changing the picture at all. These bands sit near 6-7% instead, so
 * the surface has slopes large enough to shade.
 *
 * Wavelengths stay above roughly four coarse grid cells (`WATER_SURFACE` is
 * ~5.2 m) so the shared lattice can resolve them without the geometry itself
 * aliasing; finer movement than that belongs to the fragment normal, not to
 * displaced vertices.
 */
export const WATER_WAVE_CONFIG = Object.freeze({
  primary: {
    amplitude: [0.038, 0.26, 0.45],
    frequency: [0.15, 0.175, 0.157],
    speed: [0.34, 0.81, 0.77],
    orbitGain: [1, 1.7, 2.1]
  } satisfies WaterWaveBand,
  cross: {
    amplitude: [0.014, 0.135, 0.24],
    frequency: [0.29, 0.29, 0.262],
    speed: [-0.23, -1.05, -0.99],
    orbitGain: [1, 1.6, 1.9]
  } satisfies WaterWaveBand,
  detail: {
    amplitude: [0.004, 0.055, 0.09],
    frequency: [0.48, 0.34, 0.3],
    speed: [0.42, 1.13, 1.06],
    orbitGain: [1, 1.4, 1.6]
  } satisfies WaterWaveBand,
  roughnessGain: [0.28, 0.72, 1.2] as const,
  oceanWindGainPerMeterSecond: 0.018,
  /**
   * Marine band speeds follow deep-water dispersion, ω = tempo·√(g·k), so the
   * long swell genuinely outruns the chop instead of every band scrolling at
   * one authored rate — that ratio is most of what reads as a live sea. The
   * tempo below holds the whole set back to a cozy pace while preserving it;
   * river speeds stay authored, because a channel is not a dispersive
   * deep-water train.
   */
  dispersionTempo: 0.62,
  /**
   * Crest wander. A swell does not arrive as one straight front: its heading
   * drifts slowly across the fetch, so real crest lines curve and lose
   * register with each other over a few hundred metres. Rotating the travel
   * frame by a long, low-amplitude sine of the across-travel coordinate buys
   * that irregularity for one extra sine per vertex, which is what stops a
   * sum of three bands from reading as parallel corduroy over the whole sea.
   */
  crestWander: {
    radiansPerMeter: 0.013,
    radians: 1.1
  },
  /**
   * Total trochoidal steepness ceiling across all three bands, measured as
   * Σ orbitGain·amplitude·frequency. Steepness grows with sea state because
   * that is what sharpens crests into whitecaps, but the sum is clamped below
   * the cusp so the surface cannot fold through itself and the CPU inversion
   * below stays contractive.
   */
  steepnessCeiling: 0.82,
  /**
   * Shoaling: a real wave train feels the bed before it reaches the beach,
   * growing and steepening over the shallow shelf and then dying in the
   * swash zone. `gain` is the extra amplitude at the peak of the shelf,
   * `peakMeters`/`deepMeters` bound the band over which the bed is felt, and
   * `dampMeters` is the depth below which displacement is gone, so waves
   * cannot punch through the sand. Freshwater keeps its own quiet response
   * through `freshwaterScale`.
   */
  shoaling: {
    gain: 0.85,
    peakMeters: 1.1,
    deepMeters: 7,
    dampMeters: 0.55,
    freshwaterScale: 0.25
  },
  riverBlend: [-2, 4] as const,
  oceanBlend: [105, 145] as const
});

function waveVector(values: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(values[0], values[1], values[2]);
}

/**
 * Worst-case displacement the wave field can apply, in metres.
 *
 * Frustum bounds are authored against the undisplaced lattice, so they have
 * to be widened by whatever the vertex shader can add — horizontally as well
 * as vertically, now that the water moves in orbits. Deriving the margin from
 * the config instead of writing a literal means retuning a band cannot
 * silently start popping tiles at the edge of the view.
 */
export function maxWaveDisplacement(): { vertical: number; horizontal: number } {
  const bands = [WATER_WAVE_CONFIG.primary, WATER_WAVE_CONFIG.cross, WATER_WAVE_CONFIG.detail];
  const peakRegional = (values: readonly [number, number, number]) => Math.max(...values);
  // The roughness and wind gains multiply amplitude; shoaling multiplies it
  // again over the shelf. Taking each factor at its ceiling is deliberately
  // pessimistic — the alternative is a tile that vanishes in a storm.
  const roughnessCeiling = 1 + peakRegional(WATER_WAVE_CONFIG.roughnessGain)
    + 25 * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
  const { gain } = WATER_WAVE_CONFIG.shoaling;
  let vertical = 0;
  let horizontal = 0;
  for (const band of bands) {
    const amplitude = peakRegional(band.amplitude) * roughnessCeiling * (1 + gain);
    vertical += amplitude;
    horizontal += amplitude * peakRegional(band.orbitGain) * (1 + gain * 1.45);
  }
  return { vertical, horizontal };
}

/**
 * `WATER_WAVE_CONFIG` expressed as shader uniforms.
 *
 * Three materials displace this same field — the coarse surface, the near
 * tessellation and the shore-foam quads — and a hand-copied uniform list in
 * each is exactly how one band silently stops matching its neighbours at a
 * seam. Keeping the factory beside the numeric owner means a new band
 * parameter reaches every surface or none.
 *
 * The canonical bed uniforms are deliberately not here: both water surfaces
 * already receive those from `createCoastalUniforms`, the single owner the
 * render pipeline updates, and redeclaring them would shadow it.
 */
export function createWaveUniforms() {
  const { primary, cross, detail, shoaling } = WATER_WAVE_CONFIG;
  return {
    uTime: { value: 0 },
    uRoughness: { value: DEFAULT_CONDITIONS.seaRoughness },
    uWindSpeed: { value: 0 },
    uWindDirection: { value: new THREE.Vector2(0, 1) },
    uPrimaryAmplitude: { value: waveVector(primary.amplitude) },
    uPrimaryFrequency: { value: waveVector(primary.frequency) },
    uPrimarySpeed: { value: waveVector(primary.speed) },
    uPrimaryOrbit: { value: waveVector(primary.orbitGain) },
    uCrossAmplitude: { value: waveVector(cross.amplitude) },
    uCrossFrequency: { value: waveVector(cross.frequency) },
    uCrossSpeed: { value: waveVector(cross.speed) },
    uCrossOrbit: { value: waveVector(cross.orbitGain) },
    uDetailAmplitude: { value: waveVector(detail.amplitude) },
    uDetailFrequency: { value: waveVector(detail.frequency) },
    uDetailSpeed: { value: waveVector(detail.speed) },
    uDetailOrbit: { value: waveVector(detail.orbitGain) },
    uRoughnessGain: { value: waveVector(WATER_WAVE_CONFIG.roughnessGain) },
    uOceanWindGain: { value: WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond },
    uSteepnessCeiling: { value: WATER_WAVE_CONFIG.steepnessCeiling },
    uShoalGain: { value: shoaling.gain },
    uShoalPeak: { value: shoaling.peakMeters },
    uShoalDeep: { value: shoaling.deepMeters },
    uShoalDamp: { value: shoaling.dampMeters },
    uShoalFreshwater: { value: shoaling.freshwaterScale },
    uCrestWander: { value: new THREE.Vector2(
      WATER_WAVE_CONFIG.crestWander.radiansPerMeter,
      WATER_WAVE_CONFIG.crestWander.radians
    ) }
  };
}

/**
 * Bed lookup for a displacing surface that does not already carry the shared
 * coastal uniforms. Passing a null map disables the lookup, and the shoaling
 * function then reports open water, which reproduces the unshoaled field.
 */
export function createWaterBedUniforms(depthMap: THREE.Texture | null, bounds: THREE.Vector4) {
  return {
    uWaterDepthMap: { value: depthMap },
    uCoastalFieldEnabled: { value: depthMap ? 1 : 0 },
    uOpticsBounds: { value: bounds }
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

function weighted(values: readonly [number, number, number], weights: WaterRegionWeights): number {
  return values[0] * weights.river + values[1] * weights.sea + values[2] * weights.ocean;
}

function dominantRegion(weights: WaterRegionWeights): WaterRegion {
  if (weights.river >= weights.sea && weights.river >= weights.ocean) return "river";
  return weights.ocean > weights.sea ? "ocean" : "sea";
}

function normalizedDirection(x: number, z: number): THREE.Vector2 {
  const length = Math.hypot(x, z);
  return length > 0.0001 ? new THREE.Vector2(x / length, z / length) : new THREE.Vector2(0, -1);
}

/** Render-only regional classification with soft estuary and offshore transitions. */
export function waterSpatialProfile(x: number, z: number, queries?: WaterSpatialQueries): WaterSpatialProfile {
  const marine = queries?.marine ?? WorldLayout.marineSampleAt(x, z);
  const southCoastZ = WorldLayout.coastlineZ(x);
  const riverSignedDistance = WorldLayout.riverWaterSignedDistance(x, z);

  // River corridor: bounded by finite headwater source and southern estuary
  const inRiverCorridor = z >= NEVA_HEADWATERS.source.z - NEVA_HEADWATERS.sourceRadiusMeters
    && z <= southCoastZ + 1.5;
  const channelInfluence = inRiverCorridor
    ? smoothstep(0, 0.8, riverSignedDistance)
    : 0;

  // Estuary flow: where the river enters the southern sea
  const coastDistance = z - southCoastZ;
  const estuaryFlow = WorldLayout.estuaryInfluence(x, z)
    * (1 - smoothstep(2, 27, Math.max(0, coastDistance)))
    * 0.82;

  const mainlandWater = mainlandWaterSample(x, z);
  const river = Math.min(1, Math.max(channelInfluence, estuaryFlow, smoothstep(0, 0.8, mainlandWater.signedDistance)));

  const oceanBlend = smoothstep(
    WATER_WAVE_CONFIG.oceanBlend[0],
    WATER_WAVE_CONFIG.oceanBlend[1],
    marine.signedShoreDistance
  );
  const ocean = THREE.MathUtils.clamp(
    Math.max(marine.openWaterExposure, oceanBlend) * (1 - river),
    0,
    1
  );
  const sea = Math.max(0, 1 - river - ocean);
  const weights = { river, sea, ocean };

  const sampleDistance = 1.25;
  const riverTangent = mainlandWater.signedDistance > -4
    ? normalizedDirection(mainlandWater.direction.x, mainlandWater.direction.z)
    : normalizedDirection(
      WorldLayout.riverCenterX(z + sampleDistance) - WorldLayout.riverCenterX(z - sampleDistance),
      sampleDistance * 2
    );
  const marineDir = normalizedDirection(marine.waveDirection.x, marine.waveDirection.z);
  let coastalDirection = marineDir;
  if (sea > 0.0001 && Math.abs(marine.signedShoreDistance) < 90) {
    const shore = queries?.shore ?? WorldLayout.shoreProjectionAt(x, z);
    if (queries) queries.shore = shore;
    const shoreward = normalizedDirection(
      -shore.waterwardNormalXZ.x,
      -shore.waterwardNormalXZ.z
    );
    const shoreInfluence = (1 - smoothstep(18, 80, Math.abs(shore.signedDistanceMeters)))
      * (1 - marine.openWaterExposure * 0.35);
    coastalDirection = normalizedDirection(
      THREE.MathUtils.lerp(marineDir.x, shoreward.x, shoreInfluence),
      THREE.MathUtils.lerp(marineDir.y, shoreward.y, shoreInfluence)
    );
  }
  const localDirection = normalizedDirection(
    riverTangent.x * river + coastalDirection.x * sea + marineDir.x * ocean,
    riverTangent.y * river + coastalDirection.y * sea + marineDir.y * ocean
  );

  return {
    region: dominantRegion(weights),
    weights,
    signedWaterDistance: marine.signedShoreDistance,
    coastDistance: marine.signedShoreDistance,
    localDirection
  };
}

function resolvedConditions(conditions?: Partial<WaterConditions>): WaterConditions {
  return {
    seaRoughness: THREE.MathUtils.clamp(
      conditions?.seaRoughness ?? DEFAULT_CONDITIONS.seaRoughness,
      0,
      1
    ),
    windDirectionDeg: conditions?.windDirectionDeg ?? DEFAULT_CONDITIONS.windDirectionDeg,
    windSpeed: Math.max(0, conditions?.windSpeed ?? DEFAULT_CONDITIONS.windSpeed)
  };
}

function travelDirection(profile: WaterSpatialProfile, conditions: WaterConditions): THREE.Vector2 {
  const windRadians = THREE.MathUtils.degToRad(conditions.windDirectionDeg);
  const wind = new THREE.Vector2(Math.sin(windRadians), Math.cos(windRadians));
  return normalizedDirection(
    THREE.MathUtils.lerp(profile.localDirection.x, wind.x, profile.weights.ocean),
    THREE.MathUtils.lerp(profile.localDirection.y, wind.y, profile.weights.ocean)
  );
}

/** One band resolved for a point: the regional blend the GPU also computes. */
interface ResolvedBand {
  axis: THREE.Vector2;
  frequency: number;
  speed: number;
  amplitude: number;
  /** Horizontal orbit radius in metres, after shoaling and the cusp clamp. */
  orbit: number;
  /** Band phase offset plus the shared crest warp at this point. */
  phase: number;
  /** d(phase)/d(position): the band's own axis scaled by frequency, plus the warp. */
  phaseGradient: THREE.Vector2;
}

/**
 * Still-water column depth over the canonical bed — the same quantity the
 * depth map's R channel carries to the shader, read from its owner here so
 * the two cannot encode it differently.
 */
function bedWaterDepth(x: number, z: number): number {
  return WorldLayout.waterColumnDepth(x, z);
}

/** CPU mirror of nevaWaveShoaling(): (amplitude factor, orbit factor). */
function shoalingFactors(depth: number, riverWeight: number): { amplitude: number; orbit: number } {
  const { gain, peakMeters, deepMeters, dampMeters, freshwaterScale } = WATER_WAVE_CONFIG.shoaling;
  const damp = smoothstep(0, dampMeters, depth);
  const shelf = 1 - smoothstep(peakMeters, deepMeters, depth);
  const shelfGain = gain * shelf * THREE.MathUtils.lerp(1, freshwaterScale, riverWeight);
  return { amplitude: (1 + shelfGain) * damp, orbit: (1 + shelfGain * 1.45) * damp };
}

/**
 * CPU mirror of nevaWaveAxes(): the primary, cross and detail travel axes.
 *
 * The heading wanders slowly across the fetch so crest lines curve rather
 * than running dead straight, and the cross band sits off-perpendicular so
 * the two trains do not weave a square plaid. All three axes are unit length,
 * so a band's frequency means the same thing on whichever axis it rides.
 */
function waveAxes(
  profile: WaterSpatialProfile,
  conditions: WaterConditions
): [THREE.Vector2, THREE.Vector2, THREE.Vector2] {
  const primary = travelDirection(profile, conditions);
  const perpendicular = new THREE.Vector2(-primary.y, primary.x);
  const blend = (along: number, across: number) => new THREE.Vector2(
    primary.x * along + perpendicular.x * across,
    primary.y * along + perpendicular.y * across
  ).normalize();
  return [
    primary,
    blend(WAVE_CROSS_AXIS.along, WAVE_CROSS_AXIS.across),
    blend(WAVE_DETAIL_AXIS.along, WAVE_DETAIL_AXIS.across)
  ];
}

/**
 * CPU mirror of nevaCrestWander(): the phase warp and its gradient.
 *
 * See the shader for why this warps the phase rather than turning the travel
 * heading — a rotation's phase effect is levered by distance from the world
 * origin, this one's gradient is bounded everywhere.
 */
function crestWander(
  x: number,
  z: number,
  travelAxis: THREE.Vector2
): { warp: number; gradient: THREE.Vector2 } {
  const { radiansPerMeter, radians } = WATER_WAVE_CONFIG.crestWander;
  const across = new THREE.Vector2(-travelAxis.y, travelAxis.x);
  const along = (x * across.x + z * across.y) * radiansPerMeter;
  return {
    warp: Math.sin(along) * radians,
    gradient: across.clone().multiplyScalar(Math.cos(along) * radiansPerMeter * radians)
  };
}

/**
 * Resolve the three bands at a point. Regional weights, travel direction and
 * bed depth are treated as locally constant across the wave, which is the
 * same approximation waveGerstner() makes on the GPU.
 */
function resolveBands(
  x: number,
  z: number,
  profile: WaterSpatialProfile,
  conditions: WaterConditions
): ResolvedBand[] {
  const [direction, crossDirection, detailDirection] = waveAxes(profile, conditions);
  const wander = crestWander(x, z, direction);
  const shoal = shoalingFactors(bedWaterDepth(x, z), profile.weights.river);
  const roughnessScale = 1
    + conditions.seaRoughness * weighted(WATER_WAVE_CONFIG.roughnessGain, profile.weights)
    + conditions.windSpeed * profile.weights.ocean * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
  const amplitudeScale = roughnessScale * shoal.amplitude;
  const sources: readonly (readonly [WaterWaveBand, THREE.Vector2, number])[] = [
    [WATER_WAVE_CONFIG.primary, direction, WAVE_BAND_PHASES.primary],
    [WATER_WAVE_CONFIG.cross, crossDirection, WAVE_BAND_PHASES.cross],
    [WATER_WAVE_CONFIG.detail, detailDirection, WAVE_BAND_PHASES.detail]
  ];
  const bands = sources.map(([band, axis, phase]) => {
    const amplitude = weighted(band.amplitude, profile.weights) * amplitudeScale;
    const frequency = weighted(band.frequency, profile.weights);
    return {
      axis,
      frequency,
      speed: weighted(band.speed, profile.weights),
      amplitude,
      orbit: weighted(band.orbitGain, profile.weights) * amplitude * shoal.orbit,
      phase: phase + wander.warp,
      phaseGradient: axis.clone().multiplyScalar(frequency).add(wander.gradient)
    };
  });
  // Σ orbit·frequency is the trochoid's steepness; past 1 the surface folds
  // through itself and the inversion below stops contracting. The warp raises
  // the effective wavenumber, so it counts toward the ceiling. Scaling the
  // whole set together preserves the bands' relative weight.
  const warpCeiling = WATER_WAVE_CONFIG.crestWander.radiansPerMeter * WATER_WAVE_CONFIG.crestWander.radians;
  const steepness = bands.reduce((sum, band) => sum + band.orbit * (band.frequency + warpCeiling), 0);
  if (steepness > WATER_WAVE_CONFIG.steepnessCeiling) {
    const scale = WATER_WAVE_CONFIG.steepnessCeiling / steepness;
    for (const band of bands) band.orbit *= scale;
  }
  return bands;
}

/** Horizontal displacement the trochoid applies to a lattice point. */
function waveOffset(
  latticeX: number,
  latticeZ: number,
  bands: readonly ResolvedBand[],
  timeSeconds: number,
  out: THREE.Vector2
): THREE.Vector2 {
  out.set(0, 0);
  for (const band of bands) {
    const phase = (latticeX * band.axis.x + latticeZ * band.axis.y) * band.frequency
      + timeSeconds * band.speed + band.phase;
    const swing = band.orbit * Math.cos(phase);
    out.x += band.axis.x * swing;
    out.y += band.axis.y * swing;
  }
  return out;
}

/**
 * Invert the trochoid: find the lattice point whose displaced position lands
 * on world (x, z).
 *
 * The GPU displaces water horizontally, so the surface drawn above a world
 * column no longer comes from the lattice point directly beneath it. Buoyancy
 * asks "how high is the water *here*", and answering with the undisplaced
 * sample would float boats against a surface that is visibly somewhere else.
 * Fixed-point iteration converges because the steepness clamp above keeps the
 * displacement a contraction. Its rate falls as the sea steepens, which is
 * exactly when a hull is moving most, so the pass count is set for the rough
 * end of the range rather than the calm one; the loop costs only trigonometry,
 * because the expensive regional profile is resolved once, outside it.
 */
function latticePointFor(
  x: number,
  z: number,
  bands: readonly ResolvedBand[],
  timeSeconds: number
): THREE.Vector2 {
  const lattice = new THREE.Vector2(x, z);
  const offset = new THREE.Vector2();
  for (let iteration = 0; iteration < 5; iteration += 1) {
    waveOffset(lattice.x, lattice.y, bands, timeSeconds, offset);
    lattice.set(x - offset.x, z - offset.y);
  }
  return lattice;
}

/** CPU mirror of the shader's world-space regional wave function. */
export function waterHeight(
  x: number,
  z: number,
  timeSeconds: number,
  inputConditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
): number {
  const conditions = resolvedConditions(inputConditions);
  const profile = waterSpatialProfile(x, z);
  const bands = resolveBands(x, z, profile, conditions);
  const lattice = latticePointFor(x, z, bands, timeSeconds);
  let height = 0;
  for (const band of bands) {
    height += Math.sin(
      (lattice.x * band.axis.x + lattice.y * band.axis.y) * band.frequency
      + timeSeconds * band.speed + band.phase
    ) * band.amplitude;
  }
  return WorldLayout.waterSurfaceElevation(x, z) + height;
}

/**
 * Analytic surface normal for the same wave field waterHeight() evaluates.
 *
 * Each band contributes A·freq·cos(φ) of vertical slope along its own axis
 * and, because the water also moves horizontally, a term in the horizontal
 * Jacobian. The surface normal is the cross product of the two displaced
 * tangents, which reduces exactly to the former heightfield form when the
 * orbit is zero. Regional weights and travel direction are treated as
 * locally constant, mirroring waveGerstner() in waveGlsl.ts. Presentation
 * only; buoyancy reads height, never this normal. The headwater grade adds
 * the canonical static surface derivative after the wave contribution.
 */
export function waterNormal(
  x: number,
  z: number,
  timeSeconds: number,
  inputConditions: Partial<WaterConditions> = DEFAULT_CONDITIONS
): THREE.Vector3 {
  const conditions = resolvedConditions(inputConditions);
  const profile = waterSpatialProfile(x, z);
  const bands = resolveBands(x, z, profile, conditions);
  const lattice = latticePointFor(x, z, bands, timeSeconds);
  let dhdx = 0;
  let dhdz = 0;
  let jxx = 0;
  let jzz = 0;
  let jxz = 0;
  let jzx = 0;
  for (const band of bands) {
    const phase = (lattice.x * band.axis.x + lattice.y * band.axis.y) * band.frequency
      + timeSeconds * band.speed + band.phase;
    const weight = Math.cos(phase) * band.amplitude;
    dhdx += weight * band.phaseGradient.x;
    dhdz += weight * band.phaseGradient.y;
    const compress = band.orbit * Math.sin(phase);
    jxx -= band.axis.x * band.phaseGradient.x * compress;
    jxz -= band.axis.x * band.phaseGradient.y * compress;
    jzx -= band.axis.y * band.phaseGradient.x * compress;
    jzz -= band.axis.y * band.phaseGradient.y * compress;
  }
  const bounds = NEVA_HEADWATERS.bounds;
  if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) {
    dhdz += headwaterGradientAt(z);
  }
  const tangentX = new THREE.Vector3(1 + jxx, dhdx, jzx);
  const tangentZ = new THREE.Vector3(jxz, dhdz, 1 + jzz);
  return tangentZ.cross(tangentX).normalize();
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
    const height = this.height(x, z, timeSeconds, conditions);
    const profile = waterSpatialProfile(x, z);
    return {
      height,
      normal: waterNormal(x, z, timeSeconds, conditions),
      region: profile.region,
      weights: profile.weights
    };
  }
}

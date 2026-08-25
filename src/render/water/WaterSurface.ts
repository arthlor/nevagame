import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";

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
}

/** The single numeric owner for CPU buoyancy and GPU water displacement. */
export const WATER_WAVE_CONFIG = Object.freeze({
  primary: {
    amplitude: [0.038, 0.078, 0.13],
    frequency: [0.15, 0.095, 0.066],
    speed: [0.34, 0.52, 0.46]
  } satisfies WaterWaveBand,
  cross: {
    amplitude: [0.014, 0.031, 0.052],
    frequency: [0.29, 0.18, 0.12],
    speed: [-0.23, -0.38, -0.31]
  } satisfies WaterWaveBand,
  detail: {
    amplitude: [0.004, 0.009, 0.014],
    frequency: [0.48, 0.31, 0.23],
    speed: [0.42, 0.72, 0.66]
  } satisfies WaterWaveBand,
  roughnessGain: [0.28, 0.72, 1.2] as const,
  oceanWindGainPerMeterSecond: 0.018,
  riverBlend: [-2, 4] as const,
  oceanBlend: [105, 145] as const
});

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
export function waterSpatialProfile(x: number, z: number): WaterSpatialProfile {
  const coastDistance = z - WorldLayout.coastlineZ(x);
  const riverCore = 1 - smoothstep(
    WATER_WAVE_CONFIG.riverBlend[0],
    WATER_WAVE_CONFIG.riverBlend[1],
    coastDistance
  );
  const estuaryFlow = WorldLayout.estuaryInfluence(x, z)
    * (1 - smoothstep(2, 27, coastDistance))
    * 0.82;
  const river = Math.max(riverCore, estuaryFlow);
  const ocean = smoothstep(
    WATER_WAVE_CONFIG.oceanBlend[0],
    WATER_WAVE_CONFIG.oceanBlend[1],
    coastDistance
  );
  const sea = Math.max(0, 1 - river - ocean);
  const weights = { river, sea, ocean };

  const sampleDistance = 1.25;
  const riverTangent = normalizedDirection(
    WorldLayout.riverCenterX(z + sampleDistance) - WorldLayout.riverCenterX(z - sampleDistance),
    sampleDistance * 2
  );
  const coastSlope = (
    WorldLayout.coastlineZ(x + sampleDistance) - WorldLayout.coastlineZ(x - sampleDistance)
  ) / (sampleDistance * 2);
  const shoreward = normalizedDirection(coastSlope, -1);
  const coastalTotal = Math.max(0.0001, river + sea);
  const localDirection = normalizedDirection(
    (riverTangent.x * river + shoreward.x * sea) / coastalTotal,
    (riverTangent.y * river + shoreward.y * sea) / coastalTotal
  );

  return {
    region: dominantRegion(weights),
    weights,
    signedWaterDistance: WorldLayout.waterSignedDistance(x, z),
    coastDistance,
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

function bandHeight(
  band: WaterWaveBand,
  weights: WaterRegionWeights,
  projectedPosition: number,
  timeSeconds: number,
  phase: number
): number {
  return Math.sin(
    projectedPosition * weighted(band.frequency, weights)
    + timeSeconds * weighted(band.speed, weights)
    + phase
  ) * weighted(band.amplitude, weights);
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
  const direction = travelDirection(profile, conditions);
  const crossDirection = new THREE.Vector2(-direction.y, direction.x);
  const primaryPosition = x * direction.x + z * direction.y;
  const crossPosition = x * crossDirection.x + z * crossDirection.y;
  const detailPosition = x * (direction.x * 0.72 + crossDirection.x * 0.28)
    + z * (direction.y * 0.72 + crossDirection.y * 0.28);
  const roughnessScale = 1
    + conditions.seaRoughness * weighted(WATER_WAVE_CONFIG.roughnessGain, profile.weights)
    + conditions.windSpeed * profile.weights.ocean * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
  return (
    bandHeight(WATER_WAVE_CONFIG.primary, profile.weights, primaryPosition, timeSeconds, 0)
    + bandHeight(WATER_WAVE_CONFIG.cross, profile.weights, crossPosition, timeSeconds, 1.7)
    + bandHeight(WATER_WAVE_CONFIG.detail, profile.weights, detailPosition, timeSeconds, 4.1)
  ) * roughnessScale;
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
    const step = 0.15;
    const height = this.height(x, z, timeSeconds, conditions);
    const dx = this.height(x + step, z, timeSeconds, conditions) - height;
    const dz = this.height(x, z + step, timeSeconds, conditions) - height;
    const profile = waterSpatialProfile(x, z);
    return {
      height,
      normal: new THREE.Vector3(-dx / step, 1, -dz / step).normalize(),
      region: profile.region,
      weights: profile.weights
    };
  }
}

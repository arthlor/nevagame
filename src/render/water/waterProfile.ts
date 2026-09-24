import * as THREE from "three";
import { WorldLayout } from "../../world/WorldLayout";
import type { MarineSample } from "../../world/WorldIslands";
import type { ShoreProjection } from "../../world/WorldGeographyTypes";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { mainlandWaterSample } from "../../world/NevaMainland";

export type WaterRegion = "river" | "sea" | "ocean";

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
  /** Unit travel direction: the channel tangent on rivers, shoreward near coasts. */
  localDirection: THREE.Vector2;
}

/** One texel's canonical queries, shared only while its two water maps are baked. */
export interface WaterSpatialQueries {
  marine: MarineSample;
  shore?: ShoreProjection;
}

/**
 * Regional blend distances. The sea hands over to open ocean between these
 * shore distances; the river blend is resolved from the channel itself.
 */
export const WATER_REGION_BLEND = Object.freeze({
  oceanShoreMeters: [105, 145] as const
});

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function normalizedDirection(x: number, z: number): THREE.Vector2 {
  const length = Math.hypot(x, z);
  return length > 0.0001 ? new THREE.Vector2(x / length, z / length) : new THREE.Vector2(0, -1);
}

function dominantRegion(weights: WaterRegionWeights): WaterRegion {
  if (weights.river >= weights.sea && weights.river >= weights.ocean) return "river";
  return weights.ocean > weights.sea ? "ocean" : "sea";
}

export interface WaterSpatialProfileOptions {
  /**
   * Carry the river classification this far onto dry bank. Only the baked
   * field needs it: a land texel otherwise reads as open sea, and linear
   * filtering across a narrow channel's banks blended sea swell into the
   * river. Dry texels are never drawn as water, so widening them is free.
   */
  bankDilationMeters?: number;
}

/**
 * Canonical, render-only regional classification with soft estuary and
 * offshore transitions. This is the expensive analytic query: runtime wave
 * evaluation reads it through the baked water field (`waterField.ts`) so the
 * CPU and the GPU see the same quantised values.
 */
export function waterSpatialProfile(
  x: number, z: number, queries?: WaterSpatialQueries, options: WaterSpatialProfileOptions = {}
): WaterSpatialProfile {
  const dilation = Math.max(0, options.bankDilationMeters ?? 0);
  const marine = queries?.marine ?? WorldLayout.marineSampleAt(x, z);
  const southCoastZ = WorldLayout.coastlineZ(x);
  const riverSignedDistance = WorldLayout.riverWaterSignedDistance(x, z);

  // River corridor: bounded by the finite headwater source and the southern estuary.
  const inRiverCorridor = z >= NEVA_HEADWATERS.source.z - NEVA_HEADWATERS.sourceRadiusMeters
    && z <= southCoastZ + 1.5;
  const channelInfluence = inRiverCorridor
    ? smoothstep(-dilation, 0.8, riverSignedDistance)
    : 0;

  // Estuary flow: where the river enters the southern sea.
  const coastDistance = z - southCoastZ;
  const estuaryFlow = WorldLayout.estuaryInfluence(x, z)
    * (1 - smoothstep(2, 27, Math.max(0, coastDistance)))
    * 0.82;

  const mainlandWater = mainlandWaterSample(x, z);
  const river = Math.min(1, Math.max(channelInfluence, estuaryFlow,
    smoothstep(-dilation, 0.8, mainlandWater.signedDistance)));

  const oceanBlend = smoothstep(
    WATER_REGION_BLEND.oceanShoreMeters[0],
    WATER_REGION_BLEND.oceanShoreMeters[1],
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
    // Depth refraction: a wave train turns to meet the bed contours, so near
    // the shore the crests swing parallel to the beach.
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

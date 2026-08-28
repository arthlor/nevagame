import { WorldLayout } from "../../world/WorldLayout";
import { ASSET_IDS, type AssetId } from "../assets/AssetCatalog";

export interface AmbientFlyerOrbit {
  originX: number;
  originY: number;
  originZ: number;
  radiusX: number;
  radiusZ: number;
  altitude: number;
  phase: number;
  speed: number;
}

export interface AmbientFlyerPose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export type AmbientCloudTier = "low" | "mid" | "horizon";

export interface AmbientCloudPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  bobPhase: number;
  assetId: AssetId;
  tier?: AmbientCloudTier;
  speedMultiplier?: number;
  bobAmplitude?: number;
  bobFrequency?: number;
}

export interface AmbientCloudPose {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
}

export const CLOUD_BOUNDS = Object.freeze({
  minX: -600,
  maxX: 600,
  minZ: -600,
  maxZ: 600
});

export const CLOUD_HORIZON_BOUNDS = Object.freeze({
  minX: -950,
  maxX: 950,
  minZ: -950,
  maxZ: 950
});

export function wrapCloudCoordinate(val: number, min: number, max: number): number {
  const span = max - min;
  return min + ((((val - min) % span) + span) % span);
}

export function sampleAmbientCloudPose(
  placement: Readonly<AmbientCloudPlacement>,
  timeSeconds: number,
  motionScale: number,
  windDirectionX: number,
  windDirectionZ: number,
  windSpeed: number
): AmbientCloudPose {
  const tier = placement.tier ?? "low";
  const speedMult = placement.speedMultiplier ?? (tier === "horizon" ? 0.6 : tier === "mid" ? 0.85 : 1.1);
  const bobAmp = (placement.bobAmplitude ?? (tier === "horizon" ? 0.6 : tier === "mid" ? 0.45 : 0.35)) * motionScale;
  const bobFreq = placement.bobFrequency ?? (tier === "horizon" ? 0.015 : tier === "mid" ? 0.025 : 0.035);
  const bounds = tier === "horizon" ? CLOUD_HORIZON_BOUNDS : CLOUD_BOUNDS;

  // Gentle, peaceful, cinematic drift: base ~0.22 m/s + ~0.025 m/s per unit windSpeed
  const baseDriftSpeed = (0.22 + Math.max(0, windSpeed) * 0.025) * speedMult * motionScale;
  const gustDisplacement = Math.sin(timeSeconds * 0.08 + placement.bobPhase) * 0.4 * motionScale;
  const totalTravelMeters = timeSeconds * baseDriftSpeed + gustDisplacement;

  const rawX = placement.x + totalTravelMeters * windDirectionX;
  const rawZ = placement.z + totalTravelMeters * windDirectionZ;

  const x = wrapCloudCoordinate(rawX, bounds.minX, bounds.maxX);
  const z = wrapCloudCoordinate(rawZ, bounds.minZ, bounds.maxZ);

  // Vertical thermal float & harmonic wave
  const primaryBob = Math.sin(timeSeconds * bobFreq + placement.bobPhase) * bobAmp;
  const secondaryBob = Math.cos(timeSeconds * (bobFreq * 0.6) + placement.bobPhase * 1.4) * (bobAmp * 0.35);
  const y = placement.y + primaryBob + secondaryBob;

  // Gentle aerodynamic tilt & roll
  const rotationX = Math.sin(timeSeconds * 0.06 + placement.bobPhase) * 0.012 * motionScale;
  const rotationZ = Math.cos(timeSeconds * 0.05 + placement.bobPhase) * 0.014 * motionScale;
  const rotationY = placement.rotationY + Math.sin(timeSeconds * 0.02 + placement.bobPhase) * 0.03 * motionScale;

  // Volumetric breath
  const scalePulse = 1 + Math.sin(timeSeconds * 0.04 + placement.bobPhase) * 0.012 * motionScale;
  const scale = placement.scale * scalePulse;

  return { x, y, z, rotationX, rotationY, rotationZ, scale };
}

export function sampleAmbientFlyerPose(
  orbit: Readonly<AmbientFlyerOrbit>,
  timeSeconds: number,
  motionScale: number
): AmbientFlyerPose {
  const angle = timeSeconds * orbit.speed * motionScale + orbit.phase;
  const x = orbit.originX + Math.cos(angle) * orbit.radiusX;
  const z = orbit.originZ + Math.sin(angle) * orbit.radiusZ;
  const hover = orbit.originY + orbit.altitude;
  const bob = Math.sin(angle * 2.1 + orbit.phase) * Math.min(0.42, hover * 0.18) * motionScale;
  const y = WorldLayout.terrainHeight(x, z) + hover + bob;
  const tangentX = -Math.sin(angle) * orbit.radiusX;
  const tangentZ = Math.cos(angle) * orbit.radiusZ;
  return {
    x,
    y,
    z,
    heading: Math.atan2(tangentX, tangentZ)
  };
}

export const GULL_ORBITS: readonly AmbientFlyerOrbit[] = [
  { originX: 78, originY: 9.5, originZ: 68, radiusX: 18, radiusZ: 12, altitude: 0, phase: 0.2, speed: 0.18 },
  { originX: 64, originY: 11, originZ: 74, radiusX: 22, radiusZ: 14, altitude: 0.4, phase: 1.7, speed: 0.15 },
  { originX: 88, originY: 10.2, originZ: 58, radiusX: 16, radiusZ: 11, altitude: 0.2, phase: 3.1, speed: 0.2 },
  { originX: -92, originY: 14, originZ: 70, radiusX: 14, radiusZ: 10, altitude: 0.6, phase: 4.4, speed: 0.16 },
  { originX: 20, originY: 12.5, originZ: 82, radiusX: 24, radiusZ: 13, altitude: 0.3, phase: 5.6, speed: 0.14 },
  { originX: 102, originY: 9.8, originZ: 48, radiusX: 15, radiusZ: 9, altitude: 0.15, phase: 2.3, speed: 0.19 },
  { originX: -62, originY: 8.6, originZ: -52, radiusX: 16, radiusZ: 11, altitude: 0.45, phase: 0.7, speed: 0.17 },
  { originX: -48, originY: 9.4, originZ: -38, radiusX: 14, radiusZ: 10, altitude: 0.25, phase: 2.4, speed: 0.21 },
  { originX: -74, originY: 10.2, originZ: -46, radiusX: 18, radiusZ: 12, altitude: 0.55, phase: 4.1, speed: 0.15 },
  { originX: 52, originY: 9.1, originZ: -54, radiusX: 13, radiusZ: 9, altitude: 0.35, phase: 5.8, speed: 0.18 },
  { originX: 42, originY: 10.8, originZ: 96, radiusX: 20, radiusZ: 12, altitude: 0.25, phase: 0.95, speed: 0.16 },
  { originX: 118, originY: 11.2, originZ: 58, radiusX: 18, radiusZ: 11, altitude: 0.35, phase: 2, speed: 0.14 },
  { originX: -18, originY: 11.4, originZ: 78, radiusX: 21, radiusZ: 13, altitude: 0.4, phase: 3.5, speed: 0.17 },
  { originX: -120, originY: 12.8, originZ: 82, radiusX: 18, radiusZ: 12, altitude: 0.5, phase: 4.9, speed: 0.15 },
  { originX: -84, originY: 9.8, originZ: -24, radiusX: 17, radiusZ: 11, altitude: 0.35, phase: 1.15, speed: 0.18 },
  { originX: 72, originY: 11.8, originZ: -20, radiusX: 16, radiusZ: 10, altitude: 0.45, phase: 4.8, speed: 0.16 }
];

export const BUTTERFLY_ORBITS: readonly AmbientFlyerOrbit[] = [
  { originX: -58, originY: 1.15, originZ: -48, radiusX: 2.8, radiusZ: 2.1, altitude: 0.22, phase: 0.4, speed: 0.55 },
  { originX: -70, originY: 1.2, originZ: -52, radiusX: 2.4, radiusZ: 1.9, altitude: 0.28, phase: 1.2, speed: 0.62 },
  { originX: -52, originY: 1.1, originZ: -44, radiusX: 2.2, radiusZ: 2.5, altitude: 0.18, phase: 2.6, speed: 0.48 },
  { originX: 42, originY: 1.25, originZ: 6, radiusX: 2.8, radiusZ: 2.1, altitude: 0.3, phase: 3.4, speed: 0.5 },
  { originX: 24, originY: 1.18, originZ: -26, radiusX: 2.5, radiusZ: 2.0, altitude: 0.2, phase: 4.1, speed: 0.58 },
  { originX: 116, originY: 1.12, originZ: -56, radiusX: 2.2, radiusZ: 1.7, altitude: 0.24, phase: 5.2, speed: 0.52 },
  { originX: -62, originY: 1.16, originZ: -66, radiusX: 2.0, radiusZ: 1.8, altitude: 0.16, phase: 0.9, speed: 0.66 },
  { originX: 54, originY: 1.22, originZ: -48, radiusX: 2.6, radiusZ: 2.0, altitude: 0.26, phase: 1.8, speed: 0.47 },
  { originX: -48, originY: 1.14, originZ: -40, radiusX: 2.2, radiusZ: 2.3, altitude: 0.2, phase: 2.9, speed: 0.6 },
  { originX: 8, originY: 1.2, originZ: -18, radiusX: 2.8, radiusZ: 1.9, altitude: 0.28, phase: 3.8, speed: 0.44 },
  { originX: -64, originY: 1.18, originZ: -58, radiusX: 2.3, radiusZ: 2.0, altitude: 0.22, phase: 4.7, speed: 0.57 },
  { originX: 48, originY: 1.24, originZ: -62, radiusX: 2.4, radiusZ: 1.8, altitude: 0.24, phase: 5.5, speed: 0.51 },
  { originX: -78, originY: 1.17, originZ: -42, radiusX: 2.6, radiusZ: 2.1, altitude: 0.24, phase: 0.75, speed: 0.53 },
  { originX: -56, originY: 1.2, originZ: -62, radiusX: 2.7, radiusZ: 2.2, altitude: 0.26, phase: 1.95, speed: 0.49 },
  { originX: -80, originY: 1.12, originZ: -70, radiusX: 2.1, radiusZ: 1.8, altitude: 0.2, phase: 3.15, speed: 0.64 },
  { originX: 30, originY: 1.2, originZ: -36, radiusX: 2.4, radiusZ: 2, altitude: 0.22, phase: 4.5, speed: 0.52 },
  { originX: 58, originY: 1.18, originZ: -54, radiusX: 2.3, radiusZ: 1.7, altitude: 0.24, phase: 5.7, speed: 0.46 },
  { originX: 16, originY: 1.16, originZ: 2, radiusX: 2.6, radiusZ: 2.1, altitude: 0.2, phase: 1.4, speed: 0.57 },
  { originX: -10, originY: 1.24, originZ: -12, radiusX: 2, radiusZ: 2.4, altitude: 0.3, phase: 2.8, speed: 0.5 },
  { originX: 104, originY: 1.16, originZ: -46, radiusX: 2.5, radiusZ: 1.9, altitude: 0.22, phase: 4.9, speed: 0.6 }
];

/**
 * Rich, multi-tiered cloud placements positioned far in the background and horizon
 * sky dome (180m - 750m distance, 35m - 72m altitude) for serene, cinematic depth.
 */
export const CLOUD_PLACEMENTS: readonly AmbientCloudPlacement[] = [
  // =========================================================================
  // TIER 1: Mid Background Skyline Cumulus (180m - 320m Distance, 35m - 46m Altitude)
  // =========================================================================
  // South & South-East Bay Framing
  { x: -180, y: 36.0, z: 140, scale: 2.8, rotationY: 0.12, bobPhase: 0.4, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.1, bobAmplitude: 0.35, bobFrequency: 0.035 },
  { x: 190, y: 38.0, z: 160, scale: 2.6, rotationY: -0.18, bobPhase: 1.2, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.15, bobAmplitude: 0.32, bobFrequency: 0.038 },
  { x: -80, y: 41.0, z: 240, scale: 2.9, rotationY: 0.28, bobPhase: 2.1, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.05, bobAmplitude: 0.38, bobFrequency: 0.032 },
  { x: 90, y: 42.0, z: 250, scale: 2.7, rotationY: -0.24, bobPhase: 1.8, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.12, bobAmplitude: 0.34, bobFrequency: 0.036 },
  { x: 0, y: 39.5, z: 260, scale: 3.1, rotationY: 0.45, bobPhase: 3.5, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.14, bobAmplitude: 0.36, bobFrequency: 0.034 },

  // West & North-West Ridge Framing
  { x: -240, y: 40.0, z: 40, scale: 3.0, rotationY: -0.16, bobPhase: 4.7, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.08, bobAmplitude: 0.36, bobFrequency: 0.033 },
  { x: -260, y: 43.0, z: -80, scale: 2.8, rotationY: 0.35, bobPhase: 0.8, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.12, bobAmplitude: 0.34, bobFrequency: 0.035 },
  { x: -210, y: 37.5, z: -160, scale: 2.9, rotationY: -0.32, bobPhase: 2.9, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.06, bobAmplitude: 0.38, bobFrequency: 0.032 },
  { x: -160, y: 42.0, z: -210, scale: 2.5, rotationY: 0.52, bobPhase: 5.3, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.16, bobAmplitude: 0.3, bobFrequency: 0.038 },

  // East & North-East Coastal Framing
  { x: 230, y: 39.0, z: -60, scale: 3.1, rotationY: 0.22, bobPhase: 3.9, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.08, bobAmplitude: 0.38, bobFrequency: 0.033 },
  { x: 250, y: 41.5, z: 70, scale: 2.7, rotationY: -0.42, bobPhase: 1.5, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.15, bobAmplitude: 0.32, bobFrequency: 0.037 },
  { x: 200, y: 38.0, z: -160, scale: 2.8, rotationY: 0.65, bobPhase: 4.2, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.05, bobAmplitude: 0.36, bobFrequency: 0.034 },
  { x: 160, y: 43.5, z: -210, scale: 2.6, rotationY: -0.42, bobPhase: 2.2, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.1, bobAmplitude: 0.35, bobFrequency: 0.035 },
  { x: 220, y: 37.0, z: 120, scale: 2.9, rotationY: -0.55, bobPhase: 5.1, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.12, bobAmplitude: 0.36, bobFrequency: 0.033 },

  // North Deep Woods Framing
  { x: -90, y: 38.5, z: -240, scale: 3.2, rotationY: 0.08, bobPhase: 1.5, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.07, bobAmplitude: 0.4, bobFrequency: 0.031 },
  { x: 80, y: 40.5, z: -250, scale: 2.7, rotationY: -0.3, bobPhase: 3.1, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.14, bobAmplitude: 0.32, bobFrequency: 0.037 },
  { x: 0, y: 44.0, z: -260, scale: 3.0, rotationY: 0.4, bobPhase: 4.8, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.1, bobAmplitude: 0.36, bobFrequency: 0.035 },
  { x: -40, y: 41.5, z: -270, scale: 2.8, rotationY: -0.22, bobPhase: 2.4, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.12, bobAmplitude: 0.34, bobFrequency: 0.036 },

  // Extra Flank Fillers
  { x: -270, y: 45.0, z: 110, scale: 2.9, rotationY: 0.15, bobPhase: 0.9, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.08, bobAmplitude: 0.36, bobFrequency: 0.034 },
  { x: 270, y: 44.5, z: -110, scale: 2.8, rotationY: 0.34, bobPhase: 3.7, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.12, bobAmplitude: 0.34, bobFrequency: 0.035 },
  { x: -140, y: 39.0, z: 220, scale: 3.1, rotationY: -0.18, bobPhase: 5.0, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.08, bobAmplitude: 0.38, bobFrequency: 0.033 },
  { x: 140, y: 41.0, z: 230, scale: 2.7, rotationY: 0.48, bobPhase: 0.6, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "low", speedMultiplier: 1.15, bobAmplitude: 0.32, bobFrequency: 0.038 },

  // =========================================================================
  // TIER 2: Outer Island & Coastal Sky (320m - 520m Distance, 44m - 58m Altitude)
  // =========================================================================
  { x: -340, y: 46.0, z: -180, scale: 3.8, rotationY: 0.2, bobPhase: 1.4, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.88, bobAmplitude: 0.48, bobFrequency: 0.024 },
  { x: -380, y: 49.0, z: 160, scale: 3.6, rotationY: -0.35, bobPhase: 3.8, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.85, bobAmplitude: 0.46, bobFrequency: 0.022 },
  { x: 360, y: 48.0, z: -190, scale: 3.9, rotationY: 0.45, bobPhase: 0.3, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.82, bobAmplitude: 0.5, bobFrequency: 0.021 },
  { x: 390, y: 47.0, z: 180, scale: 3.5, rotationY: -0.12, bobPhase: 4.5, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.9, bobAmplitude: 0.44, bobFrequency: 0.026 },
  { x: -180, y: 52.0, z: 380, scale: 4.1, rotationY: 0.28, bobPhase: 2.7, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.84, bobAmplitude: 0.52, bobFrequency: 0.023 },
  { x: 170, y: 51.0, z: 400, scale: 3.7, rotationY: -0.4, bobPhase: 5.6, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.86, bobAmplitude: 0.48, bobFrequency: 0.025 },
  { x: -200, y: 50.0, z: -410, scale: 3.6, rotationY: 0.55, bobPhase: 1.9, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.88, bobAmplitude: 0.46, bobFrequency: 0.024 },
  { x: 210, y: 49.0, z: -390, scale: 3.8, rotationY: -0.25, bobPhase: 4.1, assetId: ASSET_IDS.CLOUD_LOWPOLY_A, tier: "mid", speedMultiplier: 0.83, bobAmplitude: 0.5, bobFrequency: 0.022 },
  { x: -440, y: 53.0, z: -60, scale: 3.4, rotationY: 0.33, bobPhase: 3.2, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "mid", speedMultiplier: 0.8, bobAmplitude: 0.54, bobFrequency: 0.02 },
  { x: 450, y: 54.0, z: 40, scale: 3.3, rotationY: -0.5, bobPhase: 0.7, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "mid", speedMultiplier: 0.81, bobAmplitude: 0.52, bobFrequency: 0.02 },
  { x: -320, y: 55.0, z: 340, scale: 3.5, rotationY: 0.18, bobPhase: 2.5, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "mid", speedMultiplier: 0.85, bobAmplitude: 0.48, bobFrequency: 0.023 },
  { x: 330, y: 53.0, z: -350, scale: 3.4, rotationY: -0.28, bobPhase: 4.3, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "mid", speedMultiplier: 0.78, bobAmplitude: 0.55, bobFrequency: 0.019 },

  // =========================================================================
  // TIER 3: Distant Ocean Horizon Formations (520m - 780m Distance, 56m - 72m Altitude)
  // =========================================================================
  { x: -580, y: 58.0, z: -420, scale: 4.2, rotationY: 0.15, bobPhase: 1.1, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.6, bobAmplitude: 0.65, bobFrequency: 0.015 },
  { x: -650, y: 62.0, z: 180, scale: 4.6, rotationY: -0.3, bobPhase: 3.4, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.56, bobAmplitude: 0.7, bobFrequency: 0.013 },
  { x: -540, y: 65.0, z: 560, scale: 4.4, rotationY: 0.42, bobPhase: 5.2, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.58, bobAmplitude: 0.68, bobFrequency: 0.014 },
  { x: 0, y: 68.0, z: 680, scale: 4.8, rotationY: -0.18, bobPhase: 0.5, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.52, bobAmplitude: 0.75, bobFrequency: 0.012 },
  { x: 540, y: 64.0, z: 550, scale: 4.5, rotationY: 0.58, bobPhase: 2.8, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.55, bobAmplitude: 0.7, bobFrequency: 0.013 },
  { x: 660, y: 60.0, z: 140, scale: 4.7, rotationY: -0.45, bobPhase: 4.6, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.54, bobAmplitude: 0.72, bobFrequency: 0.013 },
  { x: 590, y: 66.0, z: -460, scale: 4.3, rotationY: 0.25, bobPhase: 1.7, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.58, bobAmplitude: 0.66, bobFrequency: 0.014 },
  { x: 40, y: 70.0, z: -690, scale: 4.9, rotationY: -0.35, bobPhase: 3.9, assetId: ASSET_IDS.CLOUD_TOWERING_A, tier: "horizon", speedMultiplier: 0.5, bobAmplitude: 0.78, bobFrequency: 0.012 }
];

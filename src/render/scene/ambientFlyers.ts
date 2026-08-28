import { WorldLayout } from "../../world/WorldLayout";

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

export interface AmbientCloudPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotationY: number;
  bobPhase: number;
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

/** World-space cloud centers tuned to remain in the high farm review cameras. */
export const CLOUD_PLACEMENTS: readonly AmbientCloudPlacement[] = [
  { x: -78, y: 16, z: 11, scale: 2.1, rotationY: 0.12, bobPhase: 0.4 },
  { x: -59, y: 17, z: 49, scale: 1.8, rotationY: -0.24, bobPhase: 1.8 },
  { x: -44, y: 18, z: 84, scale: 2.5, rotationY: 0.33, bobPhase: 3.2 },
  { x: -118, y: 15.5, z: 47, scale: 1.9, rotationY: -0.16, bobPhase: 4.7 },
  { x: -60, y: 17, z: 116, scale: 2.2, rotationY: 0.22, bobPhase: 5.6 },
  { x: -128, y: 18.5, z: 94, scale: 1.7, rotationY: 0.58, bobPhase: 0.9 },
  { x: 86, y: 17, z: 38, scale: 2, rotationY: -0.42, bobPhase: 2.2 },
  { x: 42, y: 17.5, z: 96, scale: 1.65, rotationY: 0.72, bobPhase: 3.9 },
  { x: 91, y: 16, z: 86, scale: 1.85, rotationY: -0.55, bobPhase: 5.1 },
  { x: -12, y: 15, z: -112, scale: 2.3, rotationY: 0.08, bobPhase: 1.5 },
  { x: 174, y: 18.5, z: 22, scale: 1.75, rotationY: -0.28, bobPhase: 4.3 }
];

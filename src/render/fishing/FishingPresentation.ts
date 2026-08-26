import * as THREE from "three";
import type { FishingEncounterState } from "../../simulation/core/types";

export interface SportFishingPresentationSample {
  endpointX: number;
  endpointZ: number;
  depthMeters: number;
  lineSagMeters: number;
  rodBendRadians: number;
  rodTwistRadians: number;
  surfaceStrength: number;
  fishPitchRadians: number;
  fishRollRadians: number;
  fishYawRadians: number;
}

export function createSportFishingPresentationSample(): SportFishingPresentationSample {
  return {
    endpointX: 0,
    endpointZ: 0,
    depthMeters: 0,
    lineSagMeters: 0,
    rodBendRadians: 0,
    rodTwistRadians: 0,
    surfaceStrength: 0,
    fishPitchRadians: 0,
    fishRollRadians: 0,
    fishYawRadians: 0
  };
}

/** Deterministic render evidence derived only from the authoritative encounter. */
export function sampleSportFishingPresentation(
  encounter: Readonly<FishingEncounterState>,
  playerX: number,
  playerZ: number,
  playerHeadingRadians: number,
  reducedMotionScale: number,
  target: SportFishingPresentationSample
): SportFishingPresentationSample {
  const distance = Math.max(0.5, encounter.distanceMeters);
  const direction = THREE.MathUtils.clamp(encounter.fishDirection, -1, 1);
  const behaviorDirection = encounter.behavior === "run-left"
    ? -1
    : encounter.behavior === "run-right"
      ? 1
      : direction;
  const shake = encounter.behavior === "shake"
    ? Math.sin(encounter.elapsedSeconds * 16.5) * Math.min(0.75, distance * 0.035)
    : 0;
  const lateralMeters = THREE.MathUtils.clamp(
    behaviorDirection * Math.min(distance * 0.34, 6) + shake,
    -distance * 0.72,
    distance * 0.72
  );
  const forwardMeters = Math.sqrt(Math.max(0.25, distance * distance - lateralMeters * lateralMeters));
  const forwardX = Math.sin(playerHeadingRadians);
  const forwardZ = Math.cos(playerHeadingRadians);
  const rightX = Math.cos(playerHeadingRadians);
  const rightZ = -Math.sin(playerHeadingRadians);
  target.endpointX = playerX + forwardX * forwardMeters + rightX * lateralMeters;
  target.endpointZ = playerZ + forwardZ * forwardMeters + rightZ * lateralMeters;

  const tension = THREE.MathUtils.clamp(encounter.lineTension / 100, 0, 1);
  const integrityDanger = 1 - THREE.MathUtils.clamp(encounter.lineIntegrity / 100, 0, 1);
  target.depthMeters = encounter.behavior === "dive"
    ? 0.72
    : encounter.behavior === "surface"
      ? -0.08
      : encounter.behavior === "burst"
        ? 0.06
        : 0.2;
  target.lineSagMeters = THREE.MathUtils.lerp(0.72, 0.035, tension)
    + (encounter.isSlacking ? 0.28 : 0);
  target.rodBendRadians = (0.045 + tension * 0.28 + integrityDanger * 0.045)
    * reducedMotionScale;
  target.rodTwistRadians = THREE.MathUtils.clamp(lateralMeters / Math.max(1, distance), -1, 1)
    * 0.12
    * reducedMotionScale;
  target.surfaceStrength = THREE.MathUtils.clamp(
    (encounter.behavior === "surface" ? 0.9 : encounter.behavior === "burst" ? 0.72 : encounter.behavior === "shake" ? 0.56 : 0.18)
      + tension * 0.18,
    0,
    1
  ) * reducedMotionScale;
  target.fishPitchRadians = encounter.behavior === "dive"
    ? -0.42
    : encounter.behavior === "surface"
      ? 0.32
      : 0;
  target.fishRollRadians = (
    encounter.behavior === "shake"
      ? Math.sin(encounter.elapsedSeconds * 19) * 0.34
      : behaviorDirection * 0.09
  ) * reducedMotionScale;
  target.fishYawRadians = Math.atan2(
    target.endpointX - playerX,
    target.endpointZ - playerZ
  ) + Math.PI;
  return target;
}

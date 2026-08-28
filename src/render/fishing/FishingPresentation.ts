import * as THREE from "three";
import type { FishingEncounterState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { fishingEndpoint } from "../../simulation/fishing/FishingTuning";

export interface SportFishingPresentationSample {
  endpointX: number; endpointZ: number; depthMeters: number;
  lineSagMeters: number; rodBendRadians: number; rodTwistRadians: number;
  surfaceStrength: number; fishPitchRadians: number; fishRollRadians: number;
  fishYawRadians: number; fishScale: number;
  retrievalMetersPerSecond: number; payoutMetersPerSecond: number;
  loadRatio: number; surfaceCrossings: number; encounterId: string;
  elapsedSeconds: number; lineIntegrity: number; snapTimerSeconds: number;
  lineTension: number; maxSafeTension: number;
}

export function createSportFishingPresentationSample(): SportFishingPresentationSample {
  return {
    endpointX: 0, endpointZ: 0, depthMeters: 0, lineSagMeters: 0,
    rodBendRadians: 0, rodTwistRadians: 0, surfaceStrength: 0,
    fishPitchRadians: 0, fishRollRadians: 0, fishYawRadians: 0, fishScale: 1,
    retrievalMetersPerSecond: 0, payoutMetersPerSecond: 0, loadRatio: 0,
    surfaceCrossings: 0, encounterId: "", elapsedSeconds: 0, lineIntegrity: 100,
    snapTimerSeconds: 0, lineTension: 0, maxSafeTension: 80
  };
}

/** One read model for the line, fish, angler, camera and sound. No gameplay mutation. */
export function sampleSportFishingPresentation(
  encounter: Readonly<FishingEncounterState>, playerX: number, playerZ: number,
  playerHeadingRadians: number, reducedMotionScale: number, target: SportFishingPresentationSample
): SportFishingPresentationSample {
  const m = encounter.dynamics;
  const point = m ? fishingEndpoint(encounter) : {
    x: playerX + Math.sin(playerHeadingRadians) * encounter.distanceMeters,
    z: playerZ + Math.cos(playerHeadingRadians) * encounter.distanceMeters
  };
  const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId);
  const rod = ContentRegistry.rods.get(encounter.rodId);
  const tension = THREE.MathUtils.clamp(encounter.lineTension / 100, 0, 1);
  target.endpointX = point.x;
  target.endpointZ = point.z;
  target.depthMeters = m?.depthMeters ?? 0.25;
  const looseLine = m ? Math.max(0, m.lineLengthMeters - encounter.distanceMeters) : 0;
  target.lineSagMeters = THREE.MathUtils.lerp(0.65, 0.025, tension) + Math.min(2.5, looseLine * 0.35);
  // Load and direction remain legible with reduced motion; only secondary oscillation is scaled.
  target.rodBendRadians = 0.03 + tension * 0.48;
  target.rodTwistRadians = (m?.rodDirection ?? encounter.rodDirectionAngle) * 0.12;
  target.retrievalMetersPerSecond = m?.retrievalMetersPerSecond ?? 0;
  target.payoutMetersPerSecond = m?.payoutMetersPerSecond ?? 0;
  target.loadRatio = encounter.lineTension / Math.max(1, rod?.maxSafeTension ?? 80);
  target.surfaceStrength = THREE.MathUtils.clamp(1 - Math.abs(target.depthMeters) / 0.35, 0, 1)
    * THREE.MathUtils.clamp(0.15 + (m?.effort ?? 0) * 0.65, 0, 1);
  target.fishPitchRadians = m ? Math.atan2(m.verticalVelocity,
    Math.max(0.4, Math.hypot(m.radialVelocity, m.angularVelocity * encounter.distanceMeters))) : 0;
  target.fishRollRadians = (m?.angularVelocity ?? 0) * 0.3 * reducedMotionScale;
  // The catalog fish faces local +Z (Blender -Y).
  target.fishYawRadians = m?.headingRadians ?? playerHeadingRadians;
  target.fishScale = species ? THREE.MathUtils.clamp(
    Math.cbrt(encounter.fish.weightKg / Math.max(0.1, species.weightKg.average)), 0.7, 1.3) : 1;
  target.surfaceCrossings = m?.surfaceCrossings ?? 0;
  target.encounterId = encounter.fish.instanceId;
  target.elapsedSeconds = encounter.elapsedSeconds;
  target.lineIntegrity = encounter.lineIntegrity;
  target.snapTimerSeconds = encounter.snapTimerSeconds;
  target.lineTension = encounter.lineTension;
  target.maxSafeTension = rod?.maxSafeTension ?? 80;
  return target;
}

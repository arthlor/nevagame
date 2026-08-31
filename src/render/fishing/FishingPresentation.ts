import * as THREE from "three";
import type { FishingEncounterState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import {
  FISHING_TUNING,
  fishingBehaviorReadout,
  fishingEndpoint,
  type FishingBehaviorPhase
} from "../../simulation/fishing/FishingTuning";

export interface SportFishingPresentationSample {
  endpointX: number; endpointZ: number; depthMeters: number;
  lineSagMeters: number; rodBendRadians: number; rodTwistRadians: number;
  surfaceStrength: number; fishPitchRadians: number; fishRollRadians: number;
  fishYawRadians: number; fishScale: number;
  retrievalMetersPerSecond: number; payoutMetersPerSecond: number;
  loadRatio: number; surfaceCrossings: number; encounterId: string;
  elapsedSeconds: number; lineIntegrity: number; snapTimerSeconds: number;
  lineTension: number; maxSafeTension: number;
  /** Rebuild signals — physics head-shake, rod-blank load, fish world speed, steer input. */
  shakeAmplitude: number; rodLoad: number; fishSpeedMps: number; rodDirection: number;
  /** Procedural fish body drive derived here so the renderer stays declarative. */
  fishTailBeatHz: number; fishBendRadians: number; fishFlashIntensity: number;
  /** Shared fight-language signals consumed by camera, animation and explanatory UI. */
  behaviorPhase: FishingBehaviorPhase; behaviorPhaseProgress: number;
  pumpLoadRatio: number; windOpportunity: number; staminaRatio: number;
}

export function createSportFishingPresentationSample(): SportFishingPresentationSample {
  return {
    endpointX: 0, endpointZ: 0, depthMeters: 0, lineSagMeters: 0,
    rodBendRadians: 0, rodTwistRadians: 0, surfaceStrength: 0,
    fishPitchRadians: 0, fishRollRadians: 0, fishYawRadians: 0, fishScale: 1,
    retrievalMetersPerSecond: 0, payoutMetersPerSecond: 0, loadRatio: 0,
    surfaceCrossings: 0, encounterId: "", elapsedSeconds: 0, lineIntegrity: 100,
    snapTimerSeconds: 0, lineTension: 0, maxSafeTension: 80,
    shakeAmplitude: 0, rodLoad: 0, fishSpeedMps: 0, rodDirection: 0,
    fishTailBeatHz: 1.6, fishBendRadians: 0, fishFlashIntensity: 0,
    behaviorPhase: "recovery", behaviorPhaseProgress: 0,
    pumpLoadRatio: 0, windOpportunity: 0, staminaRatio: 1
  };
}

/** One read model for the line, fish, angler, camera and sound. No gameplay mutation. */
export function sampleSportFishingPresentation(
  encounter: Readonly<FishingEncounterState>, playerX: number, playerZ: number,
  playerHeadingRadians: number, reducedMotionScale: number, target: SportFishingPresentationSample
): SportFishingPresentationSample {
  const m = encounter.dynamics;
  const fallbackBearing = playerHeadingRadians + encounter.fishDirection;
  const point = m ? fishingEndpoint(encounter) : {
    x: playerX + Math.sin(fallbackBearing) * encounter.distanceMeters,
    z: playerZ + Math.cos(fallbackBearing) * encounter.distanceMeters
  };
  const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId);
  const profile = species ? ContentRegistry.fishBehaviors.get(species.behaviorProfileId) : undefined;
  const rod = ContentRegistry.rods.get(encounter.rodId);
  const tension = THREE.MathUtils.clamp(encounter.lineTension / 100, 0, 1);
  target.endpointX = point.x;
  target.endpointZ = point.z;
  target.depthMeters = m?.depthMeters ?? 0.25;
  const looseLine = m ? Math.max(0, m.lineLengthMeters - encounter.distanceMeters) : 0;
  target.lineSagMeters = THREE.MathUtils.lerp(0.65, 0.025, tension) + Math.min(2.5, looseLine * 0.35);
  // Load and direction remain legible with reduced motion; only secondary oscillation is scaled.
  target.rodBendRadians = 0.03 + tension * 0.48;
  target.rodDirection = m?.rodDirection ?? encounter.rodDirectionAngle;
  target.rodTwistRadians = target.rodDirection * 0.12;
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
  // The fish is the subject of the fight, not a distant locator dot. Scale only
  // the presentation model as it runs out; simulation size and collision stay canonical.
  const distanceReadability = 1 + THREE.MathUtils.smoothstep(encounter.distanceMeters, 9, 52) * 0.86;
  target.fishScale = species ? THREE.MathUtils.clamp(
    Math.cbrt(encounter.fish.weightKg / Math.max(0.1, species.weightKg.average)), 0.7, 1.3)
    * distanceReadability : 1;
  target.surfaceCrossings = m?.surfaceCrossings ?? 0;
  target.encounterId = encounter.fish.instanceId;
  target.elapsedSeconds = encounter.elapsedSeconds;
  target.lineIntegrity = encounter.lineIntegrity;
  target.snapTimerSeconds = encounter.snapTimerSeconds;
  target.lineTension = encounter.lineTension;
  target.maxSafeTension = rod?.maxSafeTension ?? 80;

  // Rebuild signals. Head-shake and rod load fall back to tension for pre-rebuild
  // in-memory encounters that have no populated dynamics block.
  const shake = (m?.shakeAmplitude ?? 0) * reducedMotionScale;
  target.shakeAmplitude = shake;
  target.rodLoad = m?.rodLoad ?? tension;
  const speed = m?.fishSpeed ?? Math.abs(m?.radialVelocity ?? 0);
  target.fishSpeedMps = speed;
  const tired = species
    ? THREE.MathUtils.clamp(encounter.stamina / Math.max(1, encounter.maxStamina), 0, 1)
    : 1;
  // Tail beats faster as the fish swims harder; the body bows into turns and a
  // near-beaten fish rolls its flank up (flash) as it gives in near the boat.
  target.fishTailBeatHz = THREE.MathUtils.clamp(1.1 + speed * 0.85 + (m?.effort ?? 0) * 1.6, 0.6, 6);
  target.fishBendRadians = THREE.MathUtils.clamp((m?.angularVelocity ?? 0) * 0.6, -0.5, 0.5)
    + Math.sin((m?.shakePhase ?? 0)) * shake * 0.25;
  target.fishFlashIntensity = THREE.MathUtils.clamp(
    (1 - tired) * 0.6 + (encounter.distanceMeters < 6 ? (6 - encounter.distanceMeters) / 6 * 0.5 : 0),
    0,
    1
  );
  const behavior = fishingBehaviorReadout(encounter, profile);
  target.behaviorPhase = behavior.phase;
  target.behaviorPhaseProgress = behavior.progress;
  target.pumpLoadRatio = THREE.MathUtils.clamp(
    (m?.rodLoad ?? tension) / FISHING_TUNING.pumpMaximumLoad,
    0,
    1
  );
  target.windOpportunity = THREE.MathUtils.clamp(
    Math.max(0, (m?.rodLoad ?? tension) - tension)
      / Math.max(0.01, FISHING_TUNING.pumpMaximumLoad - tension),
    0,
    1
  );
  target.staminaRatio = THREE.MathUtils.clamp(encounter.stamina / Math.max(1, encounter.maxStamina), 0, 1);
  return target;
}

import type { FishBehavior, FishingDynamicsState, FishingEncounterState } from "../core/types";

/** Metres, seconds and normalized gameplay load (not Newtons). */
export const FISHING_TUNING = Object.freeze({
  stepSeconds: 1 / 60,
  minimumDistance: 0.5,
  minimumLineLength: 0.05,
  maximumDistance: 120,
  landingDistance: 3,
  landingStaminaRatio: 0.15,
  minimumLandingTension: 12,
  slackTension: 8,
  lineStiffness: 28,
  lineDamping: 4,
  tensionRisePerSecond: 42,
  tensionFallPerSecond: 55,
  reelMetersPerPower: 0.1,
  resistancePerPower: 0.14,
  dragThresholdRatio: 0.72,
  dragPayoutRate: 0.11,
  overloadDamageRate: 0.45,
  snapGraceSeconds: 0.85,
  restRecoveryPerSecond: 0.45
});

export const FISH_BEHAVIOR_EFFORT: Record<FishBehavior, number> = {
  rest: 0.06, "run-left": 0.78, "run-right": 0.78,
  dive: 0.95, surface: 0.55, burst: 1.45, shake: 0.58
};

export const clampFishing = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export const approachFishing = (value: number, target: number, step: number): number =>
  value + clampFishing(target - value, -step, step);
export const fishingAngleDelta = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Also used by the save migration; preserves the encounter's existing result/resources. */
export function createFishingDynamics(
  state: Readonly<FishingEncounterState>,
  originX = 0,
  originZ = 0,
  bearingRadians = 0,
  rngState = 1
): FishingDynamicsState {
  return {
    originX, originZ, bearingRadians, headingRadians: bearingRadians,
    radialVelocity: 0, angularVelocity: 0, depthMeters: 0.25, verticalVelocity: 0,
    lineLengthMeters: Math.max(FISHING_TUNING.minimumLineLength, state.distanceMeters - state.lineTension / FISHING_TUNING.lineStiffness),
    rodDirection: clampFishing(state.rodDirectionAngle, -1, 1), effort: 0.06,
    retrievalMetersPerSecond: 0, payoutMetersPerSecond: 0,
    behaviorDurationSeconds: Math.max(0.1, state.behaviorUntilSeconds),
    surfaceCrossings: 0, stepRemainderSeconds: 0, rngState
  };
}

export function fishingEndpoint(state: Readonly<FishingEncounterState>): { x: number; z: number } {
  const motion = state.dynamics;
  if (!motion) return { x: 0, z: state.distanceMeters };
  const horizontal = Math.sqrt(Math.max(0, state.distanceMeters ** 2 - motion.depthMeters ** 2));
  return {
    x: motion.originX + Math.sin(motion.bearingRadians) * horizontal,
    z: motion.originZ + Math.cos(motion.bearingRadians) * horizontal
  };
}

/** Pick a continuous stretch of water, allowing a short dry bank below the angler. */
export function findFishingWater(
  x: number, z: number, bearing: number, reach: number,
  isWater: (x: number, z: number) => boolean
): { distance: number; bearing: number } | null {
  for (let distance = reach; distance >= Math.min(2, reach); distance -= 2) {
    for (let turn = 0; turn < 24; turn++) {
      const angle = bearing + (turn % 2 ? 1 : -1) * Math.ceil(turn / 2) * Math.PI / 12;
      if (!isWater(x + Math.sin(angle) * distance, z + Math.cos(angle) * distance)) continue;
      let entered = false;
      let valid = true;
      for (let along = 0.5; along <= distance; along += 0.5) {
        const wet = isWater(x + Math.sin(angle) * along, z + Math.cos(angle) * along);
        if ((!wet && entered) || (!wet && along > 12)) { valid = false; break; }
        entered ||= wet;
      }
      if (valid && entered) return { distance, bearing: angle };
    }
  }
  return null;
}

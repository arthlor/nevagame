import type { FishBehavior, FishingDynamicsState, FishingEncounterState } from "../core/types";
import type { FishBehaviorProfile } from "../../content/types";

export type FishingBehaviorPhase = "tell" | "drive" | "recovery";

export const FISHING_STEER_INPUT_MAX = 0.6;

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
  /** A tired fish inside landing range must be held in the green band this long before it beaches. */
  landReadySeconds: 0.55,
  /** Upper edge of the "green" landing band, as a fraction of the rod's max safe tension. */
  landingTensionCeilRatio: 0.86,
  lineStiffness: 28,
  lineDamping: 4,
  tensionRisePerSecond: 32,
  tensionFallPerSecond: 44,
  reelMetersPerPower: 0.1,
  resistancePerPower: 0.14,
  dragThresholdRatio: 0.72,
  dragPayoutRate: 0.11,
  overloadDamageRate: 0.45,
  snapGraceSeconds: 1.1,
  /** Fast species still hold one readable command long enough for a player to react. */
  minimumBehaviorSeconds: 3.2,
  minimumTellSeconds: 0.85,
  minimumRecoverySeconds: 0.75,
  /** A brief dip into slack warns first; it is not an instant loss on strong fish. */
  minimumSlackEscapeSeconds: 2.2,
  restRecoveryPerSecond: 0.45,
  /** How fast the rod blank loads and unloads toward the current line tension. */
  rodLoadResponse: 7,
  /** Maximum load stored in the blank by a deliberate Space lift. */
  pumpMaximumLoad: 1.25,
  /** Load added per second while the player lifts against a live fish. */
  pumpLoadPerSecond: 0.72,
  /** Additional normalized tension created by lifting the rod. */
  pumpTensionGain: 10,
  /** Direct winding is deliberately weak while the rod is still being lifted. */
  pumpingReelScale: 0.12,
  /** Extra retrieval (m/s) the rod feeds back as it unloads while you reel a pumped rod down. */
  rodAssistPerLoad: 3.1,
  /** Recovery is the high-value wind-down window after a fish commits. */
  recoveryReelMultiplier: 1.32,
  /** Retrieval efficiency lost, at worst, when reeling straight across a running fish. */
  pumpCrossPenalty: 0.5,
  /** Fish forward-speed and heading responsiveness toward their behaviour targets. */
  fishAccelResponse: 2.4,
  fishTurnResponse: 2.4,
  /** Line-integrity damage multiplier contributed by a hard head-shake. */
  shakeDamageScale: 4,
  /** Bracing protects the hook during a shake, but still adds its normal tension load. */
  bracedShakeDamageMultiplier: 0.3,
  /** A prepared lure makes a hooked sport fish more readable without changing tell duration. */
  preparedLureDriveMultiplier: 0.9,
  preparedLureShakeDamageMultiplier: 0.8,
  /** Rough water adds bounded fight pressure; behavior clocks and minimum tells are untouched. */
  roughSeaDriveScale: 0.18,
  windOpportunityCueThreshold: 0.12
});

export interface FishingBehaviorReadout {
  phase: FishingBehaviorPhase;
  progress: number;
}

/** Shared behavior clock interpretation for simulation-adjacent presentation and UI. */
export function fishingBehaviorReadout(
  state: Readonly<FishingEncounterState>,
  profile?: Readonly<FishBehaviorProfile>
): FishingBehaviorReadout {
  if (state.behavior === "rest") return { phase: "recovery", progress: 1 };
  const duration = Math.max(0.1, state.dynamics?.behaviorDurationSeconds ?? state.behaviorUntilSeconds);
  const age = Math.max(0, duration - state.behaviorUntilSeconds);
  const tell = Math.min(
    duration * 0.42,
    Math.max(FISHING_TUNING.minimumTellSeconds, profile?.tellSeconds ?? 0)
  );
  const recovery = Math.min(
    duration * 0.38,
    Math.max(FISHING_TUNING.minimumRecoverySeconds, profile?.recoverySeconds ?? 0)
  );
  if (age < tell) return { phase: "tell", progress: clampFishing(age / Math.max(0.05, tell), 0, 1) };
  if (state.behaviorUntilSeconds <= recovery) {
    return {
      phase: "recovery",
      progress: clampFishing(1 - state.behaviorUntilSeconds / Math.max(0.05, recovery), 0, 1)
    };
  }
  return {
    phase: "drive",
    progress: clampFishing((age - tell) / Math.max(0.05, duration - tell - recovery), 0, 1)
  };
}

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

/** One species-aware depth contract shared by encounter motion and save validation. */
export function fishingDepthBounds(
  profile: Readonly<Pick<FishBehaviorProfile, "surfaceLeapMeters" | "diveDepthMeters">>,
  distanceMeters: number
): { minimum: number; maximum: number } {
  const reach = Math.max(0, distanceMeters) * 0.6;
  return {
    minimum: -Math.min(profile.surfaceLeapMeters ?? 0.9, reach),
    maximum: Math.min(Math.max(4, profile.diveDepthMeters ?? 4), reach)
  };
}

/** Simulation-owned opportunity signal used by mechanics, presentation, and HUD. */
export function fishingWindOpportunity(state: Readonly<FishingEncounterState>): number {
  const tension = clampFishing(state.lineTension / 100, 0, 1);
  const storedLoadOpportunity = clampFishing(
    Math.max(0, (state.dynamics?.rodLoad ?? tension) - tension)
      / Math.max(0.01, FISHING_TUNING.pumpMaximumLoad - tension),
    0,
    1
  );
  const lowEffortOpportunity = 1 - clampFishing(
    ((state.dynamics?.effort ?? 1) - 0.12) / 0.6,
    0,
    1
  );
  return Math.max(storedLoadOpportunity, lowEffortOpportunity);
}

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
    surfaceCrossings: 0, stepRemainderSeconds: 0, rngState,
    rodLoad: clampFishing(state.lineTension / 100, 0, 1), fishSpeed: 0,
    shakePhase: 0, shakeAmplitude: 0, landReadySeconds: 0
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

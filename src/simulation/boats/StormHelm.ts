// src/simulation/boats/StormHelm.ts

import type { BoatDefinition } from "../../content/types";
import type { BoatId, BoatState, TimeWindowId, WeatherState } from "../core/types";
import { unsafeSeaMargin } from "../weather/seaState";

/**
 * The storm-helm stability challenge.
 *
 * This is the one owner of the gust schedule, the heel dynamics and the
 * pass/fail rule. It is deliberately a pure, fixed-step model: the same input
 * timeline and weather produce the same result at any render rate, and it draws
 * no RNG at all. The player never gets a second control layer for it — the
 * challenge reads the real heading and speed the ordinary helm already owns, so
 * pointing the bow into the gust with A/D is the whole skill, and heaving to
 * (easing the throttle) trades trip time for safety.
 *
 * Runtime state is intentionally not persisted, like a Work shift: a reload
 * abandons the current gust, and the next one simply arrives because the storm
 * is still there. Hull damage and wrecks persist through `BoatState.durability`.
 */

export const STORM_HELM_FIXED_STEP_SECONDS = 1 / 60;

/** A long frame hitch must not burst-advance the challenge. */
export const STORM_HELM_MAX_REAL_STEP_SECONDS = 0.25;

export const STORM_HELM = Object.freeze({
  /** First gust this many eligible seconds after entering an unsafe sea. */
  entryGraceSeconds: 5,
  /** Seconds of storm sailing between gust windows, mild to full strength. */
  gustIntervalSeconds: [22, 11] as const,
  /** Gust window length, mild to full strength. */
  gustDurationSeconds: [5, 7] as const,
  /** Below this share of top speed the gust eases and a heave-to survives. */
  minimumSpeedRatio: 0.35,
  /** Effective roughness must pass the safe value by this much to start a gust. */
  unsafeMargin: 0.02,
  /** Gust strength floor; the ramp to 1 spans the rest of the unsafe margin. */
  minimumGustStrength: 0.45,
  /** Deterministic heading wander of the gust around the weather wind. */
  gustDirectionWanderRadians: 0.35,
  gustWanderRate: 0.9,
  /** Deterministic force wobble over the window so the helm must keep working. */
  gustForceWobble: 0.35,
  gustForceWobbleRate: 1.7,
  /** Heel spring toward the gust push. */
  heelSpring: 3.0,
  heelDamping: 2.2,
  /**
   * Gust push that saturates the needle. A beam-on gust at full throttle
   * broaches; the same gust at reduced throttle only labors outside the band,
   * so easing off is a real second option next to turning into the wind.
   */
  heelPushScale: 0.55,
  /** Half-width of the safe needle band. */
  heelSafeHalfWidth: 0.6,
  /** Maximum seconds outside the safe band before the hull is struck. */
  outOfBandGraceSeconds: 1.5,
  /** Result plaque lifetime before the next gust can begin charging. */
  resultSeconds: 2.4,
  /** Open-water exposure below which a river, cove or estuary counts as shelter. */
  minimumOpenWaterExposure: 0.35
});

export type StormHelmPhase = "idle" | "gust" | "result";
export type StormHelmFailReason = "broach" | "sustained";

export interface StormHelmRuntime {
  boatId: BoatId;
  phase: StormHelmPhase;
  /** Continuous eligible open-water sailing since the last gust window closed. */
  exposureSeconds: number;
  /** Elapsed seconds within the current gust or result plaque. */
  elapsedSeconds: number;
  durationSeconds: number;
  gustStrength: number;
  /** Stable per-boat offset so two hulls never wobble in lockstep. */
  phaseOffsetRadians: number;
  /** Normalized heel, -1..1; |heel| >= 1 is a broach. */
  heel: number;
  heelVelocity: number;
  outOfBandSeconds: number;
  result: "survived" | "failed" | null;
  failReason: StormHelmFailReason | null;
}

export interface StormHelmContext {
  definition: BoatDefinition;
  boat: Readonly<
    Pick<BoatState, "x" | "z" | "headingRadians" | "speed" | "durability" | "isDocked">
  >;
  weather: Readonly<Pick<WeatherState, "seaRoughness" | "windDirectionDeg" | "windSpeed">>;
  timeOfDay: TimeWindowId;
  /** Shared world query at the hull. */
  openWaterExposure: number;
}

export type StormHelmStepOutcome =
  | { kind: "none" }
  | { kind: "gust-started" }
  | { kind: "survived" }
  | { kind: "failed"; reason: StormHelmFailReason };

const NO_OUTCOME: StormHelmStepOutcome = { kind: "none" };

export function createStormHelmRuntime(boatId: BoatId, phaseOffsetRadians = stablePhaseRadians(boatId)): StormHelmRuntime {
  return {
    boatId,
    phase: "idle",
    exposureSeconds: 0,
    elapsedSeconds: 0,
    durationSeconds: 0,
    gustStrength: 0,
    phaseOffsetRadians,
    heel: 0,
    heelVelocity: 0,
    outOfBandSeconds: 0,
    result: null,
    failReason: null
  };
}

/**
 * Whether the sea itself is past this hull's safe range. `isStormHelmEligible`
 * adds the helm/shelter conditions on top.
 */
export function isUnsafeSea(context: Pick<StormHelmContext, "definition" | "weather" | "timeOfDay">): boolean {
  return unsafeSeaMargin(
    context.weather.seaRoughness,
    context.timeOfDay,
    context.definition.safeSeaRoughness
  ) > STORM_HELM.unsafeMargin;
}

export function stormHelmGustStrength(
  context: Pick<StormHelmContext, "definition" | "weather" | "timeOfDay">
): number {
  const margin = Math.max(0.15, 1 - context.definition.safeSeaRoughness);
  const ratio = clamp01(
    unsafeSeaMargin(context.weather.seaRoughness, context.timeOfDay, context.definition.safeSeaRoughness)
      / margin
  );
  return clamp01(STORM_HELM.minimumGustStrength + (1 - STORM_HELM.minimumGustStrength) * ratio);
}

export function stormHelmGustIntervalSeconds(strength: number): number {
  return lerp(STORM_HELM.gustIntervalSeconds[0], STORM_HELM.gustIntervalSeconds[1], clamp01(strength));
}

export function stormHelmGustDurationSeconds(strength: number): number {
  return lerp(STORM_HELM.gustDurationSeconds[0], STORM_HELM.gustDurationSeconds[1], clamp01(strength));
}

/** A gust can begin only while under way in exposed water on an unsafe sea. */
export function isStormHelmEligible(context: StormHelmContext): boolean {
  if (context.boat.isDocked) return false;
  if (context.boat.durability <= 0) return false;
  if (context.openWaterExposure < STORM_HELM.minimumOpenWaterExposure) return false;
  if (!isUnsafeSea(context)) return false;
  return Math.abs(context.boat.speed) >= context.definition.maxSpeed * STORM_HELM.minimumSpeedRatio;
}

/** A running gust continues while the hull is afloat in still-unsafe exposed water. */
function isStormHelmEnduring(context: StormHelmContext): boolean {
  if (context.boat.isDocked) return false;
  if (context.boat.durability <= 0) return false;
  if (context.openWaterExposure < STORM_HELM.minimumOpenWaterExposure) return false;
  return isUnsafeSea(context);
}

/**
 * Advances the challenge by one fixed step. Mutates `runtime` only; the caller
 * applies hull damage/restoration and emits events from the returned outcome.
 */
export function stepStormHelm(
  runtime: StormHelmRuntime,
  context: StormHelmContext,
  deltaSeconds: number
): StormHelmStepOutcome {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return NO_OUTCOME;

  if (runtime.phase === "result") {
    runtime.elapsedSeconds += deltaSeconds;
    if (runtime.elapsedSeconds >= STORM_HELM.resultSeconds) {
      resetToIdle(runtime);
    }
    return NO_OUTCOME;
  }

  if (runtime.phase === "idle") {
    runtime.heel = 0;
    runtime.heelVelocity = 0;
    runtime.outOfBandSeconds = 0;
    if (!isStormHelmEligible(context)) {
      runtime.exposureSeconds = 0;
      return NO_OUTCOME;
    }
    runtime.exposureSeconds += deltaSeconds;
    const strength = stormHelmGustStrength(context);
    const interval = stormHelmGustIntervalSeconds(strength);
    if (runtime.exposureSeconds < Math.max(STORM_HELM.entryGraceSeconds, interval)) return NO_OUTCOME;
    runtime.phase = "gust";
    runtime.elapsedSeconds = 0;
    runtime.durationSeconds = stormHelmGustDurationSeconds(strength);
    runtime.gustStrength = strength;
    runtime.result = null;
    runtime.failReason = null;
    return { kind: "gust-started" };
  }

  // Gust in progress.
  runtime.elapsedSeconds += deltaSeconds;
  if (!isStormHelmEnduring(context)) {
    return closeGust(runtime, "survived");
  }

  const windRadians = (context.weather.windDirectionDeg * Math.PI) / 180;
  const wander = Math.sin(runtime.elapsedSeconds * STORM_HELM.gustWanderRate + runtime.phaseOffsetRadians)
    * STORM_HELM.gustDirectionWanderRadians;
  const gustDirection = windRadians + wander;
  const crosswind = Math.sin(gustDirection - context.boat.headingRadians);
  const speedRatio = clamp01(
    Math.abs(context.boat.speed) / Math.max(0.1, context.definition.maxSpeed)
  );
  const wobble = 1 - STORM_HELM.gustForceWobble
    + STORM_HELM.gustForceWobble
    * (0.5 + 0.5 * Math.sin(runtime.elapsedSeconds * STORM_HELM.gustForceWobbleRate + runtime.phaseOffsetRadians * 1.7));
  const push = runtime.gustStrength * crosswind * speedRatio * wobble;
  const targetHeel = clamp(push / STORM_HELM.heelPushScale, -1, 1);
  runtime.heelVelocity += (targetHeel - runtime.heel) * STORM_HELM.heelSpring * deltaSeconds;
  runtime.heelVelocity *= Math.exp(-STORM_HELM.heelDamping * deltaSeconds);
  runtime.heel += runtime.heelVelocity * deltaSeconds;
  // The spring may overshoot on the step that crosses the broach threshold.
  // Bound the stored needle so no consumer can read an impossible value.
  runtime.heel = clamp(runtime.heel, -1.25, 1.25);

  if (Math.abs(runtime.heel) >= 1) {
    return closeGust(runtime, "failed", "broach");
  }
  if (Math.abs(runtime.heel) > STORM_HELM.heelSafeHalfWidth) {
    runtime.outOfBandSeconds += deltaSeconds;
  } else {
    runtime.outOfBandSeconds = Math.max(0, runtime.outOfBandSeconds - deltaSeconds * 2);
  }
  if (runtime.outOfBandSeconds >= STORM_HELM.outOfBandGraceSeconds) {
    return closeGust(runtime, "failed", "sustained");
  }
  if (runtime.elapsedSeconds >= runtime.durationSeconds) {
    return closeGust(runtime, "survived");
  }
  return NO_OUTCOME;
}

function closeGust(
  runtime: StormHelmRuntime,
  result: "survived" | "failed",
  failReason: StormHelmFailReason | null = null
): StormHelmStepOutcome {
  runtime.phase = "result";
  runtime.elapsedSeconds = 0;
  runtime.result = result;
  runtime.failReason = failReason;
  runtime.heelVelocity = 0;
  return result === "survived"
    ? { kind: "survived" }
    : { kind: "failed", reason: failReason ?? "broach" };
}

function resetToIdle(runtime: StormHelmRuntime): void {
  runtime.phase = "idle";
  runtime.elapsedSeconds = 0;
  runtime.exposureSeconds = 0;
  runtime.durationSeconds = 0;
  runtime.gustStrength = 0;
  runtime.heel = 0;
  runtime.heelVelocity = 0;
  runtime.outOfBandSeconds = 0;
  runtime.result = null;
  runtime.failReason = null;
}

/** Stable per-boat wobble phase; derived from the ID, never from wall time. */
function stablePhaseRadians(boatId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < boatId.length; index += 1) {
    hash ^= boatId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * Math.PI * 2;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

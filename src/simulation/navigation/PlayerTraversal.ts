import type { PlayerTraversalState } from "../core/types";

export const PLAYER_TRAVERSAL_TUNING = Object.freeze({
  walkSpeedMetersPerSecond: 5,
  sprintSpeedMetersPerSecond: 8.2,
  accelerationMetersPerSecondSquared: 32,
  decelerationMetersPerSecondSquared: 42,
  gravityMetersPerSecondSquared: 18,
  terminalFallSpeedMetersPerSecond: 22,
  jumpSpeedMetersPerSecond: 5.55,
  jumpBufferSeconds: 0.12,
  coyoteTimeSeconds: 0.1,
  maximumSprintStamina: 100,
  sprintDrainPerSecond: 22,
  sprintRecoveryPerSecond: 30,
  sprintRecoveryDelaySeconds: 0.65,
  sprintResumeThreshold: 18
});

export interface TraversalStepInput {
  wantsSprint: boolean;
  isMoving: boolean;
}

export interface TraversalStepResult {
  traversal: PlayerTraversalState;
  isSprinting: boolean;
}

export function createFullPlayerTraversalState(): PlayerTraversalState {
  return {
    sprintStamina: PLAYER_TRAVERSAL_TUNING.maximumSprintStamina,
    sprintRecoveryDelaySeconds: 0,
    sprintExhausted: false,
    isGrounded: true
  };
}

/** Advances traversal resources once per fixed simulation step. */
export function advancePlayerTraversal(
  current: Readonly<PlayerTraversalState>,
  input: Readonly<TraversalStepInput>,
  fixedDeltaSeconds: number
): TraversalStepResult {
  const dt = Math.max(0, fixedDeltaSeconds);
  const maximum = PLAYER_TRAVERSAL_TUNING.maximumSprintStamina;
  let stamina = clamp(finiteOr(current.sprintStamina, maximum), 0, maximum);
  let recoveryDelay = Math.max(0, finiteOr(current.sprintRecoveryDelaySeconds, 0));
  let exhausted = current.sprintExhausted === true;

  if (exhausted && stamina >= PLAYER_TRAVERSAL_TUNING.sprintResumeThreshold) {
    exhausted = false;
  }

  const isSprinting = input.wantsSprint && input.isMoving && !exhausted && stamina > 0;
  if (isSprinting) {
    stamina = Math.max(0, stamina - PLAYER_TRAVERSAL_TUNING.sprintDrainPerSecond * dt);
    recoveryDelay = PLAYER_TRAVERSAL_TUNING.sprintRecoveryDelaySeconds;
    if (stamina <= 0) exhausted = true;
  } else {
    recoveryDelay = Math.max(0, recoveryDelay - dt);
    if (recoveryDelay <= 0 && stamina < maximum) {
      stamina = Math.min(maximum, stamina + PLAYER_TRAVERSAL_TUNING.sprintRecoveryPerSecond * dt);
    }
    if (exhausted && stamina >= PLAYER_TRAVERSAL_TUNING.sprintResumeThreshold) {
      exhausted = false;
    }
  }

  return {
    traversal: {
      sprintStamina: stamina,
      sprintRecoveryDelaySeconds: recoveryDelay,
      sprintExhausted: exhausted,
      isGrounded: current.isGrounded === true
    },
    isSprinting
  };
}

/**
 * Modest uphill penalty and downhill gain from the ground normal so hills read
 * as effort. Flat ground and missing/degenerate normals leave gait unchanged.
 */
export function slopeGaitScale(
  normal: Readonly<{ x: number; y: number; z: number }>,
  moveX: number,
  moveZ: number
): number {
  const moveLength = Math.hypot(moveX, moveZ);
  if (moveLength < 0.001 || !Number.isFinite(normal.y)) return 1;
  const slope = 1 - clamp(normal.y, 0, 1);
  if (slope < 0.01) return 1;
  const downhillLength = Math.hypot(-normal.x, -normal.z);
  if (downhillLength < 0.001) return 1;
  const alignment = (moveX * -normal.x + moveZ * -normal.z) / (moveLength * downhillLength);
  const signed = alignment >= 0 ? 0.12 * alignment : 0.22 * alignment;
  return clamp(1 + slope * signed, 0.78, 1.14);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

import type { GameMode, GameState, PlayerTraversalState } from "./types";

export interface PhysicsIntent {
  x: number;
  z: number;
  sprint: boolean;
  jumpRequested?: boolean;
}

export type RequestedPlayerGait = "idle" | "walk" | "run" | "vehicle";

/**
 * Transient fixed-step motion evidence. This is deliberately separate from
 * ResolvedPhysicsFrame so it can drive presentation without entering GameState.
 */
export interface PlayerMotionSample {
  velocity: { x: number; y: number; z: number };
  speedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  turnRateRadiansPerSecond: number;
  isGrounded: boolean;
  isCollisionBlocked: boolean;
  requestedGait: RequestedPlayerGait;
}

export interface ResolvedPlayerPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  traversal: PlayerTraversalState;
}

export interface ResolvedBoatPose {
  x: number;
  y: number;
  z: number;
  headingRadians: number;
  speed: number;
}

export interface ResolvedPhysicsFrame {
  player: ResolvedPlayerPose;
  boats: Record<string, ResolvedBoatPose>;
}

export interface PhysicsStepResult {
  frame: ResolvedPhysicsFrame;
  playerMotion: PlayerMotionSample;
}

export interface PhysicsAdapter {
  step(
    state: Readonly<GameState>,
    intent: PhysicsIntent,
    mode: GameMode,
    fixedDeltaSeconds: number,
    timeSeconds: number
  ): PhysicsStepResult;
}

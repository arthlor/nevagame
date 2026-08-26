import type { GameMode, GameState, PlayerTraversalState } from "./types";

export interface PhysicsIntent {
  x: number;
  z: number;
  sprint: boolean;
  jumpRequested?: boolean;
}

export type RequestedPlayerGait = "idle" | "walk" | "run" | "vehicle";

export type PlayerAirbornePhase = "grounded" | "rising" | "apex" | "falling";

export type PlayerContactEvent = "none" | "takeoff" | "land-soft" | "land-hard";

export type PhysicsContactSurface =
  | "grass"
  | "meadow"
  | "dry-soil"
  | "damp-soil"
  | "path"
  | "shoulder"
  | "beach"
  | "riverbed"
  | "wet-shoreline"
  | "cliff"
  | "interior-floor"
  | "bridge-deck"
  | "boat-deck"
  | "unknown";

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
  groundNormal: { x: number; y: number; z: number };
  slopeRadians: number;
  airbornePhase: PlayerAirbornePhase;
  contactEvent: PlayerContactEvent;
  landingImpactStrength: number;
  contactSurface: PhysicsContactSurface;
  isCollisionBlocked: boolean;
  requestedGait: RequestedPlayerGait;
}

/**
 * Per-boat transient evidence for animation, camera, wake, and audio. Canonical
 * boat state remains speed + heading in ResolvedPhysicsFrame/GameState.
 */
export interface BoatMotionSample {
  velocity: { x: number; y: number; z: number };
  accelerationMetersPerSecondSquared: number;
  yawRateRadiansPerSecond: number;
  throttle: number;
  steering: number;
  controlEffort: number;
  roughnessResponse: number;
  isCollisionBlocked: boolean;
  contactStrength: number;
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
  boatMotion: Record<string, BoatMotionSample>;
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

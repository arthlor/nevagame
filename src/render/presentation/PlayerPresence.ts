import type { GameMode } from "../../simulation/core/types";
import type { PresentedPlayerFrame } from "./PlayerPresentationBuffer";

/**
 * One render-only reading of "where the player is and what they are doing",
 * shared by every ambient presentation system so none of them recompute player
 * distance or gait on their own. It is derived from an already-sampled frame
 * and never flows back into simulation or a save.
 */
export interface PlayerPresence {
  x: number;
  y: number;
  z: number;
  facingRadians: number;
  speedMetersPerSecond: number;
  moving: boolean;
  mounted: boolean;
  mode: GameMode;
  reducedMotion: boolean;
}

export const IDLE_PLAYER_PRESENCE: Readonly<PlayerPresence> = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
  facingRadians: 0,
  speedMetersPerSecond: 0,
  moving: false,
  mounted: false,
  mode: "on-foot" as GameMode,
  reducedMotion: false
});

/** Below this speed a presence counts as standing still, matching the animator's idle threshold. */
export const PRESENCE_MOVING_SPEED_METERS_PER_SECOND = 0.05;

/**
 * Reuses `target` when supplied so the per-frame path never allocates.
 */
export function samplePlayerPresence(
  frame: Pick<PresentedPlayerFrame, "x" | "y" | "z" | "rotationY" | "motion"> | null,
  options: { mode: GameMode; mounted: boolean; reducedMotion: boolean },
  target: PlayerPresence = { ...IDLE_PLAYER_PRESENCE }
): PlayerPresence {
  const speed = frame?.motion?.speedMetersPerSecond ?? 0;
  target.x = frame?.x ?? target.x;
  target.y = frame?.y ?? target.y;
  target.z = frame?.z ?? target.z;
  target.facingRadians = frame?.rotationY ?? target.facingRadians;
  target.speedMetersPerSecond = speed;
  target.moving = speed > PRESENCE_MOVING_SPEED_METERS_PER_SECOND;
  target.mounted = options.mounted;
  target.mode = options.mode;
  target.reducedMotion = options.reducedMotion;
  return target;
}

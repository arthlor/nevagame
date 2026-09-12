import type { PlayerPresence } from "./PlayerPresence";

/**
 * Render-only proximity reactions. Everything here is a pure function of a
 * `PlayerPresence` and a world point, so the ambient systems share one
 * definition of "close enough to notice" and the math stays unit-testable.
 */

/** Radius inside which a person turns their head toward the player. */
export const ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS = 8;
/** Radius inside which ground cover releases and leans away from the player. */
export const ACKNOWLEDGE_COVER_RADIUS_METERS = 2.2;
/** Radius inside which fireflies drift off the player's path. */
export const ACKNOWLEDGE_FIREFLY_RADIUS_METERS = 4.5;

export function distanceSquaredToPresence(
  presence: Pick<PlayerPresence, "x" | "z">,
  x: number,
  z: number
): number {
  const dx = presence.x - x;
  const dz = presence.z - z;
  return dx * dx + dz * dz;
}

/** Smooth 1-at-centre → 0-at-radius falloff, used as a reaction strength. */
export function presenceFalloff(
  presence: Pick<PlayerPresence, "x" | "z">,
  x: number,
  z: number,
  radiusMeters: number
): number {
  if (radiusMeters <= 0) return 0;
  const distance = Math.sqrt(distanceSquaredToPresence(presence, x, z));
  const t = 1 - Math.min(1, distance / radiusMeters);
  return t * t * (3 - 2 * t);
}

/** World yaw from a world point to the player, matching the +Z forward convention. */
export function headingFromPointToPresence(
  presence: Pick<PlayerPresence, "x" | "z">,
  x: number,
  z: number
): number {
  return Math.atan2(presence.x - x, presence.z - z);
}

function wrapRadians(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Relative head yaw for a person at `(x, z)` facing `facingRadians`. Returns 0
 * once the player leaves the acknowledge radius so the head settles home.
 */
export function acknowledgeHeadYaw(
  presence: Pick<PlayerPresence, "x" | "z">,
  x: number,
  z: number,
  facingRadians: number,
  radiusMeters: number = ACKNOWLEDGE_HEAD_TURN_RADIUS_METERS
): number {
  if (distanceSquaredToPresence(presence, x, z) > radiusMeters * radiusMeters) return 0;
  return wrapRadians(headingFromPointToPresence(presence, x, z) - facingRadians);
}

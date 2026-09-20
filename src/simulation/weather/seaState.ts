// src/simulation/weather/seaState.ts

import type { TimeWindowId } from "../core/types";

/**
 * The single owner for the sea state a helm actually feels.
 *
 * Night adds effective wave energy on top of the weather's authored
 * `seaRoughness`: a dark sea is harder to read and easier to get wrong. Both
 * `PhysicsWorld` (handling penalty) and the storm-helm challenge read this
 * formula so a boat cannot be "unsafe" for one system and calm for the other.
 */
export function nightSeaExtra(timeOfDay: TimeWindowId): number {
  if (timeOfDay === "night") return 0.22;
  if (timeOfDay === "dusk") return 0.1;
  return 0;
}

export function effectiveSeaRoughness(seaRoughness: number, timeOfDay: TimeWindowId): number {
  return seaRoughness + nightSeaExtra(timeOfDay);
}

/** Storm helm only starts once the sea is meaningfully past the boat's safe range. */
export function unsafeSeaMargin(seaRoughness: number, timeOfDay: TimeWindowId, safeSeaRoughness: number): number {
  return effectiveSeaRoughness(seaRoughness, timeOfDay) - safeSeaRoughness;
}

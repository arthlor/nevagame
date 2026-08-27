import type { GroundCoverCategory } from "../../world/WorldEnvironmentLayout";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";

/** Per-category vertex sway in meters at full wind. Zero means the material is not patched. */
export const GROUND_COVER_WIND_AMPLITUDE: Readonly<Record<GroundCoverCategory, number>> = {
  grass: 0.22,
  flowers: 0.28,
  bushes: 0.12,
  meadowTall: 0.4,
  pebbles: 0,
  paving: 0,
  driftwood: 0.04
};

export function groundCoverSwaysInWind(category: GroundCoverCategory): boolean {
  return GROUND_COVER_WIND_AMPLITUDE[category] > 0;
}

/** Stable 0–1 phase from a placement id so tufts never sway in lockstep. */
export function groundCoverWindPhase(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function groundCoverWindStrength(signal: Readonly<WeatherMotionSignal>): number {
  return Math.max(0, 0.42 + signal.normalizedStrength * 0.9 + signal.gust * 0.14);
}

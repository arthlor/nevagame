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

/** Normalized model height where cover begins to release from its planted base. */
export const GROUND_COVER_WIND_ROOT_LOCK = 0.03;
export const GROUND_COVER_WIND_ROOT_RELEASE = 0.24;

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

/** Smooth rooted response used by the shader and its deterministic unit contract. */
export function groundCoverWindRootWeight(normalizedHeight: number): number {
  if (!Number.isFinite(normalizedHeight)) return 0;
  const span = GROUND_COVER_WIND_ROOT_RELEASE - GROUND_COVER_WIND_ROOT_LOCK;
  const t = Math.max(0, Math.min(1, (normalizedHeight - GROUND_COVER_WIND_ROOT_LOCK) / span));
  return t * t * (3 - 2 * t);
}

export function groundCoverWindStrength(signal: Readonly<WeatherMotionSignal>): number {
  return Math.max(0, 0.42 + signal.normalizedStrength * 0.9 + signal.gust * 0.14);
}

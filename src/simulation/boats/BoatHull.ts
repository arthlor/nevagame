// src/simulation/boats/BoatHull.ts

import { ContentRegistry } from "../../content/ContentRegistry";
import type { BoatState } from "../core/types";

/**
 * The single owner for boat hull life.
 *
 * Hull life is five equal steps: `durabilityMax / HULL_LIFE_STEPS`. A failed
 * storm gust costs one step and a survived gust restores one, so a full-hull
 * boat is wrecked by five consecutive failures and nowhere earlier. Wrecked is
 * derived (`durability <= 0`) rather than stored, so no schema field and no
 * migration exist for it; the flat Silas repair restores the full hull.
 */
export const HULL_LIFE_STEPS = 5;

export function boatDurabilityMax(boat: Pick<BoatState, "boatTypeId">): number {
  const definition = ContentRegistry.boats.get(boat.boatTypeId);
  return Math.max(1, definition?.durabilityMax ?? 100);
}

export function boatHullStep(boat: Pick<BoatState, "boatTypeId">): number {
  return boatDurabilityMax(boat) / HULL_LIFE_STEPS;
}

export function isBoatWrecked(boat: Pick<BoatState, "durability">): boolean {
  return boat.durability <= 0;
}

/** Whole hull lives remaining, rounded up so any surviving sliver still shows one. */
export function boatHullLives(boat: Pick<BoatState, "boatTypeId" | "durability">): number {
  if (!Number.isFinite(boat.durability) || boat.durability <= 0) return 0;
  return Math.min(HULL_LIFE_STEPS, Math.ceil(boat.durability / boatHullStep(boat)));
}

/**
 * Removes hull lives. Returns the damage actually applied so the caller can
 * report it truthfully after a wreck clamps at zero.
 */
export function damageBoatHull(boat: BoatState, steps = 1): number {
  const safeSteps = Number.isFinite(steps) ? Math.max(0, steps) : 0;
  const requested = boatHullStep(boat) * safeSteps;
  const before = Number.isFinite(boat.durability) ? Math.max(0, boat.durability) : 0;
  const after = Math.max(0, before - requested);
  boat.durability = after;
  return before - after;
}

/**
 * Restores hull lives, capped at the definition maximum. A survived gust uses
 * this; it never exceeds the full hull.
 */
export function restoreBoatHull(boat: BoatState, steps = 1): number {
  const maximum = boatDurabilityMax(boat);
  const before = Number.isFinite(boat.durability)
    ? Math.max(0, Math.min(maximum, boat.durability))
    : 0;
  const safeSteps = Number.isFinite(steps) ? Math.max(0, steps) : 0;
  const after = Math.min(maximum, before + boatHullStep(boat) * safeSteps);
  boat.durability = after;
  return after - before;
}

/** Full hull restoration for the paid harbor repair. Returns the amount restored. */
export function repairBoatHull(boat: BoatState): number {
  const maximum = boatDurabilityMax(boat);
  const before = Number.isFinite(boat.durability)
    ? Math.max(0, Math.min(maximum, boat.durability))
    : 0;
  boat.durability = maximum;
  return maximum - before;
}

import { WORK_CAPACITY_MAXIMUM } from "../simulation/domains/ProgressionDomain";
import type { GameState } from "../simulation/core/types";

/**
 * Raises the Work pool ceiling to `WORK_CAPACITY_MAXIMUM` without refilling a
 * pool that was below the old ceiling. Values already above the new ceiling
 * are clamped. Daily earn tallies, meals, labor use and the idle accumulator
 * are left as saved.
 */
export function migrateWorkCeiling72(state: GameState): GameState {
  const work = state.player?.workCapacity;
  if (work) {
    const current = Number.isFinite(work.current) ? Math.max(0, work.current) : 0;
    work.maximum = WORK_CAPACITY_MAXIMUM;
    work.current = Math.min(WORK_CAPACITY_MAXIMUM, current);
  }
  state.schemaVersion = 72;
  return state;
}

import type { GameState } from "../simulation/core/types";
import {
  WORK_CAPACITY_MAXIMUM,
  workEarningsDayFor
} from "../simulation/domains/ProgressionDomain";

/**
 * Layout 42 -> schema 43. Work Capacity becomes a daily labor budget earned
 * from rest, provisions, labor shifts and skill, so the old 1,000-point bank is
 * rescaled to the new ceiling while preserving how full the pool was. The daily
 * earning tallies are introduced here so validation can read them for every
 * current-schema save.
 */
export function migrateWorkCapacity43(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 43;
  const work = state.player?.workCapacity;
  if (work) {
    const oldMax = Number.isFinite(work.maximum) && work.maximum > 0 ? work.maximum : WORK_CAPACITY_MAXIMUM;
    const oldCurrent = Number.isFinite(work.current) ? work.current : oldMax;
    const rescaled =
      oldMax === WORK_CAPACITY_MAXIMUM
        ? Math.round(oldCurrent)
        : Math.round((oldCurrent / oldMax) * WORK_CAPACITY_MAXIMUM);
    work.maximum = WORK_CAPACITY_MAXIMUM;
    work.current = Math.max(0, Math.min(WORK_CAPACITY_MAXIMUM, rescaled));
    work.earnedToday = 0;
    work.earningsDay = workEarningsDayFor(state.clock?.currentMinute ?? 0);
    work.mealsToday = 0;
    work.laborUsedToday = [];
    work.passiveRegenSeconds = 0;
  }
  return state;
}

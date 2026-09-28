import type { GameState } from "../simulation/core/types";
import { workEarningsDayFor } from "../simulation/domains/ProgressionDomain";

/** Frozen ceiling for this historical step. Later ceilings must not rewrite it. */
export const WORK_CAPACITY_DAILY_BUDGET_V43 = 500;

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
    const oldMax = Number.isFinite(work.maximum) && work.maximum > 0 ? work.maximum : WORK_CAPACITY_DAILY_BUDGET_V43;
    const oldCurrent = Number.isFinite(work.current) ? work.current : oldMax;
    const rescaled =
      oldMax === WORK_CAPACITY_DAILY_BUDGET_V43
        ? Math.round(oldCurrent)
        : Math.round((oldCurrent / oldMax) * WORK_CAPACITY_DAILY_BUDGET_V43);
    work.maximum = WORK_CAPACITY_DAILY_BUDGET_V43;
    work.current = Math.max(0, Math.min(WORK_CAPACITY_DAILY_BUDGET_V43, rescaled));
    work.earnedToday = 0;
    work.earningsDay = workEarningsDayFor(state.clock?.currentMinute ?? 0);
    work.mealsToday = 0;
    work.laborUsedToday = [];
    work.passiveRegenSeconds = 0;
  }
  return state;
}

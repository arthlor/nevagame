import type { ClockState } from "../core/types";
import { DAYS_PER_SEASON, MINUTES_PER_DAY, SEASONS } from "../core/GameClock";

/** The first day eases out of the preceding palette; a fresh spring stays spring. */
export function buildSeasonPresentation(clock: Pick<ClockState, "season" | "currentMinute">) {
  const seasonMinutes = DAYS_PER_SEASON * MINUTES_PER_DAY;
  const elapsed = ((clock.currentMinute % seasonMinutes) + seasonMinutes) % seasonMinutes;
  const phase = Math.min(1, elapsed / MINUTES_PER_DAY);
  const blend = phase * phase * (3 - 2 * phase);
  const previous = clock.currentMinute < seasonMinutes ? clock.season
    : SEASONS[(SEASONS.indexOf(clock.season) + SEASONS.length - 1) % SEASONS.length];
  return { previous, current: clock.season, blend };
}

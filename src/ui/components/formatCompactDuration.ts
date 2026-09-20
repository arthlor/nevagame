/**
 * Authored game durations read better as the days and hours a player waits
 * than as raw minutes. One implementation: the satchel's item card and the
 * almanac each carried a copy of the same rounding, and both could report
 * "24h" or "1d 24h" when the leftover minutes rounded up to a full hour.
 *
 * The day/hour split is derived from the rounded total, so a value in the last
 * half hour before a day boundary carries into the next day instead of
 * printing a twenty-fifth hour.
 */
export function formatCompactDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const totalHours = Math.round(minutes / 60);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  return `${totalHours}h`;
}

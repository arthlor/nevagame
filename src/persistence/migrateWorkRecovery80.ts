import type { GameState } from "../simulation/core/types";

/** Frozen schema-80 recovery interval and conservative legacy basic-cast rebate ceiling. */
const RECOVERY_INTERVAL_SECONDS_V80 = 300;
const LEGACY_BASIC_WORK_CHARGED_V80 = 10;

export function migrateWorkRecovery80(state: GameState): GameState {
  if (state.schemaVersion >= 80) return state;
  const work = state.player.workCapacity;
  // Legitimate partial online time carries forward without refilling Work or
  // resetting earned boosts. Old validators admitted whole intervals here;
  // only the fractional interval is a recovery remainder.
  const online = work.passiveRegenSeconds ?? 0;
  work.passiveRegenSeconds = Number.isFinite(online) && online >= 0
    ? online % RECOVERY_INTERVAL_SECONDS_V80 : 0;
  work.offlineRegenSeconds = 0;
  if (work.current >= work.maximum) {
    work.passiveRegenSeconds = 0;
  }
  const basic = state.basicFishing;
  if (basic && basic.phase !== "charging-cast" && basic.workCharged === undefined) {
    // Every legacy paid cast charged at least 11 after rank/equipment bounds.
    // Its exact old discount is unavailable, so a 10-point rebate is safe.
    basic.workCharged = LEGACY_BASIC_WORK_CHARGED_V80;
  }
  state.schemaVersion = 80;
  return state;
}

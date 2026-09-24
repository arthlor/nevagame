import {
  formatClockTime,
  minutesUntilNextMorning
} from "../core/GameClock";
import type { GameState } from "../core/types";
import { restoreWorkOnRest } from "../domains/ProgressionDomain";

export interface RestQuoteDto {
  wakeClockLabel: string;
  workGain: number;
  warning: string | null;
}

/** Preview the same wake boundary and Work grant used by the rest command. */
export function buildRestQuote(state: GameState): RestQuoteDto {
  const wakeMinute = state.clock.currentMinute + minutesUntilNextMorning(state.clock.currentMinute);
  const workCapacity = {
    ...state.player.workCapacity,
    laborUsedToday: [...(state.player.workCapacity.laborUsedToday ?? [])]
  };
  const workGain = restoreWorkOnRest(workCapacity, wakeMinute);
  const expiringOrder = state.contracts.some((contract) =>
    contract.status === "active" && contract.expiresAtMinute <= wakeMinute);
  const freshCatch = Object.values(state.fishCargo).some((cargo) => cargo.freshness > 0);

  return {
    wakeClockLabel: formatClockTime(wakeMinute),
    workGain,
    warning: expiringOrder
      ? "Delivery expires overnight"
      : freshCatch
        ? "Catch loses freshness overnight"
        : null
  };
}

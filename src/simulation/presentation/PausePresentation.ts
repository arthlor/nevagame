import type { PauseSummaryDto } from "../core/contracts";
import type { GameState } from "../core/types";
import { dayOfSeason } from "../core/GameClock";
import { WORLD_REGION_LABELS } from "../../world/WorldGameplayLocations";

export function buildPauseSummaryDto(state: GameState): PauseSummaryDto {
  const hour = Math.floor((state.clock.currentMinute % 1440) / 60);
  const minute = state.clock.currentMinute % 60;
  const season = state.clock.season.charAt(0).toUpperCase() + state.clock.season.slice(1);
  const day = dayOfSeason(state.clock.dayCount);
  return {
    regionLabel: (WORLD_REGION_LABELS as Readonly<Record<string, string>>)[state.player.currentRegionId] ?? "Open Waters",
    dateTimeLabel: `Day ${day} of ${season} · ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    work: {
      current: Math.floor(state.player.workCapacity.current),
      maximum: state.player.workCapacity.maximum
    },
    lastSavedUtcMs: state.metadata.lastSavedUtcMs
  };
}

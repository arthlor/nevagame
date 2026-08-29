// src/persistence/offlineDelta.ts

import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { GameClock } from "../simulation/core/GameClock";
import { advancePlacedCropGrowth } from "../simulation/farming/calculateCropGrowth";
import { forEachWeatherBoundedSegment } from "../simulation/farming/weatherBoundedSegments";
import { advanceCargoFreshness } from "../simulation/fishing/calculateFreshness";
import { tickMarket } from "../simulation/economy/updateMarket";
import { SeededRng } from "../simulation/core/Rng";
import { regenerateWorkCapacity, OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR } from "../simulation/domains/ProgressionDomain";
import { expireContracts, refillContracts } from "../simulation/domains/ContractDomain";
import { expireSpentSchools } from "../simulation/domains/FishingDomain";
import { drainMotorFuel } from "../simulation/domains/NavigationDomain";

export interface OfflineProgressionSummary {
  elapsedRealMinutes: number;
  simulatedGameMinutes: number;
  cropsMaturedCount: number;
  cropsWitheredCount: number;
  jobsCompletedCount: number;
  cargoSpoiledCount: number;
  contractsExpiredCount: number;
}

export const MAX_OFFLINE_HOURS = 72;
export const MAX_OFFLINE_MS = MAX_OFFLINE_HOURS * 3600 * 1000;

export function applyOfflineProgression(state: GameState, nowUtcMs: number): OfflineProgressionSummary {
  const elapsedMs = Math.max(0, nowUtcMs - state.metadata.lastSavedUtcMs);
  const elapsedRealMinutes = Math.floor(elapsedMs / (1000 * 60));
  const cappedMs = Math.min(elapsedMs, MAX_OFFLINE_MS);
  // In default settings, 2.5 real seconds = 1 game minute (0.4 minutes per real second).
  // GameMinute is an integer. Apply only whole minutes so offline state never
  // advances crops or cargo farther than the canonical clock.
  const gameMinutesToSimulate = Math.floor(Math.floor(cappedMs / 1000) * state.clock.minutesPerRealSecond);

  const summary: OfflineProgressionSummary = {
    elapsedRealMinutes,
    simulatedGameMinutes: gameMinutesToSimulate,
    cropsMaturedCount: 0,
    cropsWitheredCount: 0,
    jobsCompletedCount: 0,
    cargoSpoiledCount: 0,
    contractsExpiredCount: 0
  };

  if (gameMinutesToSimulate <= 0) {
    return summary;
  }

  const rng = new SeededRng(state.worldSeed + state.clock.currentMinute, state.metadata.rngState);
  const clock = new GameClock(state.clock);
  const startMinute = state.clock.currentMinute;

  // Advance in weather-bounded segments so long offline periods do not apply a
  // single stale weather snapshot to every crop and cargo item.
  forEachWeatherBoundedSegment(state.weather, startMinute, gameMinutesToSimulate, rng, (segmentMinutes, segmentStartMinute) => {
    for (const cropState of Object.values(state.crops)) {
      const cropDef = ContentRegistry.crops.get(cropState.cropId);
      const farm = state.farms[cropState.farmId];
      if (!cropDef || !farm) continue;

      const previousStage = cropState.stage;
      const newStage = advancePlacedCropGrowth(
        cropState,
        cropDef,
        farm.climateId,
        farm.soil.fertility,
        state.weather.type,
        segmentMinutes
      );
      if (previousStage !== "mature" && previousStage !== "overripe" && (newStage === "mature" || newStage === "overripe")) {
        summary.cropsMaturedCount += 1;
      } else if (previousStage !== "withered" && newStage === "withered") {
        summary.cropsWitheredCount += 1;
      }
    }

    summary.cargoSpoiledCount += advanceCargoFreshness(
      state,
      segmentMinutes,
      segmentStartMinute,
      state.weather.temperatureC
    );
  });

  clock.advanceMinutes(gameMinutesToSimulate);
  state.clock = { ...clock.getState() };
  for (const cropState of Object.values(state.crops)) cropState.lastUpdatedMinute = state.clock.currentMinute;
  regenerateWorkCapacity(state.player.workCapacity, gameMinutesToSimulate, state.clock.currentMinute, OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR);
  drainMotorFuel(state, gameMinutesToSimulate);
  expireSpentSchools(state);

  // Step 4: Processing jobs
  for (const job of Object.values(state.processingJobs)) {
    if (job.status === "active" && state.clock.currentMinute >= job.completesAtMinute) {
      job.status = "complete";
      summary.jobsCompletedCount += 1;
    }
  }

  // Step 5: Spoilage is advanced inside weather-bounded segments above.

  const expiredBefore = state.contracts.filter((contract) => contract.status === "expired").length;
  expireContracts(state);
  refillContracts(state, rng, (prefix) => {
    const a = rng.intInclusive(1, 0x7fffffff).toString(36);
    const b = rng.intInclusive(0, 0xffff).toString(36);
    return `${prefix}_${a}_${b}`;
  });
  summary.contractsExpiredCount = Math.max(
    0,
    state.contracts.filter((contract) => contract.status === "expired").length - expiredBefore
  );

  // Step 7: Market ticks
  for (const market of Object.values(state.markets)) {
    tickMarket(market, state.clock.currentMinute, state.clock.season, rng);
  }

  // Step 8: Weather that lands exactly at the final minute is resolved by the
  // shared weather-bounded helper.

  // Step 9: Update metadata
  state.metadata.lastSavedUtcMs = nowUtcMs;
  state.metadata.totalPlayMinutes += elapsedRealMinutes;
  state.metadata.rngState = rng.getState();

  return summary;
}

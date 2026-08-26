// src/persistence/offlineDelta.ts

import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { advancePlacedCropGrowth } from "../simulation/farming/calculateCropGrowth";
import { forEachWeatherBoundedSegment } from "../simulation/farming/weatherBoundedSegments";
import { calculateFreshnessLoss, resolveCargoHasIce } from "../simulation/fishing/calculateFreshness";
import { tickMarket } from "../simulation/economy/updateMarket";
import { SeededRng } from "../simulation/core/Rng";
import { GameClock } from "../simulation/core/GameClock";

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
  // In default settings, 1 real second = 1 game minute.
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
  forEachWeatherBoundedSegment(state.weather, startMinute, gameMinutesToSimulate, rng, (segmentMinutes) => {
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

    for (const cargo of Object.values(state.fishCargo)) {
      if (cargo.freshness <= 0) continue;
      const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
      if (!speciesDef) continue;
      const hasIce = resolveCargoHasIce(state, cargo);
      const freshnessBefore = cargo.freshness;
      cargo.freshness = Math.max(
        0,
        cargo.freshness - calculateFreshnessLoss(
          segmentMinutes,
          speciesDef.baseDecayRatePerMinute,
          cargo.location.type,
          hasIce,
          state.weather.temperatureC
        )
      );
      if (freshnessBefore > 0 && cargo.freshness <= 0) summary.cargoSpoiledCount += 1;
    }
  });

  clock.advanceMinutes(gameMinutesToSimulate);
  state.clock = { ...clock.getState() };
  for (const cropState of Object.values(state.crops)) cropState.lastUpdatedMinute = state.clock.currentMinute;

  // Step 4: Processing jobs
  for (const job of Object.values(state.processingJobs)) {
    if (job.status === "active" && state.clock.currentMinute >= job.completesAtMinute) {
      job.status = "complete";
      summary.jobsCompletedCount += 1;
    }
  }

  // Step 5: Spoilage is advanced inside weather-bounded segments above.

  // Step 6: Contracts expiry
  for (const contract of state.contracts) {
    if (contract.status === "active" && state.clock.currentMinute >= contract.expiresAtMinute) {
      contract.status = "expired";
      summary.contractsExpiredCount += 1;
    }
  }

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

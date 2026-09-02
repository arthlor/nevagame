// src/telemetry/attachTelemetry.ts

import type { EventBus } from "../simulation/core/EventBus";
import { SessionRecorder, type TelemetryEventName } from "./SessionRecorder";

/**
 * Subscribes a `SessionRecorder` to the domain events that answer the
 * `LLM/03` §32 questions. Returns a detach function.
 *
 * The recorder never reads a clock itself, so the caller supplies both: the
 * simulation's game minute and real elapsed milliseconds.
 */
export interface TelemetryClock {
  gameMinute(): number;
  realElapsedMs(): number;
  activeQuestId(): string | null;
}

/**
 * Events worth a buffer slot. Deliberately not every domain event — high
 * frequency ticks (`MarketTicked`, `CropStageChanged`) would evict the
 * meaningful history from the ring buffer within minutes.
 */
const RECORDED_EVENTS: TelemetryEventName[] = [
  "QuestStarted",
  "QuestProgressed",
  "QuestCompleted",
  "ActCompleted",
  "NpcTalked",
  "CropPlanted",
  "CropWatered",
  "CropHarvested",
  "RecipeStarted",
  "RecipeCompleted",
  "BasicFishingStarted",
  "BasicFishingResolved",
  "FishSchoolChummed",
  "FishHooked",
  "FishLanded",
  "FishEscaped",
  "BoatBoarded",
  "BoatDocked",
  "ItemSold",
  "FishSold",
  "ContractCompleted",
  "ProficiencyLeveledUp",
  "WeatherChanged",
  "SeasonChanged"
];

export function attachTelemetry(
  events: EventBus,
  recorder: SessionRecorder,
  clock: TelemetryClock
): () => void {
  const unsubscribes: Array<() => void> = [];

  for (const name of RECORDED_EVENTS) {
    unsubscribes.push(
      events.on(name, () => {
        recorder.record(name, clock.gameMinute(), clock.realElapsedMs(), clock.activeQuestId());
      })
    );
  }

  const milestone = (id: Parameters<SessionRecorder["markMilestone"]>[0]) =>
    recorder.markMilestone(id, clock.gameMinute(), clock.realElapsedMs());

  unsubscribes.push(events.on("CropPlanted", () => milestone("firstCropPlanted")));
  // The single most important number this whole module exists to answer: how
  // long, in real minutes, before a player sees the calendar turn at all.
  unsubscribes.push(events.on("SeasonChanged", () => milestone("firstSeasonTurn")));
  unsubscribes.push(events.on("CropHarvested", () => milestone("firstHarvest")));
  unsubscribes.push(events.on("BoatBoarded", () => milestone("firstBoatBoarded")));

  unsubscribes.push(
    events.on("BasicFishingResolved", (payload) => {
      // Only a landed catch counts; a miss is not a first catch.
      if (payload.catchItemId) milestone("firstBasicCatch");
    })
  );

  unsubscribes.push(
    events.on("FishHooked", () => {
      recorder.countHooked();
    })
  );

  unsubscribes.push(
    events.on("FishLanded", () => {
      recorder.countLanded();
      milestone("firstSportLanding");
    })
  );

  unsubscribes.push(
    events.on("FishEscaped", () => {
      recorder.countEscaped();
    })
  );

  unsubscribes.push(
    events.on("ItemSold", (payload) => {
      recorder.addRevenue(payload.revenue);
      milestone("firstSale");
    })
  );

  unsubscribes.push(
    events.on("FishSold", (payload) => {
      recorder.addRevenue(payload.revenue);
      milestone("firstSale");
    })
  );

  unsubscribes.push(
    events.on("ContractCompleted", (payload) => {
      recorder.addRevenue(payload.rewardMoney);
      milestone("firstContractCompleted");
    })
  );

  unsubscribes.push(
    events.on("QuestStarted", () => {
      recorder.countQuestStarted();
    })
  );

  unsubscribes.push(
    events.on("QuestCompleted", () => {
      recorder.countQuestCompleted();
    })
  );

  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}

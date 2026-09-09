// src/persistence/migrateOnboardingCredits35.ts

import type { GameState } from "../simulation/core/types";
import type { QuestEarlyActionCredit } from "../simulation/core/QuestTypes";

/**
 * Schema 35 — the early-action credit ledger, plus one-time repairs for saves
 * the old rules could strand.
 *
 * Every identifier and threshold below is a frozen literal rather than a live
 * import. A migration describes history: retuning `WET_MOISTURE_THRESHOLD` or
 * renaming an objective later must not silently rewrite what this migration
 * meant when it ran.
 */
const V35_WET_MOISTURE = 85;               // FarmingDomain.WET_MOISTURE_THRESHOLD at v35
const V35_MAIN_TRACK = "track.main";
const V35_FARM = "farm.starter_garden";
const V35_WATER_QUEST = "quest.act1_water_crops";
const V35_WATER_STEP = { id: "step.act1_water_3_crops", index: 0, targetQuantity: 3 };
const V35_ACT2_QUEST = "quest.act2_harvest_and_compost";
const V35_COMPOST_STEP = { id: "step.act2_compost_worms", index: 1 };
const V35_COMPOST_RECIPE = "recipe.compost_worms";
const V35_COMPOST_STATION = "struct.starter_compost";
const V35_BAIT_WORMS = "item.bait_worms";
const V35_ONBOARDING_COMPOST_MINUTES = 12;

export function migrateOnboardingCredits35(previous: GameState): GameState {
  const state: GameState = {
    ...previous,
    schemaVersion: 35,
    quests: {
      ...previous.quests,
      tracks: { ...previous.quests.tracks },
      earlyActionCredits: Array.isArray(previous.quests.earlyActionCredits)
        ? previous.quests.earlyActionCredits
        : []
    },
    processingJobs: { ...previous.processingJobs }
  };

  const main = state.quests.tracks[V35_MAIN_TRACK];
  const questComplete = state.quests.completedQuestIds.includes(V35_ACT2_QUEST);

  // (1) A save stuck on the watering step because it watered during the sow
  //     step. Recorded as a credit rather than written straight into progress,
  //     so redemption has exactly one code path — `reconcileQuestCursors` on
  //     the next load applies it, respecting the cap and any existing progress.
  //
  //     Counts any living, sufficiently wet crop in the starter garden, not
  //     only wheat: the objective declares no `targetId`, so the runtime
  //     credits any crop there, and a narrower rule here would leave a class
  //     of saves stuck in exactly the way this migration exists to fix.
  if (main?.activeQuestId === V35_WATER_QUEST && main.activeStepIndex === V35_WATER_STEP.index) {
    const wet = Object.values(state.crops).filter((crop) =>
      crop.farmId === V35_FARM && crop.stage !== "withered" && crop.moisture >= V35_WET_MOISTURE
    ).length;
    const already = main.stepProgress?.[V35_WATER_STEP.id] ?? 0;
    const owed = Math.min(V35_WATER_STEP.targetQuantity, wet) - already;
    if (owed > 0) {
      const credit: QuestEarlyActionCredit = {
        type: "water-crop",
        location: { kind: "farm", id: V35_FARM },
        quantity: owed
      };
      state.quests.earlyActionCredits = [...state.quests.earlyActionCredits, credit];
    }
  }

  // (2) A save sitting exactly on the compost step, from the era when every
  //     new game was handed ten bait worms. Written directly, never as a
  //     credit and never as a reconcile rule: worm ownership must not count as
  //     recipe evidence anywhere outside this version gate, or every new
  //     player would skip Act 2's only processing lesson.
  if (
    main?.activeQuestId === V35_ACT2_QUEST
    && main.activeStepIndex === V35_COMPOST_STEP.index
    && playerHoldsBaitWorms(state)
  ) {
    main.stepProgress = { ...main.stepProgress, [V35_COMPOST_STEP.id]: 1 };
  }

  // (3) Bring an in-flight tutorial compost run onto the new pace. Gated on
  //     the tutorial still being unfinished, so a veteran mid-run does not get
  //     handed five and a half free hours.
  if (!questComplete) {
    for (const [jobId, job] of Object.entries(state.processingJobs)) {
      if (job.status !== "active") continue;
      if (job.recipeId !== V35_COMPOST_RECIPE || job.stationId !== V35_COMPOST_STATION) continue;
      const capped = state.clock.currentMinute + V35_ONBOARDING_COMPOST_MINUTES;
      if (job.completesAtMinute <= capped) continue;
      state.processingJobs[jobId] = { ...job, completesAtMinute: capped };
    }
  }

  return state;
}

function playerHoldsBaitWorms(state: GameState): boolean {
  const inventory = state.inventories[state.player.inventoryId];
  return (inventory?.slots ?? []).some(
    (slot) => slot.itemId === V35_BAIT_WORMS && (slot.quantity ?? 0) > 0
  );
}

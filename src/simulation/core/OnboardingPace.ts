// src/simulation/core/OnboardingPace.ts

import { MAIN_QUEST_TRACK_ID, type QuestState } from "./QuestTypes";
import type { RecipeDefinition } from "../../content/types";

/**
 * The opening tutorial runs on a compressed clock. Real playtests stalled on
 * two waits that are correct for the steady-state game and far too long for a
 * first five minutes: wheat at 180 game minutes (~7.5 real minutes) and the
 * compost worm recipe at 360 (~15 real minutes).
 *
 * This module is the single owner of that compression. It is deliberately
 * simulation-side and pure so the interaction prompt, the processing domain,
 * the live tick and the offline catch-up all quote the same number — a UI that
 * reads `recipe.durationMinutes` directly would advertise a duration the
 * simulation does not honour.
 *
 * Nothing here duplicates content: the same `crop.wheat` and
 * `recipe.compost_worms` definitions are used, with an effective-duration
 * calculation layered over them.
 */
export const ONBOARDING_PACE = {
  /** The pace ends once this quest is in `completedQuestIds`. */
  gateQuestId: "quest.act2_harvest_and_compost",
  crop: {
    cropId: "crop.wheat",
    farmId: "farm.starter_garden",
    /** 180 base minutes / 5 ≈ 27-36 game minutes ≈ 68-90 real seconds. */
    growthRateMultiplier: 5
  },
  recipe: {
    recipeId: "recipe.compost_worms",
    stationId: "struct.starter_compost",
    /** 12 game minutes = 30 real seconds at the default clock rate. */
    durationMinutes: 12,
    /** The tutorial step whose progress is evidence the run already happened. */
    objectiveId: "step.act2_compost_worms"
  }
} as const;

/** Whether the player is still inside the opening tutorial. */
export function isOnboardingPaceActive(quests: QuestState): boolean {
  return !quests.completedQuestIds.includes(ONBOARDING_PACE.gateQuestId);
}

/**
 * The growth scalar for one crop. Returns 1 for everything except tutorial
 * wheat in the starter garden, so no other crop, farm or save is affected.
 */
export function onboardingGrowthMultiplier(
  cropId: string,
  farmId: string,
  quests: QuestState
): number {
  if (cropId !== ONBOARDING_PACE.crop.cropId) return 1;
  if (farmId !== ONBOARDING_PACE.crop.farmId) return 1;
  if (!isOnboardingPaceActive(quests)) return 1;
  return ONBOARDING_PACE.crop.growthRateMultiplier;
}

/**
 * Whether the accelerated compost run is still available.
 *
 * Gating on the quest alone would be an economy hole rather than a pacing
 * choice: a player who simply never turns Act 2 in could run a profitable
 * 360-minute recipe every 30 real seconds. Requiring that no compost run has
 * happened yet — neither recorded on the step nor banked as an early-action
 * credit — caps the acceleration at exactly the one run the tutorial asks for.
 */
function onboardingCompostAvailable(quests: QuestState): boolean {
  if (!isOnboardingPaceActive(quests)) return false;
  const track = quests.tracks[MAIN_QUEST_TRACK_ID];
  if ((track?.stepProgress[ONBOARDING_PACE.recipe.objectiveId] ?? 0) > 0) return false;
  return !(quests.earlyActionCredits ?? []).some((credit) =>
    credit.type === "craft-recipe"
    && credit.targetId === ONBOARDING_PACE.recipe.recipeId
    && credit.location?.kind === "station"
    && credit.location.id === ONBOARDING_PACE.recipe.stationId
    && credit.quantity > 0
  );
}

/**
 * How long a job at this station actually takes. The sole owner of that
 * question — `ProcessingDomain` and the interaction prompt both call it, so a
 * quoted duration and a scheduled one can never disagree.
 */
export function effectiveRecipeDurationMinutes(
  recipe: RecipeDefinition,
  stationId: string,
  quests: QuestState
): number {
  if (recipe.id !== ONBOARDING_PACE.recipe.recipeId) return recipe.durationMinutes;
  if (stationId !== ONBOARDING_PACE.recipe.stationId) return recipe.durationMinutes;
  if (!onboardingCompostAvailable(quests)) return recipe.durationMinutes;
  return ONBOARDING_PACE.recipe.durationMinutes;
}

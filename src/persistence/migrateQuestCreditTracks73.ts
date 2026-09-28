import type { GameState } from "../simulation/core/types";
import { MAIN_QUEST_TRACK_ID } from "../simulation/core/QuestTypes";

/**
 * Schema 73 binds each saved early-action credit to one quest track. Credits
 * written before this version could only belong to the main track, so missing
 * ownership is migrated there without changing their quantity or action shape.
 */
export function migrateQuestCreditTracks73(state: GameState): GameState {
  const credits = state.quests?.earlyActionCredits;
  if (Array.isArray(credits)) {
    state.quests.earlyActionCredits = credits.map((credit) => ({
      ...credit,
      trackId: typeof credit.trackId === "string" && credit.trackId.length > 0
        ? credit.trackId
        : MAIN_QUEST_TRACK_ID
    }));
  }
  state.schemaVersion = 73;
  return state;
}

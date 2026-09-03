// src/content/questTracks.ts

import { MAIN_QUEST_TRACK_ID, type QuestTrackDefinition } from "../simulation/core/QuestTypes";

/**
 * Quest tracks are parallel linear chains, not branches.
 *
 * Each track is its own `nextQuestId` chain with its own cursor, so a player
 * can carry more than one thread at a time and a seasonal or weather-gated
 * objective can sit on a side track without ever blocking the spine. No quest
 * has two possible outcomes and no dialogue offers a choice, which keeps the
 * no-branching contract in `LLM/02` section 22 intact.
 *
 * `track.main` has no unlock predicate: it is running from a new game.
 */
export const QUEST_TRACKS: QuestTrackDefinition[] = [
  {
    id: MAIN_QUEST_TRACK_ID,
    title: "The Neva Spine",
    entryQuestId: "quest.act1_welcome"
  }
];

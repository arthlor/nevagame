// src/content/questTracks.ts

import { MAIN_QUEST_TRACK_ID, type QuestTrackDefinition } from "../simulation/core/QuestTypes";

/** Silas's standing lesson in where each species actually lives. */
export const TIDES_QUEST_TRACK_ID = "track.tides";

/** The inheritance the homestead itself remembers. */
export const HOMESTEAD_QUEST_TRACK_ID = "track.homestead";

/** Maeve on what an order actually costs to keep. */
export const TRADELANES_QUEST_TRACK_ID = "track.tradelanes";

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
  },
  {
    // Opens once the player has landed and sold their first sport fish, which
    // is also the point the spine stops teaching new verbs. Every seasonal and
    // conditional objective in the game lives here rather than on the spine,
    // so waiting for winter never blocks the story.
    id: TIDES_QUEST_TRACK_ID,
    title: "Reading the Water",
    entryQuestId: "quest.tides_home_water",
    unlock: { requiresCompletedQuestIds: ["quest.act5_maiden_voyage"] }
  },
  {
    // Opens once the player has harvested and composted, so they know the
    // verbs the private homestead asks for. It runs long on purpose: the
    // orchard at its end is a genuine late goal, which is exactly the kind of
    // pacing a side track can carry and the spine cannot.
    id: HOMESTEAD_QUEST_TRACK_ID,
    title: "The Family Ledger",
    entryQuestId: "quest.homestead_seed_pouch",
    unlock: { requiresCompletedQuestIds: ["quest.act2_harvest_and_compost"] }
  },
  {
    // Opens once the player has kept one contract, which is the point they
    // have the vocabulary for the rest. Its objectives target contract *types*
    // rather than specific templates: the board rolls a few slots out of two
    // dozen, so naming one template would leave the player waiting on a dice
    // roll instead of pursuing a goal.
    id: TRADELANES_QUEST_TRACK_ID,
    title: "Freight and Favour",
    entryQuestId: "quest.tradelanes_volume",
    unlock: { requiresCompletedQuestIds: ["quest.act6_harbor_promise"] }
  }
];

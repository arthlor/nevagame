import type { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";

/**
 * v43 -> v44. A pre-v9 build granted `quest.rewards.unlocksFeature` by pushing
 * the capability id into both `quests.unlockedFeatureIds` and
 * `journal.unlockedKnowledge`, so saves of that era carry capability ids
 * (`boat.player_rowboat`, `feature.expedition_planner`) inside the knowledge
 * journal. `unlockedFeatureIds` already owns the unlock and old code wrote
 * both, so keeping only registered knowledge entries loses no capability. It
 * lets the shipping validator treat an unknown knowledge id as real corruption
 * instead of having to tolerate legacy noise.
 */
export function migrateKnowledgeJournal44(previous: GameState): GameState {
  ContentRegistry.initializeAndValidate();
  const state = structuredClone(previous);
  state.schemaVersion = 44;
  state.journal.unlockedKnowledge = state.journal.unlockedKnowledge.filter((id) =>
    ContentRegistry.knowledge.has(id)
  );
  return state;
}

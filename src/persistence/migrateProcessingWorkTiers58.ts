import type { GameState } from "../simulation/core/types";

/**
 * v57 -> v58. New jobs may use light or prepared processing tiers. Existing
 * jobs retain their captured standard/masterwork Work and XP without repricing.
 */
export function migrateProcessingWorkTiers58(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 58;
  return state;
}

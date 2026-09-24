import type { GameState } from "../simulation/core/types";

/**
 * v55 -> v56. Trade packs gain a `ground` rest pose (`CargoLocation.type`
 * `"ground"` with the literal container `"ground"` and finite X/Z inside the
 * world bounds). No v55 save contains one, so the migration preserves every
 * field and only advances the version stamp; the validator gates `ground`
 * on `schemaVersion >= 56`.
 */
export function migrateGroundCargo56(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 56;
  return state;
}

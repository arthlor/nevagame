import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const MAINLAND_LAYOUT_REVISION = 22;

/** v49 -> v50 adds the cove mainland without scaling saved world positions. */
export function migrateMainland50(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 50, MAINLAND_LAYOUT_REVISION);
}

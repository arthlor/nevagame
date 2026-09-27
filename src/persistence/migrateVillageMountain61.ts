import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Layout revision for the sculpted village headwater cirque and its approaches. */
export const VILLAGE_MOUNTAIN_LAYOUT_REVISION = 31;

/** Re-ground saved actors after the headwater slopes change, preserving supported X/Z. */
export function migrateVillageMountain61(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 61, VILLAGE_MOUNTAIN_LAYOUT_REVISION);
}

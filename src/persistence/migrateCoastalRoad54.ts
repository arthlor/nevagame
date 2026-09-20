import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Lowered coastal road and contour bends share the canonical actor recovery. */
export function migrateCoastalRoad54(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 54, 26);
}

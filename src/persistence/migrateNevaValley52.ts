import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Recover supported poses after the starter watershed and contour trails change. */
export function migrateNevaValley52(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 52, 24);
}

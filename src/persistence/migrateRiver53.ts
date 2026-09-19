import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Re-ground actors and recover equipment on the re-authored Neva river banks. */
export function migrateRiver53(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 53, 25);
}

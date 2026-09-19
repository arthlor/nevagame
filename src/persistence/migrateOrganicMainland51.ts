import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const ORGANIC_MAINLAND_LAYOUT_REVISION = 23;

/** v50 -> v51 recovers actors after contour roads, landforms and biome dressing move. */
export function migrateOrganicMainland51(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 51, ORGANIC_MAINLAND_LAYOUT_REVISION);
}

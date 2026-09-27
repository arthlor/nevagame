import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Shared-node road junctions now have one worked surface and collider. */
export const ROAD_JUNCTION_LAYOUT_REVISION = 32;

/** Preserve supported horizontal poses while re-grounding changed junction support. */
export function migrateRoadJunctions62(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 62, ROAD_JUNCTION_LAYOUT_REVISION);
}

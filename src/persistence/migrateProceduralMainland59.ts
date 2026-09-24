import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Layout revision produced by the procedural mainland landform, coast and road pass. */
export const PROCEDURAL_MAINLAND_LAYOUT_REVISION = 29;

/**
 * v58 -> v59. Mainland ranges, shoreline, lake shore and routed roads are
 * regenerated; supported actors keep their X/Z and are re-grounded, and only
 * a pose left on newly steep, wet or blocked ground moves, to the nearest safe
 * Neva support. Crops, cargo, economy and quest truth are untouched.
 */
export function migrateProceduralMainland59(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 59, PROCEDURAL_MAINLAND_LAYOUT_REVISION);
}

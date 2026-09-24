import type { GameState } from "../simulation/core/types";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/** Layout revision produced by the village-life dressing: dovecote and paddock colliders. */
export const VILLAGE_LIFE_LAYOUT_REVISION = 30;

/**
 * v59 -> v60. The village square gains a dovecote and the meadow south of the
 * south cottage a fenced sheep paddock, both with catalog colliders. A pose
 * those footprints now cover moves to the nearest clear Neva support through
 * the shared recovery; every other actor keeps its X/Z. Terrain, routes, crops,
 * cargo, economy and quest truth are untouched.
 */
export function migrateVillageLife60(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 60, VILLAGE_LIFE_LAYOUT_REVISION);
}

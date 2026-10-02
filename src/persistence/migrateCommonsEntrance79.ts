import type { GameState } from "../simulation/core/types";
import { PLAYER_HOMESTEAD_LAYOUT } from "../world/FarmLayout";
import { collisionPolishProxies } from "./migrateCollisionPolish76";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const COMMONS_ENTRANCE_LAYOUT_REVISION = 43;

/** Only the gate approach changes; crop coordinates remain fixed. */
export function migrateCommonsEntrance79(previous: GameState): GameState {
  const origin = PLAYER_HOMESTEAD_LAYOUT.origin;
  return recoverMainlandLayout(previous, 79, COMMONS_ENTRANCE_LAYOUT_REVISION, {
    contains: (point) => Math.abs(point.x - origin.x) <= 8 && Math.abs(point.z - origin.z) <= 8,
    preserveLandIsland: true,
    collisionProxies: collisionPolishProxies,
    boatIsClear: () => true
  });
}

import { ELSPETH_HOME_ANCHOR, ELSPETH_TRAPPED_ANCHOR } from "../content/npcs";
import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";

/** A player this close to the old fence post was already stuck against it. */
const TRAPPED_RECOVERY_RADIUS_METERS = 1.6;

/**
 * Elspeth's station is content, not saved pose, so she leaves the fence on load.
 * A player still standing in that pocket is moved onto the open yard in front
 * of her new station. Everyone else keeps their place.
 */
export function migrateElspethYard71(state: GameState): GameState {
  const player = state.player;
  if (player) {
    const distance = Math.hypot(player.x - ELSPETH_TRAPPED_ANCHOR.x, player.z - ELSPETH_TRAPPED_ANCHOR.z);
    if (distance <= TRAPPED_RECOVERY_RADIUS_METERS) {
      player.x = ELSPETH_HOME_ANCHOR.x;
      player.z = ELSPETH_HOME_ANCHOR.z - 1.4;
      player.y = WorldLayout.traversalSurfaceHeight(player.x, player.z) + 0.5;
    }
  }
  state.schemaVersion = 71;
  return state;
}

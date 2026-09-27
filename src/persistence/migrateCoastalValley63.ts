import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { WORLD_SPAWN } from "../world/WorldAnchors";
import { nearestPoint, validLand } from "./terrainMigrationSupport";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const COASTAL_VALLEY_LAYOUT_REVISION = 33;

/** Re-ground the valley's saved actors against the same support used in play. */
export function migrateCoastalValley63(previous: GameState): GameState {
  const state = recoverMainlandLayout(previous, 63, COASTAL_VALLEY_LAYOUT_REVISION);
  if (previous.world.layoutRevision >= COASTAL_VALLEY_LAYOUT_REVISION) return state;
  // Ground packs have no persisted Y, but widened water must not strand their X/Z.
  for (const cargo of Object.values(state.fishCargo)) {
    const location = cargo.location;
    if (!location || location.type !== "ground" || location.x === undefined || location.z === undefined) continue;
    if (WorldLayout.terrainPatchAt(location.x, location.z)?.id !== "terrain.neva") continue;
    const point = nearestPoint({ x: location.x, z: location.z },
      (candidate) => validLand(candidate, false), WORLD_SPAWN.playerPosition);
    location.x = point.x;
    location.z = point.z;
  }
  return state;
}

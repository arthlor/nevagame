import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/**
 * Road forks become one apron: the route ribbon stops at the apron edge and
 * each branch is a single strip. The walkable mesh changes on Neva and Sunreach.
 */
export const ROAD_APRON_LAYOUT_REVISION = 39;

const ROAD_ISLANDS: ReadonlySet<string> = new Set(["island.neva", "island.sunreach"]);

/** Keep supported horizontal poses; re-ground actors on the joined apron. */
export function migrateRoadApron74(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 74, ROAD_APRON_LAYOUT_REVISION, {
    contains: (point) => ROAD_ISLANDS.has(WorldLayout.terrainPatchAt(point.x, point.z)?.islandId ?? ""),
    boatIsClear: () => true
  });
}

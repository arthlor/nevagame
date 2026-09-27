import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/**
 * Roads at cart scale on a generated mainland network: every road narrows to
 * its class width with a wider graded bench, the starter district's shared
 * stretches become forks, and the mainland roads, junctions and brook
 * culverts are re-planned from the places they serve.
 */
export const ROAD_NETWORK_LAYOUT_REVISION = 38;

/** Road widths changed on Sunreach as well as across Neva. */
const ROAD_ISLANDS: ReadonlySet<string> = new Set(["island.neva", "island.sunreach"]);

/** Keep supported horizontal poses; re-ground actors where the road surface moved. */
export function migrateRoadNetwork70(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 70, ROAD_NETWORK_LAYOUT_REVISION, {
    contains: (point) => ROAD_ISLANDS.has(WorldLayout.terrainPatchAt(point.x, point.z)?.islandId ?? ""),
    // Boats keep their berths: no water or mooring changed.
    boatIsClear: () => true
  });
}

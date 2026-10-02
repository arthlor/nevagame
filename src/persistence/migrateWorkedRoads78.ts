import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { recoverMainlandLayout } from "./recoverMainlandLayout";
import { collisionPolishProxies } from "./migrateCollisionPolish76";

/** One worked-earth footprint replaces the old strips and fork aprons on both islands. */
export const WORKED_ROADS_LAYOUT_REVISION = 42;

const ROAD_ISLANDS: ReadonlySet<string> = new Set(["island.neva", "island.sunreach"]);

/** Retain supported horizontal poses and re-ground against the shared road/collision surface. */
export function migrateWorkedRoads78(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 78, WORKED_ROADS_LAYOUT_REVISION, {
    contains: (point) => ROAD_ISLANDS.has(WorldLayout.terrainPatchAt(point.x, point.z)?.islandId ?? ""),
    preserveLandIsland: true,
    collisionProxies: collisionPolishProxies,
    // Route connections, water and berths remain fixed in this road-surface revision.
    boatIsClear: () => true
  });
}

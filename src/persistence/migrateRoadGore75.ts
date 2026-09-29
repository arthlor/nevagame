import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

/**
 * The wedge between roads that meet is paved, so a fork is one surface
 * instead of separate tongues with grass between them.
 */
export const ROAD_GORE_LAYOUT_REVISION = 40;

const ROAD_ISLANDS: ReadonlySet<string> = new Set(["island.neva", "island.sunreach"]);

/** Keep supported horizontal poses; re-ground actors on the paved wedges. */
export function migrateRoadGore75(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 75, ROAD_GORE_LAYOUT_REVISION, {
    contains: (point) => ROAD_ISLANDS.has(WorldLayout.terrainPatchAt(point.x, point.z)?.islandId ?? ""),
    boatIsClear: () => true
  });
}

import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { starterStructureAnchor } from "../world/FarmLayout";

const KITCHEN_ID = "struct.kitchen";

/**
 * v47 -> v48. The farm kitchen's authored pose moved inside the southeast yard
 * pocket after v45 shipped it by the home lane, so a v45-v47 save still stores
 * the old structure X/Z while the renderer and the processing-station approach
 * already read the current `FarmLayout` anchor. Re-anchoring that one structure
 * keeps rendering, interaction and the shipping validator reading the same
 * pose. Player, crop, cargo, inventory, quest, clock and RNG truth is
 * untouched, and no other structure moves.
 */
export function migrateKitchenAnchor48(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 48;
  const anchor = starterStructureAnchor(KITCHEN_ID);
  const kitchen = state.world.structures[KITCHEN_ID];
  if (!anchor || !kitchen) return state;
  kitchen.x = anchor.x;
  kitchen.y = WorldLayout.terrainHeight(anchor.x, anchor.z);
  kitchen.z = anchor.z;
  return state;
}

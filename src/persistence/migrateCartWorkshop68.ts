import type { GameState } from "../simulation/core/types";
import { villageTradePlacements } from "../world/WorldEnvironmentLayout";
import { CART_WORKSHOP } from "../world/VillageTradeLayout";
import { recoverTradeObstacles } from "./migrateVillageTrade65";

export const CART_WORKSHOP_LAYOUT_REVISION = 36;

/** The replacement's interior adds solids; preserve all poses already clear. */
export function migrateCartWorkshop68(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 68;
  if (state.world.layoutRevision >= CART_WORKSHOP_LAYOUT_REVISION) return state;
  recoverTradeObstacles(state, villageTradePlacements().filter(placement => placement.id === CART_WORKSHOP.id), false);
  state.world.layoutRevision = CART_WORKSHOP_LAYOUT_REVISION;
  return state;
}

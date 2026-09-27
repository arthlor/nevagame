import type { GameState } from '../simulation/core/types';
import { isVillageTradeOrigin } from '../content/villageTrade';
import { createTradeDemand } from '../simulation/economy/TradePackEconomy';

/** Existing jobs and packs retain their paid legacy terms; only future output uses named packs. */
export function migrateTradeEconomy66(input: GameState): GameState {
  const state = structuredClone(input);
  for (const market of Object.values(state.markets ?? {})) {
    if (isVillageTradeOrigin(market.id) && market.tradeDemand === undefined) {
      market.tradeDemand = createTradeDemand(state.clock.currentMinute);
    }
  }
  state.schemaVersion = Math.max(state.schemaVersion, 66);
  return state;
}

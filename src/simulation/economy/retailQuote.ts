import { ContentRegistry } from '../../content/ContentRegistry';
import type { GameState, MarketCommodityState } from '../core/types';
import { demandFromSupply, quoteCommodityPurchase, WORKSHOP_SUPPLY_MARKUP } from './marketPricing';

/** One retail quote owner for market purchases and production replacement-cost estimates. */
export function quoteMarketRetail(state: GameState, marketId: string, commodity: MarketCommodityState, quantity: number) {
  let minimumEffectiveModifier = 0;
  for (const market of Object.values(state.markets)) {
    const candidate = market.commodities[commodity.itemId];
    if (!candidate) continue;
    minimumEffectiveModifier = Math.max(minimumEffectiveModifier,
      demandFromSupply(candidate, candidate.localSupply, state.clock.currentMinute / 60, state.worldSeed) * candidate.seasonalModifier);
  }
  const workshopSupply = ContentRegistry.markets.get(marketId)?.retail.workshopSupplyItemIds?.includes(commodity.itemId);
  return quoteCommodityPurchase(commodity, quantity, {
    absoluteHour: state.clock.currentMinute / 60, worldSeed: state.worldSeed, minimumEffectiveModifier,
    ...(workshopSupply ? { retailMarkup: WORKSHOP_SUPPLY_MARKUP } : {})
  });
}

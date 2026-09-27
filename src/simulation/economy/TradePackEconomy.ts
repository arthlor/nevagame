import { TRADE_APPETITE, TRADE_DEMAND_TUNING, TRADE_PACK_FAMILIES, type TradePackDefinition } from '../../content/tradePacks';
import { ITEMS } from '../../content/items';
import { cropQualityPriceMultiplier, demandFromSupply } from './marketPricing';
import { villageTradeModifiers } from './VillageTrade';
import { getFreshnessPriceMultiplier } from '../fishing/calculateFreshness';
import type { ItemStack, MarketState, TradePackSnapshot } from '../core/types';
import type { FarmPackPriceBreakdown } from '../cargo/farmPacks';

export function createTradeDemand(minute: number): NonNullable<MarketState['tradeDemand']> {
  return Object.fromEntries(TRADE_PACK_FAMILIES.map(family => [family, {
    supply: TRADE_DEMAND_TUNING.targetPacks, lastTickMinute: minute
  }])) as NonNullable<MarketState['tradeDemand']>;
}

export function snapshotTradePack(definition: TradePackDefinition, lots: readonly ItemStack[]): TradePackSnapshot {
  const commonValue = lots.reduce((sum, lot) => sum + ITEMS[lot.itemId].baseValue * lot.quantity, 0);
  const gradedValue = lots.reduce((sum, lot) => sum + ITEMS[lot.itemId].baseValue * lot.quantity * cropQualityPriceMultiplier(lot.quality), 0);
  return { definitionId: definition.id, quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0), family: definition.family, tier: definition.tier,
    name: definition.name, baseValue: definition.baseValue,
    qualityMultiplier: commonValue > 0 ? gradedValue / commonValue : 1, decayPerMinute: definition.decayPerMinute };
}

/** Supply is shared by related recipes; changing the wrapping cannot evade a glut. */
export function quoteCraftedTradePack(pack: TradePackSnapshot, quantity: number, freshness: number,
  origin: string, market: MarketState, minute: number, worldSeed: number): FarmPackPriceBreakdown {
  const demand = market.tradeDemand![pack.family];
  const commodity = { itemId: `trade.${market.id}.${pack.family}`, targetSupply: TRADE_DEMAND_TUNING.targetPacks };
  const demandModifier = (demandFromSupply(commodity, demand.supply, minute / 60, worldSeed)
    + demandFromSupply(commodity, demand.supply + 1, minute / 60, worldSeed)) / 2;
  const route = villageTradeModifiers(origin, market.id, '');
  const regionalModifier = TRADE_APPETITE[market.id][pack.family];
  const freshnessModifier = getFreshnessPriceMultiplier(freshness);
  const finalPrice = Math.floor(pack.baseValue * pack.qualityMultiplier * demandModifier * regionalModifier
    * route.routeModifier * freshnessModifier);
  return { kind: 'farm', quantity, wholesaleValue: pack.baseValue, packingModifier: 1,
    ...route, specialtyModifier: regionalModifier, freshnessModifier, demandModifier,
    qualityModifier: pack.qualityMultiplier, finalPrice,
    tradingXp: Math.floor(finalPrice * .1 * route.xpModifier) };
}

export function recordTradePackDelivery(market: MarketState, pack: TradePackSnapshot): void {
  const demand = market.tradeDemand![pack.family];
  demand.supply = Math.min(TRADE_DEMAND_TUNING.maximumSupply, demand.supply + 1);
}

export function tickTradeDemand(market: MarketState, minute: number): boolean {
  if (!market.tradeDemand) return false;
  let ticked = false;
  for (const demand of Object.values(market.tradeDemand)) {
    const hours = Math.floor((minute - demand.lastTickMinute) / 60);
    if (hours <= 0) continue;
    demand.supply = Math.max(TRADE_DEMAND_TUNING.targetPacks, demand.supply - TRADE_DEMAND_TUNING.recoveryPerHour * hours);
    demand.lastTickMinute += hours * 60;
    ticked = true;
  }
  return ticked;
}

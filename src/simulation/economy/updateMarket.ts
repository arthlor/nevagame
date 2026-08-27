// src/simulation/economy/updateMarket.ts

import { GameMinute, MarketCommodityState, MarketState, SeasonId } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { Rng } from "../core/Rng";
import { seasonAtMinute } from "../core/GameClock";
import type { MarketCommodityDefinition } from "../../content/types";

export function tickMarket(
  market: MarketState,
  currentMinute: GameMinute,
  currentSeason: SeasonId,
  rng: Rng
): boolean {
  const def = ContentRegistry.markets.get(market.id);
  if (!def) return false;

  let ticked = false;

  for (const commodityDef of def.commodities) {
    let state = market.commodities[commodityDef.itemId];
    if (!state) {
      state = {
        itemId: commodityDef.itemId,
        basePrice: commodityDef.basePrice,
        demandIndex: 1.0,
        localSupply: commodityDef.targetSupply,
        targetSupply: commodityDef.targetSupply,
        consumptionRate: commodityDef.consumptionRatePerHour,
        seasonalModifier: commodityDef.seasonalFactors[currentSeason] || 1.0,
        lastTickMinute: currentMinute,
        recentSalesVolume: 0
      };
      market.commodities[commodityDef.itemId] = state;
    }

    const elapsedMinutes = currentMinute - state.lastTickMinute;
    if (elapsedMinutes < 60) continue;

    let remainingMinutes = elapsedMinutes;
    let cursor = state.lastTickMinute;
    let tickedHours = false;
    while (remainingMinutes >= 60) {
      cursor += 60;
      remainingMinutes -= 60;
      applyMarketHour(state, commodityDef, seasonAtMinute(cursor), rng, 1);
      tickedHours = true;
    }
    if (remainingMinutes > 0) {
      applyMarketHour(state, commodityDef, seasonAtMinute(currentMinute), rng, remainingMinutes / 60);
      tickedHours = true;
    }
    if (!tickedHours) continue;

    state.lastTickMinute = currentMinute;
    state.seasonalModifier = commodityDef.seasonalFactors[seasonAtMinute(currentMinute)] || 1.0;
    ticked = true;
  }

  return ticked;
}

function applyMarketHour(
  state: MarketCommodityState,
  commodityDef: MarketCommodityDefinition,
  season: SeasonId,
  rng: Rng,
  hours: number
): void {
  state.seasonalModifier = commodityDef.seasonalFactors[season] || 1.0;
  const consumed = state.consumptionRate * hours;
  state.localSupply = Math.max(1, state.localSupply - consumed);
  if (state.localSupply < state.targetSupply) {
    const recovery = (state.targetSupply - state.localSupply) * 0.15 * hours;
    state.localSupply += recovery;
  }
  const supplyRatio = state.targetSupply / Math.max(1, state.localSupply);
  const noise = (rng.nextFloat() - 0.5) * 0.05;
  const rawDemand = supplyRatio + noise;
  state.demandIndex = Math.min(1.6, Math.max(0.65, rawDemand));
  state.recentSalesVolume = Math.max(0, state.recentSalesVolume * 0.5);
}

export function recordMarketSale(
  market: MarketState,
  itemId: string,
  quantity: number
): void {
  const state = market.commodities[itemId];
  if (state) {
    state.localSupply += quantity;
    state.recentSalesVolume += quantity;
    // Immediate slight dampening of demand on heavy sale
    const drop = Math.min(0.2, (quantity / Math.max(1, state.targetSupply)) * 0.15);
    state.demandIndex = Math.min(1.6, Math.max(0.65, state.demandIndex - drop));
  }
}

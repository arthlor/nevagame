// src/simulation/economy/updateMarket.ts

import { GameMinute, MarketCommodityState, MarketState, SeasonId } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { seasonAtMinute } from "../core/GameClock";
import type { MarketCommodityDefinition } from "../../content/types";
import { demandFromSupply, relaxSupply } from "./marketPricing";

export function tickMarket(
  market: MarketState,
  currentMinute: GameMinute,
  currentSeason: SeasonId,
  worldSeed: number
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
      applyMarketHour(state, commodityDef, seasonAtMinute(cursor), cursor / 60, worldSeed, 1);
      tickedHours = true;
    }
    if (remainingMinutes > 0) {
      applyMarketHour(
        state,
        commodityDef,
        seasonAtMinute(currentMinute),
        currentMinute / 60,
        worldSeed,
        remainingMinutes / 60
      );
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
  absoluteHour: number,
  worldSeed: number,
  hours: number
): void {
  state.seasonalModifier = commodityDef.seasonalFactors[season] ?? 1.0;
  state.localSupply = relaxSupply(
    state.localSupply,
    state.targetSupply,
    state.consumptionRate,
    hours
  );
  state.demandIndex = demandFromSupply(state, state.localSupply, absoluteHour, worldSeed);
  // Display-only recent activity. Supply is the sole pricing input from trades.
  state.recentSalesVolume = Math.max(0, state.recentSalesVolume * Math.pow(0.5, hours));
}

/**
 * How far above target a stall's stock may be pushed by selling into it.
 * `demandFromSupply` already bottoms out at DEMAND_MIN around 1.58x target, so
 * everything past this ceiling is invisible to price and only lengthens the
 * linear `relaxSupply` walk home — a few hundred units of a cheap staple could
 * otherwise pin that commodity at the floor for hundreds of game hours.
 */
export const SUPPLY_GLUT_CEILING = 2;

export function marketSupplyCeiling(targetSupply: number): number {
  return Math.max(1, targetSupply) * SUPPLY_GLUT_CEILING;
}

export function recordMarketSale(
  market: MarketState,
  itemId: string,
  quantity: number
): void {
  const state = market.commodities[itemId];
  if (state) {
    state.localSupply = Math.min(
      marketSupplyCeiling(state.targetSupply),
      state.localSupply + quantity
    );
    state.recentSalesVolume += quantity;
  }
}

export function recordMarketPurchase(
  market: MarketState,
  itemId: string,
  quantity: number
): void {
  const state = market.commodities[itemId];
  if (!state) return;
  state.localSupply = Math.max(0, state.localSupply - quantity);
}

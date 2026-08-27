// src/simulation/economy/updateMarket.ts

import { GameMinute, MarketState, SeasonId } from "../core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { Rng } from "../core/Rng";

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

    // Apply each elapsed market hour independently. A single multi-day
    // recovery step makes supply overshoot its target and pushes demand to
    // the floor when offline catch-up is saved.
    while (currentMinute - state.lastTickMinute >= 60) {
      state.lastTickMinute += 60;
      state.seasonalModifier = commodityDef.seasonalFactors[currentSeason] || 1.0;
      ticked = true;

      // 1. Consume local supply
      state.localSupply = Math.max(1, state.localSupply - state.consumptionRate);

      // 2. Replenish supply slowly towards target if understocked
      if (state.localSupply < state.targetSupply) {
        const recovery = (state.targetSupply - state.localSupply) * 0.15;
        state.localSupply += recovery;
      }

      // 3. Demand is supply ratio + noise only. Seasonal is applied at sale time.
      const supplyRatio = state.targetSupply / Math.max(1, state.localSupply);
      const noise = (rng.nextFloat() - 0.5) * 0.05; // ±2.5% variation
      const rawDemand = supplyRatio + noise;

      // Clamped strictly between 0.65 and 1.60
      state.demandIndex = Math.min(1.6, Math.max(0.65, rawDemand));
      state.recentSalesVolume = Math.max(0, state.recentSalesVolume * 0.5); // decay sales memory
    }
  }

  return ticked;
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

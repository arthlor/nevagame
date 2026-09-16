import { ContentRegistry } from "../../content/ContentRegistry";
import { FISH_TRADE_CENTER_MARKET_ID } from "../../content/markets";
import { demandLabelFromPercent, sampleDemandTrend } from "../economy/marketPricing";
import type { GameState, MarketId } from "../core/types";
import { isPhysicalTradePackSpecies } from "../domains/domainRules";

export type MarketDemandLabel = "Wanted" | "Steady" | "Plentiful";

export interface MarketLifeHighlightDto {
  itemId: string;
  itemName: string;
  demandPercent: number;
  direction: "rising" | "steady" | "falling";
  label: MarketDemandLabel;
  localSupply: number;
  targetSupply: number;
}

export interface MarketLifeBoardDto {
  marketId: MarketId;
  marketName: string;
  highlights: MarketLifeHighlightDto[];
}

/** How many goods a stall board calls out. */
export const MARKET_LIFE_BOARD_SIZE = 3;

/**
 * What each stall is calling for right now, ranked by demand. A pure read of
 * `MarketState` through the same pricing model the stall itself uses, so the
 * board cannot advertise a demand the market does not pay. It adds no state.
 */
export function buildMarketLifeBoards(state: Readonly<GameState>): MarketLifeBoardDto[] {
  const hourNow = state.clock.currentMinute / 60;
  return Object.values(state.markets).map((market) => {
    const highlights = Object.values(market.commodities)
      .filter((commodity) => {
        const fish = ContentRegistry.fishSpecies.get(commodity.itemId);
        return market.id === FISH_TRADE_CENTER_MARKET_ID || !fish || !isPhysicalTradePackSpecies(fish);
      })
      .map((commodity) => {
        const trend = sampleDemandTrend(commodity, commodity.localSupply, hourNow, state.worldSeed);
        const item =
          ContentRegistry.items.get(commodity.itemId) ?? ContentRegistry.fishSpecies.get(commodity.itemId);
        return {
          itemId: commodity.itemId,
          itemName: item?.name ?? commodity.itemId,
          demandPercent: trend.currentDemandPercent,
          direction: trend.direction,
          label: demandLabelFromPercent(trend.currentDemandPercent),
          localSupply: commodity.localSupply,
          targetSupply: commodity.targetSupply
        };
      })
      .sort((a, b) => b.demandPercent - a.demandPercent || a.itemId.localeCompare(b.itemId))
      .slice(0, MARKET_LIFE_BOARD_SIZE);
    return { marketId: market.id, marketName: market.name, highlights };
  });
}

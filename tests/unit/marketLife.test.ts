import { describe, expect, it } from "vitest";

import {
  buildMarketLifeBoards,
  MARKET_LIFE_BOARD_SIZE
} from "../../src/simulation/presentation/MarketLifePresentation";
import { nearestMarketBoardInReach } from "../../src/ui/hud/MarketBoardOverlay";
import type { GameState, MarketCommodityState } from "../../src/simulation/core/types";

function commodity(itemId: string, supply: number, targetSupply = 100): MarketCommodityState {
  return {
    itemId,
    basePrice: 10,
    demandIndex: 1,
    localSupply: supply,
    targetSupply,
    consumptionRate: 1,
    seasonalModifier: 1,
    lastTickMinute: 0,
    recentSalesVolume: 0
  };
}

function stateWithMarkets(): GameState {
  return {
    clock: { currentMinute: 12 * 60 },
    worldSeed: 4242,
    markets: {
      "market.village": {
        id: "market.village",
        name: "Village Market",
        regionId: "region.village",
        commodities: {
          alpha: commodity("alpha", 0),
          gamma: commodity("gamma", 100),
          beta: commodity("beta", 200)
        }
      },
      "market.harbor": {
        id: "market.harbor",
        name: "Harbor Fish Market",
        regionId: "region.harbor",
        commodities: { fish: commodity("fish", 0) }
      }
    }
  } as unknown as GameState;
}

describe("market life boards", () => {
  it("builds one board per market, capped at the board size", () => {
    const boards = buildMarketLifeBoards(stateWithMarkets());
    expect(boards.map((board) => board.marketId).sort()).toEqual(["market.harbor", "market.village"]);
    for (const board of boards) {
      expect(board.marketName.length).toBeGreaterThan(0);
      expect(board.highlights.length).toBeLessThanOrEqual(MARKET_LIFE_BOARD_SIZE);
    }
  });

  it("ranks the scarcest good first and labels the extremes", () => {
    const board = buildMarketLifeBoards(stateWithMarkets())
      .find((entry) => entry.marketId === "market.village")!;
    expect(board.highlights.map((highlight) => highlight.itemId)).toEqual(["alpha", "gamma", "beta"]);
    expect(board.highlights[0].label).toBe("Wanted");
    expect(board.highlights[0].demandPercent).toBeGreaterThan(100);
    expect(board.highlights[2].label).toBe("Plentiful");
    expect(board.highlights[2].demandPercent).toBeLessThan(100);
  });

  it("carries the supply the stall is actually holding", () => {
    const board = buildMarketLifeBoards(stateWithMarkets())
      .find((entry) => entry.marketId === "market.village")!;
    const beta = board.highlights.find((highlight) => highlight.itemId === "beta")!;
    expect(beta.localSupply).toBe(200);
    expect(beta.targetSupply).toBe(100);
  });

  it("is deterministic for the same state", () => {
    const state = stateWithMarkets();
    expect(buildMarketLifeBoards(state)).toEqual(buildMarketLifeBoards(state));
  });
});

describe("nearestMarketBoardInReach", () => {
  const boards = [
    { board: { marketId: "near", marketName: "Near", highlights: [] }, x: 0, z: 0 },
    { board: { marketId: "far", marketName: "Far", highlights: [] }, x: 100, z: 0 }
  ];

  it("picks the nearest stall inside the reach", () => {
    expect(nearestMarketBoardInReach(boards, 5, 0)?.board.marketId).toBe("near");
  });

  it("shows nothing when no stall is close enough", () => {
    expect(nearestMarketBoardInReach(boards, 500, 0)).toBeNull();
  });

  it("honours an explicit reach override", () => {
    expect(nearestMarketBoardInReach(boards, 5, 0, 1)).toBeNull();
  });
});

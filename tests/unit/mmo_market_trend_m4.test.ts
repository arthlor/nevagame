import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Simulation } from "../../src/simulation/Simulation";
import { MarketDemandTrend, demandPlotY } from "../../src/ui/components/MarketDemandTrend";
import { demandFromSupply, DEMAND_MIN, DEMAND_MAX } from "../../src/simulation/economy/marketPricing";
import type { MarketDemandTrendDto } from "../../src/simulation/core/contracts";

function anyCommodity(sim: Simulation): { marketId: string; itemId: string } {
  for (const [marketId, market] of Object.entries(sim.state.markets)) {
    const itemId = Object.keys(market.commodities)[0];
    if (itemId) return { marketId, itemId };
  }
  throw new Error("the starter world must post at least one commodity");
}

describe("Milestone M4 — Market demand outlook (R6.2)", () => {
  describe("simulation", () => {
    it("samples the same pricing function the stall charges with", () => {
      const sim = new Simulation();
      const { marketId, itemId } = anyCommodity(sim);
      const commodity = sim.state.markets[marketId].commodities[itemId];
      const trend = sim.query({ type: "market.demand-trend", marketId, itemId } as never) as MarketDemandTrendDto;

      const hourNow = sim.state.clock.currentMinute / 60;
      for (const point of trend.points) {
        const expected = Math.round(
          demandFromSupply(commodity, commodity.localSupply, hourNow + point.dayOffset * 24, sim.state.worldSeed) * 100
        );
        expect(point.demandPercent, `day ${point.dayOffset}`).toBe(expected);
      }
    });

    it("keeps every sample inside the model's own demand band", () => {
      const sim = new Simulation();
      const { marketId, itemId } = anyCommodity(sim);
      const trend = sim.query({ type: "market.demand-trend", marketId, itemId, days: 14 } as never) as MarketDemandTrendDto;
      for (const point of trend.points) {
        expect(point.demandPercent).toBeGreaterThanOrEqual(Math.round(DEMAND_MIN * 100));
        expect(point.demandPercent).toBeLessThanOrEqual(Math.round(DEMAND_MAX * 100));
      }
    });

    it("is deterministic for the same world and clock", () => {
      const sim = new Simulation();
      const { marketId, itemId } = anyCommodity(sim);
      const a = sim.query({ type: "market.demand-trend", marketId, itemId } as never) as MarketDemandTrendDto;
      const b = sim.query({ type: "market.demand-trend", marketId, itemId } as never) as MarketDemandTrendDto;
      expect(b.points).toEqual(a.points);
    });

    it("clamps the window and returns null for an unstocked commodity", () => {
      const sim = new Simulation();
      const { marketId, itemId } = anyCommodity(sim);
      expect((sim.query({ type: "market.demand-trend", marketId, itemId, days: 999 } as never) as MarketDemandTrendDto).points).toHaveLength(14);
      expect((sim.query({ type: "market.demand-trend", marketId, itemId, days: 1 } as never) as MarketDemandTrendDto).points).toHaveLength(2);
      expect(sim.query({ type: "market.demand-trend", marketId, itemId: "item.nope" } as never)).toBeNull();
    });

    it("never mutates market state while projecting", () => {
      const sim = new Simulation();
      const { marketId, itemId } = anyCommodity(sim);
      const before = JSON.stringify(sim.state.markets);
      sim.query({ type: "market.demand-trend", marketId, itemId } as never);
      expect(JSON.stringify(sim.state.markets)).toBe(before);
    });
  });

  describe("presentation", () => {
    const trend = (over: Partial<MarketDemandTrendDto> = {}): MarketDemandTrendDto => ({
      marketId: "market.village",
      itemId: "item.wheat",
      itemName: "Wheat",
      points: [
        { dayOffset: 0, demandPercent: 100 },
        { dayOffset: 1, demandPercent: 112 },
        { dayOffset: 2, demandPercent: 124 }
      ],
      currentDemandPercent: 100,
      direction: "rising",
      localSupply: 40,
      targetSupply: 60,
      ...over
    });

    const render = (over: Partial<MarketDemandTrendDto> = {}): string =>
      renderToString(React.createElement(MarketDemandTrend, { trend: trend(over) }));

    it("plots one point per sampled day and marks today", () => {
      const html = render();
      expect(html).toContain('data-testid="market-demand-trend"');
      expect(html).toContain("M0.0,");
      expect(html).toContain("L66.0,");
      expect(html).toContain("L132.0,");
      expect(html).toContain("market-demand-today");
    });

    it("says plainly that the outlook holds today's stock constant", () => {
      // Presenting a projection as history would mislead; the note must say so.
      const html = render();
      expect(html).toContain("at today&#x27;s stock");
      expect(html).toContain("40 of 60 target");
    });

    it("colours and labels the direction the model actually reports", () => {
      expect(render({ direction: "rising" })).toContain('data-direction="rising"');
      expect(render({ direction: "falling" })).toContain("Falling");
      expect(render({ direction: "steady" })).toContain("Steady");
    });

    it("maps demand onto the plot with higher demand drawn higher", () => {
      expect(demandPlotY(160)).toBeCloseTo(0, 5);
      expect(demandPlotY(65)).toBeCloseTo(34, 5);
      expect(demandPlotY(140)).toBeLessThan(demandPlotY(90));
    });

    it("clamps a sample outside the band instead of drawing off-plot", () => {
      expect(demandPlotY(999)).toBeCloseTo(0, 5);
      expect(demandPlotY(0)).toBeCloseTo(34, 5);
    });
  });
});

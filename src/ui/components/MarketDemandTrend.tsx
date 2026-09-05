import React from "react";
import type { MarketDemandTrendDto } from "../../simulation/core/contracts";

interface MarketDemandTrendProps {
  trend: MarketDemandTrendDto;
}

const VIEW_WIDTH = 132;
const VIEW_HEIGHT = 34;
/** Demand is clamped to this band by the pricing model, so the plot uses it. */
const DEMAND_FLOOR = 65;
const DEMAND_CEILING = 160;

const DIRECTION_LABEL: Record<MarketDemandTrendDto["direction"], string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling"
};

/** Maps a demand percentage onto the plot's vertical axis. */
export function demandPlotY(demandPercent: number): number {
  const span = DEMAND_CEILING - DEMAND_FLOOR;
  const clamped = Math.max(DEMAND_FLOOR, Math.min(DEMAND_CEILING, demandPercent));
  return VIEW_HEIGHT - ((clamped - DEMAND_FLOOR) / span) * VIEW_HEIGHT;
}

export const MarketDemandTrend: React.FC<MarketDemandTrendProps> = ({ trend }) => {
  const { points } = trend;
  const step = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : 0;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${demandPlotY(point.demandPercent).toFixed(1)}`)
    .join(" ");
  // The 100% line is where price sits at the stall's target stock.
  const parY = demandPlotY(100);

  return (
    <section
      className={`market-demand-trend direction--${trend.direction}`}
      data-testid="market-demand-trend"
      data-direction={trend.direction}
      aria-label={`${trend.itemName} demand outlook: ${DIRECTION_LABEL[trend.direction].toLowerCase()}, now ${trend.currentDemandPercent}%`}
    >
      <header className="market-demand-trend-head">
        <span>Demand outlook</span>
        <strong data-testid="market-demand-now">{`${trend.currentDemandPercent}%`}</strong>
        <span className="market-demand-direction">{DIRECTION_LABEL[trend.direction]}</span>
      </header>

      <svg
        className="market-demand-trend-plot"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="0" y1={parY} x2={VIEW_WIDTH} y2={parY} className="market-demand-par" />
        <path d={path} className="market-demand-line" fill="none" />
        <circle cx="0" cy={demandPlotY(points[0]?.demandPercent ?? 100)} r="2.5" className="market-demand-today" />
      </svg>

      <p className="market-demand-trend-note">
        {`Next ${points.length} days at today's stock (${trend.localSupply} of ${trend.targetSupply} target)`}
      </p>
    </section>
  );
};

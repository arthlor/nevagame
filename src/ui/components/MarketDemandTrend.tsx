import React from "react";
import type { MarketDemandTrendDto } from "../../simulation/core/contracts";
import { useTranslation } from "../../i18n/useTranslation";

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

const DIRECTION_LABEL_TR: Record<MarketDemandTrendDto["direction"], string> = {
  rising: "Yükseliyor",
  steady: "Dengeli",
  falling: "Düşüyor"
};

/** Maps a demand percentage onto the plot's vertical axis. */
export function demandPlotY(demandPercent: number): number {
  const span = DEMAND_CEILING - DEMAND_FLOOR;
  const clamped = Math.max(DEMAND_FLOOR, Math.min(DEMAND_CEILING, demandPercent));
  return VIEW_HEIGHT - ((clamped - DEMAND_FLOOR) / span) * VIEW_HEIGHT;
}

export const MarketDemandTrend: React.FC<MarketDemandTrendProps> = ({ trend }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const { points } = trend;
  const step = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : 0;
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${demandPlotY(point.demandPercent).toFixed(1)}`)
    .join(" ");
  // The 100% line is where price sits at the stall's target stock.
  const parY = demandPlotY(100);

  const directionText = isTr ? DIRECTION_LABEL_TR[trend.direction] : DIRECTION_LABEL[trend.direction];
  const ariaLabel = isTr
    ? `${trend.itemName} talep görünümü: ${directionText.toLowerCase()}, şu an %${trend.currentDemandPercent}`
    : `${trend.itemName} demand outlook: ${directionText.toLowerCase()}, now ${trend.currentDemandPercent}%`;

  return (
    <section
      className={`market-demand-trend direction--${trend.direction}`}
      data-testid="market-demand-trend"
      data-direction={trend.direction}
      aria-label={ariaLabel}
    >
      <header className="market-demand-trend-head">
        <span>{isTr ? "Talep Görünümü" : "Demand outlook"}</span>
        <strong data-testid="market-demand-now">{isTr ? `%${trend.currentDemandPercent}` : `${trend.currentDemandPercent}%`}</strong>
        <span className="market-demand-direction">{directionText}</span>
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
        {isTr
          ? `Gelecek ${points.length} gün için bugünkü stok tahmini (hedef ${trend.targetSupply} / mevcut ${trend.localSupply})`
          : `Next ${points.length} days at today's stock (${trend.localSupply} of ${trend.targetSupply} target)`}
      </p>
    </section>
  );
};

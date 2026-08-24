import { MarketCommodityState } from "../core/types";

export interface CommodityPriceBreakdown {
  basePrice: number;
  demandModifier: number;
  demandPercent: number;
  seasonalModifier: number;
  unitPrice: number;
}

export function calculateCommodityUnitPrice(commodity: MarketCommodityState): CommodityPriceBreakdown {
  const demandModifier = Math.min(1.6, Math.max(0.65, commodity.demandIndex));
  const seasonalModifier = Math.max(0, commodity.seasonalModifier);
  return {
    basePrice: commodity.basePrice,
    demandModifier: Number(demandModifier.toFixed(2)),
    demandPercent: Math.round(demandModifier * 100),
    seasonalModifier: Number(seasonalModifier.toFixed(2)),
    unitPrice: Math.max(1, Math.round(commodity.basePrice * demandModifier * seasonalModifier))
  };
}

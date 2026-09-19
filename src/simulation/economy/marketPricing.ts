import type { CropQuality, MarketCommodityState } from "../core/types";
import { SeededRng } from "../core/Rng";

export const DEMAND_MIN = 0.65;
export const DEMAND_MAX = 1.6;
export const DEMAND_ELASTICITY = 0.6;
export const RETAIL_MARKUP = 1.25;
/** A visible raw-input spread: direct resale still loses, while processing may earn a modest margin. */
export const WORKSHOP_SUPPLY_MARKUP = 1;
export const DAILY_TREND_AMPLITUDE = 0.15;
export const HOURLY_NOISE_AMPLITUDE = 0.025;

/**
 * Harvest grade scales a produce lot's quote. Crops sit below the fish/trophy
 * ladder (`getQualityMultiplier` in `calculateFishValue`) because a grade
 * rides a whole bushel stack and crop volume is far higher. A missing grade
 * is an ungraded commodity at common value.
 */
export const CROP_QUALITY_PRICE_MULTIPLIER: Record<CropQuality, number> = {
  common: 1,
  fine: 1.2,
  exceptional: 1.45,
  prize: 1.75
};

export function cropQualityPriceMultiplier(quality: CropQuality | undefined): number {
  return quality ? CROP_QUALITY_PRICE_MULTIPLIER[quality] : 1;
}

export type DemandCommodity = Pick<MarketCommodityState, "itemId" | "targetSupply">;

export interface MarketQuoteContext {
  absoluteHour: number;
  worldSeed: number;
  /** Prevents a same-hour buy from undercutting the best wholesale quote elsewhere. */
  minimumEffectiveModifier?: number;
  /** Overrides the standard retail spread for explicitly authored workshop inputs. */
  retailMarkup?: number;
  /**
   * One multiplier per marginal unit, in sale order. Graded produce builds
   * this from its lots so a bulk quote prices exactly the units the sale will
   * remove, in the order it removes them. Purchases never set it.
   */
  qualityMultipliers?: readonly number[];
  /**
   * Prices against this supply instead of the commodity's live supply. A
   * multi-lot produce quote walks one supply cursor across lots so the sum of
   * lot quotes equals one quote over the whole batch.
   */
  supplyOverride?: number;
}

export interface CommodityMarketQuote {
  itemId: string;
  quantity: number;
  side: "wholesale" | "retail";
  total: number;
  unitPrice: number;
  averageUnitPrice: number;
  demandBefore: number;
  demandAfter: number;
  averageDemandModifier: number;
  supplyBefore: number;
  supplyAfter: number;
  marginalDemandModifiers: number[];
  /** Per-unit settled price, in the same order as `marginalDemandModifiers`. */
  marginalUnitPrices: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Moves either a glut or a shortage back toward target at the authored town throughput. */
export function relaxSupply(
  supply: number,
  targetSupply: number,
  consumptionRate: number,
  hours: number
): number {
  const target = Math.max(1, targetSupply);
  const current = Math.max(0, supply);
  const maximumMove = Math.max(0, consumptionRate) * Math.max(0, hours);
  const delta = target - current;
  if (Math.abs(delta) <= maximumMove) return target;
  return current + Math.sign(delta) * maximumMove;
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicSignedNoise(worldSeed: number, itemId: string, bucket: number, salt: number): number {
  const seed = (
    (worldSeed >>> 0) ^
    hashString(itemId) ^
    Math.imul(Math.trunc(bucket) | 0, 0x9e3779b1) ^
    salt
  ) >>> 0;
  const rng = new SeededRng(seed || 0x6d2b79f5);
  return rng.nextFloat() * 2 - 1;
}

export function dailyDemandTrend(worldSeed: number, itemId: string, dayIndex: number): number {
  return deterministicSignedNoise(worldSeed, itemId, dayIndex, 0x51ed270b) * DAILY_TREND_AMPLITUDE;
}

export function hourlyDemandNoise(worldSeed: number, itemId: string, absoluteHour: number): number {
  return deterministicSignedNoise(worldSeed, itemId, absoluteHour, 0x68bc21eb) * HOURLY_NOISE_AMPLITUDE;
}

/**
 * A pure, centered demand signal. At target supply it varies around 1.0 only by
 * the deterministic day/hour signal; no shared gameplay RNG stream is consumed.
 */
export function demandFromSupply(
  commodity: DemandCommodity,
  supply: number,
  absoluteHour: number,
  worldSeed: number
): number {
  const target = Math.max(1, commodity.targetSupply);
  const hour = Math.floor(Math.max(0, absoluteHour));
  const deviation = (Math.max(0, supply) - target) / target;
  const raw = 1
    - DEMAND_ELASTICITY * deviation
    + dailyDemandTrend(worldSeed, commodity.itemId, Math.floor(hour / 24))
    + hourlyDemandNoise(worldSeed, commodity.itemId, hour);
  return clamp(raw, DEMAND_MIN, DEMAND_MAX);
}

/** Where a demand modifier lands on the stall's three-word reading. */
export function demandLabelFromModifier(demand: number): "Wanted" | "Steady" | "Plentiful" {
  return demand >= 1.1 ? "Wanted" : demand <= 0.9 ? "Plentiful" : "Steady";
}

export function demandLabelFromPercent(demandPercent: number): "Wanted" | "Steady" | "Plentiful" {
  return demandLabelFromModifier(demandPercent / 100);
}

export interface DemandTrendPoint {
  dayOffset: number;
  demandPercent: number;
}

export interface DemandTrendSample {
  points: DemandTrendPoint[];
  currentDemandPercent: number;
  /** A few points of drift is noise, not a trend worth calling. */
  direction: "rising" | "steady" | "falling";
}

export const DEMAND_TREND_WINDOW_DAYS = 5;

/**
 * Projects the seeded demand curve for one commodity across a window of days
 * with supply pinned at `supply`. Pure: the same inputs produce the same curve,
 * and no gameplay RNG is consumed. Shared by the market modal and the world
 * board so both read one trend definition.
 */
export function sampleDemandTrend(
  commodity: DemandCommodity,
  supply: number,
  absoluteHour: number,
  worldSeed: number,
  days: number = DEMAND_TREND_WINDOW_DAYS
): DemandTrendSample {
  // A non-finite request (NaN from a query) would size the window to zero.
  const requested = Number.isFinite(days) ? Math.floor(days) : DEMAND_TREND_WINDOW_DAYS;
  const window = Math.max(2, Math.min(14, requested));
  const points = Array.from({ length: window }, (_, dayOffset) => ({
    dayOffset,
    demandPercent: Math.round(
      demandFromSupply(commodity, supply, absoluteHour + dayOffset * 24, worldSeed) * 100
    )
  }));
  const currentDemandPercent = points[0].demandPercent;
  const last = points[points.length - 1].demandPercent;
  const delta = last - currentDemandPercent;
  return {
    points,
    currentDemandPercent,
    direction: delta >= 5 ? "rising" : delta <= -5 ? "falling" : "steady"
  };
}

/**
 * Largest quantity one quote prices. A quote walks one marginal unit at a time,
 * so an unbounded request is a loop and allocation hazard; no finite satchel,
 * hold or stall supply comes near it.
 */
export const MAX_MARKET_QUOTE_QUANTITY = 10_000;

export function isQuotableQuantity(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_MARKET_QUOTE_QUANTITY;
}

function quoteCommodity(
  commodity: MarketCommodityState,
  quantity: number,
  context: MarketQuoteContext,
  side: "wholesale" | "retail"
): CommodityMarketQuote {
  if (!isQuotableQuantity(quantity)) {
    throw new Error(`Market quote quantity must be a whole number from 1 to ${MAX_MARKET_QUOTE_QUANTITY}`);
  }

  const supplyBefore = Math.max(0, context.supplyOverride ?? commodity.localSupply);
  const direction = side === "wholesale" ? 1 : -1;
  let supply = supplyBefore;
  let total = 0;
  const marginalDemandModifiers: number[] = [];
  const marginalUnitPrices: number[] = [];
  const demandBefore = demandFromSupply(commodity, supply, context.absoluteHour, context.worldSeed);

  for (let index = 0; index < quantity; index += 1) {
    const nextSupply = Math.max(0, supply + direction);
    const before = demandFromSupply(commodity, supply, context.absoluteHour, context.worldSeed);
    const after = demandFromSupply(commodity, nextSupply, context.absoluteHour, context.worldSeed);
    const marginalDemand = (before + after) / 2;
    marginalDemandModifiers.push(marginalDemand);
    const qualityMultiplier = context.qualityMultipliers?.[index] ?? 1;
    // The cross-market anti-arbitrage floor applies to the demand/season
    // modifier; a harvest grade is a property of the goods, so its premium
    // rides on top of the floor rather than being flattened by it.
    const effectiveModifier = Math.max(
      context.minimumEffectiveModifier ?? 0,
      marginalDemand * Math.max(0, commodity.seasonalModifier)
    ) * Math.max(0, qualityMultiplier);
    const rawUnitPrice = commodity.basePrice * effectiveModifier * (
      side === "retail" ? context.retailMarkup ?? RETAIL_MARKUP : 1
    );
    const wholesaleUnit = Math.max(1, Math.round(commodity.basePrice * effectiveModifier));
    const unitPrice = side === "retail"
      // Low-value inputs can otherwise round the retail and wholesale price
      // to the same integer. Keep a visible one-gold spread per marginal unit.
      ? Math.max(wholesaleUnit + 1, Math.ceil(rawUnitPrice))
      : wholesaleUnit;
    marginalUnitPrices.push(unitPrice);
    total += unitPrice;
    supply = nextSupply;
  }

  const demandAfter = demandFromSupply(commodity, supply, context.absoluteHour, context.worldSeed);
  const averageDemandModifier = marginalDemandModifiers.reduce((sum, value) => sum + value, 0) / quantity;
  return {
    itemId: commodity.itemId,
    quantity,
    side,
    total,
    unitPrice: quantity === 1 ? total : Math.round(total / quantity),
    averageUnitPrice: total / quantity,
    demandBefore,
    demandAfter,
    averageDemandModifier,
    supplyBefore,
    supplyAfter: supply,
    marginalDemandModifiers,
    marginalUnitPrices
  };
}

/** One bulk fill is exactly the sum of the same one-unit marginal fills. */
export function quoteCommoditySale(
  commodity: MarketCommodityState,
  quantity: number,
  context: MarketQuoteContext
): CommodityMarketQuote {
  return quoteCommodity(commodity, quantity, context, "wholesale");
}

/** Purchases deplete stall supply and include the retail spread. */
export function quoteCommodityPurchase(
  commodity: MarketCommodityState,
  quantity: number,
  context: MarketQuoteContext
): CommodityMarketQuote {
  return quoteCommodity(commodity, quantity, context, "retail");
}

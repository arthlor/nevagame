import type { MarketCommodityState } from "../core/types";
import { SeededRng } from "../core/Rng";

export const DEMAND_MIN = 0.65;
export const DEMAND_MAX = 1.6;
export const DEMAND_ELASTICITY = 0.6;
export const RETAIL_MARKUP = 1.25;
export const DAILY_TREND_AMPLITUDE = 0.15;
export const HOURLY_NOISE_AMPLITUDE = 0.025;

type DemandCommodity = Pick<MarketCommodityState, "itemId" | "targetSupply">;

export interface MarketQuoteContext {
  absoluteHour: number;
  worldSeed: number;
  /** Prevents a same-hour buy from undercutting the best wholesale quote elsewhere. */
  minimumEffectiveModifier?: number;
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

function quoteCommodity(
  commodity: MarketCommodityState,
  quantity: number,
  context: MarketQuoteContext,
  side: "wholesale" | "retail"
): CommodityMarketQuote {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Market quote quantity must be a positive whole number");
  }

  const supplyBefore = Math.max(0, commodity.localSupply);
  const direction = side === "wholesale" ? 1 : -1;
  let supply = supplyBefore;
  let total = 0;
  const marginalDemandModifiers: number[] = [];
  const demandBefore = demandFromSupply(commodity, supply, context.absoluteHour, context.worldSeed);

  for (let index = 0; index < quantity; index += 1) {
    const nextSupply = Math.max(0, supply + direction);
    const before = demandFromSupply(commodity, supply, context.absoluteHour, context.worldSeed);
    const after = demandFromSupply(commodity, nextSupply, context.absoluteHour, context.worldSeed);
    const marginalDemand = (before + after) / 2;
    marginalDemandModifiers.push(marginalDemand);
    const effectiveModifier = Math.max(
      context.minimumEffectiveModifier ?? 0,
      marginalDemand * Math.max(0, commodity.seasonalModifier)
    );
    const rawUnitPrice = commodity.basePrice * effectiveModifier * (side === "retail" ? RETAIL_MARKUP : 1);
    total += side === "retail"
      ? Math.max(1, Math.ceil(rawUnitPrice))
      : Math.max(1, Math.round(rawUnitPrice));
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
    marginalDemandModifiers
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


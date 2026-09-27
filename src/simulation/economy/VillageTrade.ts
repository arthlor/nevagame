import { VILLAGE_TRADE_GOODS } from '../../content/villageTrade';
import { WorldLayout } from '../../world/WorldLayout';
import { WORLD_MARKET_LOCATIONS } from '../../world/WorldGameplayLocations';
import { WORLD_SAILING_ROUTES, mooringById } from '../../world/WorldMoorings';
import { HARBOR_MAIN_PIER, HARBOR_MARKET_APRON, HARBOR_PIER_DECK } from '../../world/WorldAnchors';

type Point = { x: number; z: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
let distances: Map<string, number> | undefined;

/** Shortest authored road/channel journey, never distance accumulated by circling. */
function buildDistances(): Map<string, number> {
  const points: Point[] = [], edges: Map<number, number>[] = [];
  const add = (p: Point) => { const found = points.findIndex(q => distance(p, q) < 0.05); if (found >= 0) return found; points.push(p); edges.push(new Map()); return points.length - 1; };
  const connect = (a: number, b: number) => { const d = distance(points[a], points[b]); edges[a].set(b, d); edges[b].set(a, d); };
  const connectPath = (path: readonly Point[]) => {
    const ids = path.map(add); for (let i = 1; i < ids.length; i++) connect(ids[i - 1], ids[i]);
  };
  for (const route of WorldLayout.routeDefinitions()) connectPath(route.points);
  const landPointCount = points.length;
  for (const route of WORLD_SAILING_ROUTES.filter(r => !r.landAccessible)) {
    connectPath(route.points);
    for (const mooringId of [route.fromMooringId, route.toMooringId]) {
      const mooring = mooringById(mooringId);
      if (!mooring) throw new Error(`Missing trade-route mooring: ${mooringId}`);
      // Boarding links are explicit: extending a pier must not disconnect the
      // channel merely because its berth is farther than the short road joins.
      const access = mooring.marketId === 'market.harbor' ? [
        HARBOR_MARKET_APRON,
        { x: HARBOR_MAIN_PIER.x, z: HARBOR_MAIN_PIER.z - HARBOR_MAIN_PIER.length / 2 - HARBOR_PIER_DECK.stairRun },
        { x: HARBOR_MAIN_PIER.x, z: mooring.playerPosition.z },
        mooring.playerPosition
      ] : [mooring.playerPosition];
      let nearest = 0;
      for (let i = 1; i < landPointCount; i++) if (distance(access[0], points[i]) < distance(access[0], points[nearest])) nearest = i;
      connectPath([points[nearest], ...access, mooring.boatPosition]);
    }
  }
  // Short authored joins between the local road ends and landing/court anchors.
  for (let i = 0; i < points.length; i++) for (let j = 0; j < i; j++) if (distance(points[i], points[j]) <= 12) connect(i, j);
  const markets = Object.keys(VILLAGE_TRADE_GOODS);
  const nodes = markets.map(id => {
    const p = WORLD_MARKET_LOCATIONS[id].position;
    const nearest = points.reduce((best, q, i) => distance(p, q) < distance(p, points[best]) ? i : best, 0);
    const index = add(p); connect(index, nearest); return index;
  });
  const result = new Map<string, number>();
  for (let source = 0; source < markets.length; source++) {
    const costs = points.map(() => Infinity), visited = new Set<number>(); costs[nodes[source]] = 0;
    for (let n = 0; n < points.length; n++) {
      let current = -1;
      for (let i = 0; i < costs.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i;
      if (current < 0 || !Number.isFinite(costs[current])) break;
      visited.add(current);
      for (const [next, length] of edges[current]) costs[next] = Math.min(costs[next], costs[current] + length);
    }
    for (let target = 0; target < markets.length; target++) {
      const length = costs[nodes[target]];
      if (!Number.isFinite(length)) throw new Error(`Disconnected village trade route: ${markets[source]} to ${markets[target]}`);
      result.set(`${markets[source]}:${markets[target]}`, Math.round(length));
    }
  }
  return result;
}
export function villageTradeRouteMeters(origin: string | undefined, destination: string): number {
  if (!origin || !VILLAGE_TRADE_GOODS[origin] || !VILLAGE_TRADE_GOODS[destination] || origin === destination) return 0;
  distances ??= buildDistances();
  return distances.get(`${origin}:${destination}`)!;
}
export const VILLAGE_TRADE_TUNING = Object.freeze({ moneyBonusPerKm: 0.85, xpBonusPerKm: 0.35, foreignSpecialtyPremium: 1.2 });
export function villageTradeModifiers(origin: string | undefined, destination: string, itemId: string) {
  const routeMeters = villageTradeRouteMeters(origin, destination);
  const foreignSpecialty = routeMeters > 0 && VILLAGE_TRADE_GOODS[origin!]?.includes(itemId) && !VILLAGE_TRADE_GOODS[destination]?.includes(itemId);
  return { routeMeters, routeModifier: 1 + routeMeters / 1000 * VILLAGE_TRADE_TUNING.moneyBonusPerKm,
    specialtyModifier: foreignSpecialty ? VILLAGE_TRADE_TUNING.foreignSpecialtyPremium : 1,
    xpModifier: 1 + routeMeters / 1000 * VILLAGE_TRADE_TUNING.xpBonusPerKm };
}

import { FARM_PACK_QUANTITY, FARM_PACK_VALUE_MULTIPLIER } from '../../content/farmPacks';
import { cropQualityPriceMultiplier, quoteCommoditySale, type MarketQuoteContext } from './marketPricing';
import { cropQualityRank } from '../farming/calculateCropGrowth';
import { getFreshnessPriceMultiplier } from '../fishing/calculateFreshness';
import type { ItemStack, MarketCommodityState } from '../core/types';
import type { FarmPackPriceBreakdown } from '../cargo/farmPacks';

/** Shared by the packing-yard estimate and the counter's atomic settlement. */
export function quoteVillageTradePack(commodity: MarketCommodityState, lots: readonly ItemStack[], freshness: number,
  origin: string | undefined, destination: string, context: MarketQuoteContext): FarmPackPriceBreakdown {
  const qualityMultipliers = [...lots].sort((a, b) => cropQualityRank(b.quality) - cropQualityRank(a.quality))
    .flatMap(lot => Array(lot.quantity).fill(cropQualityPriceMultiplier(lot.quality)) as number[]);
  const wholesaleValue = quoteCommoditySale(commodity, FARM_PACK_QUANTITY, { ...context, qualityMultipliers }).total;
  const modifiers = villageTradeModifiers(origin, destination, commodity.itemId);
  const freshnessModifier = getFreshnessPriceMultiplier(freshness);
  const finalPrice = Math.floor(wholesaleValue * FARM_PACK_VALUE_MULTIPLIER * freshnessModifier * modifiers.routeModifier * modifiers.specialtyModifier);
  return { kind: 'farm', quantity: FARM_PACK_QUANTITY, wholesaleValue, packingModifier: FARM_PACK_VALUE_MULTIPLIER,
    freshnessModifier, finalPrice, ...modifiers, tradingXp: Math.floor(finalPrice * .1 * modifiers.xpModifier) };
}

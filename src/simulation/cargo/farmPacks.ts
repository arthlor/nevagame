import { TRADE_PACKS, TRADE_PACK_FAMILIES } from '../../content/tradePacks';
import { ITEMS } from '../../content/items';
import { CROPS } from '../../content/crops';
import type { TradePackSnapshot } from '../core/types';
import { FARM_PACK_QUANTITY, isFarmPackItem } from "../../content/farmPacks";
import type { CargoState, CropQuality, ItemStack } from "../core/types";

const GRADES: readonly CropQuality[] = ["common", "fine", "exceptional", "prize"];

/** One captured debit, never reconstructed from mutable inventory at collection. */
export function validFarmPackLots(itemId: unknown, quantity: unknown, lots: unknown): lots is ItemStack[] {
  if (typeof itemId !== "string" || !isFarmPackItem(itemId) || quantity !== FARM_PACK_QUANTITY
    || !Array.isArray(lots) || lots.length < 1 || lots.length > FARM_PACK_QUANTITY) return false;
  return lots.every((lot) => lot && typeof lot === "object" && lot.itemId === itemId
    && Number.isSafeInteger(lot.quantity) && lot.quantity > 0
    && (lot.quality === undefined || GRADES.includes(lot.quality)))
    && lots.reduce((sum, lot) => sum + lot.quantity, 0) === quantity;
}

/** The label advertises the lowest grade; sale prices every preserved lot. */
export function farmPackQuality(lots: readonly ItemStack[]): CropQuality {
  return GRADES[Math.min(...lots.map((lot) => GRADES.indexOf(lot.quality ?? "common")))];
}

export function cargoContentId(cargo: CargoState): string {
  return cargo.kind === "farm" ? cargo.itemId : cargo.speciesId;
}

export interface FarmPackPriceBreakdown {
  kind: "farm";
  quantity: number;
  wholesaleValue: number;
  demandModifier?: number;
  qualityModifier?: number;
  packingModifier: number;
  routeMeters: number;
  routeModifier: number;
  specialtyModifier: number;
  xpModifier: number;
  tradingXp: number;
  freshnessModifier: number;
  finalPrice: number;
}

/** Validate paid contents without reconstructing them from a recipe that may have changed. */
export function validTradePackSnapshot(value: unknown, lots: unknown, origin: unknown): value is TradePackSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pack = value as TradePackSnapshot;
  const definition = TRADE_PACKS[pack.definitionId];
  if (!definition || origin !== definition.originMarketId || !TRADE_PACK_FAMILIES.includes(pack.family)
    || pack.tier !== definition.tier || pack.family !== definition.family
    || !Number.isSafeInteger(pack.quantity) || pack.quantity < 1 || pack.quantity > 100
    || !Number.isSafeInteger(pack.baseValue) || pack.baseValue < 1 || pack.baseValue > 10000
    || !Number.isFinite(pack.qualityMultiplier) || pack.qualityMultiplier < 1 || pack.qualityMultiplier > 1.75
    || !Number.isFinite(pack.decayPerMinute) || pack.decayPerMinute < 0 || pack.decayPerMinute > 1
    || typeof pack.name !== 'string' || !pack.name.trim() || pack.name.length > 160
    || !Array.isArray(lots) || lots.length < 1 || lots.length > 20) return false;
  let count = 0;
  for (const lot of lots) {
    if (!lot || typeof lot !== 'object' || !ITEMS[lot.itemId] || !Number.isSafeInteger(lot.quantity)
      || lot.quantity <= 0 || lot.quantity > ITEMS[lot.itemId].stackLimit
      || (lot.quality !== undefined && (!GRADES.includes(lot.quality)
        || !Object.values(CROPS).some(crop => crop.harvestItemId === lot.itemId)))) return false;
    // Separate satchel slots can contain the same item and grade. Keep the
    // exact debit lots; the frozen total bounds the entire shipment.
    count += lot.quantity;
  }
  return count === pack.quantity && (pack.tier !== "harvest" || validFarmPackLots(definition.iconItemId, pack.quantity, lots));
}

export function isLooseHarvestPack(cargo: import('../core/types').FarmCargoState): boolean {
  return validFarmPackLots(cargo.itemId, FARM_PACK_QUANTITY, cargo.lots)
    && (!cargo.tradePack || cargo.tradePack.tier === 'harvest');
}

export function farmCargoName(cargo: import('../core/types').FarmCargoState): string {
  return cargo.tradePack?.name ?? `${ITEMS[cargo.itemId]?.name ?? cargo.itemId} trade pack`;
}

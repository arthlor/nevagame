import { TRADE_PACK_RECIPES } from "./tradePacks";
import { CROPS } from "./crops";

/** Packed harvest uses the existing station, transport and commodity markets. */
export const FARM_PACK_QUANTITY = 10;
export const FARM_PACK_WEIGHT_KG = 10;
export const FARM_PACK_DECAY_PER_MINUTE = 0.025;
/** Pays for Work, packing time and physical delivery; workshop inputs may earn a modest margin. */
export const FARM_PACK_VALUE_MULTIPLIER = 1.15;

export const FARM_PACK_RECIPES = TRADE_PACK_RECIPES.filter(recipe => recipe.tags.includes('harvest'));

export function isFarmPackItem(itemId: string): boolean {
  return Object.values(CROPS).some((crop) => crop.harvestItemId === itemId);
}

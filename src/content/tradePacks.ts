import { CROPS } from './crops';
import { VILLAGE_TRADE_GOODS } from './villageTrade';
import type { ItemStack, TradePackFamily, TradePackTier } from '../simulation/core/types';
import type { RecipeDefinition } from './types';

export const TRADE_PACK_FAMILIES = ['provisions', 'textiles', 'workshop', 'maritime'] as const;
export interface TradePackDefinition {
  id: string;
  recipeId: string;
  name: string;
  originMarketId: string;
  tier: TradePackTier;
  family: TradePackFamily;
  inputs: ItemStack[];
  /** Common-grade value before regional appetite, route, demand and condition. */
  baseValue: number;
  costMoney: number;
  durationMinutes: number;
  processingXp: number;
  tradingXp: number;
  decayPerMinute: number;
  iconItemId: string;
}

const harvestValues: Record<string, number> = {
  wheat: 98, tomato: 145, flax: 190, apple: 180, corn: 168,
  carrot: 110, barley: 120, potato: 132, sunflower_seed: 156, olive: 264
};
const harvestPacks: TradePackDefinition[] = Object.values(CROPS).map(crop => {
  const suffix = crop.id.slice('crop.'.length);
  const itemSuffix = crop.harvestItemId.slice('produce.'.length);
  return {
    id: `trade.${suffix}`, recipeId: `recipe.pack_${suffix}`, name: `${crop.name} Trade Pack`,
    originMarketId: Object.entries(VILLAGE_TRADE_GOODS).find(([, items]) => items.includes(crop.harvestItemId))![0],
    tier: 'harvest', family: crop.harvestItemId === 'produce.flax' ? 'textiles' : 'provisions',
    inputs: [{ itemId: crop.harvestItemId, quantity: 10 }],
    baseValue: harvestValues[itemSuffix], costMoney: 8, durationMinutes: 5,
    processingXp: 0, tradingXp: 0, decayPerMinute: crop.harvestItemId === 'produce.flax' ? 0 : .025,
    iconItemId: crop.harvestItemId
  };
});

type Ingredient = [string, number];
function specialty(id: string, name: string, village: string, tier: 'crafted' | 'premium', family: TradePackFamily,
  inputs: Ingredient[], baseValue: number, decayPerMinute: number): TradePackDefinition {
  return {
    id: `trade.${id}`, recipeId: `recipe.pack_${id}`, name,
    originMarketId: `market.${village}`, tier, family,
    inputs: inputs.map(([itemId, quantity]) => ({ itemId, quantity })),
    baseValue, costMoney: tier === 'crafted' ? 25 : 75,
    durationMinutes: tier === 'crafted' ? 12 : 20,
    processingXp: tier === 'crafted' ? 1000 : 3000,
    tradingXp: tier === 'crafted' ? 0 : 3000,
    decayPerMinute, iconItemId: inputs[0][0]
  };
}

export const TRADE_PACKS: Readonly<Record<string, TradePackDefinition>> = Object.fromEntries([
  ...harvestPacks,
  specialty('neva_grain', 'Milled Grain Sacks', 'village', 'crafted', 'provisions', [['item.ground_grain', 8], ['produce.wheat', 4], ['item.linen_roll', 1]], 235, .008),
  specialty('neva_provisions', 'Harvest Provisions', 'village', 'crafted', 'provisions', [['produce.tomato', 8], ['produce.wheat', 6], ['item.hardwood_blank', 2]], 240, .04),
  specialty('neva_feast', 'Village Feast Hamper', 'village', 'premium', 'provisions', [['item.meal_harvest_bowl', 4], ['item.meal_orchard_tart', 3], ['produce.olive', 4], ['item.linen_roll', 2]], 540, .05),
  specialty('neva_voyage', 'Voyage Provisions Chest', 'village', 'premium', 'maritime', [['item.ground_grain', 10], ['item.salt_cured_fish', 6], ['item.oiled_canvas', 2], ['item.hardwood_blank', 2]], 650, .008),
  specialty('pinewatch_timber', 'Seasoned Timber Bundle', 'pinewatch', 'crafted', 'workshop', [['item.hardwood_blank', 6], ['item.tanned_leather', 2]], 260, 0),
  specialty('pinewatch_linen', 'Linen Bale', 'pinewatch', 'crafted', 'textiles', [['item.linen_roll', 3], ['produce.flax', 4]], 280, 0),
  specialty('pinewatch_weatherproof', 'Weatherproof Supplies', 'pinewatch', 'premium', 'textiles', [['item.oiled_canvas', 3], ['item.linen_roll', 3], ['item.brass_fittings', 3]], 650, 0),
  specialty('pinewatch_outfitter', 'Woodland Outfitter Chest', 'pinewatch', 'premium', 'workshop', [['item.hardwood_blank', 8], ['item.tool_steel', 4], ['item.tanned_leather', 3], ['produce.apple', 4]], 670, .015),
  specialty('reedhaven_angler', 'Angler Supply Crate', 'reedhaven', 'crafted', 'maritime', [['item.bait_worms', 10], ['item.basic_lure', 4], ['item.hardwood_blank', 2]], 220, .012),
  specialty('reedhaven_preserved', 'Preserved River Provisions', 'reedhaven', 'crafted', 'provisions', [['item.salt_cured_fish', 4], ['produce.corn', 4], ['produce.carrot', 4]], 285, .008),
  specialty('reedhaven_expedition', 'River Expedition Supplies', 'reedhaven', 'premium', 'maritime', [['item.chum_rich', 5], ['item.basic_lure', 5], ['item.oiled_canvas', 2], ['item.hardwood_blank', 3]], 660, .008),
  specialty('reedhaven_pantry', 'Marsh Pantry Hamper', 'reedhaven', 'premium', 'provisions', [['item.salt_cured_fish', 6], ['item.ground_grain', 8], ['produce.apple', 6], ['item.linen_roll', 2]], 630, .012),
  specialty('highridge_metals', 'Workshop Metal Crate', 'highridge', 'crafted', 'workshop', [['item.tool_steel', 3], ['item.copper_sheet', 2], ['item.hardwood_blank', 2]], 315, 0),
  specialty('highridge_field', 'Field Tool Materials', 'highridge', 'crafted', 'workshop', [['item.tool_steel', 2], ['item.hardwood_blank', 3], ['item.tanned_leather', 2]], 280, 0),
  specialty('highridge_fittings', 'Reinforced Fittings Chest', 'highridge', 'premium', 'workshop', [['item.brass_fittings', 5], ['item.tool_steel', 4], ['item.oiled_canvas', 2], ['item.hardwood_blank', 2]], 740, 0),
  specialty('highridge_harvest', 'Highland Harvest Chest', 'highridge', 'premium', 'provisions', [['produce.barley', 12], ['produce.potato', 12], ['item.salt_cured_fish', 6], ['item.linen_roll', 2]], 690, .02),
  specialty('sunreach_cured', 'Cured Coastal Fish Crate', 'sunreach_cove', 'crafted', 'provisions', [['item.salt_cured_fish', 5], ['produce.olive', 3], ['item.hardwood_blank', 2]], 350, .008),
  specialty('sunreach_pantry', 'Island Pantry Pack', 'sunreach_cove', 'crafted', 'provisions', [['produce.sunflower_seed', 8], ['produce.olive', 5], ['item.linen_roll', 1]], 320, .012),
  specialty('sunreach_export', 'Sunreach Export Hamper', 'sunreach_cove', 'premium', 'provisions', [['produce.olive', 10], ['item.salt_cured_fish', 6], ['item.ground_grain', 8], ['item.linen_roll', 2]], 770, .008),
  specialty('sunreach_rigging', 'Coastal Rigging Chest', 'sunreach_cove', 'premium', 'maritime', [['item.oiled_canvas', 4], ['item.brass_fittings', 4], ['item.linen_roll', 2], ['produce.sunflower_seed', 6]], 800, .008)
].map(pack => [pack.id, pack]));

export const TRADE_PACK_RECIPES: RecipeDefinition[] = Object.values(TRADE_PACKS).map(pack => ({
  id: pack.recipeId, name: `Pack ${pack.name}`, stationType: 'trading-station',
  inputs: pack.inputs, result: { kind: 'farm-pack', itemId: pack.iconItemId,
    quantity: pack.inputs.reduce((sum, input) => sum + input.quantity, 0), tradePackId: pack.id },
  costMoney: pack.costMoney, durationMinutes: pack.durationMinutes,
  workTier: pack.tier === 'harvest' ? 'light' : pack.tier === 'crafted' ? 'prepared' : 'standard',
  presentationKind: 'existing', minimumSkill: { skill: 'processing', xp: pack.processingXp },
  minimumTradingXp: pack.tradingXp, tags: ['farm-pack', 'trade', pack.tier]
}));

/** Regional appetite is independent of where ingredients happened to be bought. */
export const TRADE_APPETITE: Readonly<Record<string, Record<TradePackFamily, number>>> = {
  'market.village': { provisions: .95, textiles: 1.1, workshop: 1.05, maritime: 1.1 },
  'market.pinewatch': { provisions: 1.2, textiles: .85, workshop: 1.05, maritime: 1.05 },
  'market.reedhaven': { provisions: 1.1, textiles: 1.2, workshop: 1.05, maritime: .9 },
  'market.highridge': { provisions: 1.25, textiles: 1.1, workshop: .85, maritime: 1.15 },
  'market.sunreach_cove': { provisions: 1, textiles: 1.2, workshop: 1.25, maritime: 1.1 }
};
export const TRADE_DEMAND_TUNING = Object.freeze({ targetPacks: 16, recoveryPerHour: 1.5, maximumSupply: 32 });

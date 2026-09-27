/** A local packing craft gives every village a reason to be visited. */
export const VILLAGE_TRADE_GOODS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'market.village': ['produce.wheat', 'produce.tomato'],
  'market.pinewatch': ['produce.flax', 'produce.apple'],
  'market.reedhaven': ['produce.corn', 'produce.carrot'],
  'market.highridge': ['produce.barley', 'produce.potato'],
  'market.sunreach_cove': ['produce.sunflower_seed', 'produce.olive']
});
export function isVillageTradeOrigin(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(VILLAGE_TRADE_GOODS, value);
}

export const TRADE_VEHICLES = {
  'mount.carriage_4': { id: 'mount.carriage_4', name: 'Four-pack Wagon', assetId: 'prop_merchant_carriage_4_a', cargoSlots: 4, bedWidth: 1.85, bedLength: 3, costMoney: 14000, requiredTradingXp: 3000 },
  'mount.carriage_6': { id: 'mount.carriage_6', name: 'Six-pack Wagon', assetId: 'prop_merchant_carriage_6_a', cargoSlots: 6, bedWidth: 2, bedLength: 3.5, costMoney: 60000, requiredTradingXp: 15000 }
} as const;
export type TradeCarriageTypeId = keyof typeof TRADE_VEHICLES;
export function isTradeCarriageType(value: unknown): value is TradeCarriageTypeId {
  return typeof value === 'string' && Object.hasOwn(TRADE_VEHICLES, value);
}

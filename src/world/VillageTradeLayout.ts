import { bindInteractionPose, bindInteractionPoint } from "./InteractionPlacements";
import { MAINLAND_VILLAGES } from './NevaMainland';
import { SUNREACH_ANCHORS } from './WorldIslands';

const MAINLAND_PACKING_OFFSETS = {
  pinewatch: { x: 10, z: -10, rotationY: Math.PI / 2 },
  reedhaven: { x: -10, z: -10, rotationY: Math.PI / 2 },
  highridge: { x: 0, z: -10, rotationY: Math.PI }
} as const;

/** Packing yards share the village market's road and delivery catchment. */
export const VILLAGE_TRADE_STATIONS = [
  { id: 'struct.trade_neva', marketId: 'market.village', name: 'Neva Packing Yard', islandId: 'island.neva', assetId: 'station_trade_neva_a', position: { x: 55, z: -66 }, rotationY: Math.PI / 2 },
  ...Object.values(MAINLAND_VILLAGES).map(v => {
    const offset = MAINLAND_PACKING_OFFSETS[v.id];
    return { id: `struct.trade_${v.id}`, marketId: v.marketId, name: `${v.label} Packing Yard`,
      islandId: 'island.neva', assetId: `station_trade_${v.id}_a`,
      position: { x: v.market.x + offset.x, z: v.market.z + offset.z }, rotationY: offset.rotationY };
  }),
  { id: 'struct.trade_sunreach', marketId: 'market.sunreach_cove', name: 'Sunreach Packing Yard', islandId: 'island.sunreach', assetId: 'station_trade_sunreach_a', position: { x: SUNREACH_ANCHORS.coveMarket.x + 9, z: SUNREACH_ANCHORS.coveMarket.z }, rotationY: Math.PI / 2 }
] as const;

const BASE_CART_WORKSHOP = {
  id: 'landmark.cart_workshop', position: { x: 83, z: -44 }, rotationY: 0,
  /** Wagons face the village road; each display becomes the purchased vehicle. */
  displays: [
    { mountId: 'mount.carriage_4', mountTypeId: 'mount.carriage_4', x: 83, z: -28, rotationY: -Math.PI / 2 },
    { mountId: 'mount.carriage_6', mountTypeId: 'mount.carriage_6', x: 83, z: -20, rotationY: -Math.PI / 2 }
  ]
} as const;

const workshopPose = bindInteractionPose(BASE_CART_WORKSHOP.id, { ...BASE_CART_WORKSHOP.position, rotationY: BASE_CART_WORKSHOP.rotationY });
export const CART_WORKSHOP = {
  ...BASE_CART_WORKSHOP,
  position: workshopPose,
  get rotationY() { return workshopPose.rotationY; },
  displays: BASE_CART_WORKSHOP.displays.map(display => bindInteractionPoint(BASE_CART_WORKSHOP.id, display,
    { ...BASE_CART_WORKSHOP.position, rotationY: BASE_CART_WORKSHOP.rotationY }))
};

/** Keep generated vegetation out of packing approaches and the barn's drive yard. */
export function inVillageTradeReserve(point: { x: number; z: number }): boolean {
  return (point.x > 72 && point.x < 95 && point.z > -54 && point.z < -16)
    || VILLAGE_TRADE_STATIONS.some(station => Math.hypot(point.x - station.position.x, point.z - station.position.z) < 4.5);
}

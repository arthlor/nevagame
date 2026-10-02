/** Shared, renderer-free placement contract. Overrides are authored by Place mode. */
export interface InteractionPlacementPose { x: number; z: number; rotationY: number }

export const INTERACTION_PLACEMENT_OVERRIDES: Record<string, InteractionPlacementPose> = {
  "struct.trade_neva": { x: 57.9, z: -61.6, rotationY: 6.545 },
  "village_bulletin_board": { x: 44.9, z: -59.8, rotationY: 0 },
  "authored.sunreach.workbench": { x: 1278.7, z: 12.6, rotationY: 4.7124 },
  "authored.sunreach.hand-mill": { x: 1278.6, z: 15, rotationY: 4.7124 },
  "authored.sunreach.terrace-cistern": { x: 1252.1, z: 8.3, rotationY: 0 },
  "authored.sunreach.fish-table": { x: 1180.3, z: 60.5, rotationY: -0.2618 },
  "struct.trade_sunreach": { x: 1187.5, z: 60.3, rotationY: 6.0214 },
  "authored.sunreach.cove-market": { x: 1172.4, z: 56.1, rotationY: -6.2832 },
  "authored.mainland.highridge.market": { x: -344.9, z: -366.8, rotationY: 0.8961 },
  "struct.trade_highridge": { x: -334.9, z: -368.2, rotationY: 6.2832 },
  "authored.mainland.reedhaven.market": { x: -561.6, z: 335.2, rotationY: -0.5236 },
  "struct.trade_reedhaven": { x: -574.5, z: 329.2, rotationY: 7.854 },
  "authored.mainland.pinewatch.market": { x: -398.9, z: 57.9, rotationY: 2.0944 },
  "struct.trade_pinewatch": { x: -391, z: 43.3, rotationY: 4.7124 },
  "struct.starter_mill": { x: 66, z: -68.1, rotationY: -0.2618 },
};

/** A gameplay-bearing prefab cannot be copied/deleted as ordinary scenery. */
export const INTERACTION_PLACEMENTS: Readonly<Record<string, { stationId?: string; marketId?: string }>> = {
  "authored.mainland.pinewatch.market": { marketId: "market.pinewatch" },
  "authored.mainland.reedhaven.market": { marketId: "market.reedhaven" },
  "authored.mainland.highridge.market": { marketId: "market.highridge" },
  farmhouse: {}, well: {}, dock: {},
  "produce-stall": { marketId: "market.village" },
  "fish-market": { marketId: "market.harbor" },
  "struct.starter_mill": { stationId: "struct.starter_mill" },
  "struct.workbench": { stationId: "struct.workbench" },
  "struct.starter_compost": { stationId: "struct.starter_compost" },
  "struct.kitchen": { stationId: "struct.kitchen" },
  "struct.harbor_fish_table": { stationId: "struct.harbor_fish_table" },
  "authored.sunreach.hand-mill": { stationId: "struct.sunreach_hand_mill" },
  "authored.sunreach.workbench": { stationId: "struct.sunreach_workbench" },
  "authored.sunreach.fish-table": { stationId: "struct.sunreach_fish_table" },
  "struct.trade_neva": { stationId: "struct.trade_neva" },
  "struct.trade_pinewatch": { stationId: "struct.trade_pinewatch" },
  "struct.trade_reedhaven": { stationId: "struct.trade_reedhaven" },
  "struct.trade_highridge": { stationId: "struct.trade_highridge" },
  "struct.trade_sunreach": { stationId: "struct.trade_sunreach" },
  "landmark.cart_workshop": {},
  "authored.sunreach.cove-market": { marketId: "market.sunreach_cove" },
  "authored.sunreach.terrace-cistern": {},
  "authored.sunreach.cove-dock": {},
  "village_bulletin_board": {},
  "authored.arrival.village.firewood": {},
  "authored.arrival.village.rack": {},
  "authored.prop.net-rack.harbor": {},
  "authored.commons.basket": {},
  "authored.village.produce-crate": {},
  "authored.prop.crate.harbor": {},
  "authored.mainland.pinewatch.working-stock": {},
  "authored.mainland.reedhaven.working-stock": {},
  "authored.mainland.highridge.working-stock": {}
};

export function placementForStation(stationId: string): string | undefined {
  return Object.keys(INTERACTION_PLACEMENTS).find(id => INTERACTION_PLACEMENTS[id].stationId === stationId);
}

/** Getters retain the binding in consumers that keep a reference across editor moves. */
export function bindInteractionPose<T extends InteractionPlacementPose>(id: string, base: T, visualYawCorrection = 0): T {
  return {
    ...base,
    get x() { return INTERACTION_PLACEMENT_OVERRIDES[id]?.x ?? base.x; },
    get z() { return INTERACTION_PLACEMENT_OVERRIDES[id]?.z ?? base.z; },
    get rotationY() { return INTERACTION_PLACEMENT_OVERRIDES[id]
      ? INTERACTION_PLACEMENT_OVERRIDES[id].rotationY - visualYawCorrection : base.rotationY; }
  };
}

/** Attach an authored point (and optional facing) to the parent's translation and yaw. */
export function bindInteractionPoint<T extends { x: number; z: number; rotationY?: number }>(
  id: string, point: T, base: InteractionPlacementPose
): T {
  const resolve = () => {
    const pose = INTERACTION_PLACEMENT_OVERRIDES[id];
    if (!pose) return point;
    const angle = pose.rotationY - base.rotationY;
    const dx = point.x - base.x, dz = point.z - base.z;
    return { x: pose.x + dx * Math.cos(angle) + dz * Math.sin(angle),
      z: pose.z - dx * Math.sin(angle) + dz * Math.cos(angle) };
  };
  const result = {
    ...point,
    get x() { return resolve().x; },
    get z() { return resolve().z; },
  };
  if (point.rotationY !== undefined) Object.defineProperty(result, "rotationY", { enumerable: true,
    get: () => point.rotationY! + (INTERACTION_PLACEMENT_OVERRIDES[id]
      ? INTERACTION_PLACEMENT_OVERRIDES[id].rotationY - base.rotationY : 0) });
  return result;
}

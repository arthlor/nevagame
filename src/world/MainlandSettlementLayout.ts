import { MAINLAND_VILLAGES } from "./NevaMainland";
import type { WorldArchitecturePad } from "./WorldLayout";

/** Shared building footprints: terrain, cover, collision review and rendering read one layout. */
export const MAINLAND_SETTLEMENT_BUILDINGS = Object.values(MAINLAND_VILLAGES).flatMap((village) => {
  const marketOffset = village.id === "pinewatch" ? [-9, 3]
    : village.id === "reedhaven" ? [2, -10] : [-10, -8];
  const buildings = [
    { key: "market", assetId: "building_medieval_market_stall_a", dx: marketOffset[0], dz: marketOffset[1], halfX: 3.1, halfZ: 2.9 },
    { key: "west-house", assetId: "house_farmhouse_a", dx: village.id === "reedhaven" ? -32 : -22, dz: village.id === "reedhaven" ? -10 : -18, halfX: 4.5, halfZ: 4.6 },
    { key: "east-house", assetId: "house_cottage_a", dx: village.id === "highridge" ? 32 : 20, dz: -20, halfX: 4.3, halfZ: 2.9 },
    { key: "cottage", assetId: "building_thatched_cottage_a", dx: -23, dz: 16, halfX: 3.1, halfZ: 3.2 },
    { key: "work-shed", assetId: "prop_tool_shed_a", dx: village.id === "pinewatch" ? 30 : 22, dz: 16, halfX: 1.7, halfZ: 1.6 }
  ];
  return buildings.map((building) => {
    const center = { x: village.market.x + building.dx, z: village.market.z + building.dz };
    const pad: WorldArchitecturePad = {
      id: `mainland.${village.id}.${building.key}`,
      center,
      rotationY: Math.atan2(-building.dx, -building.dz),
      envelope: [building.halfX, building.halfZ],
      frontageClearanceMeters: building.key === "market" ? 4 : 3,
      frontApproachMeters: 3
    };
    return { villageId: village.id, assetId: building.assetId, pad };
  });
});

export const MAINLAND_ARCHITECTURE_PADS: readonly WorldArchitecturePad[] =
  MAINLAND_SETTLEMENT_BUILDINGS.map((building) => building.pad);

/** Signed distance to working space, rather than a bare circle around a village. */
export function mainlandSettlementClearanceAt(x: number, z: number): number {
  let distance = Infinity;
  for (const village of Object.values(MAINLAND_VILLAGES)) {
    distance = Math.min(distance,
      Math.hypot(x - village.market.x, z - village.market.z) - 7.5,
      Math.hypot(x - village.npc.x, z - village.npc.z) - 3.5,
      Math.hypot(x - village.market.x + 15, z - village.market.z + 7) - 3.5,
      Math.hypot(x - village.market.x - 15, z - village.market.z + 8) - 3.5,
      Math.hypot(x - village.market.x + 12, z - village.market.z - 6) - 2.5,
      Math.hypot(x - village.market.x - 20, z - village.market.z - 12) - 5);
    if ("landing" in village) distance = Math.min(distance,
      Math.hypot(x - village.landing.x, z - village.landing.z) - 8);
  }
  for (const { pad } of MAINLAND_SETTLEMENT_BUILDINGS) {
    const dx = x - pad.center.x, dz = z - pad.center.z;
    const localX = dx * Math.cos(pad.rotationY) - dz * Math.sin(pad.rotationY);
    const localZ = dx * Math.sin(pad.rotationY) + dz * Math.cos(pad.rotationY);
    // Preserve the doorway approach without excluding the entire back garden.
    const halfX = pad.envelope[0] + 1.2;
    const minimumZ = -pad.envelope[1] - 1.2;
    const maximumZ = pad.envelope[1] + pad.frontApproachMeters + 1.5;
    const outsideX = Math.abs(localX) - halfX;
    const outsideZ = Math.max(minimumZ - localZ, localZ - maximumZ);
    distance = Math.min(distance,
      Math.hypot(Math.max(0, outsideX), Math.max(0, outsideZ)) + Math.min(0, Math.max(outsideX, outsideZ)));
  }
  return distance;
}

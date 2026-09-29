import { collisionPrimitivesForAsset } from "../physics/CollisionCatalogAdapter";
import type { GameState } from "../simulation/core/types";
import { HARBOR_MAIN_PIER, harborMooringForBoatType } from "../world/WorldAnchors";
import { harborBoatAssetId, harborBoatIsClear } from "./migrateHarborDistrict67";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const MAIN_HARBOR_LAYOUT_REVISION = 37;

/** Project each hull box, not its circumscribed circle: alongside berths are intentionally close. */
export function mainHarborBoatIsClear(boat: GameState["boats"][string]): boolean {
  const pier = HARBOR_MAIN_PIER;
  return harborBoatIsClear(boat) && collisionPrimitivesForAsset(harborBoatAssetId(boat)).every(part => {
    const heading = boat.headingRadians, c = Math.cos(heading), s = Math.sin(heading);
    const x = boat.x + part.center[0] * c + part.center[2] * s;
    const z = boat.z - part.center[0] * s + part.center[2] * c;
    const yaw = heading + (part.yawDegrees ?? 0) * Math.PI / 180;
    const halfX = Math.abs(Math.cos(yaw)) * part.halfExtents[0] + Math.abs(Math.sin(yaw)) * part.halfExtents[2];
    const halfZ = Math.abs(Math.sin(yaw)) * part.halfExtents[0] + Math.abs(Math.cos(yaw)) * part.halfExtents[2];
    return Math.abs(x - pier.x) > halfX + pier.width / 2 + .15
      || Math.abs(z - pier.z) > halfZ + pier.length / 2 + .15;
  });
}

/** Retain ownership and cargo while reconciling old berths and newly obstructed water. */
export function migrateMainHarbor69(previous: GameState): GameState {
  const contains = (p: { x: number; z: number }) => p.x >= 32 && p.x <= 147 && p.z >= 28 && p.z <= 125;
  return recoverMainlandLayout(previous, 69, MAIN_HARBOR_LAYOUT_REVISION, {
    contains, boatIsClear: mainHarborBoatIsClear,
    reconcileBoats: state => {
      for (const boat of Object.values(state.boats)) {
        if (!(boat.isDocked && boat.dockedMarketId === "market.harbor")
          && !(contains(boat) && !mainHarborBoatIsClear(boat))) continue;
        const mooring = harborMooringForBoatType(boat.boatTypeId);
        const active = state.player.activeBoatId === boat.id;
        Object.assign(boat, mooring.boatPosition, { headingRadians: 0, speed: 0,
          isDocked: !active, dockedMarketId: active ? null : mooring.marketId });
        if (active) Object.assign(state.player, mooring.boatPosition, { y: .5, rotationY: 0 });
      }
    }
  });
}

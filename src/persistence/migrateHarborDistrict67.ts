import { collisionPrimitivesForAsset } from "../physics/CollisionCatalogAdapter";
import { boatAssetId } from "../render/assets/AssetCatalog";
import type { GameState } from "../simulation/core/types";
import { HARBOR_WORKING_PIERS, WORKING_PIER } from "../world/HarborDistrictLayout";
import { recoverMainlandLayout } from "./recoverMainlandLayout";

export const HARBOR_DISTRICT_LAYOUT_REVISION = 35;

/** Disjoint districts keep recovery on the original island and out of unrelated saves. */
export function inHarborRecoveryArea(point: { x: number; z: number }): boolean {
  return (point.x >= 32 && point.x <= 147 && point.z >= 28 && point.z <= 110)
    || (point.x >= 1128 && point.x <= 1210 && point.z >= 14 && point.z <= 110);
}

/** A conservative hull envelope also catches a bow under the new deck. */
export function harborBoatIsClear(boat: GameState["boats"][string]): boolean {
  const radius = collisionPrimitivesForAsset(boatAssetId(boat.boatTypeId)).reduce((maximum, part) => Math.max(maximum,
    Math.hypot(part.center[0], part.center[2]) + Math.hypot(part.halfExtents[0], part.halfExtents[2])), 0);
  return HARBOR_WORKING_PIERS.every(pier => {
    const dx = boat.x - pier.x, dz = boat.z - pier.z;
    const localX = dx * Math.cos(pier.rotationY) - dz * Math.sin(pier.rotationY);
    const localZ = dx * Math.sin(pier.rotationY) + dz * Math.cos(pier.rotationY);
    return Math.hypot(Math.max(0, Math.abs(localX) - WORKING_PIER.halfLength),
      Math.max(0, Math.abs(localZ) - WORKING_PIER.halfWidth)) > radius;
  });
}

/** Recover support/obstacles, preserving cargo, farms, economy, quest progress and RNG. */
export function migrateHarborDistrict67(previous: GameState): GameState {
  return recoverMainlandLayout(previous, 67, HARBOR_DISTRICT_LAYOUT_REVISION, {
    contains: inHarborRecoveryArea, boatIsClear: harborBoatIsClear
  });
}

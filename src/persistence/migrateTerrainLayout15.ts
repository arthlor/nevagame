import { Object3D } from "three";
import type { GameState } from "../simulation/core/types";
import { playerPoseFromMount } from "../simulation/mounts/Mounts";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../physics/StaticCollision";
import type { AssetId } from "../render/assets/AssetCatalog";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { WorldLayout } from "../world/WorldLayout";
import { groundPlayer, nearestPoint, validLand, clearReach, repairAnglerReach } from "./terrainMigrationSupport";

/**
 * Layout 15 gives mature trees and large boulders physical trunks and bodies.
 * Roughly 600 static boxes appear where the world previously let the player
 * walk through, so an existing save can legitimately be standing inside one.
 *
 * Only an actor found inside a new collider moves, and only to the nearest
 * valid support. World transactions, crops, cargo, contracts, progression and
 * fishing state pass through untouched; active fishing keeps its reach.
 */
export function migrateTerrainLayout15(previous: GameState): GameState {
  const collision = createWorldStaticPlacements(previous.worldSeed).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
  const clear = (point: { x: number; z: number }, mounted: boolean) =>
    staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), mounted ? 0.7 : 0.4);
  const neva = (point: { x: number; z: number }) => !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva";
  const state: GameState = { ...previous, schemaVersion: 36, player: { ...previous.player },
    boats: { ...previous.boats }, mounts: { ...previous.mounts }, world: { ...previous.world, layoutRevision: 15 } };
  for (const [id, mount] of Object.entries(previous.mounts)) {
    if (!neva(mount) || clear(mount, true)) continue;
    const point = nearestPoint(mount, (candidate) => validLand(candidate, true) && clear(candidate, true), mount);
    state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
  }
  if (!previous.player.activeBoatId && neva(previous.player)) {
    const mountId = previous.player.activeMountId;
    if (mountId && state.mounts[mountId] !== previous.mounts[mountId]) {
      Object.assign(state.player, playerPoseFromMount(state.mounts[mountId]));
      state.player.currentRegionId = WorldLayout.regionAt(state.player.x, state.player.z);
      state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    } else if (!mountId && !clear(previous.player, false)) {
      groundPlayer(state.player, nearestPoint(previous.player,
        (point) => validLand(point, false) && clear(point, false), previous.player));
    }
  }
  const movedPlayer = state.player.x !== previous.player.x || state.player.z !== previous.player.z;
  const basic = previous.basicFishing;
  if (basic) {
    const distance = basic.castDistanceMeters ?? 6.5;
    if (movedPlayer || !clearReach(state.player, previous.player.rotationY, distance)) {
      state.player.rotationY = repairAnglerReach(state, previous.player.rotationY, distance);
      const activeBoatId = state.player.activeBoatId;
      if (activeBoatId) {
        state.boats[activeBoatId] = { ...state.boats[activeBoatId], headingRadians: state.player.rotationY };
      }
    }
  }

  const sport = previous.sportFishing;
  if (sport?.dynamics) {
    const motion = sport.dynamics;
    const origin = { x: motion.originX, z: motion.originZ };
    const distance = Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - motion.depthMeters ** 2));
    if (movedPlayer || !clearReach(origin, motion.bearingRadians, distance)) {
      const bearing = repairAnglerReach(state, motion.bearingRadians, distance);
      const turn = bearing - motion.bearingRadians;
      state.sportFishing = {
        ...sport,
        dynamics: {
          ...motion,
          originX: state.player.x,
          originZ: state.player.z,
          bearingRadians: bearing,
          headingRadians: motion.headingRadians + turn
        }
      };
    }
  }

  return state;
}

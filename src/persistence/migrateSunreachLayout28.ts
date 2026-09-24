import { Object3D } from "three";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../physics/StaticCollision";
import type { AssetId } from "../render/assets/AssetCatalog";
import type { GameState } from "../simulation/core/types";
import { carriagePoseIsClear, isCarriage } from "../simulation/mounts/Carriage";
import { MOUNT_TUNING, playerPoseFromMount, isMountableTraversalPoint } from "../simulation/mounts/Mounts";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";
import { WorldLayout } from "../world/WorldLayout";
import { clearReach, groundPlayer, nearestPoint, type Point } from "./terrainMigrationSupport";

/** Layout revision produced by the Sunreach working-settlement pass. */
export const SUNREACH_LAYOUT_28_REVISION = 28;

const WALKING_NORMAL_Y = Math.cos(38 * Math.PI / 180);
const PLAYER_COLLISION_RADIUS = 0.4;
const MOUNT_COLLISION_RADIUS = 0.7;

/**
 * Re-grounds saved land poses after the Sunreach terrace profile, route
 * earthwork and authored colliders change. Supported X/Z coordinates remain
 * stable; only an unsafe actor moves, and then only to clear ground on the same
 * island. Crops and their farm-local coordinates are not touched.
 */
export function migrateSunreachLayout28(previous: GameState): GameState {
  const state = structuredClone(previous);
  if (previous.world.layoutRevision >= SUNREACH_LAYOUT_28_REVISION) return state;

  const collision = createWorldStaticPlacements(previous.worldSeed).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });

  const islandAt = (point: Point) => WorldLayout.isInterior(point.x, point.z)
    ? null
    : WorldLayout.terrainPatchAt(point.x, point.z)?.islandId ?? null;
  const onSunreach = (point: Point) => islandAt(point) === "island.sunreach";
  const supported = (point: Point, mounted: boolean) => {
    if (!onSunreach(point) || !WorldLayout.isWalkable(point.x, point.z)
      || WorldLayout.isWater(point.x, point.z)
      || (mounted && (WorldLayout.isPierDeck(point.x, point.z) || WorldLayout.isPierStairs(point.x, point.z)))) return false;
    const surface = WorldLayout.traversalSurfaceSample(point.x, point.z);
    return surface.height >= 0
      && surface.normal.y >= (mounted ? MOUNT_TUNING.maximumSlopeNormalY : WALKING_NORMAL_Y)
      && staticPoseIsClear(collision, point, surface.height, mounted ? MOUNT_COLLISION_RADIUS : PLAYER_COLLISION_RADIUS);
  };

  for (const [id, structure] of Object.entries(previous.world.structures)) {
    if (!onSunreach(structure)) continue;
    state.world.structures[id] = {
      ...structure,
      y: WorldLayout.terrainHeight(structure.x, structure.z)
    };
  }

  const fallback = SUNREACH_ANCHORS.dockPlayer;
  for (const [id, mount] of Object.entries(previous.mounts)) {
    if (!onSunreach(mount)) continue;
    const valid = (point: Point) => onSunreach(point) && (isCarriage(mount)
      ? carriagePoseIsClear({ ...mount, ...point }, collision)
      : isMountableTraversalPoint(point.x, point.z)
        && supported(point, true));
    const point = nearestPoint(mount, valid, fallback);
    state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
  }

  const previousPlayer = previous.player;
  const playerIsland = islandAt(previousPlayer);
  if (playerIsland === "island.sunreach" && !previousPlayer.activeBoatId) {
    const riddenMount = state.player.activeMountId ? state.mounts[state.player.activeMountId] : null;
    if (riddenMount && onSunreach(riddenMount)) {
      const movedMount = riddenMount.x !== previous.mounts[riddenMount.id]?.x
        || riddenMount.z !== previous.mounts[riddenMount.id]?.z;
      Object.assign(state.player, playerPoseFromMount(riddenMount));
      if (movedMount) state.player.currentRegionId = WorldLayout.regionAt(riddenMount.x, riddenMount.z);
      state.player.traversal = { ...previousPlayer.traversal, isGrounded: true };
    } else {
      const sport = previous.sportFishing;
      const distance = sport?.dynamics
        ? Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - sport.dynamics.depthMeters ** 2))
        : previous.basicFishing?.castDistanceMeters ?? 6.5;
      const bearing = sport?.dynamics?.bearingRadians ?? previousPlayer.rotationY;
      const ecology = WorldLayout.fishingEcologyAt(previousPlayer.x, previousPlayer.z).id;
      const fishing = Boolean(sport || previous.basicFishing);
      const valid = (point: Point) => supported(point, false)
        && (!fishing || (WorldLayout.fishingEcologyAt(point.x, point.z).id === ecology
          && clearReach(point, bearing, distance)));
      const point = nearestPoint(previousPlayer, valid, fallback);
      const moved = point.x !== previousPlayer.x || point.z !== previousPlayer.z;
      if (moved) groundPlayer(state.player, point);
      else {
        const y = WorldLayout.traversalSurfaceHeight(point.x, point.z)
          + MOUNT_TUNING.playerPoseGroundOffsetMeters;
        if (state.player.y !== y) {
          state.player.y = y;
          state.player.traversal = { ...previousPlayer.traversal, isGrounded: true };
        }
      }
      if (sport?.dynamics && moved) {
        state.sportFishing = {
          ...sport,
          dynamics: { ...sport.dynamics, originX: point.x, originZ: point.z }
        };
      }
    }
  }

  state.world.layoutRevision = SUNREACH_LAYOUT_28_REVISION;
  return state;
}

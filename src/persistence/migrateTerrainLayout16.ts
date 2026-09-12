import { Object3D } from "three";
import type { GameState } from "../simulation/core/types";
import { MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../physics/StaticCollision";
import type { AssetId } from "../render/assets/AssetCatalog";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { WorldLayout } from "../world/WorldLayout";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";
import { WORLD_SPAWN } from "../world/WorldAnchors";
import { clearReach, groundPlayer, nearestPoint, type Point } from "./terrainMigrationSupport";

/** Both islands gain broad relief; wet topology and economic destinations stay fixed. */
export function migrateTerrainLayout16(previous: GameState): GameState {
  const collision = createWorldStaticPlacements(previous.worldSeed).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
  const islandAt = (point: Point) => WorldLayout.isInterior(point.x, point.z)
    ? null : WorldLayout.terrainPatchAt(point.x, point.z)?.islandId;
  const supported = (point: Point, island: ReturnType<typeof islandAt>, mounted: boolean) => {
    if (!island || islandAt(point) !== island || !WorldLayout.isWalkable(point.x, point.z)
      || WorldLayout.isWater(point.x, point.z) || (mounted && WorldLayout.isPierDeck(point.x, point.z))) return false;
    const surface = WorldLayout.traversalSurfaceSample(point.x, point.z);
    return surface.height >= 0 && surface.normal.y >= (mounted ? MOUNT_TUNING.maximumSlopeNormalY : Math.cos(38 * Math.PI / 180))
      && staticPoseIsClear(collision, point, surface.height, mounted ? 0.7 : 0.4);
  };
  const fallback = (island: ReturnType<typeof islandAt>) => island === "island.sunreach"
    ? SUNREACH_ANCHORS.dockPlayer : WORLD_SPAWN.playerPosition;
  const state: GameState = {
    ...previous, schemaVersion: 38, player: { ...previous.player }, mounts: { ...previous.mounts },
    world: { ...previous.world, layoutRevision: 16, structures: { ...previous.world.structures } }
  };
  for (const [id, structure] of Object.entries(previous.world.structures)) {
    if (islandAt(structure)) state.world.structures[id] = {
      ...structure, y: WorldLayout.terrainHeight(structure.x, structure.z)
    };
  }
  for (const [id, mount] of Object.entries(previous.mounts)) {
    const island = islandAt(mount);
    if (!island) continue;
    const point = nearestPoint(mount, (candidate) => supported(candidate, island, true), fallback(island));
    state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
  }
  // A pose whose X/Z survives keeps its saved region: only a relocation may
  // remap it. The new relief can still change the height it stands at.
  const moved = (point: Point) => point.x !== previous.player.x || point.z !== previous.player.z;
  const island = islandAt(previous.player);
  if (island && !previous.player.activeBoatId) {
    const mount = state.player.activeMountId ? state.mounts[state.player.activeMountId] : null;
    if (mount) {
      Object.assign(state.player, playerPoseFromMount(mount));
      if (moved(mount)) state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
      state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    } else {
      const sport = previous.sportFishing;
      const distance = sport?.dynamics
        ? Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - sport.dynamics.depthMeters ** 2))
        : previous.basicFishing?.castDistanceMeters ?? 6.5;
      const bearing = sport?.dynamics?.bearingRadians ?? previous.player.rotationY;
      const fishing = Boolean(sport || previous.basicFishing);
      const ecology = WorldLayout.fishingEcologyAt(previous.player.x, previous.player.z).id;
      const valid = (point: Point) => supported(point, island, false)
        && (!fishing || (WorldLayout.fishingEcologyAt(point.x, point.z).id === ecology && clearReach(point, bearing, distance)));
      const point = nearestPoint(previous.player, valid, fallback(island));
      if (moved(point)) groundPlayer(state.player, point);
      else {
        const y = WorldLayout.traversalSurfaceHeight(point.x, point.z) + MOUNT_TUNING.playerPoseGroundOffsetMeters;
        if (state.player.y !== y) {
          state.player.y = y;
          state.player.traversal = { ...previous.player.traversal, isGrounded: true };
        }
      }
      if (sport?.dynamics && moved(point)) {
        state.sportFishing = { ...sport, dynamics: { ...sport.dynamics, originX: point.x, originZ: point.z } };
      }
    }
  }
  return state;
}

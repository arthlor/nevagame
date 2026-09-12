import { Object3D } from "three";
import type { GameState } from "../simulation/core/types";
import { isMountableTraversalPoint, MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../physics/StaticCollision";
import type { AssetId } from "../render/assets/AssetCatalog";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { COMPILED_WORLD_ROUTES, WORLD_ROUTE_JUNCTIONS, WorldLayout } from "../world/WorldLayout";
import { SUNREACH_ANCHORS } from "../world/WorldIslands";
import { clearReach, groundPlayer, nearestPoint, type Point } from "./terrainMigrationSupport";

function isSunreach(point: Point): boolean {
  return WorldLayout.terrainPatchAt(point.x, point.z)?.islandId === "island.sunreach";
}

function isNevaRoadEnd(point: Point): boolean {
  if (WorldLayout.isInterior(point.x, point.z)
    || WorldLayout.terrainPatchAt(point.x, point.z)?.islandId !== "island.neva") return false;
  return COMPILED_WORLD_ROUTES.some(({ route, samples, halfWidth, shoulderWidthMeters }) =>
    [samples[0], samples[samples.length - 1]].some((sample) =>
      !WorldLayout.isBridgeDeck(sample.point.x, sample.point.z)
      && Math.hypot(point.x - sample.point.x, point.z - sample.point.z) <= halfWidth + shoulderWidthMeters
      && !WORLD_ROUTE_JUNCTIONS.some((junction) => junction.routeIds.includes(route.id)
        && Math.hypot(sample.point.x - junction.center.x, sample.point.z - junction.center.z)
          <= junction.radiusMeters + junction.blendLengthMeters * 0.72)
    )
  );
}

/** Continuous shores and closed road caps change support, not water membership. */
export function migrateTerrainLayout17(previous: GameState): GameState {
  const state: GameState = {
    ...previous, schemaVersion: 39,
    world: { ...previous.world, layoutRevision: 17, structures: { ...previous.world.structures } }
  };
  for (const [id, structure] of Object.entries(previous.world.structures)) {
    if (isSunreach(structure)) state.world.structures[id] = {
      ...structure, y: WorldLayout.terrainHeight(structure.x, structure.z)
    };
  }
  // Closing the cap's missing triangle only adds road support. Keep Neva's
  // existing XZ poses and re-seat affected actors on that exact collider.
  const capMounts = Object.entries(previous.mounts).filter(([, mount]) => isNevaRoadEnd(mount));
  if (capMounts.length) state.mounts = { ...previous.mounts };
  for (const [id, mount] of capMounts) state.mounts[id] = {
    ...mount, y: WorldLayout.traversalSurfaceHeight(mount.x, mount.z)
  };
  const capMount = previous.player.activeMountId
    && capMounts.some(([id]) => id === previous.player.activeMountId)
    ? state.mounts[previous.player.activeMountId] : null;
  if (!previous.player.activeBoatId && (capMount || isNevaRoadEnd(previous.player))) {
    state.player = {
      ...previous.player,
      ...(capMount ? playerPoseFromMount(capMount) : {
        y: WorldLayout.traversalSurfaceHeight(previous.player.x, previous.player.z)
          + MOUNT_TUNING.playerPoseGroundOffsetMeters
      }),
      traversal: { ...previous.player.traversal, isGrounded: true }
    };
  }
  const mounts = Object.entries(previous.mounts).filter(([, mount]) => isSunreach(mount));
  const recoverPlayer = isSunreach(previous.player) && !previous.player.activeBoatId;
  if (!recoverPlayer && mounts.length === 0) return state;

  const collision = createWorldStaticPlacements(previous.worldSeed)
    .filter(isSunreach)
    .flatMap((placement) => {
      const root = new Object3D();
      root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      root.rotation.y = placement.rotationY;
      root.scale.set(...placement.scale);
      return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
    });
  const supported = (point: Point, mounted: boolean) => {
    if (!isSunreach(point) || !WorldLayout.isWalkable(point.x, point.z)
      || WorldLayout.isWater(point.x, point.z) || (mounted && !isMountableTraversalPoint(point.x, point.z))) return false;
    const surface = WorldLayout.traversalSurfaceSample(point.x, point.z);
    return surface.height >= 0
      && (mounted || surface.normal.y >= Math.cos(38 * Math.PI / 180))
      && staticPoseIsClear(collision, point, surface.height, mounted ? 0.7 : 0.4);
  };
  if (mounts.length) state.mounts = { ...state.mounts };
  for (const [id, mount] of mounts) {
    const point = nearestPoint(mount, (candidate) => supported(candidate, true), SUNREACH_ANCHORS.dockPlayer);
    state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
  }
  if (!recoverPlayer) return state;
  state.player = { ...previous.player };
  const moved = (point: Point) => point.x !== previous.player.x || point.z !== previous.player.z;
  const mount = previous.player.activeMountId ? state.mounts[previous.player.activeMountId] : null;
  if (mount) {
    Object.assign(state.player, playerPoseFromMount(mount));
    if (moved(mount)) state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
    state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    return state;
  }

  const sport = previous.sportFishing;
  const distance = sport?.dynamics
    ? Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - sport.dynamics.depthMeters ** 2))
    : previous.basicFishing?.castDistanceMeters ?? 6.5;
  const bearing = sport?.dynamics?.bearingRadians ?? previous.player.rotationY;
  const fishing = Boolean(sport || previous.basicFishing);
  const ecology = WorldLayout.fishingEcologyAt(previous.player.x, previous.player.z).id;
  const valid = (point: Point) => supported(point, false)
    && (!fishing || (WorldLayout.fishingEcologyAt(point.x, point.z).id === ecology && clearReach(point, bearing, distance)));
  const point = nearestPoint(previous.player, valid, SUNREACH_ANCHORS.dockPlayer);
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
  return state;
}

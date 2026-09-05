import type { GameState } from "../simulation/core/types";
import { MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { WORLD_SPAWN } from "../world/WorldAnchors";
import { defaultMooringForBoatType } from "../world/WorldMoorings";
import { WorldLayout } from "../world/WorldLayout";
import { validLand, nearestPoint, groundPlayer, clearReach, repairAnglerReach, type Point } from "./terrainMigrationSupport";
function isNevaPoint(point: { x: number; z: number }): boolean {
  return !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva";
}

/** Layout 12 migration: Neva 4-sided natural ocean coasts, expanded world bounds, trails. */
export function migrateTerrainLayout12(previous: GameState): GameState {
  const state: GameState = {
    ...previous,
    schemaVersion: 32,
    player: { ...previous.player },
    boats: { ...previous.boats },
    mounts: { ...previous.mounts },
    world: {
      ...previous.world,
      layoutRevision: 12,
      structures: { ...previous.world.structures },
      activeSchools: { ...previous.world.activeSchools }
    }
  };

  for (const [id, oldBoat] of Object.entries(previous.boats)) {
    if (oldBoat.isDocked || WorldLayout.isSailable(oldBoat.x, oldBoat.z)) continue;
    const mooring = defaultMooringForBoatType(oldBoat.boatTypeId);
    if (!WorldLayout.isSailable(mooring.boatPosition.x, mooring.boatPosition.z)) {
      throw new Error("Layout 12 migration has no safe compatible boat mooring");
    }
    const active = previous.player.activeBoatId === id;
    state.boats[id] = {
      ...oldBoat,
      ...mooring.boatPosition,
      speed: 0,
      isDocked: !active,
      dockedMarketId: active ? null : mooring.marketId
    };
    if (active) {
      Object.assign(state.player, mooring.boatPosition, {
        y: mooring.boatPosition.y + MOUNT_TUNING.playerPoseGroundOffsetMeters,
        rotationY: oldBoat.headingRadians,
        currentRegionId: WorldLayout.regionAt(mooring.boatPosition.x, mooring.boatPosition.z),
        traversal: { ...previous.player.traversal, isGrounded: true }
      });
    }
  }

  for (const [id, structure] of Object.entries(previous.world.structures)) {
    if (!isNevaPoint(structure)) continue;
    state.world.structures[id] = {
      ...structure,
      y: WorldLayout.terrainHeight(structure.x, structure.z)
    };
  }

  for (const [id, mount] of Object.entries(previous.mounts)) {
    if (!isNevaPoint(mount)) continue;
    const point = nearestPoint(mount, (candidate) => validLand(candidate, true), WORLD_SPAWN.playerPosition);
    state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
  }

  if (!state.player.activeBoatId && isNevaPoint(previous.player)) {
    const mount = state.player.activeMountId ? state.mounts[state.player.activeMountId] : null;
    if (mount) {
      Object.assign(state.player, playerPoseFromMount(mount));
      state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
      state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    } else {
      groundPlayer(state.player, nearestPoint(previous.player, (point) => validLand(point, false), WORLD_SPAWN.playerPosition));
    }
  }

  for (const [id, school] of Object.entries(previous.world.activeSchools)) {
    if (WorldLayout.isSailable(school.x, school.z)) continue;
    const valid = (point: Point) => isNevaPoint(point)
      && WorldLayout.isSailable(point.x, point.z)
      && WorldLayout.fishingHabitatAt(point.x, point.z) === school.habitatId
      && WorldLayout.fishingEcologyAt(point.x, point.z).id === school.ecologyId;
    const point = nearestPoint(
      { x: school.x, z: -105 },
      valid,
      { x: WorldLayout.riverCenterX(-105), z: -105 }
    );
    state.world.activeSchools[id] = { ...school, ...point };
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

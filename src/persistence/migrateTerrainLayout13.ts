import type { GameState } from "../simulation/core/types";
import { MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { HARBOR_MARKET_APRON } from "../world/WorldAnchors";
import { defaultMooringForBoatType } from "../world/WorldMoorings";
import { WorldLayout } from "../world/WorldLayout";
import { validLand, nearestPoint, groundPlayer, clearReach, repairAnglerReach, type Point } from "./terrainMigrationSupport";
import { harborCoastContains } from "../world/HarborCoast";
import { harborCoastCollisionProxies } from "../world/HarborCoastLayout";
import { createWorldEnvironmentLayout } from "../world/WorldEnvironmentLayout";
import { staticPoseIsClear } from "../physics/StaticCollision";

function isNevaPoint(point: { x: number; z: number }): boolean {
  return !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva";
}

/** Layout 13: repair poses affected by harbor beach, landing rebuild, and island-wide terrain elevation changes. */
export function migrateTerrainLayout13(previous: GameState): GameState {
  const collision = harborCoastCollisionProxies(createWorldEnvironmentLayout(previous.worldSeed).staticPlacements);
  const supported = (point: Point, mounted: boolean) => validLand(point, mounted)
    && staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), mounted ? 0.7 : 0.4);
  const state: GameState = {
    ...previous,
    schemaVersion: 33,
    player: { ...previous.player },
    boats: { ...previous.boats },
    mounts: { ...previous.mounts },
    world: {
      ...previous.world,
      layoutRevision: 13,
      structures: { ...previous.world.structures },
      activeSchools: { ...previous.world.activeSchools }
    }
  };

  for (const [id, oldBoat] of Object.entries(previous.boats)) {
    if ((oldBoat.isDocked && !harborCoastContains(oldBoat.x, oldBoat.z)) || WorldLayout.isSailable(oldBoat.x, oldBoat.z)) continue;
    const mooring = defaultMooringForBoatType(oldBoat.boatTypeId);
    if (!WorldLayout.isSailable(mooring.boatPosition.x, mooring.boatPosition.z)) {
      throw new Error("Layout 13 migration has no safe compatible boat mooring");
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
    if (supported(mount, true)) {
      state.mounts[id] = { ...mount, y: WorldLayout.traversalSurfaceHeight(mount.x, mount.z) };
    } else {
      const fallback = harborCoastContains(mount.x, mount.z) ? HARBOR_MARKET_APRON : { x: mount.x, z: mount.z };
      const point = nearestPoint(mount, (candidate) => supported(candidate, true), fallback);
      state.mounts[id] = { ...mount, ...point, y: WorldLayout.traversalSurfaceHeight(point.x, point.z) };
    }
  }

  if (!state.player.activeBoatId && isNevaPoint(previous.player)) {
    const mount = state.player.activeMountId ? state.mounts[state.player.activeMountId] : null;
    if (mount) {
      Object.assign(state.player, playerPoseFromMount(mount));
      state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
      state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    } else {
      if (supported(previous.player, false)) {
        groundPlayer(state.player, previous.player);
      } else {
        const fallback = harborCoastContains(previous.player.x, previous.player.z) ? HARBOR_MARKET_APRON : { x: previous.player.x, z: previous.player.z };
        groundPlayer(state.player, nearestPoint(previous.player, (point) => supported(point, false), fallback));
      }
    }
  }

  for (const [id, school] of Object.entries(previous.world.activeSchools)) {
    if (WorldLayout.isSailable(school.x, school.z)) continue;
    const valid = (point: Point) => WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva"
      && WorldLayout.isSailable(point.x, point.z)
      && WorldLayout.fishingHabitatAt(point.x, point.z) === school.habitatId
      && WorldLayout.fishingEcologyAt(point.x, point.z).id === school.ecologyId;
    const point = nearestPoint(
      { x: school.x, z: school.z },
      valid,
      { x: 104, z: 88 }
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

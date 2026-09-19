import { Object3D } from "three";
import { ContentRegistry } from "../content/ContentRegistry";
import { projectAssetCollision } from "../physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../physics/StaticCollision";
import type { AssetId } from "../render/assets/AssetCatalog";
import type { GameState } from "../simulation/core/types";
import { carriagePoseIsClear, isCarriage } from "../simulation/mounts/Carriage";
import { isMountableTraversalPoint, MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { WORLD_SPAWN } from "../world/WorldAnchors";
import { createWorldStaticPlacements } from "../world/WorldEnvironmentLayout";
import { FISHING_ECOLOGY_DEFINITIONS, type FishingEcologyId } from "../world/WorldIslands";
import { RIVER_FISHING_ACCESS_RESERVES, WorldLayout } from "../world/WorldLayout";
import { BOAT_MOORINGS } from "../world/WorldMoorings";
import { clearReach, groundPlayer, nearestPoint } from "./terrainMigrationSupport";

/**
 * Shared recovery for mainland layout revisions. Coordinates are never scaled:
 * crops stay farm-local and supported actors retain their X/Z. The independent
 * candidate leaves the original slot available if recovery cannot succeed.
 */
export function recoverMainlandLayout(previous: GameState, schemaVersion: number, layoutRevision: number): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = schemaVersion;
  if (previous.world.layoutRevision >= layoutRevision) return state;
  ContentRegistry.initializeAndValidate();
  const collision = createWorldStaticPlacements(state.worldSeed).flatMap((placement) => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
  const neva = (point: { x: number; z: number }) => !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.islandId === "island.neva";
  const supported = (point: { x: number; z: number }) => neva(point)
    && WorldLayout.isWalkable(point.x, point.z) && !WorldLayout.isWater(point.x, point.z)
    && WorldLayout.traversalSurfaceSample(point.x, point.z).normal.y >= Math.cos(38 * Math.PI / 180);
  const clearPlayer = (point: { x: number; z: number }) => supported(point)
    && staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), 0.4);

  for (const boat of Object.values(state.boats)) {
    if (WorldLayout.isSailable(boat.x, boat.z)) continue;
    const moorings = BOAT_MOORINGS.filter((mooring) =>
      (!mooring.boatTypeIds || mooring.boatTypeIds.includes(boat.boatTypeId))
      && WorldLayout.isSailable(mooring.boatPosition.x, mooring.boatPosition.z)
      && (!WorldLayout.navigationRequirementAt(mooring.boatPosition.x, mooring.boatPosition.z)
        || WorldLayout.navigationRequirementAt(mooring.boatPosition.x, mooring.boatPosition.z)!.requiredBoatTypeId === boat.boatTypeId)
    ).sort((a, b) => Math.hypot(a.boatPosition.x - boat.x, a.boatPosition.z - boat.z)
      - Math.hypot(b.boatPosition.x - boat.x, b.boatPosition.z - boat.z));
    const mooring = moorings.find((candidate) => boat.isDocked && candidate.marketId === boat.dockedMarketId) ?? moorings[0];
    if (!mooring) throw new Error("Mainland migration has no safe compatible boat mooring");
    const active = state.player.activeBoatId === boat.id;
    Object.assign(boat, mooring.boatPosition, {
      y: 0, speed: 0, isDocked: !active, dockedMarketId: active ? null : mooring.marketId
    });
    if (active) {
      Object.assign(state.player, mooring.boatPosition, { y: 0.5, rotationY: boat.headingRadians });
      state.player.currentRegionId = WorldLayout.regionAt(boat.x, boat.z);
    }
  }

  for (const mount of Object.values(state.mounts)) {
    if (!neva(mount)) continue;
    const valid = (point: { x: number; z: number }) => neva(point) && (isCarriage(mount)
      ? carriagePoseIsClear({ ...mount, ...point }, collision)
      : isMountableTraversalPoint(point.x, point.z)
        && staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), 0.7));
    const point = nearestPoint(mount, valid, WORLD_SPAWN.playerPosition);
    const support = WorldLayout.traversalSurfaceHeight(point.x, point.z);
    // A retained valid pose can differ slightly from today's interpolated
    // heightfield. Preserve it within the canonical mount support tolerance.
    const y = point.x === mount.x && point.z === mount.z
      && Math.abs(mount.y - support) <= MOUNT_TUNING.terrainHeightToleranceMeters ? mount.y : support;
    Object.assign(mount, point, { y });
  }

  if (!state.player.activeBoatId && neva(state.player)) {
    const mount = state.player.activeMountId ? state.mounts[state.player.activeMountId] : null;
    if (mount) {
      Object.assign(state.player, playerPoseFromMount(mount));
      state.player.currentRegionId = WorldLayout.regionAt(mount.x, mount.z);
      state.player.traversal.isGrounded = true;
    } else {
      groundPlayer(state.player, nearestPoint(state.player, clearPlayer, WORLD_SPAWN.playerPosition));
    }
  }

  for (const structure of Object.values(state.world.structures)) {
    if (!neva(structure)) continue;
    // Authored work pads stay in place; arbitrary legacy structures on newly
    // wet/steep ground recover deterministically without changing their IDs.
    const point = nearestPoint(structure, supported, WORLD_SPAWN.playerPosition);
    Object.assign(structure, point, { y: WorldLayout.terrainHeight(point.x, point.z) });
  }

  for (const school of Object.values(state.world.activeSchools)) {
    const valid = (point: { x: number; z: number }) => WorldLayout.isSailable(point.x, point.z)
      && WorldLayout.fishingHabitatAt(point.x, point.z) === school.habitatId
      && WorldLayout.fishingEcologyAt(point.x, point.z).id === school.ecologyId;
    if (valid(school)) continue;
    const refuges = FISHING_ECOLOGY_DEFINITIONS[school.ecologyId].schoolSpawnPoints
      .filter((point) => point.habitatId === school.habitatId && valid(point))
      .sort((a, b) => Math.hypot(a.x - school.x, a.z - school.z) - Math.hypot(b.x - school.x, b.z - school.z));
    const refuge = refuges[0];
    if (!refuge) throw new Error(`Mainland migration has no compatible water for school ${school.id}`);
    school.x = refuge.x;
    school.z = refuge.z;
  }

  // Preserve the hooked water, not merely a wet endpoint. A coastline reshape
  // must not turn an offshore fish into a river encounter or change ecology.
  const repairReach = (preferred: number, distance: number, ecology: FishingEcologyId, habitats: readonly string[]): number => {
    const boat = state.player.activeBoatId ? state.boats[state.player.activeBoatId] : null;
    const compatible = (point: { x: number; z: number }) => WorldLayout.isSailable(point.x, point.z)
      && WorldLayout.fishingEcologyAt(point.x, point.z).id === ecology
      && habitats.includes(WorldLayout.fishingHabitatAt(point.x, point.z) ?? "");
    const bearingAt = (point: { x: number; z: number }): number | null => {
      for (let turn = 0; turn < 24; turn++) {
        const bearing = preferred + (turn % 2 ? 1 : -1) * Math.ceil(turn / 2) * Math.PI / 12;
        const endpoint = { x: point.x + Math.sin(bearing) * distance, z: point.z + Math.cos(bearing) * distance };
        if (compatible(endpoint) && clearReach(point, bearing, distance)) return bearing;
      }
      return null;
    };
    const current = bearingAt(state.player);
    if (current !== null) return current;
    const refuges = boat
      ? [...FISHING_ECOLOGY_DEFINITIONS[ecology].schoolSpawnPoints.filter((point) => habitats.includes(point.habitatId)),
        ...BOAT_MOORINGS.map((mooring) => mooring.boatPosition)]
      : [...RIVER_FISHING_ACCESS_RESERVES.map((reserve) => {
        const section = WorldLayout.riverSectionAt(reserve.z);
        const left = reserve.side === "left";
        return { x: section.centerX + (left ? -1 : 1) * ((left ? section.leftWaterWidth : section.rightWaterWidth) + 2), z: reserve.z };
      }), ...BOAT_MOORINGS.map((mooring) => mooring.playerPosition)];
    refuges.sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z)
      - Math.hypot(b.x - state.player.x, b.z - state.player.z));
    for (const point of refuges) {
      if (boat) {
        const requirement = WorldLayout.navigationRequirementAt(point.x, point.z);
        if (!compatible(point) || (requirement && requirement.requiredBoatTypeId !== boat.boatTypeId)) continue;
      } else if (!WorldLayout.isWalkable(point.x, point.z) || WorldLayout.isWater(point.x, point.z)
        || !staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), 0.4)) continue;
      const bearing = bearingAt(point);
      if (bearing === null) continue;
      if (boat) {
        Object.assign(boat, { x: point.x, z: point.z, y: 0, speed: 0, isDocked: false, dockedMarketId: null });
        Object.assign(state.player, { x: point.x, z: point.z, y: 0.5, currentRegionId: WorldLayout.regionAt(point.x, point.z) });
      } else groundPlayer(state.player, point);
      return bearing;
    }
    throw new Error("Mainland migration could not preserve the active fishing habitat and reach");
  };
  if (state.basicFishing) {
    const forward = state.basicFishing.castDistanceMeters ?? 6.5;
    const lateral = state.basicFishing.castLateralDriftMeters ?? 0;
    const windAngle = Math.atan2(lateral, forward);
    const bearing = state.player.rotationY + windAngle;
    const distance = Math.hypot(forward, lateral);
    state.player.rotationY = repairReach(bearing, distance, state.basicFishing.ecologyId, [state.basicFishing.habitatId]) - windAngle;
    if (state.player.activeBoatId) state.boats[state.player.activeBoatId].headingRadians = state.player.rotationY;
  }
  const sport = state.sportFishing;
  // A won catch belongs to the pending keep/release choice. It no longer needs
  // a water endpoint, and relocating it must not reopen the completed fight.
  if (sport?.result === "active" && sport.dynamics) {
    const motion = sport.dynamics;
    const distance = Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - motion.depthMeters ** 2));
    const species = ContentRegistry.fishSpecies.get(sport.fish.speciesId);
    const habitats = sport.fish.habitatId ? [sport.fish.habitatId] : species?.habitats ?? [];
    const ecology = sport.fish.ecologyId ?? WorldLayout.fishingEcologyAt(previous.player.x, previous.player.z).id;
    const endpoint = { x: motion.originX + Math.sin(motion.bearingRadians) * distance,
      z: motion.originZ + Math.cos(motion.bearingRadians) * distance };
    const unchangedReach = state.player.x === previous.player.x && state.player.z === previous.player.z
      && clearReach({ x: motion.originX, z: motion.originZ }, motion.bearingRadians, distance)
      && WorldLayout.fishingEcologyAt(endpoint.x, endpoint.z).id === ecology
      && habitats.includes(WorldLayout.fishingHabitatAt(endpoint.x, endpoint.z) ?? "");
    if (!unchangedReach) {
      const bearing = repairReach(motion.bearingRadians, distance, ecology, habitats);
      motion.headingRadians += bearing - motion.bearingRadians;
      motion.bearingRadians = bearing;
      motion.originX = state.player.x;
      motion.originZ = state.player.z;
    }
  }
  state.world.layoutRevision = layoutRevision;
  return state;
}

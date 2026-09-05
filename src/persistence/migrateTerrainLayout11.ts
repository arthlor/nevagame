import type { GameState } from "../simulation/core/types";
import { findFishingWater, fishingEndpoint } from "../simulation/fishing/FishingTuning";
import { MOUNT_TUNING, playerPoseFromMount } from "../simulation/mounts/Mounts";
import { HARBOR_DOCK, WORLD_SPAWN } from "../world/WorldAnchors";
import { defaultMooringForBoatType } from "../world/WorldMoorings";
import { RIVER_FISHING_ACCESS_RESERVES, WorldLayout } from "../world/WorldLayout";

interface Point { x: number; z: number; }

// Frozen boundary of the layout-10 -> 11 topology change, not live river tuning.
const LAST_UNCHANGED_RIVER_Z = -116;
const WALKING_NORMAL_Y = Math.cos(38 * Math.PI / 180);

function isNevaPoint(point: Point): boolean {
  return !WorldLayout.isInterior(point.x, point.z)
    && WorldLayout.terrainPatchAt(point.x, point.z)?.id === "terrain.neva";
}

function isChangedHeadwater(point: Point): boolean {
  return isNevaPoint(point) && point.z < LAST_UNCHANGED_RIVER_Z;
}

function validLand(point: Point, mounted: boolean): boolean {
  if (!isNevaPoint(point) || !WorldLayout.isWalkable(point.x, point.z)
    || WorldLayout.isWater(point.x, point.z)
    || (mounted && WorldLayout.isPierDeck(point.x, point.z))) return false;
  const support = WorldLayout.traversalSurfaceSample(point.x, point.z);
  // The water elevation profile extends across dry mesh padding; only the
  // canonical wet footprint can invalidate otherwise supported dry land.
  return support.normal.y >= (mounted ? MOUNT_TUNING.maximumSlopeNormalY : WALKING_NORMAL_Y);
}

function nearestPoint(
  origin: Point,
  valid: (point: Point) => boolean,
  fallback: Point
): Point {
  if (valid(origin)) return { ...origin };
  for (let radius = 0.5; radius <= 72; radius += 0.5) {
    const steps = Math.max(16, Math.ceil(radius * 5));
    for (let step = 0; step < steps; step++) {
      const angle = step / steps * Math.PI * 2;
      const point = { x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius };
      if (valid(point)) return point;
    }
  }
  if (valid(fallback)) return { ...fallback };
  throw new Error("Layout 11 migration could not find safe Neva support");
}

function groundPlayer(player: GameState["player"], point: Point): void {
  player.x = point.x;
  player.z = point.z;
  player.y = WorldLayout.traversalSurfaceHeight(point.x, point.z) + MOUNT_TUNING.playerPoseGroundOffsetMeters;
  player.traversal = { ...player.traversal, isGrounded: true };
  player.currentRegionId = WorldLayout.regionAt(point.x, point.z);
}

function clearReach(origin: Point, bearing: number, distance: number): boolean {
  const wetAt = (along: number) => WorldLayout.isSailable(
    origin.x + Math.sin(bearing) * along,
    origin.z + Math.cos(bearing) * along
  );
  if (!wetAt(distance)) return false;
  let entered = false;
  for (let along = 0.5; along <= distance; along += 0.5) {
    const wet = wetAt(along);
    if ((!wet && entered) || (!wet && along > 12)) return false;
    entered ||= wet;
  }
  return true;
}

function fullReachBearing(origin: Point, bearing: number, distance: number): number | null {
  if (clearReach(origin, bearing, distance)) return bearing;
  const water = findFishingWater(origin.x, origin.z, bearing, distance, (x, z) => WorldLayout.isSailable(x, z));
  // Shortening a nearly landed fish could grant a catch during restore. Keep
  // the exact range, depth and spool; relocate the angler if necessary instead.
  return water && Math.abs(water.distance - distance) < 1e-8
    && clearReach(origin, water.bearing, distance) ? water.bearing : null;
}

function fishingRefuges(): Point[] {
  return [
    ...RIVER_FISHING_ACCESS_RESERVES.map((reserve) => {
      const section = WorldLayout.riverSectionAt(reserve.z);
      const direction = reserve.side === "left" ? -1 : 1;
      const width = reserve.side === "left" ? section.leftWaterWidth : section.rightWaterWidth;
      return { x: section.centerX + direction * (width + 2), z: reserve.z };
    }),
    HARBOR_DOCK.playerPosition
  ];
}

function repairAnglerReach(
  state: GameState,
  preferredBearing: number,
  distance: number
): number {
  const currentBearing = fullReachBearing(state.player, preferredBearing, distance);
  if (currentBearing !== null) return currentBearing;
  // An unaffected vessel cannot be moved just to improve a fishing line. An
  // invalidated vessel has already moved to its safe, open-water mooring.
  if (!state.player.activeBoatId) {
    for (const point of fishingRefuges()) {
      if (!validLand(point, false)) continue;
      const bearing = fullReachBearing(point, preferredBearing, distance);
      if (bearing === null) continue;
      groundPlayer(state.player, point);
      return bearing;
    }
  }
  throw new Error("Layout 11 migration could not preserve the active fishing reach");
}

/** One version-gated spatial repair; no economy, clock, catch or RNG advances. */
export function migrateTerrainLayout11(previous: GameState): GameState {
  const state: GameState = {
    ...previous,
    schemaVersion: 31,
    player: { ...previous.player },
    boats: { ...previous.boats },
    mounts: { ...previous.mounts },
    world: {
      ...previous.world,
      layoutRevision: 11,
      structures: { ...previous.world.structures },
      activeSchools: { ...previous.world.activeSchools }
    }
  };

  for (const [id, oldBoat] of Object.entries(previous.boats)) {
    if (!isChangedHeadwater(oldBoat) || WorldLayout.isSailable(oldBoat.x, oldBoat.z)) continue;
    const mooring = defaultMooringForBoatType(oldBoat.boatTypeId);
    if (!WorldLayout.isSailable(mooring.boatPosition.x, mooring.boatPosition.z)) {
      throw new Error("Layout 11 migration has no safe compatible boat mooring");
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
    if (!isChangedHeadwater(school) || WorldLayout.isSailable(school.x, school.z)) continue;
    const valid = (point: Point) => point.z >= LAST_UNCHANGED_RIVER_Z && isNevaPoint(point)
      && WorldLayout.isSailable(point.x, point.z)
      && WorldLayout.fishingHabitatAt(point.x, point.z) === school.habitatId
      && WorldLayout.fishingEcologyAt(point.x, point.z).id === school.ecologyId;
    const point = nearestPoint(
      { x: school.x, z: LAST_UNCHANGED_RIVER_Z + 4 },
      valid,
      { x: WorldLayout.riverCenterX(-105), z: -105 }
    );
    state.world.activeSchools[id] = { ...school, ...point };
  }

  const movedPlayer = state.player.x !== previous.player.x || state.player.z !== previous.player.z;
  const basic = previous.basicFishing;
  if (basic) {
    const distance = basic.castDistanceMeters ?? 6.5;
    const target = {
      x: previous.player.x + Math.sin(previous.player.rotationY) * distance,
      z: previous.player.z + Math.cos(previous.player.rotationY) * distance
    };
    if (movedPlayer || ((isChangedHeadwater(previous.player) || isChangedHeadwater(target))
      && !clearReach(state.player, previous.player.rotationY, distance))) {
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
    const endpoint = fishingEndpoint(sport);
    const distance = Math.sqrt(Math.max(0, sport.distanceMeters ** 2 - motion.depthMeters ** 2));
    if (movedPlayer || ((isChangedHeadwater(origin) || isChangedHeadwater(endpoint))
      && !clearReach(origin, motion.bearingRadians, distance))) {
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

import type { GameState } from "../simulation/core/types";
import { playerPoseFromMount } from "../simulation/mounts/Mounts";
import { WorldLayout } from "../world/WorldLayout";
import { allocateCommonsCrops } from "./commonsCropPlacement";
import { groundPlayer, type Point } from "./terrainMigrationSupport";

/** The former compatibility plot beside the village market. */
const LEGACY_COMMONS_ORIGIN = { x: 60, z: -60 } as const;

/**
 * Frozen layout-18 Commons pose and bounds. Historical migrations must not read
 * future layout data, so the relocated plot is pinned as literals rather than
 * re-derived from the live `PLAYER_HOMESTEAD_LAYOUT`.
 */
const LAYOUT_18_COMMONS_ORIGIN = { x: 74, z: -75 } as const;
const LAYOUT_18_COMMONS_BOUNDS = { minX: -2, maxX: 19, minZ: -7, maxZ: 5 } as const;

/** Frozen layout-18 beds. Historical migrations must not read future layout data. */
const LAYOUT_18_COMMONS_BEDS = [
  { minX: 1, maxX: 5, minZ: -5, maxZ: -1 },
  { minX: 6.5, maxX: 10.5, minZ: -5, maxZ: -1 },
  { minX: 12, maxX: 16, minZ: -5, maxZ: -1 }
] as const;

function wasInLegacyCommons(point: Point): boolean {
  return Math.hypot(
    (point.x - LEGACY_COMMONS_ORIGIN.x) / 11,
    (point.z - LEGACY_COMMONS_ORIGIN.z) / 10
  ) <= 1;
}

/**
 * Layout 18 moves the public Commons out of the market courtyard and gives it
 * three authored beds. Crop coordinates are farm-local, so old records need
 * to be placed into the new beds before the origin changes under them.
 */
export function migrateTerrainLayout18(previous: GameState): GameState {
  const state: GameState = {
    ...previous,
    schemaVersion: 40,
    player: { ...previous.player },
    farms: { ...previous.farms },
    crops: { ...previous.crops },
    mounts: { ...previous.mounts },
    world: {
      ...previous.world,
      layoutRevision: 18,
      structures: { ...previous.world.structures }
    }
  };

  const commonsId = "farm.player_homestead";
  const oldFarm = previous.farms[commonsId];
  if (oldFarm) {
    state.farms[commonsId] = {
      ...oldFarm,
      widthMeters: LAYOUT_18_COMMONS_BOUNDS.maxX - LAYOUT_18_COMMONS_BOUNDS.minX,
      depthMeters: LAYOUT_18_COMMONS_BOUNDS.maxZ - LAYOUT_18_COMMONS_BOUNDS.minZ
    };
  }

  const cropIds = oldFarm?.placedCropIds ?? [];
  // The old field was one broad rectangle. Allocate every retained record a
  // distinct, footprint-valid spot instead of `index % beds`, which stacked a
  // fourth crop on the first and could drop a legacy tree outside its bed.
  const placements = allocateCommonsCrops(cropIds, previous.crops, LAYOUT_18_COMMONS_BEDS);
  for (const [cropId, position] of Object.entries(placements)) {
    const crop = previous.crops[cropId];
    if (!crop) continue;
    state.crops[cropId] = { ...crop, ...position };
  }

  let movedStructureIndex = 0;
  for (const [id, structure] of Object.entries(previous.world.structures)) {
    if (!wasInLegacyCommons(structure)) continue;
    const x = LAYOUT_18_COMMONS_ORIGIN.x + 2 + movedStructureIndex * 3;
    const z = LAYOUT_18_COMMONS_ORIGIN.z + 2;
    state.world.structures[id] = {
      ...structure,
      x,
      y: WorldLayout.terrainHeight(x, z),
      z
    };
    movedStructureIndex += 1;
  }

  let movedMount: GameState["mounts"][string] | undefined;
  let movedMountIndex = 0;
  for (const [id, mount] of Object.entries(previous.mounts)) {
    if (!wasInLegacyCommons(mount)) continue;
    const point = {
      x: LAYOUT_18_COMMONS_ORIGIN.x + 3 + movedMountIndex * 2.5,
      z: LAYOUT_18_COMMONS_ORIGIN.z + 2.5
    };
    state.mounts[id] = {
      ...mount,
      ...point,
      y: WorldLayout.traversalSurfaceHeight(point.x, point.z)
    };
    if (id === previous.player.activeMountId) movedMount = state.mounts[id];
    movedMountIndex += 1;
  }

  if (!previous.player.activeBoatId) {
    if (movedMount) {
      Object.assign(state.player, playerPoseFromMount(movedMount));
      state.player.currentRegionId = WorldLayout.regionAt(movedMount.x, movedMount.z);
      state.player.traversal = { ...previous.player.traversal, isGrounded: true };
    } else if (wasInLegacyCommons(previous.player)) {
      groundPlayer(state.player, LAYOUT_18_COMMONS_ORIGIN);
    }
  }

  return state;
}

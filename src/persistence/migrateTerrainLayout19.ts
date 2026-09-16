import type { GameState } from "../simulation/core/types";
import { allocateCommonsCrops } from "./commonsCropPlacement";

/**
 * Frozen layout-19 Commons pose, bounds and clearing rectangles. Historical
 * migrations must not read future layout data, so these are pinned as literals
 * rather than re-derived from the live `PLAYER_HOMESTEAD_LAYOUT`.
 */
const LAYOUT_19_COMMONS_BOUNDS = { minX: -2, maxX: 19, minZ: -7, maxZ: 5 } as const;
const LAYOUT_19_COMMONS_CLEARINGS = [
  { minX: 2, maxX: 4, minZ: -4, maxZ: -2 },
  { minX: 6.6, maxX: 10.4, minZ: -4.9, maxZ: -1.1 },
  { minX: 13, maxX: 15, minZ: -4, maxZ: -2 }
] as const;

/**
 * Layout 19 keeps the relocated Commons entrance but changes its authored
 * presentation from three full beds to two beds with three clearings. Any
 * v40 crop may have been placed anywhere in the former beds, so normalize its
 * local position into a distinct clearing while preserving its ID and all
 * growth, moisture, health, and quality state.
 */
export function migrateTerrainLayout19(previous: GameState): GameState {
  const state: GameState = {
    ...previous,
    schemaVersion: 41,
    farms: { ...previous.farms },
    crops: { ...previous.crops },
    world: {
      ...previous.world,
      layoutRevision: 19,
      structures: { ...previous.world.structures }
    }
  };

  const commonsId = "farm.player_homestead";
  const oldFarm = previous.farms[commonsId];
  const newFarm = state.farms[commonsId];
  if (!oldFarm || !newFarm) return state;

  state.farms[commonsId] = {
    ...newFarm,
    widthMeters: LAYOUT_19_COMMONS_BOUNDS.maxX - LAYOUT_19_COMMONS_BOUNDS.minX,
    depthMeters: LAYOUT_19_COMMONS_BOUNDS.maxZ - LAYOUT_19_COMMONS_BOUNDS.minZ
  };

  // Allocate every retained record a distinct, footprint-valid clearing slot.
  // `index % clearings` stacked a fourth crop on the first and could place a
  // legacy tree (2.5m) outside a 2x2 clearing.
  const placements = allocateCommonsCrops(
    oldFarm.placedCropIds,
    previous.crops,
    LAYOUT_19_COMMONS_CLEARINGS
  );
  for (const [cropId, position] of Object.entries(placements)) {
    const crop = previous.crops[cropId];
    if (!crop) continue;
    state.crops[cropId] = { ...crop, ...position };
  }

  return state;
}

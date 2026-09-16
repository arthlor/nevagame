import type { GameState } from "../simulation/core/types";
import { WorldLayout } from "../world/WorldLayout";
import { WORLD_STATION_DEFINITIONS } from "../world/WorldGameplayLocations";

const KITCHEN_ID = "struct.kitchen";
const MEAL_RECIPE_IDS = new Set([
  "recipe.cook_harvest_bowl",
  "recipe.cook_fish_stew",
  "recipe.cook_orchard_tart"
]);

/**
 * v44 -> v45. Authors the farm kitchen (`struct.kitchen`, `stationType:
 * "kitchen") in the yard pocket southeast of the farmhouse and moves meal
 * recipes off the workbench. Existing saves gain the structure, the starter
 * farm gains the placement, and any in-flight meal job at the workbench
 * follows its recipe to the kitchen so the shipping validator (`station.type
 * === recipe.stationType`) keeps passing. The kitchen never shipped at its
 * provisional work-trail pose, so the canonical farmhouse pose always wins.
 */
export function migrateKitchen45(previous: GameState): GameState {
  const state = structuredClone(previous);
  state.schemaVersion = 45;
  const kitchen = WORLD_STATION_DEFINITIONS[KITCHEN_ID];
  if (kitchen) {
    state.world.structures[KITCHEN_ID] = {
      id: KITCHEN_ID,
      type: "kitchen",
      x: kitchen.position.x,
      y: WorldLayout.terrainHeight(kitchen.position.x, kitchen.position.z),
      z: kitchen.position.z,
      rotationY: kitchen.rotationY
    };
  }
  const starterFarm = state.farms["farm.starter_garden"];
  if (starterFarm && !starterFarm.placedStructureIds.includes(KITCHEN_ID)) {
    starterFarm.placedStructureIds = [...starterFarm.placedStructureIds, KITCHEN_ID];
  }
  for (const job of Object.values(state.processingJobs ?? {})) {
    if (MEAL_RECIPE_IDS.has(job.recipeId) && job.stationId !== KITCHEN_ID) {
      job.stationId = KITCHEN_ID;
    }
  }
  return state;
}

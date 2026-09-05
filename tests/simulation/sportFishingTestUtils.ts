import { expect } from "vitest";
import type { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";

/** Hook a lake trout on a fresh save: willow rod, empty carry, chummed school. */
export function hookLakeTroutForTest(sim: Simulation): void {
  const lake = SCHOOL_SPAWN_POINTS.find(
    (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
  )!;
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
  const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
  sim.state.player.x = lake.x;
  sim.state.player.z = lake.z;
  expect(sim.chumFishSchool(schoolId).success).toBe(true);
  const hook = sim.hookSportFish(schoolId);
  expect(hook.success).toBe(true);
  expect(sim.state.sportFishing?.fish.speciesId).toBe("fish.trout");
}

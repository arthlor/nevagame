import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WorldLayout } from "../../src/world/WorldLayout";
import { armLureForTest } from "./sportFishingTestUtils";

// The western shoreline from the original island layout is now inland after
// Neva's coast envelope expanded. Keep this gameplay check on the supported
// southwest shoreline authored by the current coast loop.
const NEVA_SOUTHWEST_COAST = Object.freeze({ x: -184, z: 89 });

function simulationAtNevaSouthwestCoast(): Simulation {
  const simulation = new Simulation();
  simulation.state.player.x = NEVA_SOUTHWEST_COAST.x;
  simulation.state.player.z = NEVA_SOUTHWEST_COAST.z;
  return simulation;
}

describe("closed-coast fishing gameplay callers", () => {
  it("lets water reading and basic casting use the supported Neva shore target", () => {
    const simulation = simulationAtNevaSouthwestCoast();
    const access = WorldLayout.fishingAccessAt(NEVA_SOUTHWEST_COAST.x, NEVA_SOUTHWEST_COAST.z);
    expect(access).toMatchObject({ accessible: true, habitat: "coast", reason: "coast" });

    const reading = simulation.inspectWaterReading();
    expect(reading).toMatchObject({ habitatId: "coast", ecologyId: "ecology.neva" });
    expect(simulation.castBasicFishing()).toMatchObject({ success: true });
    expect(simulation.state.basicFishing).toMatchObject({
      habitatId: "coast",
      ecologyId: "ecology.neva"
    });
  });

  it("supports the sport-school approach from the same dry, reachable shore", () => {
    const simulation = simulationAtNevaSouthwestCoast();
    const access = WorldLayout.fishingAccessAt(NEVA_SOUTHWEST_COAST.x, NEVA_SOUTHWEST_COAST.z);
    expect(access.target).not.toBeNull();
    simulation.state.player.equippedRodId = "rod.heavy_sport";
    const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [
      { itemId: "item.chum_bucket", quantity: 1 }
    ])).toBe(true);
    const schoolId = simulation.spawnFishSchool(
      "coast",
      access.target!.x,
      access.target!.z,
      ["fish.tuna"]
    );
    expect(simulation.chumFishSchool(schoolId)).toMatchObject({ success: true });
    armLureForTest(simulation);
    expect(simulation.hookSportFish(schoolId)).toMatchObject({ success: true });
    expect(simulation.state.sportFishing).toMatchObject({ schoolId });
    expect(simulation.state.world.activeSchools[schoolId].habitatId).toBe("coast");
  });
});

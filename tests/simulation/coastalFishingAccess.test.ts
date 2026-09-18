import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WorldLayout } from "../../src/world/WorldLayout";
import { armLureForTest } from "./sportFishingTestUtils";

const WESTERN_BEACH = Object.freeze({ x: -188, z: -60 });

function simulationAtWesternBeach(): Simulation {
  const simulation = new Simulation();
  simulation.state.player.x = WESTERN_BEACH.x;
  simulation.state.player.z = WESTERN_BEACH.z;
  return simulation;
}

describe("closed-coast fishing gameplay callers", () => {
  it("lets water reading and basic casting use the newly recognized Neva shore target", () => {
    const simulation = simulationAtWesternBeach();
    const access = WorldLayout.fishingAccessAt(WESTERN_BEACH.x, WESTERN_BEACH.z);
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
    const simulation = simulationAtWesternBeach();
    const access = WorldLayout.fishingAccessAt(WESTERN_BEACH.x, WESTERN_BEACH.z);
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

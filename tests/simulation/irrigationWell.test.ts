import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  IRRIGATION_COST,
  IRRIGATION_FEATURE_ID,
  IRRIGATION_WELL_REACH_METERS
} from "../../src/simulation/domains/FarmingDomain";
import {
  PLAYER_HOMESTEAD_LAYOUT,
  STARTER_FARM_LAYOUT,
  farmWellWorldAnchor
} from "../../src/world/FarmLayout";
import { VILLAGE_MARKET, VILLAGE_PLAZA, WORLD_SPAWN } from "../../src/world/WorldAnchors";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";

function standAt(sim: Simulation, x: number, z: number): void {
  sim.state.player.x = x;
  sim.state.player.z = z;
}

describe("irrigation well binding", () => {
  it("owns a well on the starter farm and none on the village homestead plot", () => {
    const starterWell = farmWellWorldAnchor("farm.starter_garden");
    expect(starterWell).toMatchObject({
      id: "well",
      x: STARTER_FARM_LAYOUT.origin.x + 8.6,
      z: STARTER_FARM_LAYOUT.origin.z - 0.7
    });
    expect(farmWellWorldAnchor("farm.player_homestead")).toBeUndefined();
  });

  it("does not offer a field pump from spawn, the open field, or the village court", () => {
    const sim = new Simulation();
    sim.state.player.money = 200;

    standAt(sim, WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();
    expect(sim.execute({ type: "farm.buy-irrigation" }).success).toBe(false);

    standAt(sim, STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();
    expect(sim.execute({ type: "farm.buy-irrigation" }).success).toBe(false);

    standAt(sim, VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();

    standAt(sim, VILLAGE_PLAZA.x, VILLAGE_PLAZA.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();

    standAt(sim, PLAYER_HOMESTEAD_LAYOUT.origin.x, PLAYER_HOMESTEAD_LAYOUT.origin.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();
  });

  it("installs and runs the field pump only within well reach", () => {
    const sim = new Simulation();
    sim.state.player.money = 200;
    const well = farmWellWorldAnchor("farm.starter_garden")!;
    const planted = sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    );
    expect(planted.success).toBe(true);
    const cropId = Object.keys(sim.state.crops)[0];
    sim.state.crops[cropId].moisture = 20;

    standAt(sim, well.x + IRRIGATION_WELL_REACH_METERS + 0.2, well.z);
    expect(sim.getNearbyIrrigationFarmId()).toBeNull();
    expect(sim.execute({ type: "farm.buy-irrigation" }).success).toBe(false);

    standAt(sim, well.x + 1.6, well.z);
    expect(sim.getNearbyIrrigationFarmId()).toBe("farm.starter_garden");
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act6_field_pump";
    expect(sim.execute({ type: "farm.buy-irrigation" })).toMatchObject({
      success: true,
      cost: IRRIGATION_COST
    });
    expect(sim.state.quests.unlockedFeatureIds).toContain(IRRIGATION_FEATURE_ID);

    standAt(sim, STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" }).success).toBe(false);
    expect(sim.state.crops[cropId].moisture).toBe(20);

    standAt(sim, well.x + 1.6, well.z);
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" }).success).toBe(true);
    expect(sim.state.crops[cropId].moisture).toBe(100);
  });
});

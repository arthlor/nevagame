import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  FARMING_ACTION_COST,
  IRRIGATION_COST,
  IRRIGATION_FEATURE_ID,
  IRRIGATION_WELL_REACH_METERS,
  irrigationWorkForCropCount
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
    const authoredWell = STARTER_FARM_LAYOUT.farmsteadAnchors.find((anchor) => anchor.id === "well");
    expect(authoredWell).toBeDefined();
    expect(starterWell).toMatchObject({
      id: "well",
      x: STARTER_FARM_LAYOUT.origin.x + authoredWell!.x,
      z: STARTER_FARM_LAYOUT.origin.z + authoredWell!.z
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
    expect(sim.quoteIrrigationWork("farm.starter_garden")).toMatchObject({ cropCount: 1, baseCost: 10, cost: 10 });
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" })).toMatchObject({ success: true, cost: 10 });
    expect(sim.state.crops[cropId].moisture).toBe(100);
  });

  it("quotes only thirsty living crops and spends the same scaled Work atomically", () => {
    const sim = new Simulation();
    const farmId = "farm.starter_garden";
    const well = farmWellWorldAnchor(farmId)!;
    expect(sim.plantCrop(
      farmId,
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    ).success).toBe(true);
    const farm = sim.state.farms[farmId];
    const original = sim.state.crops[farm.placedCropIds[0]];
    for (const [index, offset] of [-3, -1, 3].entries()) {
      const id = `placed_crop_irrigation_${index}`;
      sim.state.crops[id] = { ...original, id, x: offset };
      farm.placedCropIds.push(id);
    }
    const [first, second, wet, withered] = farm.placedCropIds.map((id) => sim.state.crops[id]);
    first.moisture = 20;
    second.moisture = 50;
    wet.moisture = 100;
    withered.moisture = 20;
    withered.stage = "withered";
    sim.state.quests.unlockedFeatureIds.push(IRRIGATION_FEATURE_ID);
    standAt(sim, well.x, well.z);

    const quote = sim.quoteIrrigationWork(farmId)!;
    expect(quote).toMatchObject({ cropCount: 2, baseCost: 12, cost: 12 });
    const farmingXp = sim.state.player.proficiencies.farming;
    sim.state.player.workCapacity.current = quote.cost - 1;
    expect(sim.execute({ type: "farm.irrigate", farmId })).toMatchObject({ success: false, requiredWork: quote.cost });
    expect([first.moisture, second.moisture, wet.moisture, withered.moisture]).toEqual([20, 50, 100, 20]);
    expect(sim.state.player.proficiencies.farming).toBe(farmingXp);

    sim.state.player.workCapacity.current = 40;
    expect(sim.execute({ type: "farm.irrigate", farmId })).toMatchObject({ success: true, cost: quote.cost });
    expect(sim.state.player.workCapacity.current).toBe(40 - quote.cost);
    expect(sim.state.player.proficiencies.farming).toBe(farmingXp + quote.baseCost);
    expect([first.moisture, second.moisture, wet.moisture, withered.moisture]).toEqual([100, 100, 100, 20]);
    expect(sim.quoteIrrigationWork(farmId)).toBeNull();
    expect(sim.execute({ type: "farm.irrigate", farmId })).toMatchObject({ success: true, reasonCode: "already-wet" });
    expect(sim.state.player.workCapacity.current).toBe(40 - quote.cost);
  });

  it("keeps a few hand-waterings cheaper and makes the pump useful for a field", () => {
    const handWaterCost = FARMING_ACTION_COST.water;
    expect(irrigationWorkForCropCount(0)).toBe(0);
    expect(irrigationWorkForCropCount(1)).toBeGreaterThan(handWaterCost);
    expect(irrigationWorkForCropCount(4)).toBe(4 * handWaterCost - 4);
    expect(irrigationWorkForCropCount(5)).toBeLessThan(5 * (handWaterCost - 1));
    expect(irrigationWorkForCropCount(20)).toBe(48);
  });
});

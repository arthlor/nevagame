// tests/simulation/simulationLoop.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";

function movePlayerToProcessingFront(simulation: Simulation, stationId: string): void {
  const station = simulation.state.world.structures[stationId];
  const front = station ? getProcessingStationFrontPosition(stationId, station) : null;
  if (!front) throw new Error(`Missing processing front for ${stationId}`);
  simulation.state.player.x = front.x;
  simulation.state.player.z = front.z;
}

describe("Simulation Vertical Slice Loop", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
  });

  it("completes full loop: plant -> grow -> harvest -> mill -> chum -> fish -> sell", () => {
    const playerInv = sim.state.inventories[sim.state.player.inventoryId];

    // 1. Plant Wheat
    const plantRes = sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    );
    expect(plantRes.success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    expect(placedCropId).toBeDefined();

    // 2. Advance ~150 game minutes to reach maturity (wheat base is 180m with 1.2x climate)
    sim.advanceGameMinutes(155);
    expect(sim.state.crops[placedCropId].stage).toBe("mature");

    // 3. Harvest Wheat
    const harvestRes = sim.harvestCrop(placedCropId);
    expect(harvestRes.success).toBe(true);
    expect(harvestRes.yield).toBeGreaterThanOrEqual(3);
    const wheatCount = InventoryManager.getItemCount(playerInv, "produce.wheat");
    expect(wheatCount).toBeGreaterThanOrEqual(3);

    // 4. Mill Wheat into Ground Grain (Station: Hand Mill)
    movePlayerToProcessingFront(sim, "struct.starter_mill");
    const millRes = sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill");
    expect(millRes.success).toBe(true);
    const millJobId = Object.keys(sim.state.processingJobs)[0];

    // Fast-forward 6 minutes
    sim.advanceGameMinutes(6);
    expect(sim.state.processingJobs[millJobId].status).toBe("complete");
    const collectMill = sim.collectProcessingJob(millJobId);
    expect(collectMill.success).toBe(true);
    expect(InventoryManager.getItemCount(playerInv, "item.ground_grain")).toBe(2);

    // 5. Mix Chum Bucket (Station: Workbench)
    movePlayerToProcessingFront(sim, "struct.workbench");
    const chumRes = sim.startProcessingJob("recipe.craft_chum", "struct.workbench");
    expect(chumRes.success).toBe(true);
    const chumJobId = Object.keys(sim.state.processingJobs)[0];

    // Fast-forward 11 minutes
    sim.advanceGameMinutes(11);
    expect(sim.state.processingJobs[chumJobId].status).toBe("complete");
    sim.collectProcessingJob(chumJobId);
    expect(InventoryManager.getItemCount(playerInv, "item.chum_bucket")).toBe(1);

    // 6. Spawn and Chum a Fish School
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    const chumSchoolRes = sim.chumFishSchool(schoolId);
    expect(chumSchoolRes.success).toBe(true);
    expect(sim.state.world.activeSchools[schoolId].feedingFrenzyUntilMinute).toBeDefined();

    // 7. Hook Sport Fish
    const hookRes = sim.hookSportFish(schoolId);
    expect(hookRes.success).toBe(true);
    expect(sim.activeFishingEncounter).not.toBeNull();

    // 8. Simulate Fishing Battle through Simulation tick
    let steps = 0;
    while (sim.activeFishingEncounter && steps < 400) {
      const encState = sim.activeFishingEncounter.getState();
      const isReel = encState.lineTension < 70;
      const isBrace = encState.behavior === "dive" || encState.behavior === "burst";
      const isSlack = encState.lineTension > 82;

      sim.activeFishingEncounter.setInput({
        isReeling: isReel && !isSlack,
        isSlacking: isSlack,
        isBracing: isBrace,
        rodDirectionAngle: -encState.fishDirection
      });

      sim.tick(0.5);
      steps++;
    }

    const cargoIds = Object.keys(sim.state.fishCargo);
    expect(cargoIds.length).toBe(1);
    const cargo = sim.state.fishCargo[cargoIds[0]];
    expect(cargo.speciesId).toBe("fish.trout");
    expect(cargo.freshness).toBe(100);

    // 9. Sell Fish at Harbor Market
    sim.state.player.x = 68;
    sim.state.player.z = 64;
    const initialMoney = sim.state.player.money;
    const sellRes = sim.sellFishCargoAtMarket("market.harbor", cargo.id);
    expect(sellRes.success).toBe(true);
    expect(sellRes.revenue).toBeGreaterThan(30);
    expect(sim.state.player.money).toBe(initialMoney + sellRes.revenue!);
    expect(sim.state.player.proficiencies.trading).toBeGreaterThan(0);
  }, 30000);
});

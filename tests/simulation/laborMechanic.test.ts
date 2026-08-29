import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  getProficiencyLaborDiscount,
  LIVE_WORK_CAPACITY_REGEN_PER_HOUR,
  OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR,
  regenerateWorkCapacity
} from "../../src/simulation/domains/ProgressionDomain";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { WorkCapacityState } from "../../src/simulation/core/types";

function movePlayerToStarterFarm(sim: Simulation, x: number = 0, z: number = 0): { x: number; z: number } {
  const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x, z });
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
  return world;
}

describe("Labor (Work Capacity) Mechanic", () => {
  describe("Proficiency Discounts", () => {
    it("calculates 5% labor discount per proficiency rank capped at 35%", () => {
      expect(getProficiencyLaborDiscount(0)).toBe(0);      // Novice
      expect(getProficiencyLaborDiscount(1)).toBe(0.05);   // Apprentice
      expect(getProficiencyLaborDiscount(2)).toBe(0.10);   // Skilled
      expect(getProficiencyLaborDiscount(3)).toBe(0.15);   // Expert
      expect(getProficiencyLaborDiscount(4)).toBe(0.20);   // Master
      expect(getProficiencyLaborDiscount(5)).toBe(0.25);   // Artisan
      expect(getProficiencyLaborDiscount(6)).toBe(0.30);   // Famed
      expect(getProficiencyLaborDiscount(7)).toBe(0.35);   // Legendary
      expect(getProficiencyLaborDiscount(10)).toBe(0.35);  // Capped
    });

    it("applies discounts to action costs based on player skill rank", () => {
      const sim = new Simulation();
      sim.state.player.proficiencies.farming = 0; // Novice: rank 0
      expect(sim.progression.getDiscountedActionCost(15, "farming")).toBe(15);

      sim.state.player.proficiencies.farming = 3000; // Skilled: rank 2 (10% discount)
      expect(sim.progression.getDiscountedActionCost(15, "farming")).toBe(14); // 15 * 0.9 = 13.5 -> 14

      sim.state.player.proficiencies.farming = 15000; // Master: rank 4 (20% discount)
      expect(sim.progression.getDiscountedActionCost(15, "farming")).toBe(12); // 15 * 0.8 = 12

      sim.state.player.proficiencies.farming = 100000; // Legendary: rank 7 (35% discount)
      expect(sim.progression.getDiscountedActionCost(15, "farming")).toBe(10); // 15 * 0.65 = 9.75 -> 10
    });
  });

  describe("Regeneration Rates", () => {
    it("regenerates at live rate of 200 Labor per in-game hour", () => {
      const work: WorkCapacityState = { current: 0, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 30, 30, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(100);

      regenerateWorkCapacity(work, 30, 60, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(200);
    });

    it("regenerates at offline rate of 100 Labor per in-game hour", () => {
      const work: WorkCapacityState = { current: 0, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 60, 60, OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(100);
    });

    it("clamps regeneration to maximum capacity of 1000", () => {
      const work: WorkCapacityState = { current: 950, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 60, 60, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(1000);
    });

    it("regenerates labor during offline progression simulation", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 200;
      sim.state.metadata.lastSavedUtcMs = 1000000;

      // 60 game minutes = 60 / 0.4 = 150 real seconds = 150,000 ms
      applyOfflineProgression(sim.state, 1000000 + 150000);
      expect(sim.state.player.workCapacity.current).toBe(300); // 200 + 100
      expect(sim.state.player.workCapacity.regeneratedAtMinute).toBe(sim.state.clock.currentMinute);
    });
  });

  describe("Decoupled Progression XP Rewards", () => {
    it("awards quest completion XP without deducting Labor", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 500;
      const initialFarmingXp = sim.state.player.proficiencies.farming;

      sim.progression.addProficiencyXp("farming", 150);

      expect(sim.state.player.proficiencies.farming).toBe(initialFarmingXp + 150);
      expect(sim.state.player.workCapacity.current).toBe(500); // Labor unchanged!
    });

    it("awards market sale Trading XP without deducting Labor", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 750;
      const initialTradingXp = sim.state.player.proficiencies.trading;

      // Selling goods generates Trading XP
      sim.progression.addProficiencyXp("trading", 50);

      expect(sim.state.player.proficiencies.trading).toBe(initialTradingXp + 50);
      expect(sim.state.player.workCapacity.current).toBe(750); // Labor unchanged!
    });
  });

  describe("Hard Action Gating at Zero Labor", () => {
    it("blocks planting when Labor is 0", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      sim.state.player.workCapacity.current = 0;
      const result = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe("no-labor");
    });

    it("blocks watering when Labor is 0", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      // First plant with labor
      sim.state.player.workCapacity.current = 100;
      const plantResult = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(plantResult.success).toBe(true);
      const cropId = plantResult.placedCropId!;

      // Drain labor to 0
      sim.state.player.workCapacity.current = 0;
      const waterResult = sim.waterCrop(cropId);
      expect(waterResult.success).toBe(false);
      expect(waterResult.reasonCode).toBe("no-labor");
    });

    it("blocks crafting when Labor is 0", () => {
      const sim = new Simulation();
      const station = sim.state.world.structures["struct.starter_mill"];
      const front = getProcessingStationFrontPosition("struct.starter_mill", station)!;
      sim.state.player.x = front.x;
      sim.state.player.z = front.z;
      const inventory = sim.state.inventories[sim.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inventory, [{ itemId: "crop.wheat", quantity: 5 }]);

      sim.state.player.workCapacity.current = 0;
      const result = sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill");
      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe("no-labor");
    });

    it("allows actions when Labor > 0 and consumes down to 0 without going negative (soft threshold)", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      sim.state.player.workCapacity.current = 5; // Less than standard plant cost (10)

      const plantResult = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(plantResult.success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(0); // Drained to 0, not negative

      // Next action is blocked
      const waterResult = sim.waterCrop(plantResult.placedCropId!);
      expect(waterResult.success).toBe(false);
      expect(waterResult.reasonCode).toBe("no-labor");
    });
  });
});



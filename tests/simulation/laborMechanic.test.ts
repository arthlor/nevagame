import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  getProficiencyWorkDiscount,
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

describe("Work Capacity mechanic", () => {
  describe("Proficiency Discounts", () => {
    it("calculates 5% Work discount per proficiency rank capped at 35%", () => {
      expect(getProficiencyWorkDiscount(0)).toBe(0);      // Novice
      expect(getProficiencyWorkDiscount(1)).toBe(0.05);   // Apprentice
      expect(getProficiencyWorkDiscount(2)).toBe(0.10);   // Skilled
      expect(getProficiencyWorkDiscount(3)).toBe(0.15);   // Expert
      expect(getProficiencyWorkDiscount(4)).toBe(0.20);   // Master
      expect(getProficiencyWorkDiscount(5)).toBe(0.25);   // Artisan
      expect(getProficiencyWorkDiscount(6)).toBe(0.30);   // Famed
      expect(getProficiencyWorkDiscount(7)).toBe(0.35);   // Legendary
      expect(getProficiencyWorkDiscount(10)).toBe(0.35);  // Capped
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
    it("regenerates at live rate of 200 Work per in-game hour", () => {
      const work: WorkCapacityState = { current: 0, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 30, 30, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(100);

      regenerateWorkCapacity(work, 30, 60, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(200);
    });

    it("regenerates at offline rate of 100 Work per in-game hour", () => {
      const work: WorkCapacityState = { current: 0, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 60, 60, OFFLINE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(100);
    });

    it("clamps regeneration to maximum capacity of 1000", () => {
      const work: WorkCapacityState = { current: 950, maximum: 1000, regeneratedAtMinute: 0 };
      regenerateWorkCapacity(work, 60, 60, LIVE_WORK_CAPACITY_REGEN_PER_HOUR);
      expect(work.current).toBe(1000);
    });

    it("regenerates Work during offline progression simulation", () => {
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
    it("awards quest completion XP without deducting Work", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 500;
      const initialFarmingXp = sim.state.player.proficiencies.farming;

      sim.progression.addProficiencyXp("farming", 150);

      expect(sim.state.player.proficiencies.farming).toBe(initialFarmingXp + 150);
      expect(sim.state.player.workCapacity.current).toBe(500);
    });

    it("awards market sale Trading XP without deducting Work", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 750;
      const initialTradingXp = sim.state.player.proficiencies.trading;

      // Selling goods generates Trading XP
      sim.progression.addProficiencyXp("trading", 50);

      expect(sim.state.player.proficiencies.trading).toBe(initialTradingXp + 50);
      expect(sim.state.player.workCapacity.current).toBe(750);
    });
  });

  describe("fully funded action gating", () => {
    it("quotes affordability, shortage, and ready time from the discounted cost", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 9.8;
      const quote = sim.quoteWorkCost(10, "farming");
      expect(quote).toMatchObject({
        baseCost: 10,
        cost: 10,
        availableWork: 9,
        affordable: false
      });
      expect(quote.shortage).toBeCloseTo(0.2, 8);
      expect(quote.readyAtMinute).toBe(sim.state.clock.currentMinute + 1);
    });

    it("blocks planting at zero Work without mutating seed, RNG, XP, or crops", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      sim.state.player.workCapacity.current = 0;
      const inventory = sim.state.inventories[sim.state.player.inventoryId];
      const seedsBefore = InventoryManager.getItemCount(inventory, "seed.wheat");
      const rngBefore = sim.rng.getState();
      const xpBefore = sim.state.player.proficiencies.farming;
      const result = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(result).toMatchObject({
        success: false,
        reasonCode: "insufficient-work",
        requiredWork: 10,
        availableWork: 0
      });
      expect(InventoryManager.getItemCount(inventory, "seed.wheat")).toBe(seedsBefore);
      expect(sim.rng.getState()).toBe(rngBefore);
      expect(sim.state.player.proficiencies.farming).toBe(xpBefore);
      expect(Object.keys(sim.state.crops)).toHaveLength(0);
    });

    it("blocks watering below the full cost and accepts the exact cost", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      sim.state.player.workCapacity.current = 100;
      const plantResult = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      const cropId = plantResult.placedCropId!;

      sim.state.player.workCapacity.current = 4.99;
      const blocked = sim.waterCrop(cropId);
      expect(blocked.reasonCode).toBe("insufficient-work");
      expect(sim.state.player.workCapacity.current).toBe(4.99);

      sim.state.player.workCapacity.current = 5;
      expect(sim.waterCrop(cropId).success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(0);
    });

    it("blocks processing below cost without consuming ingredients or creating a job", () => {
      const sim = new Simulation();
      const station = sim.state.world.structures["struct.starter_mill"];
      const front = getProcessingStationFrontPosition("struct.starter_mill", station)!;
      sim.state.player.x = front.x;
      sim.state.player.z = front.z;
      const inventory = sim.state.inventories[sim.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }]);
      const wheatBefore = InventoryManager.getItemCount(inventory, "produce.wheat");
      const rngBefore = sim.rng.getState();

      sim.state.player.workCapacity.current = 34.99;
      const result = sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill");
      expect(result.reasonCode).toBe("insufficient-work");
      expect(sim.state.player.workCapacity.current).toBe(34.99);
      expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(wheatBefore);
      expect(sim.rng.getState()).toBe(rngBefore);
      expect(Object.keys(sim.state.processingJobs)).toHaveLength(0);
    });

    it("rejects a fractional near miss and consumes the exact plant cost atomically", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim, 0, 0);
      sim.state.player.workCapacity.current = 9.8;
      const blocked = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(blocked.reasonCode).toBe("insufficient-work");
      expect(sim.state.player.workCapacity.current).toBe(9.8);

      sim.state.player.workCapacity.current = 10;
      const exact = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(exact.success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(0);
    });
  });
});

import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import {
  applyPassiveWorkRegen,
  earnWorkCapacity,
  getProficiencyWorkDiscount,
  restoreWorkOnRest,
  rollWorkEarnings,
  WORK_PASSIVE_REGEN_AMOUNT,
  WORK_PASSIVE_REGEN_INTERVAL_SECONDS
} from "../../src/simulation/domains/ProgressionDomain";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import type { WorkCapacityState } from "../../src/simulation/core/types";
import { FARMING_ACTION_COST } from "../../src/simulation/domains/FarmingDomain";
import { BASIC_FISHING_WORK_COST } from "../../src/simulation/domains/FishingDomain";
import { PROCESSING_WORK_COST } from "../../src/simulation/domains/ProcessingDomain";
import { ACTION_WORK_COSTS } from "../../src/ui/components/FarmingActionStatus";

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

  describe("Earned Work", () => {
    it("does not regenerate Work from advanced game minutes alone", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 10;
      sim.advanceGameMinutes(600);
      expect(sim.state.player.workCapacity.current).toBe(10);
    });

    it("trickles Work on real time, clamped by the ceiling", () => {
      const work: WorkCapacityState = {
        current: 10,
        maximum: 500,
        regeneratedAtMinute: 0,
        passiveRegenSeconds: 0
      };
      // Half an interval grants nothing; the remainder carries.
      expect(applyPassiveWorkRegen(work, WORK_PASSIVE_REGEN_INTERVAL_SECONDS / 2)).toBe(0);
      expect(work.current).toBe(10);
      // The next half completes the interval.
      expect(applyPassiveWorkRegen(work, WORK_PASSIVE_REGEN_INTERVAL_SECONDS / 2)).toBe(
        WORK_PASSIVE_REGEN_AMOUNT
      );
      expect(work.current).toBe(10 + WORK_PASSIVE_REGEN_AMOUNT);

      // A full interval at once grants the same amount.
      expect(applyPassiveWorkRegen(work, WORK_PASSIVE_REGEN_INTERVAL_SECONDS)).toBe(
        WORK_PASSIVE_REGEN_AMOUNT
      );

      // Near the ceiling the grant is clipped and the accumulator clears.
      work.current = work.maximum - 2;
      work.passiveRegenSeconds = 0;
      expect(applyPassiveWorkRegen(work, WORK_PASSIVE_REGEN_INTERVAL_SECONDS)).toBe(2);
      expect(work.current).toBe(work.maximum);

      // A full pool never banks a burst.
      expect(applyPassiveWorkRegen(work, WORK_PASSIVE_REGEN_INTERVAL_SECONDS * 10)).toBe(0);
      expect(work.passiveRegenSeconds).toBe(0);
    });

    it("trickles through the real-time tick but not while paused", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 10;
      sim.clock.setPaused(true);
      sim.tick(WORK_PASSIVE_REGEN_INTERVAL_SECONDS);
      expect(sim.state.player.workCapacity.current).toBe(10);
      sim.clock.setPaused(false);
      sim.tick(WORK_PASSIVE_REGEN_INTERVAL_SECONDS);
      expect(sim.state.player.workCapacity.current).toBe(10 + WORK_PASSIVE_REGEN_AMOUNT);
    });

    it("restores a fraction plus a baseline floor on rest", () => {
      const work: WorkCapacityState = { current: 0, maximum: 500, regeneratedAtMinute: 0 };
      const granted = restoreWorkOnRest(work, 480);
      expect(granted).toBe(125); // max(0 + 10% of 500, 25% of 500)
      expect(work.current).toBe(125);
      restoreWorkOnRest(work, 480);
      expect(work.current).toBe(175);
    });

    it("caps earned Work at the daily earn cap", () => {
      const work: WorkCapacityState = {
        current: 0,
        maximum: 500,
        regeneratedAtMinute: 0,
        earnedToday: 0,
        earningsDay: 0
      };
      expect(earnWorkCapacity(work, 150, 60)).toBe(150);
      // Only the remaining room under the 300/day cap is granted.
      expect(earnWorkCapacity(work, 150, 120)).toBe(150);
      expect(earnWorkCapacity(work, 150, 180)).toBe(0);
      expect(work.current).toBe(300);
    });

    it("bounds earned Work by the pool ceiling", () => {
      const work: WorkCapacityState = {
        current: 490,
        maximum: 500,
        regeneratedAtMinute: 0,
        earnedToday: 0,
        earningsDay: 0
      };
      expect(earnWorkCapacity(work, 40, 60)).toBe(10);
    });

    it("rolls the daily tallies when the calendar day changes", () => {
      const work: WorkCapacityState = {
        current: 0,
        maximum: 500,
        regeneratedAtMinute: 0,
        earnedToday: 180,
        earningsDay: 0,
        mealsToday: 3,
        laborUsedToday: ["labor.firewood"]
      };
      rollWorkEarnings(work, 1);
      expect(work.earnedToday).toBe(0);
      expect(work.mealsToday).toBe(0);
      expect(work.laborUsedToday).toEqual([]);
    });

    it("grants at most one rest across an offline wake", () => {
      const sim = new Simulation();
      expect(sim.state.player.workCapacity.maximum).toBe(500);
      sim.state.player.workCapacity.current = 50;
      sim.state.metadata.lastSavedUtcMs = 0;
      // 1.5 game days away at 0.4 game-min per real second.
      const oneAndAHalfGameDaysMs = (1440 / 0.4) * 1000 * 1.5;
      applyOfflineProgression(sim.state, oneAndAHalfGameDaysMs);
      // One rest: max(50 + 10% of 500, 25% of 500) = 125, not a per-hour refill.
      expect(sim.state.player.workCapacity.current).toBe(125);
    });
  });

  describe("Decoupled Progression XP Rewards", () => {
    it("awards quest completion XP without deducting Work", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 250;
      const initialFarmingXp = sim.state.player.proficiencies.farming;

      sim.progression.addProficiencyXp("farming", 150);

      expect(sim.state.player.proficiencies.farming).toBe(initialFarmingXp + 150);
      expect(sim.state.player.workCapacity.current).toBe(250);
    });

    it("awards market sale Trading XP without deducting Work", () => {
      const sim = new Simulation();
      sim.state.player.workCapacity.current = 280;
      const initialTradingXp = sim.state.player.proficiencies.trading;

      // Selling goods generates Trading XP
      sim.progression.addProficiencyXp("trading", 50);

      expect(sim.state.player.proficiencies.trading).toBe(initialTradingXp + 50);
      expect(sim.state.player.workCapacity.current).toBe(280);
    });
  });

  describe("fully funded action gating", () => {
    it("quotes affordability and shortage from the discounted cost", () => {
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
        requiredWork: 12,
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
      sim.state.player.workCapacity.current = 11.8;
      const blocked = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(blocked.reasonCode).toBe("insufficient-work");
      expect(sim.state.player.workCapacity.current).toBe(11.8);

      sim.state.player.workCapacity.current = 12;
      const exact = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(exact.success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(0);
    });
  });

  describe("cost table integrity", () => {
    it("keeps the presentation Work costs derived from the simulation tables", () => {
      // The interaction prompt once quoted a hardcoded 10 for planting while
      // FarmingDomain charged 12, so between 10 and 11 Work the prompt read as
      // affordable and the action was refused.
      expect(ACTION_WORK_COSTS.plant).toBe(FARMING_ACTION_COST.plant);
      expect(ACTION_WORK_COSTS.water).toBe(FARMING_ACTION_COST.water);
      expect(ACTION_WORK_COSTS.harvest).toBe(FARMING_ACTION_COST.harvest);
      expect(ACTION_WORK_COSTS.fertilize).toBe(FARMING_ACTION_COST.fertilize);
      expect(ACTION_WORK_COSTS.cast).toBe(BASIC_FISHING_WORK_COST);
      expect(ACTION_WORK_COSTS.workstation).toBe(PROCESSING_WORK_COST);
    });

    it("charges planting exactly what the shared constant quotes", () => {
      const sim = new Simulation();
      const pos = movePlayerToStarterFarm(sim);
      const quoted = sim.quoteWorkCost(FARMING_ACTION_COST.plant, "farming").cost;

      // One short of the real cost must refuse. The prompt used to quote 10
      // here, so 10 and 11 Work read as affordable and then failed.
      sim.state.player.workCapacity.current = quoted - 1;
      expect(sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z))
        .toMatchObject({ reasonCode: "insufficient-work" });

      sim.state.player.workCapacity.current = quoted;
      expect(sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z))
        .toMatchObject({ success: true });
      expect(sim.state.player.workCapacity.current).toBe(0);
    });
  });
});

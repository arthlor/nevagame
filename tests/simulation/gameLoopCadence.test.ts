import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { Simulation } from "../../src/simulation/Simulation";
import {
  DEFAULT_MINUTES_PER_REAL_SECOND,
  minutesUntilNextMorning
} from "../../src/simulation/core/GameClock";
import type { ResolvedPhysicsFrame } from "../../src/simulation/core/PhysicsAdapter";
import {
  applyCropMoistureOverMinutes,
  calculateEffectiveGrowthDelta
} from "../../src/simulation/farming/calculateCropGrowth";
import {
  IRRIGATION_COST,
  IRRIGATION_FEATURE_ID
} from "../../src/simulation/domains/FarmingDomain";
import {
  forecastWeatherAt,
  SEASONAL_WEATHER_WEIGHTS,
  WEATHER_FRONT_MAX_MINUTES,
  WEATHER_FRONT_MIN_MINUTES
} from "../../src/simulation/weather/updateWeather";
import { STARTER_FARM_LAYOUT, farmWellWorldAnchor } from "../../src/world/FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "../../src/world/FarmhouseInterior";
import { VILLAGE_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";

function commitPlayerPose(simulation: Simulation, x: number, z: number): void {
  const { player, boats } = simulation.state;
  const frame: ResolvedPhysicsFrame = {
    player: {
      x,
      y: WorldLayout.isInterior(x, z)
        ? 0.67
        : WorldLayout.isWater(x, z)
          ? 0.5
          : WorldLayout.terrainHeight(x, z) + 0.5,
      z,
      rotationY: 0,
      traversal: { ...player.traversal, isGrounded: true }
    },
    boats: Object.fromEntries(
      Object.values(boats).map((boat) => [boat.id, {
        x: boat.x,
        y: boat.y,
        z: boat.z,
        headingRadians: boat.headingRadians,
        speed: boat.speed
      }])
    )
  };
  expect(simulation.execute({ type: "physics.commit", frame })).toMatchObject({ success: true });
}

describe("game loop cadence", () => {
  it("starts at 0.4 game minutes per real second", () => {
    const sim = new Simulation();
    expect(sim.state.clock.minutesPerRealSecond).toBe(DEFAULT_MINUTES_PER_REAL_SECOND);
    const start = sim.state.clock.currentMinute;
    sim.tick(2.5);
    expect(sim.state.clock.currentMinute).toBe(start + 1);
  });

  it("applies storm moisture and rain growth like heavy rain", () => {
    const wheat = ContentRegistry.crops.get("crop.wheat")!;
    const stormGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "storm");
    const rainGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "heavy-rain");
    const clearGrowth = calculateEffectiveGrowthDelta(60, wheat, "temperate", 80, 50, "clear");
    expect(stormGrowth).toBeCloseTo(rainGrowth);
    expect(stormGrowth).toBeGreaterThan(clearGrowth);

    const crop = { moisture: 40, averageMoistureAccum: 0, moistureSampleCount: 0 };
    applyCropMoistureOverMinutes(crop, 60, wheat.waterNeed, {
      weatherType: "storm",
      rainfallEffectiveness: 1,
      evaporationMultiplier: 1,
      moistureRetention: 0
    });
    expect(crop.moisture).toBeGreaterThan(40);
  });

  it("uses seasonal weather weights and a 360–720 minute front window", () => {
    expect(WEATHER_FRONT_MIN_MINUTES).toBe(360);
    expect(WEATHER_FRONT_MAX_MINUTES).toBe(720);
    const winterStorm = SEASONAL_WEATHER_WEIGHTS.winter.find((entry) => entry.value === "storm")!.weight;
    const summerStorm = SEASONAL_WEATHER_WEIGHTS.summer.find((entry) => entry.value === "storm")!.weight;
    const springRain = SEASONAL_WEATHER_WEIGHTS.spring.find((entry) => entry.value === "light-rain")!.weight;
    const summerRain = SEASONAL_WEATHER_WEIGHTS.summer.find((entry) => entry.value === "light-rain")!.weight;
    expect(winterStorm).toBeGreaterThan(summerStorm);
    expect(springRain).toBeGreaterThan(summerRain);
  });

  it("forecasts now, +2h, and +5h from the scheduled next type", () => {
    const sim = new Simulation();
    sim.state.weather.nextWeatherMinute = sim.state.clock.currentMinute + 90;
    sim.state.weather.nextWeatherType = "storm";
    expect(forecastWeatherAt(sim.state.weather, sim.state.clock.currentMinute, 0)).toBe(sim.state.weather.type);
    expect(forecastWeatherAt(sim.state.weather, sim.state.clock.currentMinute, 120)).toBe("storm");
    expect(forecastWeatherAt(sim.state.weather, sim.state.clock.currentMinute, 300)).toBe("storm");
  });

  it("rests until 08:00 from the farmhouse at night without auto-harvest", () => {
    const sim = new Simulation();
    commitPlayerPose(sim, STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z).success).toBe(true);
    const cropId = Object.keys(sim.state.crops)[0];

    expect(sim.execute({ type: "player.rest-until-dawn" })).toMatchObject({ success: false });

    commitPlayerPose(sim, FARMHOUSE_INTERIOR_ORIGIN.x, FARMHOUSE_INTERIOR_ORIGIN.z);
    sim.setDebugMinute(22 * 60);
    expect(sim.state.clock.timeOfDay).toBe("night");
    const restMinutes = minutesUntilNextMorning(sim.state.clock.currentMinute);
    expect(sim.execute({ type: "player.rest-until-dawn" })).toMatchObject({ success: true });
    expect(sim.state.clock.currentMinute % 1440).toBe(8 * 60);
    expect(sim.state.clock.timeOfDay).toBe("day");
    expect(restMinutes).toBeGreaterThan(0);
    expect(sim.state.crops[cropId]).toBeDefined();
  });

  it("refills contracts to at most two active listings and honors requiredXp", () => {
    const sim = new Simulation();
    sim.state.contracts = [];
    sim.state.player.proficiencies.farming = 0;
    sim.state.player.proficiencies.fishing = 0;
    sim.advanceGameMinutes(1);
    const active = sim.state.contracts.filter((contract) => contract.status === "active");
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.length).toBeLessThanOrEqual(2);
    expect(active.every((contract) => {
      const template = ContentRegistry.contractTemplates.get(contract.templateId);
      return (template?.requiredXp ?? 0) === 0;
    })).toBe(true);

    sim.state.player.proficiencies.farming = 1000;
    for (const contract of active) contract.status = "expired";
    sim.advanceGameMinutes(1);
    const afterXp = sim.state.contracts.filter((contract) => contract.status === "active");
    expect(afterXp.length).toBeLessThanOrEqual(2);
    expect(afterXp.every((contract) => {
      const template = ContentRegistry.contractTemplates.get(contract.templateId);
      if (!template) return false;
      return sim.state.player.proficiencies[template.rewardSkill] >= (template.requiredXp ?? 0);
    })).toBe(true);
  });

  it("does not publish fish contracts before the boat and rod route is available", () => {
    const sim = new Simulation();
    sim.state.contracts = [];
    sim.state.player.proficiencies = {
      farming: 1000,
      fishing: 15000,
      processing: 0,
      trading: 3000
    };

    sim.advanceGameMinutes(1);

    const active = sim.state.contracts.filter((contract) => contract.status === "active");
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((contract) => contract.type === "produce")).toBe(true);
    expect(active.some((contract) => contract.targetItemIdOrSpecies.startsWith("fish."))).toBe(false);
  });

  it("publishes a reachable trout contract once the rowboat route is unlocked", () => {
    const sim = new Simulation();
    sim.state.contracts = [];
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    sim.state.player.equippedRodId = "rod.willow";

    sim.advanceGameMinutes(1);

    const active = sim.state.contracts.filter((contract) => contract.status === "active");
    expect(active).toHaveLength(2);
    expect(active.some((contract) => contract.type === "produce")).toBe(true);
    expect(active.some((contract) => {
      return contract.type === "fresh-fish" && contract.targetItemIdOrSpecies === "fish.trout";
    })).toBe(true);
  });

  it("sells compost starter at the village and crushed ice at the harbor", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    sim.state.player.money = 80;
    commitPlayerPose(sim, VILLAGE_MARKET.position.x, VILLAGE_MARKET.position.z);
    const compost = sim.execute({
      type: "market.buy-seed",
      marketId: "market.village",
      itemId: "item.compost_starter",
      quantity: 1
    });
    expect(compost.success).toBe(true);
    expect(compost.cost).toBeGreaterThanOrEqual(10);
    expect(InventoryManager.getItemCount(inventory, "item.compost_starter")).toBe(3);

    expect(sim.execute({
      type: "market.buy-item",
      marketId: "market.harbor",
      itemId: "item.crushed_ice",
      quantity: 1
    })).toMatchObject({ success: false });

    const harbor = WorldLayout.landmark("fish-market");
    commitPlayerPose(sim, harbor.x, harbor.z);
    const ice = sim.execute({
      type: "market.buy-item",
      marketId: "market.harbor",
      itemId: "item.crushed_ice",
      quantity: 1
    });
    expect(ice.success).toBe(true);
    expect(ice.cost).toBeGreaterThanOrEqual(15);
    expect(InventoryManager.getItemCount(inventory, "item.crushed_ice")).toBe(1);
  });

  it("installs a field pump at the farm well then waters every dry crop on that farm", () => {
    const sim = new Simulation();
    sim.state.player.money = 200;
    commitPlayerPose(sim, STARTER_FARM_LAYOUT.origin.x, STARTER_FARM_LAYOUT.origin.z);
    expect(sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    ).success).toBe(true);
    const cropId = Object.keys(sim.state.crops)[0];
    sim.state.crops[cropId].moisture = 20;

    expect(sim.execute({ type: "farm.buy-irrigation" })).toMatchObject({ success: false });
    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" })).toMatchObject({ success: false });

    const well = farmWellWorldAnchor("farm.starter_garden")!;
    commitPlayerPose(sim, well.x, well.z);
    mainQuestTrack(sim.state.quests).activeQuestId = "quest.act6_field_pump";
    const purchase = sim.execute({ type: "farm.buy-irrigation" });
    expect(purchase).toMatchObject({ success: true, cost: IRRIGATION_COST });
    expect(sim.state.quests.unlockedFeatureIds).toContain(IRRIGATION_FEATURE_ID);
    expect(sim.state.player.money).toBe(200 - IRRIGATION_COST);

    expect(sim.execute({ type: "farm.irrigate", farmId: "farm.starter_garden" })).toMatchObject({ success: true });
    expect(sim.state.crops[cropId].moisture).toBe(100);
  });
});

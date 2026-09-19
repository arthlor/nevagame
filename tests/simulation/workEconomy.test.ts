import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WORK_CAPACITY_MAXIMUM, WORK_DAILY_EARN_CAP, WORK_MEAL_DAILY_LIMIT } from "../../src/simulation/domains/ProgressionDomain";
import { LABOR_STATIONS } from "../../src/simulation/labor/LaborStations";
import { AUTHORED_DETAIL_PLACEMENTS } from "../../src/world/WorldEnvironmentLayout";
import { getFarmLayout, isPlantableFarmSurface, starterFarmsteadAnchor, starterStructureAnchor, worldToFarmLocal } from "../../src/world/FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "../../src/world/FarmhouseInterior";

describe("Work economy — earned labor", () => {
  it("starts a new game with a full daily budget", () => {
    const sim = new Simulation();
    expect(sim.state.player.workCapacity.maximum).toBe(WORK_CAPACITY_MAXIMUM);
    expect(sim.state.player.workCapacity.current).toBe(WORK_CAPACITY_MAXIMUM);
  });

  it("restores a waking floor on rest instead of a passive refill", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.setDebugMinute(22 * 60);
    sim.state.player.x = FARMHOUSE_INTERIOR_ORIGIN.x;
    sim.state.player.z = FARMHOUSE_INTERIOR_ORIGIN.z;
    const result = sim.execute({ type: "player.rest-until-dawn" });
    expect(result.success).toBe(true);
    // max(0 + 10% of 500, 25% of 500) = 125.
    expect(sim.state.player.workCapacity.current).toBe(125);
  });

  it("caps earned Work at the daily cap", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    expect(sim.progression.earnWork(150)).toBe(150);
    expect(sim.progression.earnWork(150)).toBe(150); // remaining room under the 300/day cap
    expect(sim.progression.earnWork(150)).toBe(0);
    expect(sim.progression.getWorkDailyStatus().earnedToday).toBe(WORK_DAILY_EARN_CAP);
  });

  it("eats a cooked meal for Work and enforces the daily meal limit", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.meal_harvest_bowl", quantity: WORK_MEAL_DAILY_LIMIT + 1 }]);

    for (let i = 0; i < WORK_MEAL_DAILY_LIMIT; i += 1) {
      const result = sim.execute({ type: "item.consume", itemId: "item.meal_harvest_bowl" });
      expect(result.success).toBe(true);
    }
    expect(sim.progression.getWorkDailyStatus().mealsToday).toBe(WORK_MEAL_DAILY_LIMIT);
    const refused = sim.execute({ type: "item.consume", itemId: "item.meal_harvest_bowl" });
    expect(refused.success).toBe(false);
  });

  it("refuses to eat an item that is not a provision", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.potato", quantity: 1 }]);
    const result = sim.execute({ type: "item.consume", itemId: "produce.potato" });
    expect(result.success).toBe(false);
  });

  it("works a labor shift for Work, once per station per day", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;

    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    // 0.696 s at the station's meter speed puts the needle in the sweet spot.
    sim.tick(0.696);
    const strike = sim.execute({ type: "labor.strike" });
    expect(strike.success).toBe(true);
    expect(strike.yield).toBe(station.yield);

    const again = sim.execute({ type: "labor.start", stationId: station.id });
    expect(again.success).toBe(false);
  });

  it("refuses a labor strike started before fishing or mounting, without consuming the station", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;

    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    sim.state.basicFishing = {
      ecologyId: "ecology.neva",
      phase: "waiting",
      habitatId: "ocean",
      remainingSeconds: 4,
      willCatch: true
    };
    expect(sim.execute({ type: "labor.strike" }).success).toBe(false);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);
    sim.state.basicFishing = null;

    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    sim.state.player.activeBoatId = "boat.player_rowboat";
    expect(sim.execute({ type: "labor.strike" }).success).toBe(false);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);
    sim.state.player.activeBoatId = null;
  });

  it("blocks labor start and an in-progress strike while carrying fish until release", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;
    const carryFish = () => {
      sim.state.player.carriedFishCargoId = "cargo.held";
      sim.state.fishCargo["cargo.held"] = {
        id: "cargo.held",
        speciesId: "fish.trout",
        weightKg: 3,
        quality: "common",
        caughtAtMinute: sim.state.clock.currentMinute,
        freshness: 100,
        cargoClass: "medium",
        location: { type: "player", containerId: "player" }
      };
    };
    const refusal = { success: false, reason: "Stow physical fish cargo before working" };

    carryFish();
    const beforeStart = structuredClone(sim.state);
    const rngBeforeStart = sim.rng.getState();
    const hudBeforeStart = sim.query({ type: "labor.get-hud" });
    expect(sim.execute({ type: "labor.start", stationId: station.id })).toEqual(refusal);
    expect(sim.state).toEqual(beforeStart);
    expect(sim.rng.getState()).toBe(rngBeforeStart);
    expect(sim.query({ type: "labor.get-hud" })).toEqual(hudBeforeStart);

    expect(sim.execute({ type: "cargo.release", cargoId: "cargo.held" }).success).toBe(true);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    carryFish();
    const beforeStrike = structuredClone(sim.state);
    const rngBeforeStrike = sim.rng.getState();
    const hudBeforeStrike = sim.query({ type: "labor.get-hud" });
    expect(sim.execute({ type: "labor.strike" })).toEqual(refusal);
    expect(sim.state).toEqual(beforeStrike);
    expect(sim.rng.getState()).toBe(rngBeforeStrike);
    expect(sim.query({ type: "labor.get-hud" })).toEqual(hudBeforeStrike);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);

    expect(sim.execute({ type: "cargo.release", cargoId: "cargo.held" }).success).toBe(true);
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(sim.execute({ type: "labor.strike" })).toEqual({ success: true, yield: station.yield, grade: "clean" });
    expect(sim.state.player.workCapacity.current).toBe(station.yield);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(true);
  });

  it("refuses a strike that cannot fit the full grant, without consuming the station", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    // Shrink pool room below the full grant after the shift started.
    sim.state.player.workCapacity.current = sim.state.player.workCapacity.maximum - 10;
    expect(sim.execute({ type: "labor.strike" }).success).toBe(false);
    expect(sim.progression.hasWorkedLaborStation(station.id)).toBe(false);
    expect(sim.state.player.workCapacity.current).toBe(sim.state.player.workCapacity.maximum - 10);
  });

  it("requires proximity before a labor shift can start", () => {
    const station = LABOR_STATIONS["labor.nets"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x + 40;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(false);
  });

  it("abandons a strike made after stepping away, without consuming the station", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 0;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    // Walk away mid-swing, then strike.
    sim.state.player.x = station.position.x + 30;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.strike" }).success).toBe(false);
    // The station is still available, and a clean strike from reach still pays.
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(true);
    sim.tick(0.696);
    const strike = sim.execute({ type: "labor.strike" });
    expect(strike.success).toBe(true);
    expect(strike.yield).toBe(station.yield);
  });

  it("refuses a labor shift and a meal when the pool cannot take the full grant", () => {
    const station = LABOR_STATIONS["labor.firewood"];
    const sim = new Simulation();
    sim.state.player.workCapacity.current = sim.state.player.workCapacity.maximum - 5;
    sim.state.player.x = station.position.x;
    sim.state.player.z = station.position.z;
    expect(sim.execute({ type: "labor.start", stationId: station.id }).success).toBe(false);

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.meal_fish_stew", quantity: 1 }]);
    expect(sim.execute({ type: "item.consume", itemId: "item.meal_fish_stew" }).success).toBe(false);
    // A refused meal is not consumed.
    expect(InventoryManager.getItemCount(inventory, "item.meal_fish_stew")).toBe(1);
  });

  it("anchors every labor station on its authored chore prop", () => {
    // The station position is gameplay truth but mirrors a rendered prop; if a
    // future layout edit moves the prop, this fails so the station follows it.
    const expectedProp: Record<string, string> = {
      "labor.firewood": "prop_firewood_stack_a",
      "labor.racks": "prop_fish_drying_rack_a",
      "labor.nets": "prop_fishing_net_rack_a"
    };
    for (const [stationId, assetId] of Object.entries(expectedProp)) {
      const station = LABOR_STATIONS[stationId];
      expect(station, stationId).toBeDefined();
      const nearest = AUTHORED_DETAIL_PLACEMENTS
        .filter((placement) => placement.assetId === assetId)
        .map((placement) => Math.hypot(placement.x - station.position.x, placement.z - station.position.z))
        .sort((left, right) => left - right)[0];
      expect(nearest, `${stationId} → ${assetId}`).toBeDefined();
      expect(nearest, `${stationId} → ${assetId}`).toBeLessThanOrEqual(2);
    }
  });

  it("advertises the meal recipes at the cook station and marks their outputs edible", () => {
    const sim = new Simulation();
    expect(sim.state.world.structures["struct.kitchen"]).toBeDefined();
    const mealRecipes = [...ContentRegistry.recipes.values()].filter((recipe) => recipe.tags.includes("meal"));
    expect(mealRecipes.length).toBeGreaterThanOrEqual(3);
    for (const recipe of mealRecipes) {
      expect(recipe.stationType).toBe("kitchen");
      if (recipe.result.kind === "items") {
        for (const stack of recipe.result.stacks) {
          expect(ContentRegistry.items.get(stack.itemId)?.consumable?.kind).toBe("work");
        }
      }
    }
  });

  it("keeps the starter farm work area clear of the meal station footprint", () => {
    const layout = getFarmLayout("farm.starter_garden");
    expect(layout).not.toBeNull();
    // The kitchen is a farmhouse outbuilding, not a field station: it stands
    // a few strides from the house, off plantable soil and inside the fences.
    const kitchen = starterStructureAnchor("struct.kitchen")!;
    const farmhouse = starterFarmsteadAnchor("farmhouse")!;
    expect(Math.hypot(kitchen.x - farmhouse.x, kitchen.z - farmhouse.z)).toBeLessThan(12);
    expect(isPlantableFarmSurface("farm.starter_garden", worldToFarmLocal("farm.starter_garden", kitchen))).toBe(false);
  });
});

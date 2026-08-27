import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { GameClock, seasonAtMinute, DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import { tickMarket } from "../../src/simulation/economy/updateMarket";
import { SeededRng } from "../../src/simulation/core/Rng";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import { HARBOR_MARKET, VILLAGE_MARKET } from "../../src/world/WorldAnchors";

describe("Core hunt fixes", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("stops the clock completely when minutesPerRealSecond is 0", () => {
    const clock = new GameClock({ currentMinute: 120, minutesPerRealSecond: 1 });
    clock.setSpeed(0);
    expect(clock.getState().minutesPerRealSecond).toBe(0);
    expect(clock.tick(8)).toBe(0);
    expect(clock.getState().currentMinute).toBe(120);
  });

  it("resolves harbor as the nearby market at the fish-market landmark", () => {
    sim.state.player.x = HARBOR_MARKET.position.x;
    sim.state.player.z = HARBOR_MARKET.position.z;
    expect(sim.getNearbyMarketId()).toBe("market.harbor");

    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    expect(sim.getNearbyMarketId()).toBe("market.village");
  });

  it("defers a landed basic catch when the pack cannot hold it", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing().success).toBe(true);
    const catchItemId = sim.state.basicFishing!.catchItemId!;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const wheatLimit = ContentRegistry.items.get("produce.wheat")!.stackLimit;
    for (const slot of inventory.slots) {
      slot.itemId = "produce.wheat";
      slot.quantity = wheatLimit;
    }

    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(0.1);
    expect(sim.hookBiteBasicFishing().success).toBe(true);
    sim.state.basicFishing!.fishY = 0.35;
    sim.state.basicFishing!.fishTargetY = 0.35;
    sim.state.basicFishing!.barY = 0.25;
    sim.state.basicFishing!.barHeight = 0.4;
    sim.state.basicFishing!.catchProgress = 0.95;
    sim.state.basicFishing!.isHolding = false;
    for (let index = 0; index < 8; index += 1) {
      if (sim.state.basicFishing?.phase === "caught") break;
      sim.tick(0.05);
    }

    expect(sim.state.basicFishing?.phase).toBe("caught");
    expect(InventoryManager.getItemCount(inventory, catchItemId)).toBe(0);
    expect(sim.cancelBasicFishing()).toMatchObject({
      success: false,
      reason: "Your backpack is full. Make space to land the catch."
    });
    expect(sim.state.basicFishing?.phase).toBe("caught");

    inventory.slots[0] = {};
    expect(sim.cancelBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(inventory, catchItemId)).toBe(1);
  });

  it("keeps a full bite-reaction window after a hitch that overshoots the wait", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing().success).toBe(true);
    const window = sim.state.basicFishing!.biteReactionWindowSeconds ?? 1.4;
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.tick(4);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    expect(sim.state.basicFishing?.remainingSeconds).toBeCloseTo(window, 5);
  });

  it("respawns sport schools per unoccupied habitat instead of blocking the whole map", () => {
    const lake = SCHOOL_SPAWN_POINTS[0];
    const coast = SCHOOL_SPAWN_POINTS[1];
    sim.clock.setDebugMinute(DAYS_PER_SEASON * MINUTES_PER_DAY + 10 * 60);
    sim.state.weather.type = "clear";
    sim.state.world.storySchoolSpawned = true;
    sim.spawnFishSchool(lake.habitatId, lake.x, lake.z, ["fish.trout"]);
    sim.state.world.lastSchoolSpawnMinute = sim.state.clock.currentMinute - 90;

    sim.tick(1);

    const habitats = new Set(
      Object.values(sim.state.world.activeSchools).map((school) => school.habitatId)
    );
    expect(habitats.has(lake.habitatId)).toBe(true);
    expect(habitats.has(coast.habitatId)).toBe(true);
  });

  it("applies each market catch-up hour with the season at that hour", () => {
    const winterStart = 90 * MINUTES_PER_DAY;
    expect(seasonAtMinute(winterStart - 60)).toBe("autumn");
    expect(seasonAtMinute(winterStart)).toBe("winter");

    const market = structuredClone(sim.state.markets["market.village"]);
    const wheat = market.commodities["produce.wheat"];
    wheat.lastTickMinute = winterStart - 90;
    tickMarket(market, winterStart + 30, "winter", new SeededRng(11));
    expect(wheat.lastTickMinute).toBe(winterStart + 30);
    expect(wheat.seasonalModifier).toBe(1.2);
  });
});

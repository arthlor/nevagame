import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { GameClock, seasonAtMinute, DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import { tickMarket } from "../../src/simulation/economy/updateMarket";
import { SeededRng } from "../../src/simulation/core/Rng";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import { HARBOR_MARKET, VILLAGE_MARKET, HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { pickUnlockedStationRecipe } from "../../src/simulation/domains/ProcessingDomain";
import { MarketDomain } from "../../src/simulation/domains/MarketDomain";
import type { FishingEncounterState } from "../../src/simulation/core/types";

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
    sim.setDebugMinute(DAYS_PER_SEASON * MINUTES_PER_DAY + 10 * 60);
    sim.state.weather.type = "clear";
    sim.state.weather.nextWeatherMinute = sim.state.clock.currentMinute + 10_000;
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

  it("prices harbor ice buys from the same unit-price function as sells", () => {
    sim.state.player.x = HARBOR_MARKET.position.x;
    sim.state.player.z = HARBOR_MARKET.position.z;
    const money = sim.state.player.money;
    const buy = sim.buyItemAtMarket("market.harbor", "item.crushed_ice", 1);
    expect(buy.success).toBe(true);
    expect(buy.cost).toBeGreaterThan(0);
    const sell = sim.sellItemAtMarket("market.harbor", "item.crushed_ice", 1);
    expect(sell.success).toBe(true);
    expect(sell.revenue).toBe(buy.cost);
    expect(sim.state.player.money).toBe(money);
  });

  it("decays cargo freshness across offline catch-up even when caughtAtMinute equals the frozen clock", () => {
    const cargoId = "cargo.offline_trout";
    const frozenMinute = sim.state.clock.currentMinute;
    sim.state.fishCargo[cargoId] = {
      id: cargoId,
      speciesId: "fish.trout",
      weightKg: 2,
      quality: "common",
      caughtAtMinute: frozenMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = cargoId;
    sim.state.metadata.lastSavedUtcMs = 0;
    applyOfflineProgression(sim.state, 30 * 60 * 1000);
    expect(sim.state.clock.currentMinute).toBeGreaterThan(frozenMinute);
    expect(sim.state.fishCargo[cargoId].freshness).toBeLessThan(100);
  });

  it("lets the player board from the vessel hull, not only the shore apron", () => {
    const boat = sim.state.boats["boat.player_rowboat"];
    expect(boat.isDocked).toBe(true);
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    sim.state.player.x = boat.x;
    sim.state.player.z = boat.z;
    const apronDistance = Math.hypot(boat.x - HARBOR_DOCK.playerPosition.x, boat.z - HARBOR_DOCK.playerPosition.z);
    expect(apronDistance).toBeGreaterThan(HARBOR_DOCK.boardRadius);
    expect(sim.boardBoat("boat.player_rowboat").success).toBe(true);
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");
  });

  it("keeps the harbor slip walkable without swallowing the sailable hull slot", () => {
    const apron = HARBOR_DOCK.playerPosition;
    const hull = HARBOR_DOCK.boatPosition;
    const mid = { x: (apron.x + hull.x) / 2, z: (apron.z + hull.z) / 2 };
    expect(WorldLayout.isWalkable(apron.x, apron.z)).toBe(true);
    expect(WorldLayout.isWalkable(mid.x, mid.z)).toBe(true);
    expect(WorldLayout.isSailable(hull.x, hull.z)).toBe(true);
  });

  it("nulls a failed sport-fishing hydrate so planting and basic casts are not locked", () => {
    const state = createInitialGameState();
    state.sportFishing = {
      result: "active",
      fish: {
        instanceId: "fish_inst.broken",
        speciesId: "fish.not_a_species",
        weightKg: 4,
        quality: "common",
        caughtAtMinute: state.clock.currentMinute
      },
      rodId: "rod.willow",
      stamina: 10,
      maxStamina: 10,
      distanceMeters: 20,
      lineTension: 35,
      lineIntegrity: 100,
      fishDirection: 0,
      behavior: "rest",
      behaviorUntilSeconds: 1,
      elapsedSeconds: 0,
      rodDirectionAngle: 0,
      isReeling: false,
      isSlacking: false,
      isBracing: false,
      slackTimerSeconds: 0,
      snapTimerSeconds: 0
    } as unknown as FishingEncounterState;
    const recovered = new Simulation(state);
    expect(recovered.state.sportFishing).toBeNull();
    recovered.state.player.x = -8;
    recovered.state.player.z = 0;
    expect(recovered.startChargingBasicFishing().success).toBe(true);
  });

  it("rejects save envelopes that are missing market commodity rows", () => {
    const state = createInitialGameState();
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state
    };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    delete state.markets["market.harbor"].commodities["item.crushed_ice"];
    expect(validateSaveEnvelope(envelope)).toBe(false);
  });

  it("cancels a charging-cast and no-ops release unless a cast is charging", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.startChargingBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing?.phase).toBe("charging-cast");
    expect(sim.cancelBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing).toBeNull();
    expect(sim.releaseCastBasicFishing(0.8)).toMatchObject({ success: false });
  });

  it("picks the workbench lure recipe when unlocked and inputs are present", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [
      { itemId: "produce.flax", quantity: 1 },
      { itemId: "item.fish_scraps", quantity: 1 }
    ]);
    expect(pickUnlockedStationRecipe("workbench", inventory, 0)?.id).toBe("recipe.craft_chum");
    expect(pickUnlockedStationRecipe("workbench", inventory, 3000)?.id).toBe("recipe.craft_lure");
  });

  it("keeps the hooked school and a valid save while a sport fight outlives the school TTL", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.hookSportFish(schoolId).success).toBe(true);
    sim.state.world.activeSchools[schoolId].expiresAtMinute = sim.state.clock.currentMinute;
    sim.advanceGameMinutes(1);
    expect(sim.state.world.activeSchools[schoolId]).toBeDefined();
    expect(sim.state.sportFishing?.schoolId).toBe(schoolId);
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: sim.state
    })).toBe(true);
  });

  it("expires unreferenced schools during offline catch-up without dropping an active fight's school", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.hookSportFish(schoolId).success).toBe(true);
    sim.state.world.activeSchools[schoolId].expiresAtMinute = sim.state.clock.currentMinute;
    sim.state.metadata.lastSavedUtcMs = 0;
    applyOfflineProgression(sim.state, 120_000);
    expect(sim.state.world.activeSchools[schoolId]).toBeDefined();
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 120_000,
      state: sim.state
    })).toBe(true);
  });

  it("buys compost starter at the village stall the same way as fertilizer", () => {
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const before = InventoryManager.getItemCount(inventory, "item.compost_starter");
    const money = sim.state.player.money;
    expect(sim.buySeedAtMarket("market.village", "item.compost_starter", 1)).toMatchObject({
      success: true,
      cost: 10
    });
    expect(InventoryManager.getItemCount(inventory, "item.compost_starter")).toBe(before + 1);
    expect(sim.state.player.money).toBe(money - 10);
  });

  it("lets a consumed lure raise sport quality when Work Capacity is full", () => {
    const qualityRank: Record<string, number> = { common: 0, fine: 1, exceptional: 2, trophy: 3 };
    const hookQuality = (seed: number, withLure: boolean): { quality: string; lureLeft: number } => {
      const state = structuredClone(sim.state);
      state.worldSeed = seed;
      state.metadata.rngState = undefined;
      const candidate = new Simulation(state);
      candidate.state.player.workCapacity.current = 1000;
      const inventory = candidate.state.inventories[candidate.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
      if (withLure) InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.basic_lure", quantity: 1 }]);
      const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
      const schoolId = candidate.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
      candidate.state.player.x = lake.x;
      candidate.state.player.z = lake.z;
      expect(candidate.chumFishSchool(schoolId).success).toBe(true);
      const hooked = candidate.hookSportFish(schoolId);
      expect(hooked.success).toBe(true);
      return {
        quality: hooked.encounter!.fish.quality,
        lureLeft: InventoryManager.getItemCount(inventory, "item.basic_lure")
      };
    };

    let improved = false;
    for (let seed = 0; seed < 64; seed += 1) {
      const plain = hookQuality(seed, false);
      const lured = hookQuality(seed, true);
      expect(lured.lureLeft).toBe(0);
      expect(qualityRank[lured.quality]).toBeGreaterThanOrEqual(qualityRank[plain.quality]);
      if (qualityRank[lured.quality] > qualityRank[plain.quality]) improved = true;
    }
    expect(improved).toBe(true);
  });

  it("drains underway skiff fuel during offline catch-up", () => {
    sim.state.boats["boat.player_skiff"] = {
      id: "boat.player_skiff",
      boatTypeId: "boat.skiff",
      x: HARBOR_DOCK.boatPosition.x,
      y: 0,
      z: HARBOR_DOCK.boatPosition.z,
      headingRadians: 0,
      speed: 5,
      fuel: 100,
      durability: 250,
      fishCargoSlotIds: [null, null, null, null, null, null],
      supplyInventoryId: "inv.skiff_supply",
      upgrades: [],
      isDocked: false,
      dockedMarketId: null
    };
    sim.state.inventories["inv.skiff_supply"] = InventoryManager.createInventory("inv.skiff_supply", 8);
    sim.state.metadata.lastSavedUtcMs = 0;
    applyOfflineProgression(sim.state, 60_000);
    expect(sim.state.boats["boat.player_skiff"].fuel).toBeLessThan(100);
  });

  it("does not treat bait, fertilizer, ice, or fuel as bulk produce", () => {
    expect(MarketDomain.isBulkSellProduceItem("produce.wheat")).toBe(true);
    expect(MarketDomain.isBulkSellProduceItem("produce.barley")).toBe(true);
    expect(MarketDomain.isBulkSellProduceItem("item.bait_worms")).toBe(false);
    expect(MarketDomain.isBulkSellProduceItem("item.basic_fertilizer")).toBe(false);
    expect(MarketDomain.isBulkSellProduceItem("item.crushed_ice")).toBe(false);
    expect(MarketDomain.isBulkSellProduceItem("item.chum_bucket")).toBe(false);
    expect(MarketDomain.isBulkSellProduceItem("item.boat_fuel")).toBe(false);
  });

  it("spawns lake and coast sport schools in default spring day clear weather", () => {
    sim.state.world.storySchoolSpawned = true;
    sim.state.world.activeSchools = {};
    sim.state.world.lastSchoolSpawnMinute = sim.state.clock.currentMinute - 90;
    sim.state.weather.type = "clear";
    expect(sim.state.clock.season).toBe("spring");
    expect(sim.state.clock.timeOfDay).toBe("day");
    sim.advanceGameMinutes(1);
    const habitats = new Set(Object.values(sim.state.world.activeSchools).map((school) => school.habitatId));
    expect(habitats.has("lake")).toBe(true);
    expect(habitats.has("coast")).toBe(true);
  });
});


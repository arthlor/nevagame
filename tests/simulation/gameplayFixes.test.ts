// tests/simulation/gameplayFixes.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { calculateCropQuality } from "../../src/simulation/farming/calculateCropGrowth";
import { SeededRng } from "../../src/simulation/core/Rng";
import { tickMarket } from "../../src/simulation/economy/updateMarket";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { advanceScheduledWeather } from "../../src/simulation/weather/updateWeather";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { GameClock } from "../../src/simulation/core/GameClock";

describe("Gameplay simulation fixes", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("pause then unpause actually advances clock", () => {
    const start = sim.state.clock.currentMinute;
    sim.clock.setPaused(true);
    sim.tick(8);
    expect(sim.state.clock.isPaused).toBe(true);
    expect(sim.state.clock.currentMinute).toBe(start);

    sim.clock.setPaused(false);
    sim.tick(8);
    expect(sim.state.clock.isPaused).toBe(false);
    expect(sim.state.clock.currentMinute).toBe(start + 8);
  });

  it("rejects invalid clock inputs without corrupting canonical time", () => {
    const clock = new GameClock({ currentMinute: 120, minutesPerRealSecond: 1 });
    clock.setSpeed(Number.NaN);
    expect(clock.getState().minutesPerRealSecond).toBe(1);
    expect(clock.tick(Number.NaN)).toBe(0);
    clock.advanceMinutes(Number.NaN);
    clock.advanceMinutes(Number.POSITIVE_INFINITY);
    expect(clock.getState().currentMinute).toBe(120);
  });

  it("withered harvest frees the plot with no yield or XP", () => {
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", 0, 0).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    const farm = sim.state.farms["farm.starter_garden"];
    sim.state.crops[placedCropId].stage = "withered";
    const xpBefore = sim.state.player.proficiencies.farming;
    const wheatBefore = InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "produce.wheat"
    );

    const res = sim.harvestCrop(placedCropId);
    expect(res.success).toBe(true);
    expect(res.yield).toBe(0);
    expect(sim.state.crops[placedCropId]).toBeUndefined();
    expect(farm.placedCropIds).not.toContain(placedCropId);
    expect(sim.state.player.proficiencies.farming).toBe(xpBefore);
    expect(
      InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "produce.wheat")
    ).toBe(wheatBefore);

    const replant = sim.plantCrop("farm.starter_garden", "crop.wheat", 0, 0);
    expect(replant.success).toBe(true);
  });

  it("castBasicFishing uses current habitat conditions and resolves through an explicit attempt", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    const river = sim.castBasicFishing();
    expect(river.success).toBe(true);
    expect(sim.state.basicFishing?.catchItemId).toBe("fish.perch");
    sim.state.basicFishing!.willCatch = true;
    sim.tick(10);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "fish.perch")).toBe(1);

    sim.state.player.x = 0;
    sim.state.player.z = 60;
    const coast = sim.castBasicFishing();
    expect(coast.success).toBe(true);
    expect(sim.state.basicFishing?.catchItemId).toBe("fish.mackerel");

    const lake = sim.castBasicFishing();
    expect(lake).toMatchObject({ success: false, reason: "Already fishing" });

    const unknown = sim.castBasicFishing();
    expect(unknown.success).toBe(false);
  });

  it("castBasicFishing full inventory does not consume bait", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    for (const slot of inv.slots) {
      if (!slot.itemId) {
        slot.itemId = "seed.wheat";
        slot.quantity = 1;
      }
    }
    const baitBefore = InventoryManager.getItemCount(inv, "item.bait_worms");
    expect(baitBefore).toBeGreaterThan(1);
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    const full = sim.castBasicFishing();
    expect(full.success).toBe(false);
    expect(InventoryManager.getItemCount(inv, "item.bait_worms")).toBe(baitBefore);
  });

  it("derives fishing habitat from the physical world and rejects dry land", () => {
    sim.state.player.x = 50;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing()).toMatchObject({ success: false, reason: "Move closer to fishable water" });

    sim.state.player.z = 41;
    expect(sim.castBasicFishing()).toMatchObject({ success: true });
    expect(sim.state.basicFishing?.habitatId).toBe("lake");
    expect(sim.state.basicFishing?.catchItemId).toBe("fish.carp");
  });

  it("rejects fish schools outside their physical habitat or catch table", () => {
    expect(() => sim.spawnFishSchool("lake", 0, 0, ["fish.trout"])).toThrow(/physical habitat/);
    expect(() => sim.spawnFishSchool("lake", -30, 45, ["fish.perch"])).toThrow(/eligible sport-fish/);
    expect(() => sim.spawnFishSchool("lake", -30, 45, [])).toThrow(/eligible sport-fish/);
  });

  it("offline cap: 3 real hours still simulates 3*3600 game minutes", () => {
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 3 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(3 * 3600);
  });

  it("offline cap: more than 72 real hours is capped at 72h of game minutes", () => {
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 80 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(72 * 3600);
  });

  it("rounds offline fractional speeds to canonical whole game minutes", () => {
    const now = Date.now();
    sim.state.clock.minutesPerRealSecond = 0.5;
    sim.state.metadata.lastSavedUtcMs = now - 1_000;
    expect(applyOfflineProgression(sim.state, now).simulatedGameMinutes).toBe(0);

    sim.state.metadata.lastSavedUtcMs = now - 2_000;
    expect(applyOfflineProgression(sim.state, now).simulatedGameMinutes).toBe(1);
    expect(sim.state.clock.currentMinute).toBe(8 * 60 + 1);
  });

  it("seasonal: demandIndex is not pre-multiplied by 1.2 winter", () => {
    const market = sim.state.markets["market.village"];
    const wheat = market.commodities["produce.wheat"];
    wheat.localSupply = wheat.targetSupply;
    wheat.lastTickMinute = sim.state.clock.currentMinute - 60;
    wheat.seasonalModifier = 1.2;
    const rng = new SeededRng(99);
    tickMarket(market, sim.state.clock.currentMinute, "winter", rng);
    expect(wheat.seasonalModifier).toBe(1.2);
    expect(wheat.demandIndex).toBeGreaterThanOrEqual(0.65);
    expect(wheat.demandIndex).toBeLessThanOrEqual(1.1);
    expect(wheat.demandIndex).toBeLessThan(1.15);
  });

  it("remainingCatchPotential decrements on successful hook", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 2 }]);
    const schoolId = sim.spawnFishSchool("lake", -30, 45, ["fish.trout"]);
    sim.state.player.x = -30;
    sim.state.player.z = 45;
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    const hook = sim.hookSportFish(schoolId);
    expect(hook.success).toBe(true);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);

    const again = sim.hookSportFish(schoolId);
    expect(again.success).toBe(false);
    expect(again.reason).toBe("Already fighting a fish");
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
  });

  it("starter willow cannot hook heavy-sport tuna", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const schoolId = sim.spawnFishSchool("coast", 60, 80, ["fish.tuna"]);
    sim.state.player.x = 60;
    sim.state.player.z = 80;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    const hook = sim.hookSportFish(schoolId);
    expect(hook.success).toBe(false);
    expect(hook.reason).toMatch(/rod/i);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
  });

  it("sell spoiled cargo fails without deleting the fish", () => {
    sim.state.fishCargo["cargo.spoiled"] = {
      id: "cargo.spoiled",
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 0,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = "cargo.spoiled";
    const money = sim.state.player.money;
    const sell = sim.sellFishCargoAtMarket("market.harbor", "cargo.spoiled");
    expect(sell.success).toBe(false);
    expect(sim.state.fishCargo["cargo.spoiled"]).toBeDefined();
    expect(sim.state.player.money).toBe(money);
    expect(sim.state.player.carriedFishCargoId).toBe("cargo.spoiled");
  });

  it("requires the player to be at the selected market before a sale can mutate inventory", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "produce.wheat", quantity: 1 }]);

    expect(sim.sellItemAtMarket("market.village", "produce.wheat", 1)).toMatchObject({ success: true });
    InventoryManager.addItemsAtomically(inv, [{ itemId: "produce.wheat", quantity: 1 }]);
    sim.state.player.x = 40;
    sim.state.player.z = 40;

    expect(sim.sellItemAtMarket("market.village", "produce.wheat", 1)).toMatchObject({ success: false });
    expect(InventoryManager.getItemCount(inv, "produce.wheat")).toBe(1);
  });

  it("discardFishCargo removes spoiled fish and grants scraps when there is space", () => {
    sim.state.fishCargo["cargo.spoiled"] = {
      id: "cargo.spoiled",
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 0,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = "cargo.spoiled";
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    const scrapsBefore = InventoryManager.getItemCount(inv, "item.fish_scraps");
    const discard = sim.discardFishCargo("cargo.spoiled");
    expect(discard.success).toBe(true);
    expect(sim.state.fishCargo["cargo.spoiled"]).toBeUndefined();
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(InventoryManager.getItemCount(inv, "item.fish_scraps")).toBe(scrapsBefore + 1);
  });

  it("calculateCropQuality uses rngRoll and does not consume rng", () => {
    const rng = new SeededRng(42);
    const control = new SeededRng(42);
    const expectedFirst = control.nextFloat();
    const inputs = {
      climateMatchScore: 1.0,
      averageMoisture: 80,
      soilFertility: 90,
      farmingProficiency: 5000,
      rngRoll: 0
    };
    const low = calculateCropQuality(inputs, rng);
    expect(rng.nextFloat()).toBe(expectedFirst);

    const high = calculateCropQuality({ ...inputs, rngRoll: 1 }, rng);
    expect(high.score - low.score).toBeCloseTo(10);
  });

  it("tickMarket runs whenever minutes advanced, not only on the hour", () => {
    const wheat = sim.state.markets["market.village"].commodities["produce.wheat"];
    const startMinute = sim.state.clock.currentMinute;
    expect(startMinute % 60).toBe(0);
    sim.tick(90);
    expect(sim.state.clock.currentMinute).toBe(startMinute + 90);
    expect(sim.clock.getMinuteOfHour()).toBe(30);
    expect(wheat.lastTickMinute).toBe(sim.state.clock.currentMinute);
  });

  it("advances scheduled weather deterministically and persists the next forecast window", () => {
    const weather = { ...sim.state.weather, nextWeatherMinute: sim.state.clock.currentMinute };
    const rng = new SeededRng(22);
    const changed = advanceScheduledWeather(weather, sim.state.clock.currentMinute, rng);

    expect(weather.nextWeatherMinute).toBeGreaterThan(sim.state.clock.currentMinute);
    expect(weather.windDirectionDeg).toBeGreaterThanOrEqual(0);
    expect(weather.windDirectionDeg).toBeLessThan(360);
    expect(weather.seaRoughness).toBeGreaterThanOrEqual(0);
    expect(weather.seaRoughness).toBeLessThanOrEqual(1);
    expect(typeof changed).toBe("boolean");
  });

  it("live tick expires contracts at expiresAtMinute", () => {
    const contract = sim.state.contracts[0];
    contract.status = "active";
    contract.expiresAtMinute = sim.state.clock.currentMinute + 1;
    sim.tick(1);
    expect(contract.status).toBe("expired");
  });

  it("delivers an active item contract atomically and pays its reward exactly once", () => {
    const contract = sim.state.contracts[0];
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 6 }]);
    const moneyBefore = sim.state.player.money;

    const partial = sim.deliverItemsToContract(contract.id, "produce.wheat", 5);
    expect(partial).toMatchObject({ success: true, delivered: 5, completed: false });
    expect(contract.quantityFulfilled).toBe(5);
    expect(contract.status).toBe("active");
    expect(sim.state.player.money).toBe(moneyBefore);

    const complete = sim.deliverItemsToContract(contract.id, "produce.wheat", 1);
    expect(complete).toMatchObject({ success: true, delivered: 1, completed: true, rewardMoney: 65 });
    expect(contract.status).toBe("completed");
    expect(sim.state.player.money).toBe(moneyBefore + 65);
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(0);

    expect(sim.deliverItemsToContract(contract.id, "produce.wheat", 1)).toMatchObject({ success: false });
    expect(sim.state.player.money).toBe(moneyBefore + 65);
  });

  it("enforces crop XP gates and station recipe contracts before consuming inputs", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "seed.barley", quantity: 1 }]);
    expect(sim.plantCrop("farm.starter_garden", "crop.barley", 0, 0)).toMatchObject({
      success: false,
      reason: "Requires 500 Farming XP"
    });
    expect(InventoryManager.getItemCount(inventory, "seed.barley")).toBe(1);

    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }]);
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.workbench")).toMatchObject({ success: false });
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(2);
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "unknown.station")).toMatchObject({ success: false });

    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill")).toMatchObject({ success: true });
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill")).toMatchObject({
      success: false,
      reason: "Station is already in use"
    });
  });

  it("only accepts contract fish cargo that meets the target requirements", () => {
    const contract = {
      id: "contract.test_trout",
      templateId: "contract.fresh_trout_order",
      requesterId: "npc.harbor_innkeeper",
      type: "fresh-fish" as const,
      targetItemIdOrSpecies: "fish.trout",
      quantityRequired: 1,
      quantityFulfilled: 0,
      minFreshness: 80,
      rewardMoney: 90,
      rewardSkillXp: { skill: "fishing" as const, xp: 20 },
      expiresAtMinute: sim.state.clock.currentMinute + 120,
      status: "active" as const
    };
    sim.state.contracts.push(contract);
    sim.state.fishCargo["cargo.test_trout"] = {
      id: "cargo.test_trout",
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: sim.state.clock.currentMinute,
      freshness: 79,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = "cargo.test_trout";

    expect(sim.deliverFishCargoToContract(contract.id, "cargo.test_trout")).toMatchObject({ success: false });
    expect(sim.state.fishCargo["cargo.test_trout"]).toBeDefined();

    sim.state.fishCargo["cargo.test_trout"].freshness = 80;
    const delivered = sim.deliverFishCargoToContract(contract.id, "cargo.test_trout");
    expect(delivered).toMatchObject({ success: true, completed: true, rewardMoney: 90 });
    expect(sim.state.fishCargo["cargo.test_trout"]).toBeUndefined();
    expect(sim.state.player.carriedFishCargoId).toBeNull();
  });

  it("persists rngState so save/load does not reroll the same sequence", () => {
    sim.plantCrop("farm.starter_garden", "crop.wheat", 0, 0);
    const savedState = sim.rng.getState();
    expect(sim.state.metadata.rngState).toBe(savedState);
    const clone = JSON.parse(JSON.stringify(sim.state));
    const loaded = new Simulation(clone);
    expect(loaded.rng.getState()).toBe(savedState);
    expect(loaded.rng.nextFloat()).toBe(sim.rng.nextFloat());
  });

  it("validateSaveEnvelope requires inventories, player, and clock objects", () => {
    const valid = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    };
    expect(validateSaveEnvelope(valid)).toBe(true);
    expect(
      validateSaveEnvelope({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 1,
        state: { worldSeed: 1, clock: { currentMinute: 1 }, player: { money: 0 } }
      })
    ).toBe(false);

    const unresolvedCrop = createInitialGameState();
    unresolvedCrop.crops["crop.bad"] = {
      id: "crop.bad",
      cropId: "crop.missing",
      farmId: "farm.starter_garden",
      x: 0,
      z: 0,
      rotationRadians: 0,
      plantedAtMinute: 0,
      lastUpdatedMinute: 0,
      effectiveGrowthMinutes: 0,
      moisture: 50,
      health: 100,
      stage: "seeded",
      averageMoistureAccum: 50,
      moistureSampleCount: 1
    };
    unresolvedCrop.farms["farm.starter_garden"].placedCropIds.push("crop.bad");
    expect(validateSaveEnvelope({ schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state: unresolvedCrop })).toBe(false);
  });

  it("keeps sport-fishing state serializable and restores it after save/load", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const schoolId = sim.spawnFishSchool("lake", -30, 45, ["fish.trout"]);
    sim.state.player.x = -30;
    sim.state.player.z = 45;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    expect(sim.hookSportFish(schoolId).success).toBe(true);
    expect(sim.state.sportFishing?.result).toBe("active");

    const reloaded = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    expect(reloaded.activeFishingEncounter).not.toBeNull();
    expect(reloaded.state.sportFishing?.fish.instanceId).toBe(sim.state.sportFishing?.fish.instanceId);
  });

  it("keeps an in-progress basic-fishing attempt in serializable state", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing()).toMatchObject({ success: true });
    const reloaded = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    expect(reloaded.state.basicFishing).toMatchObject({ habitatId: "river", phase: "casting" });
    reloaded.tick(10);
    expect(reloaded.state.basicFishing).toBeNull();
  });

  it("migrates a v2 boat save to explicit dock and sport-fishing state", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialGameState()));
    legacy.schemaVersion = 2;
    delete legacy.sportFishing;
    for (const boat of Object.values(legacy.boats) as Array<Record<string, unknown>>) {
      delete boat.dockedMarketId;
    }
    const envelope = { schemaVersion: 2, savedAtUtcMs: 1, state: legacy };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.sportFishing).toBeNull();
    expect(migrated.state.boats["boat.player_rowboat"].dockedMarketId).toBe("market.harbor");
  });

  it("requires a docked nearby boat and never teleports a remote boat home", () => {
    expect(sim.boardBoat("boat.player_rowboat")).toMatchObject({ success: false });
    sim.state.player.x = HARBOR_DOCK.playerPosition.x;
    sim.state.player.z = HARBOR_DOCK.playerPosition.z;
    expect(sim.boardBoat("boat.player_rowboat")).toMatchObject({ success: true });
    const boat = sim.state.boats["boat.player_rowboat"];
    expect(boat.isDocked).toBe(false);
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");

    sim.driveActiveBoat({ x: 0, z: -1 }, 8);
    expect(sim.dockActiveBoat()).toMatchObject({ success: false });
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");
    expect(boat.isDocked).toBe(false);
  });

  it("rejects remote boat cargo from market sale and discard", () => {
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.fishCargoSlotIds[0] = "cargo.remote";
    sim.state.fishCargo["cargo.remote"] = {
      id: "cargo.remote",
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: 0,
      freshness: 90,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
    };
    sim.state.player.x = 21;
    sim.state.player.z = 33.5;
    expect(sim.sellFishCargoAtMarket("market.harbor", "cargo.remote")).toMatchObject({ success: false });
    expect(sim.discardFishCargo("cargo.remote")).toMatchObject({ success: false });
    expect(sim.state.fishCargo["cargo.remote"]).toBeDefined();
  });

  it("migrateSaveData does not stamp CURRENT_SCHEMA_VERSION if a migration is missing", () => {
    const migrated = migrateSaveData({
      schemaVersion: 0,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    });
    expect(migrated.schemaVersion).toBe(0);
  });

  it("resetPlayerToSafeSpawn teleports character to village, docks active boat, and clears fishing", () => {
    // 1. Teleport from remote on-foot position
    sim.state.player.x = 999;
    sim.state.player.y = -50;
    sim.state.player.z = -999;
    sim.state.player.rotationY = 3.14;
    sim.state.player.currentRegionId = "region.coast";
    sim.resetPlayerToSafeSpawn();

    expect(sim.state.player.x).toBe(0);
    expect(sim.state.player.y).toBe(0.5);
    expect(sim.state.player.z).toBe(0);
    expect(sim.state.player.rotationY).toBe(0);
    expect(sim.state.player.currentRegionId).toBe("region.village");

    // 2. Reset while driving a boat out at sea
    const boat = sim.state.boats["boat.player_rowboat"];
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.x = -150;
    boat.z = -200;
    boat.speed = 8;
    boat.headingRadians = 1.5;
    sim.state.player.activeBoatId = "boat.player_rowboat";
    sim.state.player.x = -150;
    sim.state.player.z = -200;

    sim.resetPlayerToSafeSpawn();
    expect(sim.state.player.activeBoatId).toBeNull();
    expect(sim.state.player.x).toBe(0);
    expect(sim.state.player.z).toBe(0);
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBe("market.harbor");
    expect(boat.x).toBe(35);
    expect(boat.z).toBe(55);
    expect(boat.speed).toBe(0);

    // 3. Reset while basic-fishing or sport-fishing
    sim.state.basicFishing = {
      phase: "waiting",
      habitatId: "ocean",
      remainingSeconds: 4,
      willCatch: true
    };
    sim.resetPlayerToSafeSpawn();
    expect(sim.state.basicFishing).toBeNull();
  });
});

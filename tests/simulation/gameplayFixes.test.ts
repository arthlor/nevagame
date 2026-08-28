// tests/simulation/gameplayFixes.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { calculateCropQuality } from "../../src/simulation/farming/calculateCropGrowth";
import { SeededRng } from "../../src/simulation/core/Rng";
import { tickMarket } from "../../src/simulation/economy/updateMarket";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { CURRENT_SCHEMA_VERSION } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { advanceScheduledWeather } from "../../src/simulation/weather/updateWeather";
import {
  HARBOR_DOCK,
  HARBOR_FISH_TABLE,
  HARBOR_MARKET,
  HARBOR_SKIFF_MOORING,
  VILLAGE_MARKET,
  WORLD_SPAWN
} from "../../src/world/WorldAnchors";
import { GameClock } from "../../src/simulation/core/GameClock";
import { WorldLayout } from "../../src/world/WorldLayout";
import { FERTILITY_RESTORE } from "../../src/simulation/domains/FarmingDomain";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";


function movePlayerToProcessingFront(simulation: Simulation, stationId: string): void {
  const station = simulation.state.world.structures[stationId];
  const front = station ? getProcessingStationFrontPosition(stationId, station) : null;
  if (!front) throw new Error(`Missing processing front for ${stationId}`);
  simulation.state.player.x = front.x;
  simulation.state.player.z = front.z;
}

function movePlayerToProcessingCenter(simulation: Simulation, stationId: string): void {
  const station = simulation.state.world.structures[stationId];
  if (!station) throw new Error(`Missing processing station ${stationId}`);
  simulation.state.player.x = station.x;
  simulation.state.player.z = station.z;
}

describe("Gameplay simulation fixes", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
  });

  it("pause then unpause actually advances clock", () => {
    const start = sim.state.clock.currentMinute;
    sim.clock.setPaused(true);
    sim.tick(8);
    expect(sim.state.clock.isPaused).toBe(true);
    expect(sim.state.clock.currentMinute).toBe(start);

    sim.clock.setPaused(false);
    sim.advanceGameMinutes(8);
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
    expect(sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    ).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    const farm = sim.state.farms["farm.starter_garden"];
    sim.state.crops[placedCropId].stage = "withered";
    const xpBefore = sim.state.player.proficiencies.farming;
    const wheatBefore = InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "produce.wheat"
    );
    const plantMatterBefore = InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "item.plant_matter"
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
    expect(
      InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "item.plant_matter")
    ).toBe(plantMatterBefore);

    const replant = sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    );
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
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    sim.tick(2);
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "fish.perch")).toBe(0);

    sim.state.player.x = 118;
    sim.state.player.z = WorldLayout.coastlineZ(118) + 40;
    const coast = sim.castBasicFishing();
    expect(coast.success).toBe(true);
    expect(sim.state.basicFishing?.catchItemId).toBe("fish.mackerel");

    const lake = sim.castBasicFishing();
    expect(lake).toMatchObject({ success: false, reason: "Already fishing" });

    const unknown = sim.castBasicFishing();
    expect(unknown.success).toBe(false);
  });

  it("hooking a bite then completing the minigame still lands the fish", () => {
    sim.state.player.x = -8;
    sim.state.player.z = 0;
    expect(sim.castBasicFishing().success).toBe(true);
    sim.state.basicFishing!.remainingSeconds = 0.05;
    sim.state.basicFishing!.willCatch = true;
    sim.tick(0.1);
    expect(sim.state.basicFishing?.phase).toBe("bite-reaction");
    expect(sim.hookBiteBasicFishing().success).toBe(true);
    expect(sim.state.basicFishing?.phase).toBe("minigame");

    sim.state.basicFishing!.fishY = 0.35;
    sim.state.basicFishing!.fishTargetY = 0.35;
    sim.state.basicFishing!.barY = 0.25;
    sim.state.basicFishing!.barHeight = 0.4;
    sim.state.basicFishing!.catchProgress = 0.95;
    sim.state.basicFishing!.isHolding = false;
    for (let i = 0; i < 5; i++) {
      if (!sim.state.basicFishing) break;
      sim.tick(0.05);
    }
    expect(sim.state.basicFishing).toBeNull();
    expect(InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "fish.perch")).toBe(1);
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

    sim.state.player.z = WorldLayout.coastlineZ(50) + 8;
    expect(sim.castBasicFishing()).toMatchObject({ success: true });
    expect(sim.state.basicFishing?.habitatId).toBe("coast");
    expect(sim.state.basicFishing?.catchItemId).toBe("fish.mackerel");
  });

  it("rejects fish schools outside their physical habitat or catch table", () => {
    expect(() => sim.spawnFishSchool("lake", 0, 0, ["fish.trout"])).toThrow(/physical habitat/);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    expect(() => sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.perch"])).toThrow(/eligible sport-fish/);
    expect(() => sim.spawnFishSchool("lake", lake.x, lake.z, [])).toThrow(/eligible sport-fish/);
  });

  it("offline cap: 3 real hours simulates 3*3600*0.4 game minutes", () => {
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 3 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(Math.floor(3 * 3600 * 0.4));
  });

  it("offline cap: more than 72 real hours is capped at 72h at the stored clock speed", () => {
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 80 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(Math.floor(72 * 3600 * sim.state.clock.minutesPerRealSecond));
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
    const winterMinute = 90 * 1440 + 8 * 60;
    wheat.lastTickMinute = winterMinute - 60;
    wheat.seasonalModifier = 1.2;
    const rng = new SeededRng(99);
    tickMarket(market, winterMinute, "winter", rng);
    expect(wheat.seasonalModifier).toBe(1.2);
    expect(wheat.demandIndex).toBeGreaterThanOrEqual(0.65);
    expect(wheat.demandIndex).toBeLessThanOrEqual(1.1);
    expect(wheat.demandIndex).toBeLessThan(1.15);
  });

  it("remainingCatchPotential stays until the catch is committed to cargo", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 2 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
    expect(sim.chumFishSchool(schoolId).success).toBe(true);
    const hook = sim.hookSportFish(schoolId);
    expect(hook.success).toBe(true);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);

    const again = sim.hookSportFish(schoolId);
    expect(again.success).toBe(false);
    expect(again.reason).toBe("Already fighting a fish");
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
  });

  it("starter willow cannot hook heavy-sport tuna", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const coast = { x: 118, z: WorldLayout.coastlineZ(118) + 58 };
    const schoolId = sim.spawnFishSchool("coast", coast.x, coast.z, ["fish.tuna"]);
    sim.state.player.x = coast.x;
    sim.state.player.z = coast.z;
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

  it("does not sell sport fish at a market without that species commodity", () => {
    const cargoId = "cargo.village_reject";
    sim.state.fishCargo[cargoId] = {
      id: cargoId,
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: sim.state.clock.currentMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "player", containerId: "player" }
    };
    sim.state.player.carriedFishCargoId = cargoId;
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    const money = sim.state.player.money;

    expect(sim.sellFishCargoAtMarket("market.village", cargoId)).toEqual({
      success: false,
      reason: "Market does not trade this fish"
    });
    expect(sim.state.fishCargo[cargoId]).toBeDefined();
    expect(sim.state.player.money).toBe(money);
  });

  it("requires the player to be at the selected market before a sale can mutate inventory", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "produce.wheat", quantity: 1 }]);

    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
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
    sim.advanceGameMinutes(90);
    expect(sim.state.clock.currentMinute).toBe(startMinute + 90);
    expect(sim.clock.getMinuteOfHour()).toBe(30);
    expect(wheat.lastTickMinute).toBe(startMinute + 90);
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
    sim.advanceGameMinutes(1);
    expect(contract.status).toBe("expired");
  });

  it("offline progression expires and refreshes the reachable contract board", () => {
    const state = structuredClone(sim.state);
    state.contracts[0].expiresAtMinute = state.clock.currentMinute + 1;
    const summary = applyOfflineProgression(state, state.metadata.lastSavedUtcMs + 10_000);

    expect(summary.contractsExpiredCount).toBe(1);
    const active = state.contracts.filter((contract) => contract.status === "active");
    expect(active.length).toBeGreaterThan(0);
    expect(active.every((contract) => contract.type === "produce")).toBe(true);
  });

  it("delivers an active item contract atomically and pays its reward exactly once", () => {
    const contract = sim.state.contracts[0];
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 6 }]);
    const moneyBefore = sim.state.player.money;
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;

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
    expect(sim.plantCrop(
      "farm.starter_garden",
      "crop.barley",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    )).toMatchObject({
      success: false,
      reason: "Requires 500 Farming XP"
    });
    expect(InventoryManager.getItemCount(inventory, "seed.barley")).toBe(1);

    InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }]);
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.workbench")).toMatchObject({ success: false });
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(2);
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "unknown.station")).toMatchObject({ success: false });

    movePlayerToProcessingFront(sim, "struct.starter_mill");
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill")).toMatchObject({ success: true });
    expect(sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill")).toMatchObject({
      success: false,
      reason: "Station is already in use"
    });
  });

  it("keeps the village seed stall and processing list within the live slice", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    sim.state.player.money = 1000;
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;

    expect(sim.buySeedAtMarket("market.village", "seed.carrot", 1)).toMatchObject({
      success: false,
      reasonCode: "not-stocked"
    });
    expect(sim.buySeedAtMarket("market.village", "seed.wheat", 1)).toMatchObject({ success: true });

    InventoryManager.addItemsAtomically(inventory, [{ itemId: "fish.carp", quantity: 1 }]);
    movePlayerToProcessingFront(sim, HARBOR_FISH_TABLE.structureId);
    expect(sim.startProcessingJob("recipe.carp_to_scraps", HARBOR_FISH_TABLE.structureId)).toMatchObject({
      success: false,
      reason: "That recipe is not available yet"
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
    sim.state.player.x = VILLAGE_MARKET.position.x;
    sim.state.player.z = VILLAGE_MARKET.position.z;
    expect(sim.deliverFishCargoToContract(contract.id, "cargo.test_trout")).toMatchObject({
      success: false,
      reason: "Bring this fish cargo to the Harbor Fish Market"
    });

    sim.state.player.x = HARBOR_MARKET.position.x;
    sim.state.player.z = HARBOR_MARKET.position.z;
    const delivered = sim.deliverFishCargoToContract(contract.id, "cargo.test_trout");
    expect(delivered).toMatchObject({ success: true, completed: true, rewardMoney: 90 });
    expect(sim.state.fishCargo["cargo.test_trout"]).toBeUndefined();
    expect(sim.state.player.carriedFishCargoId).toBeNull();
  });

  it("persists rngState so save/load does not reroll the same sequence", () => {
    sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    );
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
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
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
    expect(reloaded.state.basicFishing?.phase).toBe("bite-reaction");
    reloaded.tick(2);
    expect(reloaded.state.basicFishing).toBeNull();
  });

  it("migrates a v2 boat save to explicit dock and sport-fishing state", () => {
    const legacy = JSON.parse(JSON.stringify(createInitialGameState()));
    legacy.schemaVersion = 2;
    legacy.player.workCapacity.lastRegenMinute = legacy.player.workCapacity.regeneratedAtMinute;
    delete legacy.player.workCapacity.regeneratedAtMinute;
    delete legacy.sportFishing;
    for (const boat of Object.values(legacy.boats) as Array<Record<string, unknown>>) {
      delete boat.dockedMarketId;
      boat.x = 35;
      boat.y = 0;
      boat.z = 55;
    }
    const envelope = { schemaVersion: 2, savedAtUtcMs: 1, state: legacy };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.sportFishing).toBeNull();
    expect(migrated.state.boats["boat.player_rowboat"].dockedMarketId).toBe("market.harbor");
    expect(migrated.state.boats["boat.player_rowboat"]).toMatchObject(HARBOR_DOCK.boatPosition);
  });

  it("requires a docked nearby boat and never teleports a remote boat home", () => {
    expect(sim.boardBoat("boat.player_rowboat")).toMatchObject({ success: false });
    sim.state.quests.unlockedFeatureIds.push("boat.player_rowboat");
    sim.state.player.x = HARBOR_DOCK.playerPosition.x;
    sim.state.player.z = HARBOR_DOCK.playerPosition.z;
    expect(sim.boardBoat("boat.player_rowboat")).toMatchObject({ success: true });
    const boat = sim.state.boats["boat.player_rowboat"];
    expect(boat.isDocked).toBe(false);
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");

    Object.assign(boat, { x: 0, z: 90, speed: 2 });
    Object.assign(sim.state.player, { x: boat.x, z: boat.z });
    expect(sim.dockActiveBoat()).toMatchObject({ success: false });
    expect(sim.state.player.activeBoatId).toBe("boat.player_rowboat");
    expect(boat.isDocked).toBe(false);
  });

  it("purchases, boards, docks, and reloads the progression skiff without changing the rowboat", () => {
    const initialMoney = 1200;
    sim.state.player.money = initialMoney;
    sim.state.player.proficiencies.fishing = 15000;
    sim.state.player.x = HARBOR_SKIFF_MOORING.playerPosition.x;
    sim.state.player.z = HARBOR_SKIFF_MOORING.playerPosition.z;

    const purchase = sim.execute({ type: "boat.purchase-skiff" });
    expect(purchase).toMatchObject({ success: true, cost: 850 });
    expect(sim.state.player.money).toBe(initialMoney - 850);
    expect(sim.state.boats["boat.player_rowboat"]).toMatchObject({ boatTypeId: "boat.rowboat", isDocked: true });
    const skiff = sim.state.boats["boat.player_skiff"];
    expect(skiff).toMatchObject({
      boatTypeId: "boat.skiff",
      x: HARBOR_SKIFF_MOORING.boatPosition.x,
      z: HARBOR_SKIFF_MOORING.boatPosition.z,
      isDocked: true,
      dockedMarketId: "market.harbor"
    });
    expect(skiff.fishCargoSlotIds).toHaveLength(6);
    expect(sim.state.inventories[skiff.supplyInventoryId]?.slotCount).toBe(8);

    skiff.durability = 211;
    skiff.fishCargoSlotIds[0] = "cargo.skiff.persistence";
    sim.state.fishCargo["cargo.skiff.persistence"] = {
      id: "cargo.skiff.persistence",
      speciesId: "fish.tuna",
      weightKg: 31,
      quality: "fine",
      caughtAtMinute: sim.state.clock.currentMinute,
      freshness: 94,
      cargoClass: "medium",
      location: { type: "boat-hold", containerId: skiff.id, slotIndex: 0 }
    };
    sim.state.boats["boat.player_rowboat"].durability = 77;

    expect(sim.boardBoat("boat.player_skiff")).toMatchObject({ success: true });
    expect(sim.state.player.activeBoatId).toBe("boat.player_skiff");
    expect(sim.dockActiveBoat()).toMatchObject({ success: true });
    expect(sim.state.player.activeBoatId).toBeNull();
    expect(skiff.isDocked).toBe(true);

    const envelope = { schemaVersion: sim.state.schemaVersion, savedAtUtcMs: 1, state: JSON.parse(JSON.stringify(sim.state)) };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const reloaded = new Simulation(envelope.state);
    expect(reloaded.state.boats["boat.player_rowboat"]).toMatchObject({ durability: 77 });
    expect(reloaded.state.boats["boat.player_skiff"]).toMatchObject({
      durability: 211,
      isDocked: true,
      fishCargoSlotIds: ["cargo.skiff.persistence", null, null, null, null, null]
    });
    expect(reloaded.state.fishCargo["cargo.skiff.persistence"]?.location).toEqual({
      type: "boat-hold",
      containerId: "boat.player_skiff",
      slotIndex: 0
    });
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
    sim.state.player.x = 68;
    sim.state.player.z = 64;
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

  it("createInitialState processing stations sit on terrain", () => {
    const state = createInitialGameState();
    const stations = Object.values(state.world.structures);
    expect(stations.length).toBeGreaterThanOrEqual(4);
    for (const structure of stations) {
      expect(structure.y).toBeGreaterThan(0.5);
      expect(structure.y).toBeCloseTo(WorldLayout.terrainHeight(structure.x, structure.z), 6);
    }
  });

  it("applies fertilizer to restore fertility and consumes the item", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    const farm = sim.state.farms["farm.starter_garden"];
    farm.soil.fertility = 40;
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.basic_fertilizer", quantity: 1 }]);
    const result = sim.execute({ type: "farm.apply-fertilizer", farmId: "farm.starter_garden" });
    expect(result.success).toBe(true);
    expect(farm.soil.fertility).toBe(40 + FERTILITY_RESTORE);
    expect(InventoryManager.getItemCount(inventory, "item.basic_fertilizer")).toBe(0);
  });

  it("fails fertilizer without the item and does not change fertility", () => {
    const farm = sim.state.farms["farm.starter_garden"];
    farm.soil.fertility = 40;
    const result = sim.execute({ type: "farm.apply-fertilizer", farmId: "farm.starter_garden" });
    expect(result.success).toBe(false);
    expect(farm.soil.fertility).toBe(40);
  });

  it("harvest still decreases fertility", () => {
    const farm = sim.state.farms["farm.starter_garden"];
    const before = farm.soil.fertility;
    expect(sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    ).success).toBe(true);
    const placedCropId = Object.keys(sim.state.crops)[0];
    sim.state.crops[placedCropId].stage = "mature";
    sim.state.crops[placedCropId].effectiveGrowthMinutes = 60;
    const result = sim.harvestCrop(placedCropId);
    expect(result.success).toBe(true);
    expect(farm.soil.fertility).toBeLessThan(before);
  });

  it("initial state includes a harbor fish-table", () => {
    const state = createInitialGameState();
    const table = state.world.structures[HARBOR_FISH_TABLE.structureId];
    expect(table).toMatchObject({
      id: HARBOR_FISH_TABLE.structureId,
      type: "fish-table",
      x: HARBOR_FISH_TABLE.position.x,
      z: HARBOR_FISH_TABLE.position.z
    });
    expect(table.y).toBeGreaterThan(0.5);
    expect(table.y).toBeCloseTo(
      WorldLayout.terrainHeight(HARBOR_FISH_TABLE.position.x, HARBOR_FISH_TABLE.position.z),
      6
    );
  });

  it("processes fish scraps at the fish-table and rejects mill or workbench", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    sim.state.player.proficiencies.processing = 1000;
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.fish_scraps", quantity: 9 }]);

    movePlayerToProcessingFront(sim, "struct.starter_mill");
    expect(sim.startProcessingJob("recipe.fish_to_fertilizer", "struct.starter_mill")).toMatchObject({
      success: false
    });

    movePlayerToProcessingFront(sim, "struct.workbench");
    expect(sim.startProcessingJob("recipe.fish_to_fertilizer", "struct.workbench")).toMatchObject({
      success: false
    });
    expect(InventoryManager.getItemCount(inventory, "item.fish_scraps")).toBe(9);

    movePlayerToProcessingFront(sim, HARBOR_FISH_TABLE.structureId);
    expect(sim.startProcessingJob("recipe.fish_to_fertilizer", HARBOR_FISH_TABLE.structureId)).toMatchObject({
      success: true
    });
    expect(InventoryManager.getItemCount(inventory, "item.fish_scraps")).toBe(6);
  });

  it("cleans mackerel at the harbor fish-table into scraps", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "fish.mackerel", quantity: 1 }]);
    movePlayerToProcessingFront(sim, HARBOR_FISH_TABLE.structureId);

    const started = sim.startProcessingJob("recipe.mackerel_to_scraps", HARBOR_FISH_TABLE.structureId);
    expect(started).toMatchObject({ success: true });
    const jobId = Object.keys(sim.state.processingJobs)[0];
    sim.advanceGameMinutes(6);

    const inventoryBeforeInvalidCollect = inventory.slots.map((slot) => ({ ...slot }));
    const processingXpBeforeInvalidCollect = sim.state.player.proficiencies.processing;
    movePlayerToProcessingCenter(sim, HARBOR_FISH_TABLE.structureId);
    expect(sim.collectProcessingJob(jobId)).toMatchObject({ success: false, reason: "Stand in front of the station" });
    expect(inventory.slots).toEqual(inventoryBeforeInvalidCollect);
    expect(sim.state.player.proficiencies.processing).toBe(processingXpBeforeInvalidCollect);
    expect(sim.state.processingJobs[jobId]).toMatchObject({ status: "complete" });

    movePlayerToProcessingFront(sim, HARBOR_FISH_TABLE.structureId);
    expect(sim.collectProcessingJob(jobId)).toMatchObject({ success: true });
    expect(InventoryManager.getItemCount(inventory, "fish.mackerel")).toBe(0);
    expect(InventoryManager.getItemCount(inventory, "item.fish_scraps")).toBe(2);
  });

  it("requires a close front approach for every processing station without mutating state", () => {
    const cases = [
      {
        stationId: "struct.starter_mill",
        recipeId: "recipe.wheat_to_grain",
        inputs: [{ itemId: "produce.wheat", quantity: 2 }]
      },
      {
        stationId: "struct.workbench",
        recipeId: "recipe.craft_chum",
        inputs: [
          { itemId: "item.ground_grain", quantity: 2 },
          { itemId: "item.bait_worms", quantity: 2 }
        ]
      },
      {
        stationId: "struct.starter_compost",
        recipeId: "recipe.compost_worms",
        inputs: [
          { itemId: "item.plant_matter", quantity: 4 },
          { itemId: "item.compost_starter", quantity: 1 }
        ]
      },
      {
        stationId: HARBOR_FISH_TABLE.structureId,
        recipeId: "recipe.fish_to_fertilizer",
        inputs: [{ itemId: "item.fish_scraps", quantity: 3 }]
      }
    ] as const;

    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    sim.state.player.proficiencies.processing = 1000;
    for (const testCase of cases) {
      expect(InventoryManager.addItemsAtomically(
        inventory,
        testCase.inputs.map((input) => ({ ...input }))
      )).toBe(true);
      const inventoryBeforeInvalidStart = inventory.slots.map((slot) => ({ ...slot }));
      const jobsBeforeInvalidStart = Object.keys(sim.state.processingJobs);

      movePlayerToProcessingCenter(sim, testCase.stationId);
      expect(sim.startProcessingJob(testCase.recipeId, testCase.stationId).success).toBe(false);
      expect(inventory.slots).toEqual(inventoryBeforeInvalidStart);
      expect(Object.keys(sim.state.processingJobs)).toEqual(jobsBeforeInvalidStart);

      movePlayerToProcessingFront(sim, testCase.stationId);
      expect(sim.startProcessingJob(testCase.recipeId, testCase.stationId)).toMatchObject({ success: true });
      const job = Object.values(sim.state.processingJobs).find((candidate) => candidate.stationId === testCase.stationId);
      expect(job).toBeDefined();
      job!.status = "complete";

      const inventoryBeforeInvalidCollect = inventory.slots.map((slot) => ({ ...slot }));
      const xpBeforeInvalidCollect = sim.state.player.proficiencies.processing;
      movePlayerToProcessingCenter(sim, testCase.stationId);
      expect(sim.collectProcessingJob(job!.id).success).toBe(false);
      expect(inventory.slots).toEqual(inventoryBeforeInvalidCollect);
      expect(sim.state.player.proficiencies.processing).toBe(xpBeforeInvalidCollect);
      expect(sim.state.processingJobs[job!.id]).toMatchObject({ status: "complete" });

      movePlayerToProcessingFront(sim, testCase.stationId);
      expect(sim.collectProcessingJob(job!.id)).toMatchObject({ success: true });
    }
  });

  it("migrates a v9 save by inserting the starter fish-table and lifting y=0 stations", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 9;
    legacy.world.layoutRevision = 3;
    delete legacy.world.structures[HARBOR_FISH_TABLE.structureId];
    legacy.world.structures["struct.workbench"].y = 0;
    const envelope = { schemaVersion: 9, savedAtUtcMs: 1, state: legacy };
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const table = migrated.state.world.structures[HARBOR_FISH_TABLE.structureId];
    expect(table).toMatchObject({
      id: HARBOR_FISH_TABLE.structureId,
      type: "fish-table",
      x: HARBOR_FISH_TABLE.position.x,
      z: HARBOR_FISH_TABLE.position.z
    });
    expect(table.y).toBeGreaterThan(0.5);
    expect(migrated.state.world.structures["struct.workbench"].y).toBeGreaterThan(0.5);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("resetPlayerToSafeSpawn teleports character to the revision 4 farm spawn, docks active boat, and clears fishing", () => {
    // 1. Teleport from remote on-foot position
    sim.state.player.x = 999;
    sim.state.player.y = -50;
    sim.state.player.z = -999;
    sim.state.player.rotationY = 3.14;
    sim.state.player.currentRegionId = "region.coast";
    sim.resetPlayerToSafeSpawn();

    expect(sim.state.player.x).toBe(WORLD_SPAWN.playerPosition.x);
    expect(sim.state.player.y).toBeCloseTo(
      WorldLayout.terrainHeight(WORLD_SPAWN.playerPosition.x, WORLD_SPAWN.playerPosition.z) + 0.5,
      6
    );
    expect(sim.state.player.z).toBe(WORLD_SPAWN.playerPosition.z);
    expect(sim.state.player.rotationY).toBe(0);
    expect(sim.state.player.currentRegionId).toBe("region.farm");

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
    expect(sim.state.player.x).toBe(WORLD_SPAWN.playerPosition.x);
    expect(sim.state.player.z).toBe(WORLD_SPAWN.playerPosition.z);
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBe("market.harbor");
    expect(boat.x).toBe(HARBOR_DOCK.boatPosition.x);
    expect(boat.z).toBe(HARBOR_DOCK.boatPosition.z);
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

  it("refuses Safe Return while an active boat carries physical fish cargo", () => {
    sim.prepareDebugHarborBoarding();
    expect(sim.boardBoat("boat.player_rowboat")).toMatchObject({ success: true });

    const boat = sim.state.boats["boat.player_rowboat"];
    const cargoId = "cargo.safe_return_guard";
    boat.fishCargoSlotIds[0] = cargoId;
    sim.state.fishCargo[cargoId] = {
      id: cargoId,
      speciesId: "fish.trout",
      weightKg: 3,
      quality: "fine",
      caughtAtMinute: sim.state.clock.currentMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
    };
    const positionBefore = { x: sim.state.player.x, z: sim.state.player.z };

    const result = sim.execute({ type: "player.reset-safe" });

    expect(result).toMatchObject({
      success: false,
      reason: "Return to the harbor before using Safe Return while carrying physical fish cargo"
    });
    expect(sim.state.player.activeBoatId).toBe(boat.id);
    expect(sim.state.player.x).toBe(positionBefore.x);
    expect(sim.state.player.z).toBe(positionBefore.z);
    expect(boat.isDocked).toBe(false);
    expect(boat.fishCargoSlotIds[0]).toBe(cargoId);
    expect(sim.state.fishCargo[cargoId]).toBeDefined();
  });

  it("does not restore overlay pause when hydrating a saved clock", () => {
    sim.clock.setPaused(true);
    sim.tick(1);
    expect(sim.state.clock.isPaused).toBe(true);
    const clone = JSON.parse(JSON.stringify(sim.state));
    expect(clone.clock.isPaused).toBe(true);
    const loaded = new Simulation(clone);
    expect(loaded.clock.isPaused()).toBe(false);
    expect(loaded.state.clock.isPaused).toBe(false);
    const start = loaded.state.clock.currentMinute;
    loaded.advanceGameMinutes(8);
    expect(loaded.state.clock.currentMinute).toBe(start + 8);
  });

  it("apple trees past 1.60x stay planted while wheat still withers and clears", () => {
    sim.state.player.proficiencies.farming = 7500;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "seed.apple_sapling", quantity: 1 }])).toBe(true);

    const applePos = { x: STARTER_FARM_LAYOUT.origin.x, z: STARTER_FARM_LAYOUT.origin.z };
    sim.state.player.x = applePos.x;
    sim.state.player.z = applePos.z;
    const plantedApple = sim.plantCrop("farm.starter_garden", "crop.apple_tree", applePos.x, applePos.z);
    expect(plantedApple.success).toBe(true);
    const appleId = Object.keys(sim.state.crops)[0];
    const appleDef = ContentRegistry.crops.get("crop.apple_tree")!;
    sim.state.crops[appleId].effectiveGrowthMinutes = appleDef.baseGrowthMinutes * 1.7;
    sim.advanceGameMinutes(1);
    expect(sim.state.crops[appleId]).toBeDefined();
    expect(sim.state.crops[appleId].stage).toBe("overripe");
    expect(sim.state.crops[appleId].stage).not.toBe("withered");
    const appleHarvest = sim.harvestCrop(appleId);
    expect(appleHarvest.success).toBe(true);
    expect(sim.state.crops[appleId]).toBeDefined();
    expect(sim.state.crops[appleId].stage).toBe("growing");

    delete sim.state.crops[appleId];
    sim.state.farms["farm.starter_garden"].placedCropIds = [];

    const wheatPos = { x: STARTER_FARM_LAYOUT.origin.x, z: STARTER_FARM_LAYOUT.origin.z };
    sim.state.player.x = wheatPos.x;
    sim.state.player.z = wheatPos.z;
    expect(sim.plantCrop("farm.starter_garden", "crop.wheat", wheatPos.x, wheatPos.z).success).toBe(true);
    const wheatId = Object.keys(sim.state.crops)[0];
    const wheatDef = ContentRegistry.crops.get("crop.wheat")!;
    sim.state.crops[wheatId].effectiveGrowthMinutes = wheatDef.baseGrowthMinutes * 1.7;
    sim.advanceGameMinutes(1);
    expect(sim.state.crops[wheatId].stage).toBe("withered");
    const wheatClear = sim.harvestCrop(wheatId);
    expect(wheatClear.success).toBe(true);
    expect(wheatClear.yield).toBe(0);
    expect(sim.state.crops[wheatId]).toBeUndefined();
  });

  it("does not register sport trout as a stackable item and landing still creates cargo", () => {
    expect(ContentRegistry.items.has("fish.trout")).toBe(false);
    expect(ContentRegistry.fishSpecies.get("fish.trout")?.isSportFish).toBe(true);
    expect(InventoryManager.isValidItemStack({ itemId: "fish.trout", quantity: 1 })).toBe(false);

    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.startDebugSportFishing("lake", lake.x, lake.z, "fish.trout")).toBe(true);
    const encounter = sim.activeFishingEncounter;
    expect(encounter).not.toBeNull();
    for (let step = 0; step < 400; step++) {
      if (!sim.activeFishingEncounter) break;
      const state = sim.activeFishingEncounter.getState();
      const isReeling = state.lineTension < 70;
      const isBracing = state.behavior === "dive" || state.behavior === "burst";
      const isSlacking = state.lineTension > 80;
      sim.setSportFishingInput({
        isReeling: isReeling && !isSlacking,
        isSlacking,
        isBracing,
        rodDirectionAngle: -state.fishDirection
      });
      sim.tick(0.5);
    }
    expect(sim.activeFishingEncounter).toBeNull();
    const troutCargo = Object.values(sim.state.fishCargo).filter((cargo) => cargo.speciesId === "fish.trout");
    expect(troutCargo.length).toBeGreaterThan(0);
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    expect(inv.slots.some((slot) => slot.itemId === "fish.trout")).toBe(false);
  });

  it("processing start fails with inventory-full and does not consume inputs", () => {
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    for (const slot of inventory.slots) {
      slot.itemId = "item.compost_starter";
      slot.quantity = 50;
    }
    inventory.slots[0] = { itemId: "produce.wheat", quantity: 10 };
    movePlayerToProcessingFront(sim, "struct.starter_mill");
    const snapshot = inventory.slots.map((slot) => ({ ...slot }));
    const full = sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill");
    expect(full).toMatchObject({ success: false, reason: "inventory-full" });
    expect(inventory.slots).toEqual(snapshot);

    inventory.slots = inventory.slots.map(() => ({}));
    expect(InventoryManager.addItemsAtomically(inventory, [{ itemId: "produce.wheat", quantity: 2 }])).toBe(true);
    const ok = sim.startProcessingJob("recipe.wheat_to_grain", "struct.starter_mill");
    expect(ok.success).toBe(true);
    expect(InventoryManager.getItemCount(inventory, "produce.wheat")).toBe(0);
    expect(Object.values(sim.state.processingJobs).some((job) => job.recipeId === "recipe.wheat_to_grain")).toBe(true);
  });

  it("migrates stacked sport trout items into cargo without discarding the save", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 10;
    const inventory = legacy.inventories[legacy.player.inventoryId];
    inventory.slots[0] = { itemId: "fish.trout", quantity: 2 };
    const envelope = { schemaVersion: 10, savedAtUtcMs: 1, state: legacy };
    const migrated = migrateSaveData(envelope);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.inventories[migrated.state.player.inventoryId].slots[0].itemId).not.toBe("fish.trout");
    const troutCargo = Object.values(migrated.state.fishCargo).filter((cargo) => cargo.speciesId === "fish.trout");
    expect(troutCargo.length).toBeGreaterThanOrEqual(1);
    expect(migrated.state.player.carriedFishCargoId).toBeTruthy();
  });

});

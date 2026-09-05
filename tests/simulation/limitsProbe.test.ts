import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { MIGRATIONS, migrateSaveData } from "../../src/persistence/SaveMigrations";
import { MAX_OFFLINE_HOURS, applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CargoDomain } from "../../src/simulation/domains/CargoDomain";
import { cargoClassFits } from "../../src/simulation/domains/domainRules";
import {
  FARMING_ACTION_COST,
  FERTILITY_MAX,
  FERTILITY_MIN
} from "../../src/simulation/domains/FarmingDomain";
import {
  BASIC_FISHING_WORK_COST,
  SPORT_FISHING_WORK_COST_BY_CLASS
} from "../../src/simulation/domains/FishingDomain";
import { WORK_CAPACITY_MAXIMUM } from "../../src/simulation/domains/ProgressionDomain";
import { MarketDomain } from "../../src/simulation/domains/MarketDomain";
import { DEMAND_MIN, RETAIL_MARKUP } from "../../src/simulation/economy/marketPricing";
import { applyCropMoistureOverMinutes } from "../../src/simulation/farming/calculateCropGrowth";
import { autoScaleFor } from "../../src/ui/uiScale";
import { farmLocalToWorld, STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { FARMHOUSE_INTERIOR_ORIGIN } from "../../src/world/FarmhouseInterior";
import { HARBOR_MARKET } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";

function cargoOf(sim: Simulation): CargoDomain {
  return (sim as unknown as { cargoDomain: CargoDomain }).cargoDomain;
}

function land(sim: Simulation, speciesId: string) {
  const species = ContentRegistry.fishSpecies.get(speciesId)!;
  return cargoOf(sim).landCaughtFish({
    instanceId: `probe.${speciesId}.${sim.state.clock.currentMinute}.${Math.round(species.weightKg.min * 10)}`,
    speciesId,
    weightKg: species.weightKg.min,
    quality: "common",
    caughtAtMinute: sim.state.clock.currentMinute
  }, false);
}

function moveToStarterFarm(sim: Simulation, x = 0, z = 0) {
  const world = farmLocalToWorld(STARTER_FARM_LAYOUT.farmId, { x, z });
  sim.state.player.x = world.x;
  sim.state.player.z = world.z;
  return world;
}

interface Rect { x: number; y: number; w: number; h: number; name: string }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Layout math from src/ui/mobile.css + GameUI data-mobile-device flags. */
function mobileWorldLayout(width: number, height: number): Rect[] {
  const short = height <= 430;
  const controlSize = short ? 44 : 48;
  const joystickSize = short
    ? Math.min(118, Math.max(96, 0.28 * height))
    : Math.min(148, Math.max(112, 0.18 * width));
  const hudGap = short ? 10 : 16;
  const inset = 12;
  const clusterHeight = controlSize * 2 + 8;
  const hudLift = inset + Math.max(joystickSize, clusterHeight) + hudGap;
  const clusterWidth = Math.min(120, 0.46 * width, 280);
  const hotbarMax = width <= 700 ? Math.min(300, 0.44 * width) : Math.min(400, 0.52 * width);
  const hotbarHeight = 44;
  const toastWidth = Math.min(0.52 * width, width - 160);
  return [
    { name: "joystick", x: inset, y: height - inset - joystickSize, w: joystickSize, h: joystickSize },
    { name: "actions", x: width - inset - clusterWidth, y: height - inset - clusterHeight, w: clusterWidth, h: clusterHeight },
    { name: "hotbar", x: (width - hotbarMax) / 2, y: height - hudLift - hotbarHeight, w: hotbarMax, h: hotbarHeight },
    { name: "toasts", x: (width - toastWidth) / 2, y: 62, w: toastWidth, h: 40 }
  ];
}

describe("LIMITS probe", () => {
  describe("inventory", () => {
    it("uses 16 player slots and a 100 wheat-seed stack cap, splitting overflow across slots atomically", () => {
      const sim = new Simulation();
      const inv = sim.state.inventories[sim.state.player.inventoryId];
      expect(inv.slotCount).toBe(16);
      expect(inv.slots).toHaveLength(16);
      expect(ContentRegistry.items.get("seed.wheat")!.stackLimit).toBe(100);

      const two = InventoryManager.createInventory("probe.two", 2);
      expect(InventoryManager.addItemsAtomically(two, [{ itemId: "seed.wheat", quantity: 150 }])).toBe(true);
      expect(two.slots[0]).toEqual({ itemId: "seed.wheat", quantity: 100 });
      expect(two.slots[1]).toEqual({ itemId: "seed.wheat", quantity: 50 });

      const one = InventoryManager.createInventory("probe.one", 1);
      expect(InventoryManager.canAddItems(one, [{ itemId: "seed.wheat", quantity: 101 }])).toBe(false);
      expect(InventoryManager.addItemsAtomically(one, [{ itemId: "seed.wheat", quantity: 101 }])).toBe(false);
      expect(one.slots[0]).toEqual({});
    });
  });

  describe("work capacity", () => {
    it("caps at 1000 and at 20 Work allows water (5) but not harvest (30)", () => {
      expect(WORK_CAPACITY_MAXIMUM).toBe(1000);
      expect(FARMING_ACTION_COST.water).toBe(5);
      expect(FARMING_ACTION_COST.harvest).toBe(30);

      const sim = new Simulation();
      expect(sim.state.player.workCapacity.maximum).toBe(1000);
      const pos = moveToStarterFarm(sim);
      sim.state.player.workCapacity.current = 100;
      const planted = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(planted.success).toBe(true);
      const crop = sim.state.crops[planted.placedCropId!];
      crop.stage = "mature";
      crop.effectiveGrowthMinutes = ContentRegistry.crops.get("crop.wheat")!.baseGrowthMinutes;

      sim.state.player.workCapacity.current = 20;
      const harvest = sim.harvestCrop(planted.placedCropId!);
      expect(harvest.success).toBe(false);
      expect(harvest.reasonCode).toBe("insufficient-work");
      expect(sim.state.player.workCapacity.current).toBe(20);

      const watered = sim.waterCrop(planted.placedCropId!);
      expect(watered.success).toBe(true);
      expect(sim.state.player.workCapacity.current).toBe(15);
    });
  });

  describe("cargo / boats", () => {
    it("lands one fish per slot: player medium cap, rowboat small+medium, skiff hooks gargantuan", () => {
      const rowboat = ContentRegistry.boats.get("boat.rowboat")!;
      const skiff = ContentRegistry.boats.get("boat.skiff")!;
      expect(rowboat.fishCargoSlots.map((slot) => [slot.slotIndex, slot.type, slot.maxCargoClass])).toEqual([
        [0, "hold", "small"],
        [1, "hold", "medium"]
      ]);
      expect(skiff.fishCargoSlots.filter((slot) => slot.type === "external-hook").map((slot) => slot.maxCargoClass))
        .toEqual(["gargantuan", "gargantuan"]);
      expect(cargoClassFits("medium", "medium")).toBe(true);
      expect(cargoClassFits("large", "medium")).toBe(false);

      const sim = new Simulation();
      expect(land(sim, "fish.trout").success).toBe(true);
      expect(sim.state.player.carriedFishCargoId).toBeTruthy();
      expect(land(sim, "fish.trout").success).toBe(false);
      expect(land(sim, "fish.trout").reason).toBe("No cargo space");
      sim.state.player.carriedFishCargoId = null;

      expect(land(sim, "fish.sturgeon").success).toBe(false);
      sim.state.player.activeBoatId = "boat.player_rowboat";
      expect(land(sim, "fish.trout").success).toBe(true);
      expect(land(sim, "fish.carp").success).toBe(true);
      const occupied = [...sim.state.boats["boat.player_rowboat"].fishCargoSlotIds];
      expect(occupied.filter(Boolean)).toHaveLength(2);
      // Full hold still lands onto empty player hands; FishEscaped only when carry is also full.
      const overflowToHands = land(sim, "fish.trout");
      expect(overflowToHands.success).toBe(true);
      expect(sim.state.player.carriedFishCargoId).toBe(overflowToHands.cargoId);
      expect(sim.state.boats["boat.player_rowboat"].fishCargoSlotIds).toEqual(occupied);
      const noSpace = land(sim, "fish.trout");
      expect(noSpace.success).toBe(false);
      expect(noSpace.reason).toBe("No cargo space");
      expect(sim.state.boats["boat.player_rowboat"].fishCargoSlotIds).toEqual(occupied);

      sim.state.boats["boat.player_skiff"] = {
        id: "boat.player_skiff",
        boatTypeId: "boat.skiff",
        x: 0, y: 0, z: 0,
        headingRadians: 0,
        speed: 0,
        fuel: 100,
        durability: 250,
        fishCargoSlotIds: [null, null, null, null, null, null],
        supplyInventoryId: "inv.skiff_probe",
        upgrades: [],
        isDocked: true,
        dockedMarketId: "market.harbor"
      };
      sim.state.inventories["inv.skiff_probe"] = InventoryManager.createInventory("inv.skiff_probe", 8);
      sim.state.player.activeBoatId = "boat.player_skiff";
      const marlin = land(sim, "fish.blue_marlin");
      expect(marlin.success).toBe(true);
      expect(sim.state.fishCargo[marlin.cargoId!].location).toMatchObject({ type: "boat-hook", slotIndex: 4 });
    });
  });

  describe("economy", () => {
    it("floors localSupply at 0, refuses overstock and empty purse, and has no gold cap besides finite >= 0", () => {
      expect(RETAIL_MARKUP).toBe(1.25);
      expect(MarketDomain.BUY_MARKUP).toBe(1.25);
      expect(DEMAND_MIN).toBe(0.65);

      const sim = new Simulation();
      sim.state.player.x = HARBOR_MARKET.position.x;
      sim.state.player.z = HARBOR_MARKET.position.z;
      const ice = sim.state.markets["market.harbor"].commodities["item.crushed_ice"];
      ice.localSupply = 0;
      expect(sim.buyItemAtMarket("market.harbor", "item.crushed_ice", 1)).toMatchObject({
        success: false,
        reason: "Sold out"
      });

      ice.localSupply = 4;
      sim.state.player.money = 0;
      const broke = sim.buyItemAtMarket("market.harbor", "item.crushed_ice", 1);
      expect(broke.success).toBe(false);
      expect(broke.reason).toMatch(/Not enough money/i);

      const rich = createInitialGameState();
      rich.player.money = Number.MAX_SAFE_INTEGER;
      expect(validateSaveEnvelope({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 1,
        state: rich
      })).toBe(true);
      rich.player.money = Number.POSITIVE_INFINITY;
      expect(validateSaveEnvelope({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 1,
        state: rich
      })).toBe(false);
    });
  });

  describe("farming", () => {
    it("clamps moisture 0–100 and fertility 10–100, with no numeric max-plot cap", () => {
      const crop = { moisture: 95, averageMoistureAccum: 0, moistureSampleCount: 0 };
      applyCropMoistureOverMinutes(crop, 60, 15, {
        weatherType: "heavy-rain",
        rainfallEffectiveness: 2,
        evaporationMultiplier: 0,
        moistureRetention: 1
      });
      expect(crop.moisture).toBeLessThanOrEqual(100);

      crop.moisture = 2;
      applyCropMoistureOverMinutes(crop, 600, 15, {
        weatherType: "clear",
        rainfallEffectiveness: 0,
        evaporationMultiplier: 2,
        moistureRetention: 0
      });
      expect(crop.moisture).toBeGreaterThanOrEqual(0);

      const sim = new Simulation();
      const farm = sim.state.farms["farm.starter_garden"];
      moveToStarterFarm(sim);
      farm.soil.fertility = FERTILITY_MAX;
      expect(sim.applyFertilizer("farm.starter_garden")).toMatchObject({ success: true, reason: "already-fertile" });
      expect(farm.soil.fertility).toBe(100);

      farm.soil.fertility = FERTILITY_MIN;
      const pos = moveToStarterFarm(sim, 1.5, 0);
      sim.state.player.workCapacity.current = 100;
      const planted = sim.plantCrop("farm.starter_garden", "crop.wheat", pos.x, pos.z);
      expect(planted.success).toBe(true);
      const placed = sim.state.crops[planted.placedCropId!];
      placed.stage = "mature";
      placed.effectiveGrowthMinutes = 180;
      expect(sim.harvestCrop(planted.placedCropId!).success).toBe(true);
      expect(farm.soil.fertility).toBe(FERTILITY_MIN);

      const packed = new Simulation();
      const inventory = packed.state.inventories[packed.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inventory, [{ itemId: "seed.wheat", quantity: 80 }]);
      packed.state.player.workCapacity.current = 1000;
      let plantedCount = 0;
      for (let x = -5.4; x <= 5.4; x += 1.05) {
        for (let z = -4.4; z <= 4.4; z += 1.05) {
          const world = moveToStarterFarm(packed, x, z);
          const result = packed.plantCrop("farm.starter_garden", "crop.wheat", world.x, world.z);
          if (result.success) plantedCount += 1;
          else expect(["overlaps-crop", "outside-farm", "invalid-surface", "structure-clearance", "too-far", "no-seed"]).toContain(result.reasonCode);
        }
      }
      expect(plantedCount).toBeGreaterThan(10);
      expect(plantedCount).toBeLessThan(80);
    });
  });

  describe("fishing", () => {
    it("enforces chum radius 12m, spent schools, and class Work costs", () => {
      expect(BASIC_FISHING_WORK_COST).toBe(15);
      expect(SPORT_FISHING_WORK_COST_BY_CLASS).toEqual({ small: 18, medium: 28, large: 36, gargantuan: 44 });

      const sim = new Simulation();
      const inv = sim.state.inventories[sim.state.player.inventoryId];
      InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 2 }]);
      const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
      const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
      sim.state.player.x = lake.x + 13;
      sim.state.player.z = lake.z;
      expect(sim.chumFishSchool(schoolId)).toMatchObject({ success: false, reason: "Move closer to the fish school" });
      sim.state.player.x = lake.x;
      expect(sim.chumFishSchool(schoolId).success).toBe(true);

      sim.state.world.activeSchools[schoolId].remainingCatchPotential = 0;
      expect(sim.hookSportFish(schoolId)).toMatchObject({
        success: false,
        reason: "This school has moved on"
      });
    });
  });

  describe("time / save", () => {
    it("has a migration for every version up to the current schema", () => {
      // A version bump with no matching migration silently strands old saves:
      // migrateSaveData walks the ladder one rung at a time and a missing rung
      // leaves the save short of the current version.
      const missing: number[] = [];
      for (let version = 2; version <= CURRENT_SCHEMA_VERSION; version += 1) {
        if (typeof MIGRATIONS[version] !== "function") missing.push(version);
      }
      expect(missing, `schema versions with no migration: ${missing.join(", ")}`).toEqual([]);
    });

    it("an old save migrates to the current schema, and pause / restUntilDawn / 72h offline hold", () => {
      // Pinning the version as a literal only re-breaks this test on the next
      // bump. What matters is that the ladder actually reaches the current
      // version and that every rung on the way is present.
      expect(MAX_OFFLINE_HOURS).toBe(72);
      expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(22);
      const v22 = {
        schemaVersion: 22,
        savedAtUtcMs: 1,
        state: { ...createInitialGameState(), schemaVersion: 22 }
      };
      const migrated = migrateSaveData(v22 as never);
      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(validateSaveEnvelope(migrated)).toBe(true);

      const sim = new Simulation();
      const start = sim.state.clock.currentMinute;
      sim.clock.setPaused(true);
      sim.tick(8);
      expect(sim.state.clock.currentMinute).toBe(start);

      sim.setDebugMinute(22 * 60);
      sim.state.player.x = FARMHOUSE_INTERIOR_ORIGIN.x;
      sim.state.player.z = FARMHOUSE_INTERIOR_ORIGIN.z;
      expect(sim.execute({ type: "player.rest-until-dawn" }).success).toBe(true);
      expect(sim.state.clock.timeOfDay).not.toBe("night");

      sim.state.metadata.lastSavedUtcMs = 0;
      const summary = applyOfflineProgression(sim.state, 80 * 3600 * 1000);
      expect(summary.simulatedGameMinutes).toBe(Math.floor(72 * 3600 * sim.state.clock.minutesPerRealSecond));
    });
  });

  describe("mobile HUD size limits", () => {
    it("keeps joystick, hotbar, and toasts from overlapping at 844x390 and 667x375", () => {
      expect(autoScaleFor(844, 390)).toBe(0.85);
      expect(autoScaleFor(667, 375)).toBe(0.85);

      for (const [width, height] of [[844, 390], [667, 375]] as const) {
        const rects = mobileWorldLayout(width, height);
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            expect(overlaps(rects[i], rects[j]), `${rects[i].name} vs ${rects[j].name} at ${width}x${height}`).toBe(false);
          }
        }
        const joystick = rects.find((rect) => rect.name === "joystick")!;
        const hotbar = rects.find((rect) => rect.name === "hotbar")!;
        expect(hotbar.y + hotbar.h).toBeLessThanOrEqual(joystick.y);
      }
    });
  });
});

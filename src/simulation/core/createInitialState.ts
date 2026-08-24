// src/simulation/core/createInitialState.ts

import { CURRENT_SCHEMA_VERSION } from "../../persistence/SaveSchema";
import { GameState } from "./types";
import { InventoryManager } from "../inventory/InventoryManager";
import { ContentRegistry } from "../../content/ContentRegistry";

export function createInitialGameState(worldSeed: number = 42891): GameState {
  ContentRegistry.initializeAndValidate();

  const playerInventory = InventoryManager.createInventory("inv.player", 16);
  // Give starter supplies
  InventoryManager.addItemsAtomically(playerInventory, [
    { itemId: "seed.wheat", quantity: 10 },
    { itemId: "seed.potato", quantity: 6 },
    { itemId: "item.bait_worms", quantity: 10 },
    { itemId: "item.compost_starter", quantity: 2 },
    { itemId: "item.plant_matter", quantity: 8 }
  ]);

  const initialMarkets: GameState["markets"] = {};
  for (const [marketId, marketDef] of ContentRegistry.markets.entries()) {
    initialMarkets[marketId] = {
      id: marketId,
      name: marketDef.name,
      regionId: marketDef.regionId,
      commodities: {}
    };
    for (const comm of marketDef.commodities) {
      initialMarkets[marketId].commodities[comm.itemId] = {
        itemId: comm.itemId,
        basePrice: comm.basePrice,
        demandIndex: 1.0,
        localSupply: comm.targetSupply,
        targetSupply: comm.targetSupply,
        consumptionRate: comm.consumptionRatePerHour,
        seasonalModifier: 1.0,
        lastTickMinute: 8 * 60,
        recentSalesVolume: 0
      };
    }
  }

  const initialBoats: GameState["boats"] = {
    "boat.player_rowboat": {
      id: "boat.player_rowboat",
      boatTypeId: "boat.rowboat",
      x: 35,
      y: 0,
      z: 55,
      headingRadians: 0,
      speed: 0,
      fuel: 0,
      durability: 100,
      fishCargoSlotIds: [null, null],
      supplyInventoryId: "inv.rowboat_supply",
      upgrades: [],
      isDocked: true,
      dockedMarketId: "market.harbor"
    }
  };

  const rowboatInventory = InventoryManager.createInventory("inv.rowboat_supply", 4);

  const initialFarms: GameState["farms"] = {
    "farm.starter_garden": {
      id: "farm.starter_garden",
      regionId: "region.village",
      widthMeters: 8,
      depthMeters: 8,
      climateId: "temperate",
      soil: { fertility: 85, moistureRetention: 0.7 },
      placedCropIds: [],
      placedStructureIds: ["struct.starter_mill", "struct.starter_compost"],
      leaseCost: 0,
      leaseDueMinute: 0,
      accessType: "public"
    },
    "farm.player_homestead": {
      id: "farm.player_homestead",
      regionId: "region.farm",
      widthMeters: 16,
      depthMeters: 16,
      climateId: "temperate",
      soil: { fertility: 90, moistureRetention: 0.8 },
      placedCropIds: [],
      placedStructureIds: ["struct.workbench"],
      leaseCost: 50,
      leaseDueMinute: 1440 * 7,
      accessType: "private"
    }
  };

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    worldSeed,
    clock: {
      currentMinute: 8 * 60, // 08:00
      minutesPerRealSecond: 1,
      dayCount: 1,
      season: "spring",
      year: 1,
      timeOfDay: "day",
      isPaused: false
    },
    player: {
      x: 0,
      y: 0.5,
      z: 0,
      rotationY: 0,
      currentRegionId: "region.village",
      inventoryId: "inv.player",
      equippedRodId: "rod.willow",
      carriedFishCargoId: null,
      activeBoatId: null,
      money: 100,
      workCapacity: {
        current: 1000,
        maximum: 1000,
        lastRegenMinute: 8 * 60
      },
      proficiencies: {
        farming: 0,
        fishing: 0,
        processing: 0,
        trading: 0
      }
    },
    world: {
      currentSeed: worldSeed,
      activeSchools: {},
      structures: {
        "struct.starter_mill": { id: "struct.starter_mill", type: "hand-mill", x: 2, y: 0, z: -3 },
        "struct.starter_compost": { id: "struct.starter_compost", type: "compost-bin", x: 4, y: 0, z: -3 },
        "struct.workbench": { id: "struct.workbench", type: "workbench", x: -2, y: 0, z: -3 }
      },
      lastSchoolSpawnMinute: 0
    },
    farms: initialFarms,
    crops: {},
    inventories: {
      "inv.player": playerInventory,
      "inv.rowboat_supply": rowboatInventory
    },
    processingJobs: {},
    basicFishing: null,
    sportFishing: null,
    boats: initialBoats,
    fishCargo: {},
    weather: {
      type: "clear",
      windDirectionDeg: 45,
      windSpeed: 4.2,
      precipitation: 0,
      cloudCover: 0.15,
      seaRoughness: 0.1,
      visibility: 1.0,
      temperatureC: 21,
      nextWeatherMinute: 14 * 60
    },
    markets: initialMarkets,
    contracts: [
      {
        id: "contract.starter_wheat_1",
        templateId: "contract.wheat_supply",
        requesterId: "npc.village_baker",
        type: "produce",
        targetItemIdOrSpecies: "produce.wheat",
        quantityRequired: 6,
        quantityFulfilled: 0,
        rewardMoney: 65,
        rewardSkillXp: { skill: "farming", xp: 150 },
        expiresAtMinute: 24 * 60,
        status: "active"
      }
    ],
    journal: {
      fishRecords: {},
      cropRecords: {},
      unlockedKnowledge: ["knowledge.wheat_milling", "knowledge.worm_composting"]
    },
    metadata: {
      createdAtUtcMs: Date.now(),
      lastSavedUtcMs: Date.now(),
      totalPlayMinutes: 0,
      gameVersion: "0.1.0"
    }
  };
}

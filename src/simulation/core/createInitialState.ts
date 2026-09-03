// src/simulation/core/createInitialState.ts

import { CURRENT_SCHEMA_VERSION } from "../../persistence/SaveSchema";
import { createFullPlayerTraversalState } from "../navigation/PlayerTraversal";
import type { GameState, StationType, StructureId } from "./types";
import { InventoryManager } from "../inventory/InventoryManager";
import { ContentRegistry } from "../../content/ContentRegistry";
import { seasonAtMinute } from "../core/GameClock";
import { HARBOR_DOCK, WORLD_LAYOUT_REVISION, WORLD_SPAWN } from "../../world/WorldAnchors";
import { WorldLayout } from "../../world/WorldLayout";
import { DEFAULT_MINUTES_PER_REAL_SECOND } from "./GameClock";
import { WORK_CAPACITY_MAXIMUM } from "../domains/ProgressionDomain";
import { SeededRng } from "./Rng";
import { applyWeatherProfile, rollWeatherType, WEATHER_FRONT_MIN_MINUTES } from "../weather/updateWeather";
import { createStarterDonkeyState } from "../mounts/Mounts";
import { WORLD_FARM_DEFINITIONS, WORLD_STATION_DEFINITIONS } from "../../world/WorldGameplayLocations";
import { MAIN_QUEST_TRACK_ID } from "./QuestTypes";

function structureOnTerrain(
  id: StructureId,
  type: StationType,
  x: number,
  z: number,
  rotationY?: number
): { id: StructureId; type: StationType; x: number; y: number; z: number; rotationY?: number } {
  return { id, type, x, y: WorldLayout.terrainHeight(x, z), z, rotationY };
}

function initialWeather(worldSeed: number): GameState["weather"] {
  const rng = new SeededRng(worldSeed + 17);
  const weather = {
    type: "clear" as const,
    windDirectionDeg: 45,
    windSpeed: 4.2,
    precipitation: 0,
    cloudCover: 0.15,
    seaRoughness: 0.1,
    visibility: 1.0,
    temperatureC: 21,
    nextWeatherMinute: 14 * 60,
    nextWeatherType: rollWeatherType(rng, 14 * 60)
  };
  applyWeatherProfile(weather, "clear");
  weather.windDirectionDeg = 45;
  weather.nextWeatherMinute = 8 * 60 + WEATHER_FRONT_MIN_MINUTES;
  weather.nextWeatherType = rollWeatherType(rng, weather.nextWeatherMinute);
  return weather;
}


export function createInitialGameState(worldSeed: number = 42891): GameState {
  ContentRegistry.initializeAndValidate();
  const starterDonkey = createStarterDonkeyState();

  const playerInventory = InventoryManager.createInventory("inv.player", 16);
  // Give starter supplies
  InventoryManager.addItemsAtomically(playerInventory, [
    { itemId: "seed.wheat", quantity: 10 },
    { itemId: "seed.tomato", quantity: 6 },
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
        seasonalModifier: comm.seasonalFactors[seasonAtMinute(8 * 60)] || 1.0,
        lastTickMinute: 8 * 60,
        recentSalesVolume: 0
      };
    }
  }

  const initialBoats: GameState["boats"] = {
    "boat.player_rowboat": {
      id: "boat.player_rowboat",
      boatTypeId: "boat.rowboat",
      x: HARBOR_DOCK.boatPosition.x,
      y: HARBOR_DOCK.boatPosition.y,
      z: HARBOR_DOCK.boatPosition.z,
      headingRadians: 0,
      speed: 0,
      fuel: 0,
      durability: 100,
      fishCargoSlotIds: [null, null],
      supplyInventoryId: "inv.rowboat_supply",
      upgrades: [],
      isDocked: true,
      dockedMarketId: HARBOR_DOCK.marketId
    }
  };

  const rowboatInventory = InventoryManager.createInventory("inv.rowboat_supply", 4);
  const initialFarms: GameState["farms"] = Object.fromEntries(
    Object.values(WORLD_FARM_DEFINITIONS).map((farm) => [farm.id, {
      id: farm.id,
      regionId: farm.regionId,
      widthMeters: farm.widthMeters,
      depthMeters: farm.depthMeters,
      climateId: farm.climateId,
      soil: { fertility: farm.fertility, moistureRetention: farm.moistureRetention },
      placedCropIds: [],
      placedStructureIds: [...farm.structureIds],
      leaseCost: farm.leaseCost,
      leaseDueMinute: farm.id === "farm.player_homestead" ? 1440 * 7 : 0,
      accessType: farm.accessType
    }])
  );

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    worldSeed,
    clock: {
      currentMinute: 8 * 60, // 08:00
      minutesPerRealSecond: DEFAULT_MINUTES_PER_REAL_SECOND,
      dayCount: 1,
      season: "spring",
      year: 1,
      timeOfDay: "day",
      isPaused: false
    },
    player: {
      x: WORLD_SPAWN.playerPosition.x,
      y: WorldLayout.traversalSurfaceHeight(
        WORLD_SPAWN.playerPosition.x,
        WORLD_SPAWN.playerPosition.z
      ) + 0.5,
      z: WORLD_SPAWN.playerPosition.z,
      rotationY: 0,
      currentRegionId: WORLD_SPAWN.regionId,
      inventoryId: "inv.player",
      equippedRodId: "rod.willow",
      ownedRodIds: ["rod.willow"],
      preparedLureItemId: null,
      carriedFishCargoId: null,
      activeBoatId: null,
      activeMountId: null,
      money: 100,
      traversal: createFullPlayerTraversalState(),
      workCapacity: {
        current: WORK_CAPACITY_MAXIMUM,
        maximum: WORK_CAPACITY_MAXIMUM,
        regeneratedAtMinute: 8 * 60
      },
      proficiencies: {
        farming: 0,
        fishing: 0,
        processing: 0,
        trading: 0
      }
    },
    world: {
      layoutRevision: WORLD_LAYOUT_REVISION,
      currentSeed: worldSeed,
      activeSchools: {},
      fishingPressureByHabitat: {},
      structures: Object.fromEntries(Object.values(WORLD_STATION_DEFINITIONS).map((station) => [
        station.id,
        structureOnTerrain(station.id, station.type, station.position.x, station.position.z, station.rotationY)
      ])),
      lastSchoolSpawnMinute: 0,
      storySchoolSpawned: false
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
    mounts: {
      [starterDonkey.id]: starterDonkey
    },
    fishCargo: {},
    weather: initialWeather(worldSeed),
    markets: initialMarkets,
    contracts: [
      {
        id: "contract.starter_wheat_1",
        templateId: "contract.wheat_supply",
        requesterId: "npc.elspeth",
        deliveryMarketId: "market.village",
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
    quests: {
      activeActId: "act1_homestead",
      tracks: {
        [MAIN_QUEST_TRACK_ID]: {
          activeQuestId: "quest.act1_welcome",
          activeStepIndex: 0,
          stepProgress: {}
        }
      },
      focusedTrackId: MAIN_QUEST_TRACK_ID,
      completedQuestIds: [],
      unlockedFeatureIds: [],
      hintsShown: {}
    },
    metadata: {
      createdAtUtcMs: Date.now(),
      lastSavedUtcMs: Date.now(),
      totalPlayMinutes: 0,
      gameVersion: "0.1.0"
    }
  };
}

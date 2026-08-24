// src/persistence/SaveSchema.ts

import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { InventoryManager } from "../simulation/inventory/InventoryManager";

export const CURRENT_SCHEMA_VERSION = 3;

export interface SaveEnvelope {
  schemaVersion: number;
  savedAtUtcMs: number;
  checksum?: string;
  state: GameState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown, minimum: number = Number.NEGATIVE_INFINITY): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}

function isSafeInteger(value: unknown, minimum: number = Number.MIN_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value, minimum) && value <= maximum;
}

const SKILL_IDS = ["farming", "fishing", "processing", "trading"] as const;
const WEATHER_TYPES = ["clear", "cloudy", "light-rain", "heavy-rain", "windy", "fog", "storm"] as const;
const FISHING_HABITATS = ["river", "lake", "coast", "offshore"] as const;

function isOneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === "string" && choices.includes(value);
}

export function validateSaveEnvelope(data: unknown): data is SaveEnvelope {
  if (!isRecord(data)) return false;
  const env = data as Partial<SaveEnvelope>;
  const schemaVersion = env.schemaVersion;
  if (
    typeof schemaVersion !== "number" ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > CURRENT_SCHEMA_VERSION
  ) {
    return false;
  }
  if (!isFiniteNumber(env.savedAtUtcMs, 0)) return false;
  if (!isRecord(env.state)) return false;

  const state = env.state as Partial<GameState>;
  if (state.schemaVersion !== env.schemaVersion || !isSafeInteger(state.worldSeed, 0)) return false;
  if (!isRecord(state.clock) || !isSafeInteger(state.clock.currentMinute, 0) || !isFiniteNumber(state.clock.minutesPerRealSecond, 0)) return false;
  if (
    !isRecord(state.player) ||
    !isFiniteNumber(state.player.money, 0) ||
    typeof state.player.inventoryId !== "string" ||
    !isFiniteNumber(state.player.x) ||
    !isFiniteNumber(state.player.y) ||
    !isFiniteNumber(state.player.z) ||
    !isFiniteNumber(state.player.rotationY) ||
    typeof state.player.currentRegionId !== "string" ||
    !isRecord(state.player.workCapacity) ||
    !isFiniteNumber(state.player.workCapacity.current, 0) ||
    !isFiniteNumber(state.player.workCapacity.maximum, 0) ||
    state.player.workCapacity.current > state.player.workCapacity.maximum ||
    !isSafeInteger(state.player.workCapacity.lastRegenMinute, 0) ||
    !isRecord(state.player.proficiencies) ||
    !SKILL_IDS.every((skill) => isSafeInteger(state.player!.proficiencies[skill], 0))
  ) return false;
  if (!isRecord(state.inventories) || !isRecord(state.farms) || !isRecord(state.crops)) return false;
  if (
    !isRecord(state.world) ||
    !isSafeInteger(state.world.currentSeed, 0) ||
    state.world.currentSeed !== state.worldSeed ||
    !isRecord(state.world.activeSchools) ||
    !isRecord(state.world.structures) ||
    (state.world.lastSchoolSpawnMinute !== undefined && !isSafeInteger(state.world.lastSchoolSpawnMinute, 0))
  ) return false;
  if (!isRecord(state.processingJobs) || !isRecord(state.boats) || !isRecord(state.fishCargo)) return false;
  if (schemaVersion >= 2 && state.basicFishing !== null && !isRecord(state.basicFishing)) return false;
  if (schemaVersion >= 3 && state.sportFishing !== null && !isRecord(state.sportFishing)) return false;
  if (
    !isRecord(state.weather) ||
    !isOneOf(state.weather.type, WEATHER_TYPES) ||
    !isFiniteInRange(state.weather.windDirectionDeg, 0, 360) ||
    !isFiniteNumber(state.weather.windSpeed, 0) ||
    !isFiniteInRange(state.weather.precipitation, 0, 1) ||
    !isFiniteInRange(state.weather.cloudCover, 0, 1) ||
    !isFiniteInRange(state.weather.seaRoughness, 0, 1) ||
    !isFiniteInRange(state.weather.visibility, 0, 1) ||
    !isFiniteNumber(state.weather.temperatureC) ||
    !isSafeInteger(state.weather.nextWeatherMinute, 0) ||
    !isRecord(state.markets) ||
    !Array.isArray(state.contracts) ||
    !isRecord(state.journal) ||
    !isRecord(state.metadata)
  ) return false;
  if (
    !isFiniteNumber(state.metadata.createdAtUtcMs, 0) ||
    !isFiniteNumber(state.metadata.lastSavedUtcMs, 0) ||
    !isFiniteNumber(state.metadata.totalPlayMinutes, 0) ||
    typeof state.metadata.gameVersion !== "string" ||
    (state.metadata.rngState !== undefined && !isSafeInteger(state.metadata.rngState, 0))
  ) return false;

  ContentRegistry.initializeAndValidate();
  if (!state.inventories[state.player.inventoryId]) return false;
  for (const inventory of Object.values(state.inventories)) {
    if (!isRecord(inventory) || typeof inventory.id !== "string" || !Array.isArray(inventory.slots) || !InventoryManager.isValidInventory(inventory as GameState["inventories"][string])) return false;
  }
  if (!ContentRegistry.rods.has(state.player.equippedRodId)) return false;
  if (state.player.activeBoatId !== null && state.player.activeBoatId !== undefined && !state.boats[state.player.activeBoatId]) return false;
  if (state.player.carriedFishCargoId !== null && state.player.carriedFishCargoId !== undefined && !state.fishCargo[state.player.carriedFishCargoId]) return false;
  if (state.basicFishing && state.sportFishing) return false;
  if (
    state.basicFishing &&
    (typeof state.basicFishing.habitatId !== "string" ||
      !isOneOf(state.basicFishing.habitatId, FISHING_HABITATS) ||
      !["casting", "waiting", "bite"].includes(state.basicFishing.phase) ||
      !isFiniteNumber(state.basicFishing.remainingSeconds, 0) ||
      (state.basicFishing.catchItemId !== undefined && !ContentRegistry.items.has(state.basicFishing.catchItemId)) ||
      typeof state.basicFishing.willCatch !== "boolean")
  ) return false;
  if (state.sportFishing) {
    if (
      state.sportFishing.result !== "active" ||
      typeof state.sportFishing.rodId !== "string" ||
      !ContentRegistry.rods.has(state.sportFishing.rodId) ||
      !isRecord(state.sportFishing.fish) ||
      typeof state.sportFishing.fish.speciesId !== "string" ||
      !ContentRegistry.fishSpecies.has(state.sportFishing.fish.speciesId) ||
      typeof state.sportFishing.fish.instanceId !== "string" ||
      !isFiniteNumber(state.sportFishing.fish.weightKg, 0) ||
      !isFiniteNumber(state.sportFishing.stamina, 0) ||
      !isFiniteNumber(state.sportFishing.maxStamina, 0) ||
      state.sportFishing.stamina > state.sportFishing.maxStamina ||
      !isFiniteNumber(state.sportFishing.distanceMeters, 0) ||
      !isFiniteInRange(state.sportFishing.lineTension, 0, 100) ||
      !isFiniteInRange(state.sportFishing.lineIntegrity, 0, 100) ||
      !isFiniteNumber(state.sportFishing.slackTimerSeconds, 0) ||
      !isFiniteNumber(state.sportFishing.snapTimerSeconds, 0)
    ) return false;
  }

  for (const [farmId, farm] of Object.entries(state.farms)) {
    if (
      !isRecord(farm) || farm.id !== farmId || !Array.isArray(farm.placedCropIds) ||
      !isFiniteNumber(farm.widthMeters, 0) || !isFiniteNumber(farm.depthMeters, 0) ||
      !isRecord(farm.soil) || !isFiniteNumber(farm.soil.fertility, 0) || !isFiniteNumber(farm.soil.moistureRetention, 0)
    ) return false;
  }

  for (const [cropId, crop] of Object.entries(state.crops)) {
    if (!isRecord(crop) || crop.id !== cropId || typeof crop.cropId !== "string" || typeof crop.farmId !== "string") return false;
    if (![crop.x, crop.z, crop.rotationRadians, crop.effectiveGrowthMinutes, crop.moisture, crop.health, crop.averageMoistureAccum].every((value) => isFiniteNumber(value)) || !isSafeInteger(crop.plantedAtMinute, 0) || !isSafeInteger(crop.lastUpdatedMinute, 0) || !isSafeInteger(crop.moistureSampleCount, 1)) return false;
    if (!ContentRegistry.crops.has(crop.cropId) || !state.farms[crop.farmId]?.placedCropIds.includes(cropId)) return false;
  }

  for (const [structureId, structure] of Object.entries(state.world.structures)) {
    if (
      !isRecord(structure) ||
      structure.id !== structureId ||
      !["hand-mill", "workbench", "fish-table", "compost-bin"].includes(structure.type as string) ||
      ![structure.x, structure.y, structure.z].every((value) => isFiniteNumber(value))
    ) return false;
  }

  for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
    if (
      !isRecord(school) ||
      school.id !== schoolId ||
      !isOneOf(school.habitatId, FISHING_HABITATS) ||
      ![school.x, school.z].every((value) => isFiniteNumber(value)) ||
      !isFiniteNumber(school.radius, 0) ||
      !isSafeInteger(school.spawnedAtMinute, 0) ||
      !isSafeInteger(school.expiresAtMinute, school.spawnedAtMinute) ||
      !isSafeInteger(school.remainingCatchPotential, 0) ||
      !Array.isArray(school.speciesWeights) ||
      school.speciesWeights.length === 0 ||
      (school.feedingFrenzyUntilMinute !== undefined && !isSafeInteger(school.feedingFrenzyUntilMinute, school.spawnedAtMinute)) ||
      school.speciesWeights.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.speciesId !== "string" ||
          !ContentRegistry.fishSpecies.has(entry.speciesId) ||
          !isFiniteNumber(entry.weight, 0)
      )
    ) return false;
  }

  for (const [jobId, job] of Object.entries(state.processingJobs)) {
    if (!isRecord(job) || job.id !== jobId || typeof job.recipeId !== "string" || typeof job.stationId !== "string" || !isSafeInteger(job.startedAtMinute, 0) || !isSafeInteger(job.completesAtMinute, 0) || !["active", "complete", "collected"].includes(job.status as string)) return false;
    if (!ContentRegistry.recipes.has(job.recipeId) || !state.world.structures[job.stationId]) return false;
  }

  for (const [boatId, boat] of Object.entries(state.boats)) {
    if (!isRecord(boat) || boat.id !== boatId || typeof boat.boatTypeId !== "string" || typeof boat.supplyInventoryId !== "string") return false;
    if (![boat.x, boat.y, boat.z, boat.headingRadians, boat.speed, boat.fuel, boat.durability].every((value) => isFiniteNumber(value))) return false;
    if (!ContentRegistry.boats.has(boat.boatTypeId) || !state.inventories[boat.supplyInventoryId]) return false;
    if (!Array.isArray(boat.fishCargoSlotIds) || typeof boat.isDocked !== "boolean") return false;
    if (schemaVersion >= 3) {
      if (boat.dockedMarketId !== null && (typeof boat.dockedMarketId !== "string" || !ContentRegistry.markets.has(boat.dockedMarketId))) return false;
      if (boat.isDocked !== Boolean(boat.dockedMarketId)) return false;
    }
    if (state.player.activeBoatId === boatId && boat.isDocked) return false;
  }

  for (const [cargoId, cargo] of Object.entries(state.fishCargo)) {
    if (!isRecord(cargo) || cargo.id !== cargoId || typeof cargo.speciesId !== "string" || !isRecord(cargo.location) || !isFiniteNumber(cargo.weightKg, 0) || !isFiniteNumber(cargo.freshness, 0)) return false;
    if (!ContentRegistry.fishSpecies.has(cargo.speciesId)) return false;
    if (cargo.location.type === "player") {
      if (state.player.carriedFishCargoId !== cargoId) return false;
    } else if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
      const boat = state.boats[cargo.location.containerId];
      const slotIndex = cargo.location.slotIndex;
      if (!boat || typeof slotIndex !== "number" || !Number.isInteger(slotIndex) || boat.fishCargoSlotIds[slotIndex] !== cargoId) return false;
    } else {
      return false;
    }
  }

  for (const boat of Object.values(state.boats)) {
    for (let slotIndex = 0; slotIndex < boat.fishCargoSlotIds.length; slotIndex++) {
      const cargoId = boat.fishCargoSlotIds[slotIndex];
      if (!cargoId) continue;
      const cargo = state.fishCargo[cargoId];
      if (!cargo || cargo.location.containerId !== boat.id || cargo.location.slotIndex !== slotIndex) return false;
    }
  }

  for (const [marketId, market] of Object.entries(state.markets)) {
    const definition = ContentRegistry.markets.get(marketId);
    if (
      !definition ||
      !isRecord(market) ||
      market.id !== marketId ||
      market.name !== definition.name ||
      market.regionId !== definition.regionId ||
      !isRecord(market.commodities)
    ) return false;
    for (const [itemId, commodity] of Object.entries(market.commodities)) {
      if (
        !definition.commodities.some((entry) => entry.itemId === itemId) ||
        !isRecord(commodity) ||
        commodity.itemId !== itemId ||
        !isFiniteNumber(commodity.basePrice, 0) ||
        !isFiniteInRange(commodity.demandIndex, 0.65, 1.6) ||
        !isFiniteNumber(commodity.localSupply, 0) ||
        !isFiniteNumber(commodity.targetSupply, 0) ||
        !isFiniteNumber(commodity.consumptionRate, 0) ||
        !isFiniteNumber(commodity.seasonalModifier, 0) ||
        !isSafeInteger(commodity.lastTickMinute, 0) ||
        !isFiniteNumber(commodity.recentSalesVolume, 0)
      ) return false;
    }
  }

  return true;
}

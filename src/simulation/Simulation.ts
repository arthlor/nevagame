// src/simulation/Simulation.ts

import { ContentRegistry } from "../content/ContentRegistry";
import { EventBus } from "./core/EventBus";
import { GameClock } from "./core/GameClock";
import { SeededRng } from "./core/Rng";
import {
  CargoClass,
  CargoLocation,
  FarmId,
  BoatId,
  FishCargoId,
  FishCargoState,
  FishInstance,
  FishQuality,
  FishSchoolId,
  FishSpeciesId,
  FishingEncounterState,
  GameState,
  ItemId,
  MarketId,
  PlacedCropId,
  ProcessingJobId,
  RecipeId,
  RodClass,
  SkillId
} from "./core/types";
import { createInitialGameState } from "./core/createInitialState";
import {
  applyCropMoistureOverMinutes,
  calculateEffectiveGrowthDelta,
  calculateCropQuality,
  calculateHarvestYield,
  determineCropStage
} from "./farming/calculateCropGrowth";
import { calculateFreshnessLoss, resolveCargoHasIce } from "./fishing/calculateFreshness";
import { calculateFishPrice } from "./economy/calculateFishValue";
import { calculateCommodityUnitPrice } from "./economy/calculateCommodityValue";
import { recordMarketSale, tickMarket } from "./economy/updateMarket";
import { InventoryManager } from "./inventory/InventoryManager";
import { FishingEncounter } from "./fishing/FishingEncounter";
import { advanceScheduledWeather, applyWeatherProfile } from "./weather/updateWeather";
import { HARBOR_DOCK } from "../world/WorldAnchors";
import { SAILABLE_BOUNDS, WORLD_BOUNDS, WorldLayout } from "../world/WorldLayout";
import { getRankForXp } from "../content/progression";

const CARGO_CLASS_RANK: Record<CargoClass, number> = {
  small: 0,
  medium: 1,
  large: 2,
  gargantuan: 3
};

const ROD_CLASS_RANK: Record<RodClass, number> = {
  willow: 0,
  river: 1,
  "heavy-sport": 2,
  offshore: 3,
  master: 4
};

const QUALITY_RANK: Record<string, number> = {
  common: 0,
  fine: 1,
  exceptional: 2,
  trophy: 3
};

const SCHOOL_INTERACTION_RADIUS = 12;
const CROP_INTERACTION_RADIUS = 2.5;
const STATION_INTERACTION_RADIUS = 4;
const SCHOOL_RESPAWN_COOLDOWN_MINUTES = 90;
const SCHOOL_SPAWN_POINTS = [
  { habitatId: "lake", x: -30, z: 45 },
  { habitatId: "coast", x: 60, z: 80 }
] as const;
const FISHING_HABITATS = new Set(["river", "lake", "coast", "offshore"]);

function distance2d(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function cargoClassFits(fishClass: CargoClass, slotMax: CargoClass): boolean {
  return CARGO_CLASS_RANK[fishClass] <= CARGO_CLASS_RANK[slotMax];
}

function rodMeetsMinimum(equipped: RodClass, minimum: RodClass): boolean {
  return ROD_CLASS_RANK[equipped] >= ROD_CLASS_RANK[minimum];
}

function qualityRank(quality: string | undefined): number {
  if (!quality) return -1;
  return QUALITY_RANK[quality] ?? -1;
}

function scrapsForCargoClass(cargoClass: CargoClass): number {
  switch (cargoClass) {
    case "small":
      return 1;
    case "medium":
      return 2;
    case "large":
    case "gargantuan":
      return 3;
  }
}

function nextGaussian(rng: SeededRng): number {
  const u1 = Math.max(1e-12, rng.nextFloat());
  const u2 = rng.nextFloat();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function rollSpeciesWeightKg(
  weightKg: { min: number; average?: number; max: number },
  rng: SeededRng
): number {
  const min = weightKg.min;
  const max = weightKg.max;
  const average = typeof weightKg.average === "number" ? weightKg.average : (min + max) / 2;
  const sigma = Math.max(0.01, (max - min) / 6);
  const sampled = average + nextGaussian(rng) * sigma;
  const clamped = Math.min(max, Math.max(min, sampled));
  return Number(clamped.toFixed(1));
}

export class Simulation {
  public state: GameState;
  public rng: SeededRng;
  public clock: GameClock;
  public events: EventBus;
  public activeFishingEncounter: FishingEncounter | null = null;

  constructor(initialState?: GameState) {
    ContentRegistry.initializeAndValidate();
    this.state = initialState || createInitialGameState();
    this.rng = new SeededRng(this.state.worldSeed + this.state.clock.currentMinute, this.state.metadata.rngState);
    this.clock = new GameClock(this.state.clock);
    this.events = new EventBus();
    if (this.state.sportFishing?.result === "active") {
      try {
        this.activeFishingEncounter = FishingEncounter.fromState(this.state.sportFishing, this.rng);
        this.activeFishingEncounter.setInput({
          isReeling: false,
          isSlacking: false,
          isBracing: false,
          rodDirectionAngle: 0
        });
      } catch {
        this.state.sportFishing = null;
      }
    } else {
      this.state.sportFishing = null;
    }
    this.persistRng();
  }

  public getState(): Readonly<GameState> {
    this.persistRng();
    return this.state;
  }

  public getNearbyMarketId(): MarketId | null {
    const { x, z } = this.state.player;
    for (const market of ContentRegistry.markets.values()) {
      const { interactionPosition } = market;
      if (Math.hypot(x - interactionPosition.x, z - interactionPosition.z) <= interactionPosition.radiusMeters) {
        return market.id;
      }
    }
    return null;
  }

  // ==========================================
  // SIMULATION TICK
  // ==========================================
  public tick(realDeltaSeconds: number): void {
    if (this.clock.isPaused()) {
      this.state.clock = { ...this.clock.getState() };
      return;
    }

    // 1. Advance Game Clock
    const minutesAdvanced = this.clock.tick(realDeltaSeconds);
    this.state.clock = { ...this.clock.getState() };

    // 2. Tick active Sport Fishing Encounter if present
    if (this.activeFishingEncounter) {
      const outcome = this.activeFishingEncounter.tick(realDeltaSeconds);
      if (outcome === "landed") {
        const encounterState = this.activeFishingEncounter.getState();
        const landRes = this.landCaughtFish(encounterState.fish);
        if (!landRes.success) {
          this.events.emit("FishEscaped", {
            speciesId: encounterState.fish.speciesId,
            reason: "escaped",
            minute: this.state.clock.currentMinute
          });
        }
        this.activeFishingEncounter = null;
        this.state.sportFishing = null;
      } else if (outcome === "escaped" || outcome === "line-snapped") {
        const encounterState = this.activeFishingEncounter.getState();
        this.events.emit("FishEscaped", {
          speciesId: encounterState.fish.speciesId,
          reason: outcome === "line-snapped" ? "snapped" : "escaped",
          minute: this.state.clock.currentMinute
        });
        this.activeFishingEncounter = null;
        this.state.sportFishing = null;
      }
    }

    this.tickBasicFishing(realDeltaSeconds);

    if (minutesAdvanced <= 0) {
      this.persistRng();
      return;
    }

    // 3. Update Crops
    this.tickCrops(minutesAdvanced);

    // 4. Update Processing Jobs
    this.tickProcessingJobs();

    // 5. Update Fish Cargo Freshness
    this.tickFishCargo(minutesAdvanced);

    // 6. Update Fish Schools
    this.tickFishSchools();

    // 7. Update Markets whenever minutes advanced (tickMarket coalesces hours)
    for (const market of Object.values(this.state.markets)) {
      const ticked = tickMarket(market, this.state.clock.currentMinute, this.state.clock.season, this.rng);
      if (ticked) {
        this.events.emit("MarketTicked", { marketId: market.id, minute: this.state.clock.currentMinute });
      }
    }

    // 8. Expire contracts
    this.tickContracts();

    // 9. Update scheduled weather for the next simulation interval
    this.tickWeather();

    // 10. Regenerate Work Capacity slowly
    this.tickWorkCapacity(minutesAdvanced);

    this.persistRng();
  }

  /** Development-only state setup still goes through the simulation boundary. */
  public grantDebugMoney(amount: number): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) return;
    this.state.player.money += amount;
  }

  /** Development-only weather override that keeps the complete profile coherent. */
  public setDebugWeather(type: GameState["weather"]["type"]): void {
    applyWeatherProfile(this.state.weather, type);
  }

  // ==========================================
  // PLAYER & BOAT ACTIONS
  // ==========================================
  public movePlayer(moveVector: { x: number; z: number }, isSprinting: boolean, deltaSeconds: number): void {
    if (this.state.player.activeBoatId || deltaSeconds <= 0) return;
    const speed = isSprinting ? 8.0 : 4.5;
    const dx = moveVector.x * speed * deltaSeconds;
    const dz = moveVector.z * speed * deltaSeconds;
    this.state.player.x = Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, this.state.player.x + dx));
    this.state.player.z = Math.min(WORLD_BOUNDS.maxZ, Math.max(WORLD_BOUNDS.minZ, this.state.player.z + dz));
    if (dx !== 0 || dz !== 0) this.state.player.rotationY = Math.atan2(dx, dz);
    this.refreshPlayerRegion();
  }

  public driveActiveBoat(moveVector: { x: number; z: number }, deltaSeconds: number): void {
    const boatId = this.state.player.activeBoatId;
    if (!boatId || deltaSeconds <= 0) return;
    const boat = this.state.boats[boatId];
    const boatDef = boat ? ContentRegistry.boats.get(boat.boatTypeId) : undefined;
    if (!boat || !boatDef) return;

    boat.headingRadians += moveVector.x * boatDef.turningRate * deltaSeconds;
    const throttle = -moveVector.z;
    const targetSpeed = throttle * boatDef.maxSpeed;
    boat.speed += (targetSpeed - boat.speed) * boatDef.acceleration * deltaSeconds;
    boat.x = Math.min(SAILABLE_BOUNDS.maxX, Math.max(SAILABLE_BOUNDS.minX, boat.x + Math.sin(boat.headingRadians) * boat.speed * deltaSeconds));
    boat.z = Math.min(SAILABLE_BOUNDS.maxZ, Math.max(SAILABLE_BOUNDS.minZ, boat.z + Math.cos(boat.headingRadians) * boat.speed * deltaSeconds));
    this.state.player.x = boat.x;
    this.state.player.z = boat.z;
    this.state.player.y = boat.y + 0.5;
    this.state.player.rotationY = boat.headingRadians;
    this.refreshPlayerRegion();
  }

  public refreshPlayerRegion(): void {
    this.state.player.currentRegionId = WorldLayout.regionAt(this.state.player.x, this.state.player.z);
  }

  public resetPlayerToSafeSpawn(): void {
    const activeBoatId = this.state.player.activeBoatId;
    if (activeBoatId) {
      const boat = this.state.boats[activeBoatId];
      if (boat) {
        boat.speed = 0;
        boat.isDocked = true;
        boat.dockedMarketId = HARBOR_DOCK.marketId;
        boat.x = HARBOR_DOCK.boatPosition.x;
        boat.y = 0;
        boat.z = HARBOR_DOCK.boatPosition.z;
        boat.headingRadians = 0;
      }
      this.state.player.activeBoatId = null;
    }

    if (this.activeFishingEncounter) {
      this.activeFishingEncounter = null;
      this.state.sportFishing = null;
    }
    if (this.state.basicFishing) {
      this.state.basicFishing = null;
    }

    this.state.player.x = 0;
    this.state.player.y = 0.5;
    this.state.player.z = 0;
    this.state.player.rotationY = 0;
    this.state.player.currentRegionId = "region.village";
  }

  public canBoardBoat(boatId: BoatId): boolean {
    const boat = this.state.boats[boatId];
    return Boolean(
      boat &&
        !this.state.player.activeBoatId &&
        boat.isDocked &&
        boat.dockedMarketId === HARBOR_DOCK.marketId &&
        distance2d(this.state.player, HARBOR_DOCK.playerPosition) <= HARBOR_DOCK.boardRadius
    );
  }

  public boardBoat(boatId: BoatId): { success: boolean; reason?: string } {
    if (!this.canBoardBoat(boatId)) return { success: false, reason: "Move closer to the docked rowboat" };
    const boat = this.state.boats[boatId]!;
    boat.isDocked = false;
    boat.dockedMarketId = null;
    boat.speed = 0;
    this.state.player.activeBoatId = boatId;
    this.state.player.x = boat.x;
    this.state.player.y = boat.y + 0.5;
    this.state.player.z = boat.z;
    this.state.player.rotationY = boat.headingRadians;
    this.events.emit("BoatBoarded", { boatId, minute: this.state.clock.currentMinute });
    return { success: true };
  }

  public canDockActiveBoat(): boolean {
    const boatId = this.state.player.activeBoatId;
    const boat = boatId ? this.state.boats[boatId] : null;
    return Boolean(boat && distance2d(boat, HARBOR_DOCK.boatPosition) <= HARBOR_DOCK.dockRadius);
  }

  public dockActiveBoat(): { success: boolean; reason?: string } {
    const boatId = this.state.player.activeBoatId;
    if (!boatId) return { success: false, reason: "You are not aboard a boat" };
    if (!this.canDockActiveBoat()) return { success: false, reason: "Return to the harbor dock to disembark" };
    const boat = this.state.boats[boatId]!;
    boat.x = HARBOR_DOCK.boatPosition.x;
    boat.y = HARBOR_DOCK.boatPosition.y;
    boat.z = HARBOR_DOCK.boatPosition.z;
    boat.speed = 0;
    boat.isDocked = true;
    boat.dockedMarketId = HARBOR_DOCK.marketId;
    this.state.player.activeBoatId = null;
    this.state.player.x = HARBOR_DOCK.playerPosition.x;
    this.state.player.y = 0.5;
    this.state.player.z = HARBOR_DOCK.playerPosition.z;
    this.events.emit("BoatDocked", { boatId, minute: this.state.clock.currentMinute });
    this.events.emit("BoatDisembarked", { boatId, minute: this.state.clock.currentMinute });
    return { success: true };
  }

  public canAccessFishCargo(cargo: FishCargoState, marketId?: MarketId): boolean {
    if (cargo.location.type === "player") return this.state.player.carriedFishCargoId === cargo.id;
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const boat = this.state.boats[cargo.location.containerId];
    if (!boat) return false;
    if (this.state.player.activeBoatId === boat.id) return true;
    return Boolean(marketId && boat.isDocked && boat.dockedMarketId === marketId);
  }

  // ==========================================
  // FARMING ACTIONS
  // ==========================================
  public plantCrop(farmId: FarmId, cropId: string, x: number, z: number): { success: boolean; reason?: string } {
    const farm = this.state.farms[farmId];
    if (!farm) return { success: false, reason: "Invalid farm" };

    const cropDef = ContentRegistry.crops.get(cropId);
    if (!cropDef) return { success: false, reason: "Unknown crop definition" };
    if (!Number.isFinite(x) || !Number.isFinite(z)) return { success: false, reason: "Invalid crop position" };
    const origin = farmId === "farm.starter_garden" ? { x: 0, z: 0 } : { x: -8, z: -10 };
    if (distance2d(this.state.player, { x: origin.x + x, z: origin.z + z }) > CROP_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the planting plot" };
    }
    if (this.state.player.proficiencies.farming < cropDef.minimumFarmingXp) {
      return { success: false, reason: `Requires ${cropDef.minimumFarmingXp} Farming XP` };
    }

    // Check bounds
    const halfW = farm.widthMeters / 2;
    const halfD = farm.depthMeters / 2;
    if (Math.abs(x) > halfW - cropDef.footprint.width / 2 || Math.abs(z) > halfD - cropDef.footprint.depth / 2) {
      return { success: false, reason: "Outside farm boundary" };
    }

    // Check overlap with existing crops
    for (const placedId of farm.placedCropIds) {
      const other = this.state.crops[placedId];
      if (!other) continue;
      const otherDef = ContentRegistry.crops.get(other.cropId);
      const minDistance = (cropDef.footprint.width + (otherDef ? otherDef.footprint.width : 1)) / 2;
      const dx = other.x - x;
      const dz = other.z - z;
      if (Math.sqrt(dx * dx + dz * dz) < minDistance * 0.9) {
        return { success: false, reason: "Too close to another crop" };
      }
    }
    for (const structureId of farm.placedStructureIds) {
      const structure = this.state.world.structures[structureId];
      if (structure && distance2d({ x: origin.x + x, z: origin.z + z }, structure) < Math.max(cropDef.footprint.width, cropDef.footprint.depth) / 2 + 1.25) {
        return { success: false, reason: "Too close to a structure" };
      }
    }

    // Check seed inventory
    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInv, [{ itemId: cropDef.seedItemId, quantity: 1 }])) {
      return { success: false, reason: "Missing seed in inventory" };
    }

    // Deduct seed
    InventoryManager.removeItemsAtomically(playerInv, [{ itemId: cropDef.seedItemId, quantity: 1 }]);

    const placedCropId = this.nextEntityId("placed_crop");
    this.state.crops[placedCropId] = {
      id: placedCropId,
      cropId: cropDef.id,
      farmId: farm.id,
      x,
      z,
      rotationRadians: this.rng.range(0, Math.PI * 2),
      plantedAtMinute: this.state.clock.currentMinute,
      lastUpdatedMinute: this.state.clock.currentMinute,
      effectiveGrowthMinutes: 0,
      moisture: 70, // starts well-hydrated from tilled planting
      health: 100,
      stage: "seeded",
      averageMoistureAccum: 70,
      moistureSampleCount: 1
    };

    farm.placedCropIds.push(placedCropId);
    this.addProficiencyXp("farming", 10);
    this.persistRng();

    this.events.emit("CropPlanted", {
      placedCropId,
      cropId: cropDef.id,
      farmId: farm.id,
      minute: this.state.clock.currentMinute
    });

    return { success: true };
  }

  public waterCrop(placedCropId: PlacedCropId): boolean {
    const crop = this.state.crops[placedCropId];
    if (!crop) return false;
    if (!this.isNearCrop(crop)) return false;

    crop.moisture = 100;
    this.addProficiencyXp("farming", 5);

    this.events.emit("CropWatered", {
      placedCropId,
      newMoisture: 100,
      minute: this.state.clock.currentMinute
    });
    return true;
  }

  public harvestCrop(placedCropId: PlacedCropId): { success: boolean; yield?: number; quality?: FishQuality; reason?: string } {
    const crop = this.state.crops[placedCropId];
    if (!crop) return { success: false, reason: "Crop not found" };
    if (!this.isNearCrop(crop)) return { success: false, reason: "Move closer to the crop" };

    if (crop.stage === "withered") {
      this.removePlacedCrop(placedCropId);
      return { success: true, yield: 0, reason: "Crop withered; plot cleared" };
    }

    if (crop.stage !== "mature" && crop.stage !== "overripe") {
      return { success: false, reason: "Crop is not ready for harvest" };
    }

    const cropDef = ContentRegistry.crops.get(crop.cropId)!;
    const farm = this.state.farms[crop.farmId]!;
    const playerInv = this.state.inventories[this.state.player.inventoryId];

    // Compute quality
    const avgMoisture = crop.moistureSampleCount > 0 ? crop.averageMoistureAccum / crop.moistureSampleCount : 50;
    const isPreferredClimate = cropDef.preferredClimates.includes(farm.climateId);
    const climateScore = isPreferredClimate ? 1.0 : 0.6;
    const farmingProficiency = this.state.player.proficiencies.farming;
    const rngRoll = this.rng.nextFloat();

    const { quality } = calculateCropQuality(
      {
        climateMatchScore: climateScore,
        averageMoisture: avgMoisture,
        soilFertility: farm.soil.fertility,
        farmingProficiency,
        rngRoll
      },
      this.rng
    );

    // Compute yield
    const quantity = calculateHarvestYield(cropDef, crop.health, farmingProficiency, this.rng);

    // Atomic inventory transfer
    if (!InventoryManager.canAddItems(playerInv, [{ itemId: cropDef.harvestItemId, quantity }])) {
      this.persistRng();
      return { success: false, reason: "Inventory is full! Free up space first." };
    }

    InventoryManager.addItemsAtomically(playerInv, [{ itemId: cropDef.harvestItemId, quantity }]);

    // Deplete soil fertility
    farm.soil.fertility = Math.max(10, farm.soil.fertility - cropDef.fertilityCost);

    // Grant Farming XP
    this.addProficiencyXp("farming", 45);

    // Record in journal
    if (!this.state.journal.cropRecords[crop.cropId]) {
      this.state.journal.cropRecords[crop.cropId] = { harvestedCount: 0 };
    }
    const cropRecord = this.state.journal.cropRecords[crop.cropId];
    cropRecord.harvestedCount += quantity;
    if (qualityRank(quality) >= qualityRank(cropRecord.bestQuality)) {
      cropRecord.bestQuality = quality;
    }

    this.events.emit("CropHarvested", {
      placedCropId,
      cropId: crop.cropId,
      quantity,
      quality,
      minute: this.state.clock.currentMinute
    });

    if (cropDef.regrows && cropDef.regrowMinutes) {
      // Regrowing crop resets to growing stage
      crop.stage = "growing";
      crop.effectiveGrowthMinutes = cropDef.baseGrowthMinutes - cropDef.regrowMinutes;
      crop.averageMoistureAccum = crop.moisture;
      crop.moistureSampleCount = 1;
    } else {
      this.removePlacedCrop(placedCropId);
    }

    this.persistRng();
    return { success: true, yield: quantity, quality };
  }

  // ==========================================
  // PROCESSING ACTIONS
  // ==========================================
  public startProcessingJob(recipeId: RecipeId, stationId: string): { success: boolean; reason?: string } {
    const recipe = ContentRegistry.recipes.get(recipeId);
    if (!recipe) return { success: false, reason: "Unknown recipe" };

    const station = this.state.world.structures[stationId];
    if (!station) return { success: false, reason: "Station not found" };
    if (distance2d(this.state.player, station) > STATION_INTERACTION_RADIUS) return { success: false, reason: "Move closer to the station" };
    if (station.type !== recipe.stationType) {
      return { success: false, reason: `This recipe requires a ${recipe.stationType}` };
    }
    if (recipe.minimumSkill && this.state.player.proficiencies[recipe.minimumSkill.skill] < recipe.minimumSkill.xp) {
      return { success: false, reason: `Requires ${recipe.minimumSkill.xp} ${recipe.minimumSkill.skill} XP` };
    }
    if (Object.values(this.state.processingJobs).some((job) => job.stationId === stationId && job.status !== "collected")) {
      return { success: false, reason: "Station is already in use" };
    }

    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInv, recipe.inputs)) {
      return { success: false, reason: "Missing required ingredients" };
    }

    // Deduct inputs atomically
    InventoryManager.removeItemsAtomically(playerInv, recipe.inputs);

    const jobId = this.nextEntityId("job");
    this.state.processingJobs[jobId] = {
      id: jobId,
      recipeId,
      stationId,
      startedAtMinute: this.state.clock.currentMinute,
      completesAtMinute: this.state.clock.currentMinute + recipe.durationMinutes,
      status: "active"
    };

    this.persistRng();
    this.events.emit("RecipeStarted", {
      jobId,
      recipeId,
      minute: this.state.clock.currentMinute
    });

    return { success: true };
  }

  public collectProcessingJob(jobId: ProcessingJobId): { success: boolean; reason?: string } {
    const job = this.state.processingJobs[jobId];
    if (!job || job.status !== "complete") return { success: false, reason: "Job not complete" };
    const station = this.state.world.structures[job.stationId];
    if (!station || distance2d(this.state.player, station) > STATION_INTERACTION_RADIUS) return { success: false, reason: "Move closer to the station" };

    const recipe = ContentRegistry.recipes.get(job.recipeId)!;
    const playerInv = this.state.inventories[this.state.player.inventoryId];

    if (!InventoryManager.canAddItems(playerInv, recipe.outputs)) {
      return { success: false, reason: "Inventory is full!" };
    }

    InventoryManager.addItemsAtomically(playerInv, recipe.outputs);
    job.status = "collected";
    delete this.state.processingJobs[jobId];

    this.addProficiencyXp("processing", 35);
    this.events.emit("RecipeCompleted", {
      jobId,
      recipeId: recipe.id,
      minute: this.state.clock.currentMinute
    });

    return { success: true };
  }

  // ==========================================
  // FISHING & ENCOUNTERS
  // ==========================================
  public castBasicFishing(): { success: boolean; reason?: string } {
    if (this.activeFishingEncounter || this.state.basicFishing) {
      return { success: false, reason: "Already fishing" };
    }
    const habitatId = WorldLayout.nearbyFishingHabitat(this.state.player.x, this.state.player.z);
    if (!habitatId) return { success: false, reason: "Move closer to fishable water" };

    const playerInv = this.state.inventories[this.state.player.inventoryId];
    const bait = [{ itemId: "item.bait_worms", quantity: 1 }];
    if (!InventoryManager.hasItems(playerInv, bait)) {
      return { success: false, reason: "You need Bait Worms to fish!" };
    }

    const rod = ContentRegistry.rods.get(this.state.player.equippedRodId);
    if (!rod || !rod.allowedHabitats.includes(habitatId)) {
      return { success: false, reason: "Your equipped rod cannot fish this water" };
    }

    const eligibleSpecies = Array.from(ContentRegistry.fishSpecies.values()).filter(
      (fish) =>
        !fish.isSportFish &&
        fish.habitats.includes(habitatId) &&
        fish.seasons.includes(this.state.clock.season) &&
        fish.timeWindows.includes(this.state.clock.timeOfDay) &&
        fish.weatherPreferences.includes(this.state.weather.type) &&
        rodMeetsMinimum(rod.rodClass, fish.minimumRodClass) &&
        ContentRegistry.items.has(fish.id)
    );
    if (eligibleSpecies.length === 0) {
      return { success: false, reason: "Nothing is biting in these conditions" };
    }
    if (!eligibleSpecies.some((fish) => InventoryManager.canAddItems(playerInv, [{ itemId: fish.id, quantity: 1 }]))) {
      return { success: false, reason: "Inventory is full!" };
    }

    InventoryManager.removeItemsAtomically(playerInv, bait);
    const catchItemId = this.rng.weighted(eligibleSpecies.map((fish) => ({ value: fish.id, weight: fish.rarityWeight })));
    this.state.basicFishing = {
      habitatId,
      phase: "casting",
      remainingSeconds: this.rng.range(3, 6),
      catchItemId,
      willCatch: this.rng.chance(rod.hookReliability)
    };
    this.persistRng();
    this.events.emit("BasicFishingStarted", { habitatId, minute: this.state.clock.currentMinute });

    return { success: true };
  }

  public spawnFishSchool(habitatId: string, x: number, z: number, speciesIds: FishSpeciesId[]): FishSchoolId {
    const physicalHabitat = Number.isFinite(x) && Number.isFinite(z) ? WorldLayout.fishingHabitatAt(x, z) : null;
    if (!FISHING_HABITATS.has(habitatId) || physicalHabitat !== habitatId) {
      throw new Error("Fish schools must be spawned in their matching physical habitat");
    }
    if (speciesIds.length === 0 || speciesIds.some((speciesId) => {
      const fish = ContentRegistry.fishSpecies.get(speciesId);
      return !fish || !fish.isSportFish || !fish.habitats.includes(habitatId);
    })) {
      throw new Error("Fish schools require eligible sport-fish species for their habitat");
    }
    const schoolId = this.nextEntityId("school");
    const weights = speciesIds.map((speciesId) => ({
      speciesId,
      weight: ContentRegistry.fishSpecies.get(speciesId)?.rarityWeight ?? 1
    }));

    this.state.world.activeSchools[schoolId] = {
      id: schoolId,
      habitatId,
      x,
      z,
      radius: 8.0,
      spawnedAtMinute: this.state.clock.currentMinute,
      expiresAtMinute: this.state.clock.currentMinute + 180, // 3 hours
      remainingCatchPotential: 3,
      speciesWeights: weights
    };

    this.persistRng();
    this.events.emit("FishSchoolSpawned", {
      schoolId,
      x,
      z,
      species: speciesIds,
      minute: this.state.clock.currentMinute
    });

    return schoolId;
  }

  public chumFishSchool(schoolId: FishSchoolId): { success: boolean; reason?: string } {
    const school = this.state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "School disappeared" };
    if (distance2d(this.state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }
    if (school.feedingFrenzyUntilMinute && this.state.clock.currentMinute <= school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "This school is already feeding" };
    }

    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInv, [{ itemId: "item.chum_bucket", quantity: 1 }])) {
      return { success: false, reason: "You need a Chum Bucket!" };
    }

    InventoryManager.removeItemsAtomically(playerInv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    school.feedingFrenzyUntilMinute = this.state.clock.currentMinute + 30; // 30 min frenzy

    this.events.emit("FishSchoolChummed", {
      schoolId,
      frenzyMinutes: 30,
      minute: this.state.clock.currentMinute
    });

    return { success: true };
  }

  public hookSportFish(schoolId: FishSchoolId): { success: boolean; encounter?: FishingEncounterState; reason?: string } {
    if (this.activeFishingEncounter || this.state.basicFishing) {
      return { success: false, reason: "Already fighting a fish" };
    }

    const school = this.state.world.activeSchools[schoolId];
    if (!school) return { success: false, reason: "No active school" };
    if (distance2d(this.state.player, school) > SCHOOL_INTERACTION_RADIUS) {
      return { success: false, reason: "Move closer to the fish school" };
    }

    if (!school.feedingFrenzyUntilMinute || this.state.clock.currentMinute > school.feedingFrenzyUntilMinute) {
      return { success: false, reason: "School is not in a feeding frenzy! Chum it first." };
    }

    // Pick species from school
    const speciesId = this.rng.weighted(
      school.speciesWeights.map((sw) => ({ value: sw.speciesId, weight: sw.weight }))
    );
    const speciesDef = ContentRegistry.fishSpecies.get(speciesId);
    if (!speciesDef) {
      this.persistRng();
      return { success: false, reason: "Unknown fish species" };
    }

    const rodDef = ContentRegistry.rods.get(this.state.player.equippedRodId) || ContentRegistry.rods.get("rod.willow")!;
    if (!rodMeetsMinimum(rodDef.rodClass, speciesDef.minimumRodClass)) {
      this.persistRng();
      return { success: false, reason: "Rod class is too light for this species" };
    }

    const weightKg = rollSpeciesWeightKg(speciesDef.weightKg, this.rng);

    // Roll quality
    const qRoll = this.rng.nextFloat();
    let quality: FishQuality = "common";
    if (qRoll > 0.92) quality = "trophy";
    else if (qRoll > 0.75) quality = "exceptional";
    else if (qRoll > 0.45) quality = "fine";

    const fishInstance: FishInstance = {
      instanceId: this.nextEntityId("fish_inst"),
      speciesId,
      weightKg,
      quality,
      caughtAtMinute: this.state.clock.currentMinute
    };

    this.activeFishingEncounter = new FishingEncounter(
      fishInstance,
      this.state.player.equippedRodId,
      this.rng,
      30
    );
    this.state.sportFishing = this.activeFishingEncounter.getState() as FishingEncounterState;

    school.remainingCatchPotential -= 1;
    if (school.remainingCatchPotential <= 0) {
      delete this.state.world.activeSchools[schoolId];
    }

    this.persistRng();
    this.events.emit("FishHooked", {
      speciesId,
      weightKg,
      minute: this.state.clock.currentMinute
    });

    return { success: true, encounter: this.activeFishingEncounter.getState() };
  }

  private landCaughtFish(fish: FishInstance): { success: boolean; reason?: string } {
    const speciesDef = ContentRegistry.fishSpecies.get(fish.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };

    const location = this.findLandingLocation(speciesDef.cargoClass);
    if (!location) {
      return { success: false, reason: "No cargo space" };
    }

    const cargoId: FishCargoId = this.nextEntityId("cargo");

    if ((location.type === "boat-hold" || location.type === "boat-hook") && typeof location.slotIndex === "number") {
      const boat = this.state.boats[location.containerId];
      if (boat) {
        boat.fishCargoSlotIds[location.slotIndex] = cargoId;
      }
    } else if (location.type === "player") {
      this.state.player.carriedFishCargoId = cargoId;
    }

    this.state.fishCargo[cargoId] = {
      id: cargoId,
      speciesId: fish.speciesId,
      weightKg: fish.weightKg,
      quality: fish.quality,
      caughtAtMinute: this.state.clock.currentMinute,
      freshness: 100,
      cargoClass: speciesDef.cargoClass,
      location
    };
    if ((location.type === "boat-hold" || location.type === "boat-hook") && typeof location.slotIndex === "number") {
      this.events.emit("CargoLoaded", {
        cargoId,
        boatId: location.containerId,
        slotIndex: location.slotIndex,
        minute: this.state.clock.currentMinute
      });
    }

    // Update journal
    if (!this.state.journal.fishRecords[fish.speciesId]) {
      this.state.journal.fishRecords[fish.speciesId] = {
        discovered: true,
        catchCount: 0,
        largestWeightKg: fish.weightKg,
        bestQuality: fish.quality,
        firstCaughtMinute: this.state.clock.currentMinute
      };
    }
    const record = this.state.journal.fishRecords[fish.speciesId];
    record.catchCount += 1;
    record.largestWeightKg = Math.max(record.largestWeightKg || 0, fish.weightKg);
    if (qualityRank(fish.quality) > qualityRank(record.bestQuality)) {
      record.bestQuality = fish.quality;
    }

    this.addProficiencyXp("fishing", 120);
    this.persistRng();

    this.events.emit("FishLanded", {
      cargoId,
      speciesId: fish.speciesId,
      weightKg: fish.weightKg,
      quality: fish.quality,
      minute: this.state.clock.currentMinute
    });

    return { success: true };
  }

  public discardFishCargo(cargoId: FishCargoId): { success: boolean; scraps?: number; reason?: string } {
    const cargo = this.state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.canAccessFishCargo(cargo)) return { success: false, reason: "Move to the fish cargo before discarding it" };

    const scraps = scrapsForCargoClass(cargo.cargoClass);
    const playerInv = this.state.inventories[this.state.player.inventoryId];
    const scrapStack = [{ itemId: "item.fish_scraps", quantity: scraps }];
    let granted = 0;
    if (InventoryManager.canAddItems(playerInv, scrapStack)) {
      InventoryManager.addItemsAtomically(playerInv, scrapStack);
      granted = scraps;
    }

    this.clearFishCargoPointers(cargo);
    delete this.state.fishCargo[cargoId];

    return { success: true, scraps: granted, reason: granted === 0 ? "No inventory space for scraps" : undefined };
  }

  // ==========================================
  // CONTRACT DELIVERY
  // ==========================================
  public deliverItemsToContract(
    contractId: string,
    itemId: ItemId,
    quantity: number
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    if (!this.getNearbyMarketId()) return { success: false, reason: "Deliver contracts at a market" };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, reason: "Delivery quantity must be a positive whole number" };
    }

    const contract = this.getActiveContract(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };
    if (contract.targetItemIdOrSpecies !== itemId) {
      return { success: false, reason: "This contract does not accept that item" };
    }
    if (contract.type === "fresh-fish" || contract.type === "quality-target") {
      return { success: false, reason: "This contract requires physical fish cargo" };
    }

    const remaining = contract.quantityRequired - contract.quantityFulfilled;
    if (quantity > remaining) {
      return { success: false, reason: `Only ${remaining} more needed for this contract` };
    }

    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInv, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough items to deliver" };
    }

    InventoryManager.removeItemsAtomically(playerInv, [{ itemId, quantity }]);
    contract.quantityFulfilled += quantity;
    const completion = this.completeContractIfFulfilled(contract);

    return {
      success: true,
      delivered: quantity,
      completed: completion.completed,
      rewardMoney: completion.rewardMoney
    };
  }

  public deliverFishCargoToContract(
    contractId: string,
    cargoId: FishCargoId
  ): { success: boolean; delivered?: number; completed?: boolean; rewardMoney?: number; reason?: string } {
    if (!this.getNearbyMarketId()) return { success: false, reason: "Deliver contracts at a market" };
    const contract = this.getActiveContract(contractId);
    if (!contract) return { success: false, reason: "Contract is not active" };

    const cargo = this.state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    const marketId = this.getNearbyMarketId();
    if (!marketId || !this.canAccessFishCargo(cargo, marketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }
    if (contract.targetItemIdOrSpecies !== cargo.speciesId) {
      return { success: false, reason: "This contract requires a different species" };
    }
    if (contract.quantityFulfilled >= contract.quantityRequired) {
      return { success: false, reason: "Contract is already fully delivered" };
    }
    if (contract.minQuality && qualityRank(cargo.quality) < qualityRank(contract.minQuality)) {
      return { success: false, reason: `Contract requires ${contract.minQuality} quality or better` };
    }
    if (contract.minFreshness !== undefined && cargo.freshness < contract.minFreshness) {
      return { success: false, reason: `Contract requires at least ${contract.minFreshness}% freshness` };
    }
    if (contract.minWeightKg !== undefined && cargo.weightKg < contract.minWeightKg) {
      return { success: false, reason: `Contract requires at least ${contract.minWeightKg} kg` };
    }

    this.clearFishCargoPointers(cargo);
    delete this.state.fishCargo[cargoId];
    contract.quantityFulfilled += 1;
    const completion = this.completeContractIfFulfilled(contract);

    return {
      success: true,
      delivered: 1,
      completed: completion.completed,
      rewardMoney: completion.rewardMoney
    };
  }

  // ==========================================
  // ECONOMY & MARKET ACTIONS
  // ==========================================
  public sellItemAtMarket(marketId: MarketId, itemId: ItemId, quantity: number): { success: boolean; revenue?: number; reason?: string } {
    const market = this.state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };

    const commodity = market.commodities[itemId];
    if (!commodity) return { success: false, reason: "Market does not trade this item" };
    if (!InventoryManager.isValidItemStack({ itemId, quantity })) return { success: false, reason: "Sale quantity must be a positive whole number" };

    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!InventoryManager.hasItems(playerInv, [{ itemId, quantity }])) {
      return { success: false, reason: "You do not have enough of this item" };
    }

    const revenue = calculateCommodityUnitPrice(commodity).unitPrice * quantity;

    // Atomically execute transaction
    InventoryManager.removeItemsAtomically(playerInv, [{ itemId, quantity }]);
    this.state.player.money += revenue;
    recordMarketSale(market, itemId, quantity);

    this.addProficiencyXp("trading", Math.max(5, Math.floor(revenue * 0.1)));

    this.events.emit("ItemSold", {
      marketId,
      itemId,
      quantity,
      revenue,
      minute: this.state.clock.currentMinute
    });

    return { success: true, revenue };
  }

  public sellFishCargoAtMarket(marketId: MarketId, cargoId: FishCargoId): { success: boolean; revenue?: number; reason?: string } {
    const market = this.state.markets[marketId];
    if (!market) return { success: false, reason: "Market not found" };
    if (this.getNearbyMarketId() !== marketId) return { success: false, reason: "You must be at this market to trade" };

    const cargo = this.state.fishCargo[cargoId];
    if (!cargo) return { success: false, reason: "Fish cargo not found" };
    if (!this.canAccessFishCargo(cargo, marketId)) {
      return { success: false, reason: "Bring this fish cargo to the market dock" };
    }

    const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
    if (!speciesDef) return { success: false, reason: "Unknown fish species" };

    if (cargo.freshness <= 0) {
      return { success: false, reason: "Fish is spoiled and cannot be sold" };
    }

    const commodity = market.commodities[cargo.speciesId];
    const demandIndex = commodity ? commodity.demandIndex : 1.0;
    const seasonalMod = commodity ? commodity.seasonalModifier : 1.0;

    const priceBreakdown = calculateFishPrice(
      speciesDef,
      cargo.weightKg,
      cargo.quality,
      cargo.freshness,
      demandIndex,
      seasonalMod
    );

    const revenue = priceBreakdown.finalPrice;
    if (revenue <= 0) {
      return { success: false, reason: "Fish has no market value" };
    }

    this.clearFishCargoPointers(cargo);
    delete this.state.fishCargo[cargoId];
    this.state.player.money += revenue;

    if (commodity) {
      recordMarketSale(market, cargo.speciesId, 1);
    }

    this.addProficiencyXp("trading", Math.max(10, Math.floor(revenue * 0.15)));

    this.events.emit("FishSold", {
      marketId,
      cargoId,
      speciesId: cargo.speciesId,
      revenue,
      minute: this.state.clock.currentMinute
    });

    return { success: true, revenue };
  }

  // ==========================================
  // PROFICIENCY & PROGRESSION
  // ==========================================
  public addProficiencyXp(skill: SkillId, xpAmount: number): void {
    if (!Number.isSafeInteger(xpAmount) || xpAmount <= 0) return;
    const isEnergized = this.state.player.workCapacity.current > 0;
    const multiplier = isEnergized ? 1.0 : 0.4;
    const earned = Math.round(xpAmount * multiplier);

    if (isEnergized) {
      this.state.player.workCapacity.current = Math.max(0, this.state.player.workCapacity.current - xpAmount);
    }

    const currentXp = this.state.player.proficiencies[skill];
    const newXp = currentXp + earned;
    const oldRank = getRankForXp(currentXp);
    const newRank = getRankForXp(newXp);

    this.state.player.proficiencies[skill] = newXp;

    if (newRank.rankIndex > oldRank.rankIndex) {
      this.events.emit("ProficiencyLeveledUp", {
        skill,
        newRank: newRank.rankName,
        totalXp: newXp,
        minute: this.state.clock.currentMinute
      });
    }
  }

  // ==========================================
  // PRIVATE INTERNAL TICK HELPERS
  // ==========================================
  private persistRng(): void {
    this.state.metadata.rngState = this.rng.getState();
  }

  private nextEntityId(prefix: string): string {
    const a = this.rng.intInclusive(1, 0x7fffffff).toString(36);
    const b = this.rng.intInclusive(0, 0xffff).toString(36);
    return `${prefix}_${a}_${b}`;
  }

  private removePlacedCrop(placedCropId: PlacedCropId): void {
    const crop = this.state.crops[placedCropId];
    if (!crop) return;
    const farm = this.state.farms[crop.farmId];
    delete this.state.crops[placedCropId];
    if (farm) {
      farm.placedCropIds = farm.placedCropIds.filter((id) => id !== placedCropId);
    }
  }

  private isNearCrop(crop: GameState["crops"][string]): boolean {
    const origin = crop.farmId === "farm.starter_garden" ? { x: 0, z: 0 } : { x: -8, z: -10 };
    return distance2d(this.state.player, { x: origin.x + crop.x, z: origin.z + crop.z }) <= CROP_INTERACTION_RADIUS;
  }

  private clearFishCargoPointers(cargo: FishCargoState): void {
    if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
      const boat = this.state.boats[cargo.location.containerId];
      if (boat && typeof cargo.location.slotIndex === "number") {
        boat.fishCargoSlotIds[cargo.location.slotIndex] = null;
      }
    }
    if (this.state.player.carriedFishCargoId === cargo.id) {
      this.state.player.carriedFishCargoId = null;
    }
  }

  private getActiveContract(contractId: string) {
    const contract = this.state.contracts.find((candidate) => candidate.id === contractId);
    if (!contract || contract.status !== "active") return null;

    if (this.state.clock.currentMinute >= contract.expiresAtMinute) {
      contract.status = "expired";
      return null;
    }

    return contract;
  }

  private completeContractIfFulfilled(contract: GameState["contracts"][number]): {
    completed: boolean;
    rewardMoney?: number;
  } {
    if (contract.quantityFulfilled < contract.quantityRequired) {
      return { completed: false };
    }

    contract.quantityFulfilled = contract.quantityRequired;
    contract.status = "completed";
    this.state.player.money += contract.rewardMoney;
    this.addProficiencyXp(contract.rewardSkillXp.skill, contract.rewardSkillXp.xp);
    this.events.emit("ContractCompleted", {
      contractId: contract.id,
      rewardMoney: contract.rewardMoney,
      minute: this.state.clock.currentMinute
    });

    return { completed: true, rewardMoney: contract.rewardMoney };
  }

  private findLandingLocation(cargoClass: CargoClass): CargoLocation | null {
    const boat = this.state.player.activeBoatId ? this.state.boats[this.state.player.activeBoatId] : null;
    const boatDef = boat ? ContentRegistry.boats.get(boat.boatTypeId) : undefined;

    if (boat && boatDef) {
      for (let i = 0; i < boat.fishCargoSlotIds.length; i++) {
        if (boat.fishCargoSlotIds[i] !== null) continue;
        const slot = boatDef.fishCargoSlots.find((s) => s.slotIndex === i) ?? boatDef.fishCargoSlots[i];
        if (!slot) continue;
        if (!cargoClassFits(cargoClass, slot.maxCargoClass)) continue;
        const locType = slot.type === "external-hook" ? "boat-hook" : "boat-hold";
        return { type: locType, containerId: boat.id, slotIndex: i };
      }
    }

    if (!this.state.player.carriedFishCargoId) {
      return { type: "player", containerId: "player" };
    }

    return null;
  }

  private tickCrops(minutes: number): void {
    for (const crop of Object.values(this.state.crops)) {
      const cropDef = ContentRegistry.crops.get(crop.cropId);
      const farm = this.state.farms[crop.farmId];
      if (!cropDef || !farm) continue;

      const effectiveDelta = calculateEffectiveGrowthDelta(
        minutes,
        cropDef,
        farm.climateId,
        crop.moisture,
        farm.soil.fertility,
        this.state.weather.type
      );

      crop.effectiveGrowthMinutes += effectiveDelta;
      crop.lastUpdatedMinute = this.state.clock.currentMinute;

      applyCropMoistureOverMinutes(crop, minutes, cropDef.waterNeed, this.state.weather.type);

      const oldStage = crop.stage;
      const newStage = determineCropStage(crop.effectiveGrowthMinutes, cropDef.baseGrowthMinutes);
      if (newStage !== oldStage) {
        crop.stage = newStage;
        this.events.emit("CropStageChanged", {
          placedCropId: crop.id,
          cropId: crop.cropId,
          stage: newStage,
          minute: this.state.clock.currentMinute
        });
      }
    }
  }

  private tickBasicFishing(realDeltaSeconds: number): void {
    const attempt = this.state.basicFishing;
    if (!attempt || realDeltaSeconds <= 0) return;

    attempt.remainingSeconds -= realDeltaSeconds;
    if (attempt.remainingSeconds <= 1) attempt.phase = "bite";
    else if (attempt.remainingSeconds <= 3) attempt.phase = "waiting";
    if (attempt.remainingSeconds > 0) return;

    this.state.basicFishing = null;
    const playerInv = this.state.inventories[this.state.player.inventoryId];
    if (!attempt.willCatch || !attempt.catchItemId) {
      this.events.emit("BasicFishingResolved", {
        habitatId: attempt.habitatId,
        reason: "missed",
        minute: this.state.clock.currentMinute
      });
      return;
    }

    const catchStack = [{ itemId: attempt.catchItemId, quantity: 1 }];
    if (!InventoryManager.canAddItems(playerInv, catchStack)) {
      this.events.emit("BasicFishingResolved", {
        habitatId: attempt.habitatId,
        reason: "inventory-full",
        minute: this.state.clock.currentMinute
      });
      return;
    }

    InventoryManager.addItemsAtomically(playerInv, catchStack);
    this.addProficiencyXp("fishing", 25);
    this.events.emit("BasicFishingResolved", {
      habitatId: attempt.habitatId,
      catchItemId: attempt.catchItemId,
      minute: this.state.clock.currentMinute
    });
  }

  private tickProcessingJobs(): void {
    for (const job of Object.values(this.state.processingJobs)) {
      if (job.status === "active" && this.state.clock.currentMinute >= job.completesAtMinute) {
        job.status = "complete";
      }
    }
  }

  private tickFishCargo(minutes: number): void {
    for (const cargo of Object.values(this.state.fishCargo)) {
      if (cargo.freshness <= 0) continue;
      // Cargo landed during this tick begins decaying on the next simulation interval.
      if (cargo.caughtAtMinute === this.state.clock.currentMinute) continue;
      const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
      if (!speciesDef) continue;

      const hasIce = resolveCargoHasIce(this.state, cargo);
      const decay = calculateFreshnessLoss(
        minutes,
        speciesDef.baseDecayRatePerMinute,
        cargo.location.type,
        hasIce,
        this.state.weather.temperatureC
      );

      cargo.freshness = Math.max(0, cargo.freshness - decay);
    }
  }

  private tickFishSchools(): void {
    const currentMin = this.state.clock.currentMinute;
    for (const [id, school] of Object.entries(this.state.world.activeSchools)) {
      if (currentMin >= school.expiresAtMinute || school.remainingCatchPotential <= 0) {
        delete this.state.world.activeSchools[id];
      }
    }

    if (Object.keys(this.state.world.activeSchools).length > 0) return;
    const lastSpawn = this.state.world.lastSchoolSpawnMinute ?? Number.NEGATIVE_INFINITY;
    if (currentMin - lastSpawn < SCHOOL_RESPAWN_COOLDOWN_MINUTES) return;

    let spawned = false;
    for (const point of SCHOOL_SPAWN_POINTS) {
      const speciesIds = Array.from(ContentRegistry.fishSpecies.values())
        .filter(
          (fish) =>
            fish.isSportFish &&
            fish.habitats.includes(point.habitatId) &&
            fish.seasons.includes(this.state.clock.season) &&
            fish.timeWindows.includes(this.state.clock.timeOfDay) &&
            fish.weatherPreferences.includes(this.state.weather.type)
        )
        .map((fish) => fish.id);
      if (speciesIds.length === 0) continue;
      this.spawnFishSchool(point.habitatId, point.x, point.z, speciesIds);
      spawned = true;
    }
    if (spawned) this.state.world.lastSchoolSpawnMinute = currentMin;
  }

  private tickContracts(): void {
    const currentMinute = this.state.clock.currentMinute;
    for (const contract of this.state.contracts) {
      if (contract.status === "active" && currentMinute >= contract.expiresAtMinute) {
        contract.status = "expired";
      }
    }
  }

  private tickWeather(): void {
    if (
      advanceScheduledWeather(this.state.weather, this.state.clock.currentMinute, this.rng)
    ) {
      this.events.emit("WeatherChanged", {
        weather: this.state.weather.type,
        minute: this.state.clock.currentMinute
      });
    }
  }

  private tickWorkCapacity(minutes: number): void {
    const wc = this.state.player.workCapacity;
    if (wc.current < wc.maximum) {
      // Regens ~100 points per real hour (60 game minutes)
      const regen = (minutes / 60) * 100;
      wc.current = Math.min(wc.maximum, wc.current + regen);
      wc.lastRegenMinute = this.state.clock.currentMinute;
    }
  }
}

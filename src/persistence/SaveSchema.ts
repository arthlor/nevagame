// src/persistence/SaveSchema.ts

import type { CropStage, GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../simulation/inventory/InventoryLimits";
import {
  PROCESSING_JOB_SNAPSHOT_LIMITS,
  PROCESSING_WORK_BY_TIER,
  PROCESSING_XP_BY_TIER
} from "../simulation/domains/ProcessingDomain";
import { PLAYER_TRAVERSAL_TUNING } from "../simulation/navigation/PlayerTraversal";
import { calendarAtMinute, isValidClockSpeed } from "../simulation/core/GameClock";
import { cargoClassFits, isProduceContractType } from "../simulation/domains/domainRules";
import { WORLD_LAYOUT_REVISION } from "../world/WorldAnchors";
import {
  MAX_EARLY_ACTION_CREDIT_QUANTITY,
  MAX_EARLY_ACTION_CREDIT_RECORDS,
  QUEST_LOCATION_KINDS,
  QUEST_OBJECTIVE_TYPES
} from "../simulation/core/QuestTypes";
import { FISHING_TUNING, fishingDepthBounds } from "../simulation/fishing/FishingTuning";
import {
  isPlayerAtMountPose,
  isValidMountPose,
  MOUNT_TUNING,
  isValidPlayerMountGround,
  STARTER_DONKEY_ID,
  STARTER_DONKEY_TYPE_ID
} from "../simulation/mounts/Mounts";

export const CURRENT_SCHEMA_VERSION = 39;

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
const FISHING_ECOLOGIES = ["ecology.neva", "ecology.sunreach"] as const;
const FISH_QUALITIES = ["common", "fine", "exceptional", "trophy"] as const;
const CARGO_CLASSES = ["small", "medium", "large", "gargantuan"] as const;
const CROP_STAGES: readonly CropStage[] = ["seeded", "sprout", "growing", "mature", "overripe", "withered"];

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
  if (!isRecord(state.clock) || !isSafeInteger(state.clock.currentMinute, 0) || !isValidClockSpeed(state.clock.minutesPerRealSecond)) return false;
  // Since the v25 calendar retune the stored day, season and year are a cache
  // of `currentMinute`. The clock re-derives them on load, but a pre-load reader
  // (the title summary) would otherwise show whatever the slot claims.
  if (schemaVersion >= 25) {
    const calendar = calendarAtMinute(state.clock.currentMinute);
    if (
      state.clock.dayCount !== calendar.dayCount ||
      state.clock.season !== calendar.season ||
      state.clock.year !== calendar.year
    ) return false;
  }
  if (
    !isRecord(state.player) ||
    !isFiniteNumber(state.player.money, 0) ||
    typeof state.player.inventoryId !== "string" ||
    !isFiniteNumber(state.player.x) ||
    !isFiniteNumber(state.player.y) ||
    !isFiniteNumber(state.player.z) ||
    !isFiniteNumber(state.player.rotationY) ||
    typeof state.player.currentRegionId !== "string" ||
    (schemaVersion >= 6 && (
      !isRecord(state.player.traversal) ||
      !isFiniteInRange(state.player.traversal.sprintStamina, 0, PLAYER_TRAVERSAL_TUNING.maximumSprintStamina) ||
      !isFiniteNumber(state.player.traversal.sprintRecoveryDelaySeconds, 0) ||
      typeof state.player.traversal.sprintExhausted !== "boolean" ||
      typeof state.player.traversal.isGrounded !== "boolean"
    )) ||
    !isRecord(state.player.workCapacity) ||
    !isFiniteNumber(state.player.workCapacity.current, 0) ||
    !isFiniteNumber(state.player.workCapacity.maximum, 0) ||
    state.player.workCapacity.current > state.player.workCapacity.maximum ||
    !(schemaVersion >= 4
      ? isSafeInteger((state.player.workCapacity as unknown as Record<string, unknown>).regeneratedAtMinute, 0)
      : isSafeInteger((state.player.workCapacity as unknown as Record<string, unknown>).lastRegenMinute, 0)) ||
    !isRecord(state.player.proficiencies) ||
    !SKILL_IDS.every((skill) => isSafeInteger(state.player!.proficiencies[skill], 0))
  ) return false;
  if (
    state.player.dragNotch !== undefined &&
    state.player.dragNotch !== 0 &&
    state.player.dragNotch !== 1 &&
    state.player.dragNotch !== 2
  ) return false;
  if (!isRecord(state.inventories) || !isRecord(state.farms) || !isRecord(state.crops)) return false;
  if (
    !isRecord(state.world) ||
    (schemaVersion >= 39
      ? state.world.layoutRevision !== WORLD_LAYOUT_REVISION
      : schemaVersion === 38
      ? state.world.layoutRevision !== 16
      : schemaVersion >= 36
      ? state.world.layoutRevision !== 15
      // Pin the literal: schema 34-35 shipped on layout 14, and the symbol has
      // since moved on.
      : schemaVersion >= 34
      ? state.world.layoutRevision !== 14
      : schemaVersion >= 33
      ? state.world.layoutRevision !== 13
      : schemaVersion >= 32
      ? state.world.layoutRevision !== 12
      : schemaVersion >= 31
      ? state.world.layoutRevision !== 11
      : schemaVersion >= 26
      ? state.world.layoutRevision !== 10
      : schemaVersion >= 24
      ? state.world.layoutRevision !== 9
      : schemaVersion >= 17
      ? state.world.layoutRevision !== 8
      : schemaVersion >= 15
        ? state.world.layoutRevision !== 7
      : schemaVersion === 14
        ? state.world.layoutRevision !== 6
        : schemaVersion === 13
        ? state.world.layoutRevision !== 5
        : schemaVersion === 12
          ? state.world.layoutRevision !== 4
          : schemaVersion >= 7 && state.world.layoutRevision !== 3) ||
    !isSafeInteger(state.world.currentSeed, 0) ||
    state.world.currentSeed !== state.worldSeed ||
    !isRecord(state.world.activeSchools) ||
    (schemaVersion >= 28 && !isRecord(state.world.fishingPressureByHabitat)) ||
    !isRecord(state.world.structures) ||
    (state.world.lastSchoolSpawnMinute !== undefined && !isSafeInteger(state.world.lastSchoolSpawnMinute, 0))
    || (schemaVersion >= 9 && typeof state.world.storySchoolSpawned !== "boolean")
  ) return false;
  if (
    !isRecord(state.processingJobs) ||
    !isRecord(state.boats) ||
    !isRecord(state.fishCargo) ||
    (schemaVersion >= 18 && !isRecord(state.mounts))
  ) return false;
  if (
    schemaVersion >= 18 &&
    (state.player.activeMountId === undefined ||
      (state.player.activeMountId !== null && typeof state.player.activeMountId !== "string"))
  ) return false;
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
    (schemaVersion >= 16 && !isOneOf(state.weather.nextWeatherType, WEATHER_TYPES)) ||
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
  if (schemaVersion >= 20) {
    if (
      !Array.isArray(state.player.ownedRodIds) ||
      state.player.ownedRodIds.length === 0 ||
      new Set(state.player.ownedRodIds).size !== state.player.ownedRodIds.length ||
      !state.player.ownedRodIds.every((rodId) => typeof rodId === "string" && ContentRegistry.rods.has(rodId)) ||
      !state.player.ownedRodIds.includes(state.player.equippedRodId)
    ) return false;
  }
  if (schemaVersion >= 37) {
    const equipment = state.player.equipment;
    if (
      !isRecord(equipment) ||
      !Array.isArray(equipment.ownedIds) ||
      equipment.wardrobeCapacity !== 20 ||
      equipment.ownedIds.length > equipment.wardrobeCapacity ||
      new Set(equipment.ownedIds).size !== equipment.ownedIds.length ||
      !equipment.ownedIds.every((id) => typeof id === "string" && ContentRegistry.equipment.has(id)) ||
      !isRecord(equipment.equipped) ||
      !isRecord(equipment.presets)
    ) return false;
    const owned = new Set(equipment.ownedIds);
    const equipmentSlots = ["head", "outerwear", "feet", "watering-tool", "harvest-tool"] as const;
    for (const slot of equipmentSlots) {
      const id = equipment.equipped[slot];
      const definition = typeof id === "string" ? ContentRegistry.equipment.get(id) : undefined;
      if (!definition || definition.slot !== slot || !owned.has(id)) return false;
    }
    for (const presetId of ["field", "sea"] as const) {
      const preset = equipment.presets[presetId];
      if (!isRecord(preset)) return false;
      for (const slot of ["head", "outerwear", "feet"] as const) {
        const id = preset[slot];
        const definition = typeof id === "string" ? ContentRegistry.equipment.get(id) : undefined;
        if (!definition || definition.slot !== slot || !owned.has(id)) return false;
      }
    }
  }
  if (
    schemaVersion >= 28 &&
    state.player.preparedLureItemId !== null &&
    (state.player.preparedLureItemId !== "item.basic_lure" || !ContentRegistry.items.has(state.player.preparedLureItemId))
  ) return false;
  if (state.player.activeBoatId !== null && state.player.activeBoatId !== undefined && !state.boats[state.player.activeBoatId]) return false;
  if (state.player.carriedFishCargoId !== null && state.player.carriedFishCargoId !== undefined) {
    const carriedCargo = state.fishCargo[state.player.carriedFishCargoId];
    if (
      !carriedCargo ||
      !isRecord(carriedCargo.location) ||
      carriedCargo.location.type !== "player" ||
      carriedCargo.location.containerId !== "player"
    ) return false;
  }
  if (state.basicFishing && state.sportFishing) return false;
  if (
    state.basicFishing &&
    (typeof state.basicFishing.habitatId !== "string" ||
      !isOneOf(state.basicFishing.habitatId, FISHING_HABITATS) ||
      (schemaVersion >= 26 && !isOneOf(state.basicFishing.ecologyId, FISHING_ECOLOGIES)) ||
      !["charging-cast", "waiting-bite", "bite-reaction", "minigame", "caught", "escaped", "casting", "waiting", "bite"].includes(state.basicFishing.phase) ||
      !isFiniteNumber(state.basicFishing.remainingSeconds, 0) ||
      (state.basicFishing.catchItemId !== undefined && !ContentRegistry.items.has(state.basicFishing.catchItemId)) ||
      typeof state.basicFishing.willCatch !== "boolean" ||
      (state.basicFishing.castPower !== undefined && !isFiniteInRange(state.basicFishing.castPower, 0, 1)) ||
      (schemaVersion >= 22 && state.basicFishing.quality !== undefined && !isOneOf(state.basicFishing.quality, FISH_QUALITIES)))
  ) return false;
  // The dynamics/fish shape below is the post-v19 shape; validating an older
  // envelope directly (outside the migration path) must not read fields that
  // migration is responsible for introducing.
  if (schemaVersion >= 19 && state.sportFishing) {
    const dynamics = state.sportFishing.dynamics;
    const speciesId = isRecord(state.sportFishing.fish) && typeof state.sportFishing.fish.speciesId === "string"
      ? state.sportFishing.fish.speciesId
      : null;
    const species = speciesId ? ContentRegistry.fishSpecies.get(speciesId) : undefined;
    const profile = species ? ContentRegistry.fishBehaviors.get(species.behaviorProfileId) : undefined;
    const depthBounds = profile && isFiniteNumber(state.sportFishing.distanceMeters, 0)
      ? fishingDepthBounds(profile, state.sportFishing.distanceMeters)
      : null;
    if (schemaVersion >= 19 && (
      !isRecord(dynamics) ||
      ![dynamics.originX, dynamics.originZ, dynamics.bearingRadians, dynamics.headingRadians,
        dynamics.radialVelocity, dynamics.angularVelocity, dynamics.verticalVelocity].every(value => isFiniteNumber(value)) ||
      !isFiniteInRange(dynamics.lineLengthMeters, FISHING_TUNING.minimumLineLength, FISHING_TUNING.maximumDistance + 5) ||
      !depthBounds ||
      !isFiniteInRange(dynamics.depthMeters, depthBounds.minimum, depthBounds.maximum) ||
      !isFiniteInRange(dynamics.rodDirection, -1, 1) ||
      !isFiniteInRange(dynamics.effort, 0, 2) ||
      !isFiniteInRange(dynamics.retrievalMetersPerSecond, 0, 20) ||
      !isFiniteInRange(dynamics.payoutMetersPerSecond, 0, 20) ||
      !isFiniteInRange(dynamics.behaviorDurationSeconds, 0.1, 120) ||
      !isSafeInteger(dynamics.surfaceCrossings, 0) ||
      !isSafeInteger(dynamics.rngState, 0) ||
      !isFiniteInRange(dynamics.stepRemainderSeconds, 0, FISHING_TUNING.stepSeconds) ||
      (schemaVersion >= 28 && (
        !isFiniteInRange(dynamics.rodLoad, 0, FISHING_TUNING.pumpMaximumLoad) ||
        !isFiniteInRange(dynamics.fishSpeed, 0, 100) ||
        !isFiniteInRange(dynamics.shakePhase, 0, Math.PI * 2) ||
        !isFiniteInRange(dynamics.shakeAmplitude, 0, 1) ||
        !isFiniteInRange(
          dynamics.landReadySeconds,
          0,
          FISHING_TUNING.landReadySeconds + FISHING_TUNING.stepSeconds
        )
      )) ||
      !isOneOf(state.sportFishing.behavior, ["rest", "run-left", "run-right", "dive", "surface", "burst", "shake"]) ||
      !isFiniteNumber(state.sportFishing.behaviorUntilSeconds, 0) ||
      !isFiniteNumber(state.sportFishing.elapsedSeconds, 0) ||
      !isFiniteInRange(state.sportFishing.fishDirection, -1, 1) ||
      !isFiniteInRange(state.sportFishing.rodDirectionAngle, -1, 1) ||
      typeof state.sportFishing.isReeling !== "boolean" ||
      typeof state.sportFishing.isSlacking !== "boolean" ||
      typeof state.sportFishing.isBracing !== "boolean" ||
      (state.sportFishing.dragNotch !== undefined &&
        state.sportFishing.dragNotch !== 0 &&
        state.sportFishing.dragNotch !== 1 &&
        state.sportFishing.dragNotch !== 2)
    )) return false;
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
      !isFiniteNumber(state.sportFishing.snapTimerSeconds, 0) ||
      (schemaVersion >= 28 && (
        !isRecord(state.sportFishing.tackleSnapshot) ||
        (state.sportFishing.tackleSnapshot.lureItemId !== null && state.sportFishing.tackleSnapshot.lureItemId !== "item.basic_lure") ||
        !isRecord(state.sportFishing.seaConditionSnapshot) ||
        !isOneOf(state.sportFishing.seaConditionSnapshot.weatherType, WEATHER_TYPES) ||
        !isFiniteInRange(state.sportFishing.seaConditionSnapshot.seaRoughness, 0, 1) ||
        (schemaVersion >= 37 && (
          !isRecord(state.sportFishing.equipmentEffects) ||
          !isFiniteInRange(state.sportFishing.equipmentEffects.lineIntegrityDamageMultiplier, 0.1, 2) ||
          !isFiniteInRange(state.sportFishing.equipmentEffects.braceResistanceMultiplier, 0.1, 2)
        ))
      )) ||
      (state.sportFishing.schoolId !== undefined &&
        state.sportFishing.schoolId !== null &&
        (typeof state.sportFishing.schoolId !== "string" || !state.world.activeSchools[state.sportFishing.schoolId]))
    ) return false;
  }

  if (schemaVersion >= 18) {
    const mounts = state.mounts as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(mounts, STARTER_DONKEY_ID)) return false;
    for (const [mountId, mount] of Object.entries(mounts)) {
      if (
        !isRecord(mount) ||
        mountId !== STARTER_DONKEY_ID ||
        mount.id !== mountId ||
        mount.mountTypeId !== STARTER_DONKEY_TYPE_ID ||
        !isFiniteInRange(mount.gallopStamina, 0, MOUNT_TUNING.maximumGallopStamina) ||
        !isFiniteInRange(mount.gallopRecoveryDelaySeconds, 0, MOUNT_TUNING.gallopRecoveryDelaySeconds) ||
        typeof mount.gallopExhausted !== "boolean" ||
        !isValidMountPose(mount as unknown as GameState["mounts"][string])
      ) return false;
    }
    const activeMountId = state.player.activeMountId;
    if (activeMountId !== null) {
      const activeMount = mounts[activeMountId];
      if (
        !isRecord(activeMount) ||
        (state.player.activeBoatId !== null && state.player.activeBoatId !== undefined) ||
        state.basicFishing !== null ||
        state.sportFishing !== null ||
        (state.player.carriedFishCargoId !== null && state.player.carriedFishCargoId !== undefined) ||
        state.player.traversal.isGrounded !== true ||
        !isValidPlayerMountGround(state.player as GameState["player"]) ||
        !isValidMountPose(activeMount as unknown as GameState["mounts"][string]) ||
        !isPlayerAtMountPose(
          state.player as GameState["player"],
          activeMount as unknown as GameState["mounts"][string],
          0.24
        )
      ) return false;
    }
  }

  for (const [farmId, farm] of Object.entries(state.farms)) {
    if (
      !isRecord(farm) || farm.id !== farmId || !Array.isArray(farm.placedCropIds) ||
      !isFiniteNumber(farm.widthMeters, 0) || !isFiniteNumber(farm.depthMeters, 0) ||
      !isRecord(farm.soil) || !isFiniteNumber(farm.soil.fertility, 0) || !isFiniteNumber(farm.soil.moistureRetention, 0)
    ) return false;
    if (new Set(farm.placedCropIds).size !== farm.placedCropIds.length) return false;
  }

  for (const [cropId, crop] of Object.entries(state.crops)) {
    if (!isRecord(crop) || crop.id !== cropId || typeof crop.cropId !== "string" || typeof crop.farmId !== "string") return false;
    if (!isOneOf(crop.stage, CROP_STAGES)) return false;
    if (![crop.x, crop.z, crop.rotationRadians, crop.effectiveGrowthMinutes, crop.moisture, crop.health, crop.averageMoistureAccum].every((value) => isFiniteNumber(value)) || !isSafeInteger(crop.plantedAtMinute, 0) || !isSafeInteger(crop.lastUpdatedMinute, 0) || !isSafeInteger(crop.moistureSampleCount, 1)) return false;
    if (!ContentRegistry.crops.has(crop.cropId) || !state.farms[crop.farmId]?.placedCropIds.includes(cropId)) return false;
  }

  for (const [structureId, structure] of Object.entries(state.world.structures)) {
    if (
      !isRecord(structure) ||
      structure.id !== structureId ||
      !["hand-mill", "workbench", "fish-table", "compost-bin"].includes(structure.type as string) ||
      ![structure.x, structure.y, structure.z].every((value) => isFiniteNumber(value)) ||
      (structure.rotationY !== undefined && !isFiniteNumber(structure.rotationY))
    ) return false;
  }

  for (const [schoolId, school] of Object.entries(state.world.activeSchools)) {
    if (
      !isRecord(school) ||
      school.id !== schoolId ||
      !isOneOf(school.habitatId, FISHING_HABITATS) ||
      (schemaVersion >= 26 && !isOneOf(school.ecologyId, FISHING_ECOLOGIES)) ||
      ![school.x, school.z].every((value) => isFiniteNumber(value)) ||
      !isFiniteNumber(school.radius, 0) ||
      !isSafeInteger(school.spawnedAtMinute, 0) ||
      !isSafeInteger(school.expiresAtMinute, school.spawnedAtMinute) ||
      !isSafeInteger(school.remainingCatchPotential, 0) ||
      !Array.isArray(school.speciesWeights) ||
      school.speciesWeights.length === 0 ||
      (school.feedingFrenzyUntilMinute !== undefined && !isSafeInteger(school.feedingFrenzyUntilMinute, school.spawnedAtMinute)) ||
      (school.deepChumUntilMinute !== undefined && !isSafeInteger(school.deepChumUntilMinute, school.spawnedAtMinute)) ||
      school.speciesWeights.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.speciesId !== "string" ||
          !ContentRegistry.fishSpecies.has(entry.speciesId) ||
          !isFiniteNumber(entry.weight, 0)
      )
    ) return false;
  }

  if (schemaVersion >= 28) {
    for (const [key, pressure] of Object.entries(state.world.fishingPressureByHabitat)) {
      if (
        !isRecord(pressure) ||
        key !== `${String(pressure.ecologyId)}:${String(pressure.habitatId)}` ||
        !isOneOf(pressure.ecologyId, FISHING_ECOLOGIES) ||
        !isOneOf(pressure.habitatId, FISHING_HABITATS) ||
        !isSafeInteger(pressure.lastEndedMinute, 0) ||
        !isSafeInteger(pressure.cooldownUntilMinute, pressure.lastEndedMinute) ||
        !isSafeInteger(pressure.recentCatchCount, 0) ||
        pressure.recentCatchCount > 12
      ) return false;
    }
  }

  const occupiedProcessingStations = new Set<string>();
  const pendingEquipmentIds = new Set<string>();
  for (const [jobId, job] of Object.entries(state.processingJobs)) {
    if (!isRecord(job) || job.id !== jobId || typeof job.recipeId !== "string" || typeof job.stationId !== "string" || !isSafeInteger(job.startedAtMinute, 0) || !isSafeInteger(job.completesAtMinute, 0)) return false;
    const recipe = ContentRegistry.recipes.get(job.recipeId);
    const station = state.world.structures[job.stationId];
    if (!recipe || !station) return false;
    if (schemaVersion >= 37) {
      if (
        !["active", "complete"].includes(job.status as string) ||
        typeof job.recipeName !== "string" ||
        job.recipeName.trim().length === 0 ||
        job.recipeName.length > PROCESSING_JOB_SNAPSHOT_LIMITS.maxLabelCharacters ||
        typeof job.outputLabel !== "string" ||
        job.outputLabel.trim().length === 0 ||
        job.outputLabel.length > PROCESSING_JOB_SNAPSHOT_LIMITS.maxLabelCharacters ||
        !isRecord(job.result) ||
        !isOneOf(job.workTier, ["standard", "masterwork"]) ||
        !isOneOf(job.presentationKind, ["existing", "tailoring", "toolmaking"]) ||
        !isSafeInteger(job.baseWork, 1) ||
        !isSafeInteger(job.chargedWork, 1) ||
        job.chargedWork > job.baseWork ||
        !isSafeInteger(job.xpReward, 1) ||
        !isSafeInteger(job.effectiveDurationMinutes, 1) ||
        job.effectiveDurationMinutes > PROCESSING_JOB_SNAPSHOT_LIMITS.maxDurationMinutes ||
        job.startedAtMinute > state.clock.currentMinute ||
        job.completesAtMinute <= job.startedAtMinute ||
        job.completesAtMinute - job.startedAtMinute !== job.effectiveDurationMinutes ||
        station.type !== recipe.stationType ||
        (job.status === "active" && state.clock.currentMinute >= job.completesAtMinute) ||
        (job.status === "complete" && state.clock.currentMinute < job.completesAtMinute)
      ) return false;
      const workTier = job.workTier as "standard" | "masterwork";
      if (
        job.baseWork !== PROCESSING_WORK_BY_TIER[workTier] ||
        job.xpReward !== PROCESSING_XP_BY_TIER[workTier]
      ) return false;
      if (occupiedProcessingStations.has(job.stationId)) return false;
      occupiedProcessingStations.add(job.stationId);
      if (job.result.kind === "items") {
        if (
          !Array.isArray(job.result.stacks) ||
          job.result.stacks.length === 0 ||
          job.result.stacks.length > PLAYER_SATCHEL_SLOT_COUNT
        ) return false;
        const outputItemIds = new Set<string>();
        for (const stack of job.result.stacks) {
          if (
            !isRecord(stack) ||
            typeof stack.itemId !== "string" ||
            !ContentRegistry.items.has(stack.itemId) ||
            outputItemIds.has(stack.itemId) ||
            !isSafeInteger(stack.quantity, 1) ||
            stack.quantity > ContentRegistry.items.get(stack.itemId)!.stackLimit
          ) return false;
          outputItemIds.add(stack.itemId);
        }
      } else if (job.result.kind === "equipment") {
        const equipmentId = job.result.equipmentId;
        if (
          typeof equipmentId !== "string" ||
          !ContentRegistry.equipment.has(equipmentId) ||
          pendingEquipmentIds.has(equipmentId) ||
          state.player.equipment.ownedIds.includes(equipmentId)
        ) return false;
        pendingEquipmentIds.add(equipmentId);
      } else {
        return false;
      }
    } else if (!["active", "complete", "collected"].includes(job.status as string)) {
      return false;
    }
  }
  if (
    schemaVersion >= 37 &&
    state.player.equipment.ownedIds.length + pendingEquipmentIds.size > state.player.equipment.wardrobeCapacity
  ) return false;

  for (const [boatId, boat] of Object.entries(state.boats)) {
    if (!isRecord(boat) || boat.id !== boatId || typeof boat.boatTypeId !== "string" || typeof boat.supplyInventoryId !== "string") return false;
    if (![boat.x, boat.y, boat.z, boat.headingRadians, boat.speed, boat.fuel, boat.durability].every((value) => isFiniteNumber(value))) return false;
    if (!ContentRegistry.boats.has(boat.boatTypeId) || !state.inventories[boat.supplyInventoryId]) return false;
    if (!Array.isArray(boat.fishCargoSlotIds) || typeof boat.isDocked !== "boolean") return false;
    const boatDefinition = ContentRegistry.boats.get(boat.boatTypeId);
    if (!boatDefinition || boat.fishCargoSlotIds.length !== boatDefinition.fishCargoSlots.length) return false;
    if (schemaVersion >= 3) {
      if (boat.dockedMarketId !== null && (typeof boat.dockedMarketId !== "string" || !ContentRegistry.markets.has(boat.dockedMarketId))) return false;
      if (boat.isDocked !== Boolean(boat.dockedMarketId)) return false;
    }
    if (state.player.activeBoatId === boatId && boat.isDocked) return false;
  }

  for (const [cargoId, cargo] of Object.entries(state.fishCargo)) {
    if (!isRecord(cargo) || cargo.id !== cargoId || typeof cargo.speciesId !== "string" || !isRecord(cargo.location) || !isFiniteNumber(cargo.weightKg, 0) || !isFiniteInRange(cargo.freshness, 0, 100) || !isSafeInteger(cargo.caughtAtMinute, 0) || !isOneOf(cargo.quality, FISH_QUALITIES) || !isOneOf(cargo.cargoClass, CARGO_CLASSES)) return false;
    const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
    if (!species || cargo.cargoClass !== species.cargoClass || cargo.weightKg < species.weightKg.min || cargo.weightKg > species.weightKg.max) return false;
    if (cargo.location.type === "player") {
      if (cargo.location.containerId !== "player" || state.player.carriedFishCargoId !== cargoId) return false;
    } else if (cargo.location.type === "boat-hold" || cargo.location.type === "boat-hook") {
      const boat = state.boats[cargo.location.containerId];
      const slotIndex = cargo.location.slotIndex;
      const definition = boat ? ContentRegistry.boats.get(boat.boatTypeId) : undefined;
      const slot = definition && typeof slotIndex === "number" ? definition.fishCargoSlots[slotIndex] : undefined;
      if (!boat || !definition || !slot || typeof slotIndex !== "number" || !Number.isSafeInteger(slotIndex) || boat.fishCargoSlotIds[slotIndex] !== cargoId || (cargo.location.type === "boat-hook") !== (slot.type === "external-hook") || !cargoClassFits(cargo.cargoClass, slot.maxCargoClass)) return false;
    } else {
      return false;
    }
  }

  const referencedBoatCargoIds = new Set<string>();
  for (const boat of Object.values(state.boats)) {
    for (let slotIndex = 0; slotIndex < boat.fishCargoSlotIds.length; slotIndex++) {
      const cargoId = boat.fishCargoSlotIds[slotIndex];
      if (cargoId === null) continue;
      if (typeof cargoId !== "string" || referencedBoatCargoIds.has(cargoId)) return false;
      referencedBoatCargoIds.add(cargoId);
      const cargo = state.fishCargo[cargoId];
      if (!cargo || cargo.location.containerId !== boat.id || cargo.location.slotIndex !== slotIndex) return false;
    }
  }

  for (const [marketId, market] of Object.entries(state.markets)) {
    const definition = ContentRegistry.markets.get(marketId);
    const isCurrentSchema = schemaVersion === CURRENT_SCHEMA_VERSION;
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
        (isCurrentSchema && !definition.commodities.some((entry) => entry.itemId === itemId)) ||
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
    if (isCurrentSchema && !definition.commodities.every((entry) => Boolean(market.commodities[entry.itemId]))) return false;
  }

  if (schemaVersion >= 26) {
    const contractIds = new Set<string>();
    for (const contract of state.contracts) {
      if (!isRecord(contract)) return false;
      const templateId = contract.templateId;
      const template = typeof templateId === "string"
        ? ContentRegistry.contractTemplates.get(templateId)
        : undefined;
      const targetId = contract.targetItemIdOrSpecies;
      const rewardSkillXp = contract.rewardSkillXp;
      const itemContract = template ? isProduceContractType(template.type) : false;
      if (
        typeof contract.id !== "string" ||
        contract.id.length === 0 ||
        contractIds.has(contract.id) ||
        !template ||
        typeof contract.requesterId !== "string" ||
        contract.requesterId.length === 0 ||
        typeof contract.deliveryMarketId !== "string" ||
        !ContentRegistry.markets.has(contract.deliveryMarketId) ||
        contract.deliveryMarketId !== template.deliveryMarketId ||
        contract.type !== template.type ||
        typeof targetId !== "string" ||
        !template.itemOrSpeciesPool.includes(targetId) ||
        (itemContract ? !ContentRegistry.items.has(targetId) : !ContentRegistry.fishSpecies.has(targetId)) ||
        !isSafeInteger(contract.quantityRequired, 1) ||
        !isSafeInteger(contract.quantityFulfilled, 0) ||
        contract.quantityFulfilled > contract.quantityRequired ||
        !isSafeInteger(contract.rewardMoney, 0) ||
        !isRecord(rewardSkillXp) ||
        !isOneOf(rewardSkillXp.skill, SKILL_IDS) ||
        !isSafeInteger(rewardSkillXp.xp, 0) ||
        !isSafeInteger(contract.expiresAtMinute, 0) ||
        !isOneOf(contract.status, ["active", "completed", "expired", "failed"])
      ) return false;
      if (
        (contract.minQuality !== undefined && !isOneOf(contract.minQuality, FISH_QUALITIES)) ||
        (contract.minFreshness !== undefined && !isFiniteInRange(contract.minFreshness, 0, 100)) ||
        (contract.minWeightKg !== undefined && !isFiniteNumber(contract.minWeightKg, 0))
      ) return false;
      contractIds.add(contract.id);
    }
  }

  if (schemaVersion >= 22) {
    if (!Array.isArray(state.journal.unlockedKnowledge) || !state.journal.unlockedKnowledge.every((id) => typeof id === "string")) {
      return false;
    }
  }

  const fishRecords = state.journal.fishRecords;
  if (!isRecord(fishRecords) || Array.isArray(fishRecords)) return false;
  for (const [speciesId, record] of Object.entries(fishRecords)) {
    if (
      !ContentRegistry.fishSpecies.has(speciesId) ||
      !isRecord(record) ||
      Array.isArray(record) ||
      typeof record.discovered !== "boolean" ||
      !isSafeInteger(record.catchCount, 0)
    ) return false;
    if (record.largestWeightKg !== undefined && !isFiniteNumber(record.largestWeightKg, 0)) return false;
    if (record.bestQuality !== undefined) {
      const allowed = schemaVersion >= 22
        ? FISH_QUALITIES
        : [...FISH_QUALITIES, "normal", "silver", "gold", "iridium", "prize"];
      if (!isOneOf(record.bestQuality, allowed)) return false;
    }
    if (record.firstCaughtMinute !== undefined && !isSafeInteger(record.firstCaughtMinute, 0)) return false;
  }

  if (!isRecord(state.journal.cropRecords)) return false;
  for (const [cropId, record] of Object.entries(state.journal.cropRecords)) {
    if (!ContentRegistry.crops.has(cropId) || !isRecord(record) || !isSafeInteger(record.harvestedCount, 0)) return false;
    if (record.bestQuality !== undefined) {
      const allowed = schemaVersion >= 4
        ? ["common", "fine", "exceptional", "prize"]
        : ["common", "fine", "exceptional", "trophy"];
      if (!isOneOf(record.bestQuality, allowed)) return false;
    }
  }

  if (schemaVersion >= 8) {
    const quests = state.quests as Record<string, unknown> | undefined;
    if (
      !isRecord(quests) ||
      typeof quests.activeActId !== "string" ||
      !Array.isArray(quests.completedQuestIds) ||
      !isRecord(quests.hintsShown)
    ) return false;
    if (schemaVersion >= 9 && (
      !Array.isArray(quests.unlockedFeatureIds) ||
      !quests.unlockedFeatureIds.every((featureId) => typeof featureId === "string")
    )) return false;
    if (schemaVersion < 29) {
      // Single-cursor shape, before quests were split across tracks.
      if (
        (quests.activeQuestId !== null && typeof quests.activeQuestId !== "string") ||
        !isSafeInteger(quests.activeStepIndex, 0) ||
        !isRecord(quests.stepProgress) ||
        !Array.isArray(quests.unlockedDialogueIds)
      ) return false;
    } else {
      if (typeof quests.focusedTrackId !== "string" || !isRecord(quests.tracks)) return false;
      for (const progress of Object.values(quests.tracks)) {
        if (
          !isRecord(progress) ||
          (progress.activeQuestId !== null && typeof progress.activeQuestId !== "string") ||
          !isSafeInteger(progress.activeStepIndex, 0) ||
          !isRecord(progress.stepProgress)
        ) return false;
      }
      if (!isRecord(quests.tracks[quests.focusedTrackId as string])) return false;
    }
    if (schemaVersion >= 35) {
      const credits = quests.earlyActionCredits;
      if (!Array.isArray(credits) || credits.length > MAX_EARLY_ACTION_CREDIT_RECORDS) return false;
      for (const credit of credits) {
        if (!isRecord(credit)) return false;
        if (!isOneOf(credit.type, QUEST_OBJECTIVE_TYPES)) return false;
        if (credit.targetId !== undefined && typeof credit.targetId !== "string") return false;
        if (!isSafeInteger(credit.quantity, 1) || credit.quantity > MAX_EARLY_ACTION_CREDIT_QUANTITY) return false;
        if (credit.location !== undefined && (
          !isRecord(credit.location) ||
          !isOneOf(credit.location.kind, QUEST_LOCATION_KINDS) ||
          typeof credit.location.id !== "string"
        )) return false;
      }
    }
  }

  return true;
}

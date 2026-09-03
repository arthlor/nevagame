// src/persistence/SaveMigrations.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope } from "./SaveSchema";
import { GameState, FishingEncounterState, ClockState } from "../simulation/core/types";
import { createFishingDynamics, findFishingWater, fishingEndpoint, FISHING_TUNING } from "../simulation/fishing/FishingTuning";
import { ContentRegistry } from "../content/ContentRegistry";
import { STARTER_STRUCTURE_IDS, starterStructureAnchor } from "../world/FarmLayout";
import { HARBOR_DOCK, HARBOR_FISH_TABLE } from "../world/WorldAnchors";
import { WorldLayout } from "../world/WorldLayout";
import { cargoClassFits } from "../simulation/domains/domainRules";
import { createFullPlayerTraversalState } from "../simulation/navigation/PlayerTraversal";
import { DEFAULT_MINUTES_PER_REAL_SECOND, seasonAtMinute, GameClock } from "../simulation/core/GameClock";
import {
  createStarterDonkeyState,
  MOUNT_TUNING,
  playerPoseFromMount,
  STARTER_DONKEY_ID
} from "../simulation/mounts/Mounts";
import { ownedRodsThrough } from "../content/rods";
import { WORK_CAPACITY_MAXIMUM } from "../simulation/domains/ProgressionDomain";
import { voidActiveContracts } from "../simulation/domains/ContractDomain";
import { WORLD_FARM_DEFINITIONS, WORLD_STATION_DEFINITIONS } from "../world/WorldGameplayLocations";
import { MAIN_QUEST_TRACK_ID } from "../simulation/core/QuestTypes";

export type MigrationFunction = (data: unknown) => unknown;

const V1_STARTER_FARM = { x: 0, z: 0 } as const;
const V1_HOMESTEAD = { x: -8, z: -10 } as const;
const CURRENT_STARTER_FARM = { x: -65, z: -55 } as const;
const CURRENT_HOMESTEAD = { x: 60, z: -60 } as const;
/** Layout revision 5 mill pad, west of the packed plaza. Frozen for the v13 hop. */
const LAYOUT_5_MILL = { x: 46, z: -58 } as const;
/** Layout revision 6 mill pad, southwest of the packed plaza. Frozen for the v14 hop. */
const LAYOUT_6_MILL = { x: 36, z: -76 } as const;

function finite(value: unknown, fallback: number = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function countInventoryTroutUnits(inventories: Record<string, Record<string, unknown>>): number {
  let units = 0;
  for (const inventory of Object.values(inventories)) {
    if (!inventory || !Array.isArray(inventory.slots)) continue;
    for (const slot of inventory.slots) {
      if (!slot || typeof slot !== "object") continue;
      const record = slot as Record<string, unknown>;
      if (record.itemId !== "fish.trout") continue;
      const quantity = typeof record.quantity === "number" && Number.isSafeInteger(record.quantity)
        ? Math.max(0, record.quantity)
        : 0;
      units += quantity;
    }
  }
  return units;
}

function countEmptyFishCargoCapacity(
  player: Record<string, unknown>,
  boats: Record<string, Record<string, unknown>>
): number {
  let empty = player.carriedFishCargoId ? 0 : 1;
  for (const boatId of migrationBoatIds(player, boats)) {
    const boat = boats[boatId];
    const slots = Array.isArray(boat.fishCargoSlotIds) ? boat.fishCargoSlotIds : [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      if (isTroutMigrationSlot(boat, slotIndex) && (slots[slotIndex] == null || slots[slotIndex] === "")) {
        empty += 1;
      }
    }
  }
  return empty;
}

function isTroutMigrationSlot(boat: Record<string, unknown>, slotIndex: number): boolean {
  const boatTypeId = typeof boat.boatTypeId === "string" ? boat.boatTypeId : null;
  const definition = boatTypeId ? ContentRegistry.boats.get(boatTypeId) : undefined;
  if (!definition) return true;
  const slot = definition.fishCargoSlots.find((candidate) => candidate.slotIndex === slotIndex)
    ?? definition.fishCargoSlots[slotIndex];
  return Boolean(slot && slot.type === "hold" && cargoClassFits("small", slot.maxCargoClass));
}

/**
 * Legacy inventory fish may only be moved into the player's current boat or a
 * boat that is visibly docked. Stable ordering keeps migration deterministic
 * while preventing a remote boat from becoming an implicit storage fallback.
 */
function migrationBoatIds(
  player: Record<string, unknown>,
  boats: Record<string, Record<string, unknown>>
): string[] {
  const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
  const ordered = Object.keys(boats)
    .filter((boatId) => boatId !== activeBoatId && boats[boatId]?.isDocked === true)
    .sort();
  return activeBoatId && boats[activeBoatId] ? [activeBoatId, ...ordered] : ordered;
}

function distance(x: number, z: number, point: { x: number; z: number }): number {
  return Math.hypot(x - point.x, z - point.z);
}

function mapLegacyLandPoint(x: number, z: number): { x: number; z: number } {
  let mapped = { x, z };
  if (distance(x, z, V1_STARTER_FARM) <= 14.5) {
    mapped = { x: x + CURRENT_STARTER_FARM.x, z: z + CURRENT_STARTER_FARM.z };
  } else if (distance(x, z, { x: -16, z: 5 }) <= 12) {
    mapped = { x, z: z + 1 };
  } else if (z >= 28 && x < 12) {
    mapped = { x: x - 14, z };
  } else if (z >= 28) {
    mapped = { x, z: z - 1.5 };
  }
  return WorldLayout.nearestValidGround(mapped);
}

function mapLegacyWaterPoint(x: number, z: number): { x: number; z: number } {
  if (z <= 42) {
    const oldCenter = Math.sin(z * 0.04) * 6 - 16;
    const lateralOffset = x - oldCenter;
    return WorldLayout.nearestValidSailable({ x: WorldLayout.riverCenterX(z) + lateralOffset, z });
  }
  return WorldLayout.nearestValidSailable({ x, z: WorldLayout.coastlineZ(x) + (z - 42) });
}

function mapLegacySchool(school: Record<string, unknown>): Record<string, unknown> {
  const x = finite(school.x);
  const z = finite(school.z);
  const habitatId = typeof school.habitatId === "string" ? school.habitatId : "coast";
  const mapped = habitatId === "river"
    ? mapLegacyWaterPoint(x, Math.min(z, WorldLayout.coastlineZ(x) - 0.5))
    : mapLegacyWaterPoint(x, z);
  return { ...school, x: mapped.x, z: mapped.z };
}

function isValidSavedLandPose(x: number, z: number): boolean {
  return WorldLayout.isWalkable(x, z)
    && (!WorldLayout.isWater(x, z) || WorldLayout.isBridgeDeck(x, z) || WorldLayout.isPierDeck(x, z));
}

function savedLandSupportHeight(x: number, z: number): number {
  return WorldLayout.isBridgeDeck(x, z) || WorldLayout.isPierDeck(x, z)
    ? WorldLayout.traversalSurfaceHeight(x, z)
    : WorldLayout.terrainHeight(x, z);
}

function nearestValidMountGround(point: { x: number; z: number }): { x: number; z: number } {
  const valid = (x: number, z: number): boolean =>
    isValidSavedLandPose(x, z)
    && !WorldLayout.isInterior(x, z)
    && !WorldLayout.isPierDeck(x, z)
    && WorldLayout.traversalSurfaceSample(x, z).normal.y >= MOUNT_TUNING.maximumSlopeNormalY;
  if (valid(point.x, point.z)) return point;
  for (let radius = 0.5; radius <= 72; radius += 0.5) {
    const steps = Math.max(16, Math.ceil(radius * 5));
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      const candidate = {
        x: point.x + Math.cos(angle) * radius,
        z: point.z + Math.sin(angle) * radius
      };
      if (valid(candidate.x, candidate.z)) return candidate;
    }
  }
  const fallback = WorldLayout.nearestValidGround(CURRENT_STARTER_FARM);
  return valid(fallback.x, fallback.z) ? fallback : { ...CURRENT_STARTER_FARM };
}

export const MIGRATIONS: Record<number, MigrationFunction> = {
  2: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    return { ...previous, schemaVersion: 2, basicFishing: null };
  },
  3: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const migratedBoats = Object.fromEntries(
      Object.entries(boats).map(([boatId, boat]) => [
        boatId,
        {
          ...boat,
          dockedMarketId: boat.isDocked === true ? "market.harbor" : null
        }
      ])
    );
    return { ...previous, schemaVersion: 3, sportFishing: null, boats: migratedBoats };
  },
  4: (state: unknown) => {
    const starterStructureIds = new Set<string>(STARTER_STRUCTURE_IDS);
    const previous = state as Record<string, unknown>;
    const player = (previous.player ?? {}) as Record<string, unknown>;
    const legacyWorkCapacity = (player.workCapacity ?? {}) as Record<string, unknown>;
    const regeneratedAtMinute =
      typeof legacyWorkCapacity.regeneratedAtMinute === "number"
        ? legacyWorkCapacity.regeneratedAtMinute
        : legacyWorkCapacity.lastRegenMinute;
    const { lastRegenMinute: _legacyRegen, ...workCapacity } = legacyWorkCapacity;

    const journal = (previous.journal ?? {}) as Record<string, unknown>;
    const cropRecords = (journal.cropRecords ?? {}) as Record<string, Record<string, unknown>>;
    const migratedCropRecords = Object.fromEntries(
      Object.entries(cropRecords).map(([cropId, record]) => [
        cropId,
        {
          ...record,
          bestQuality: record.bestQuality === "trophy" ? "prize" : record.bestQuality
        }
      ])
    );

    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const migratedStructures = { ...structures };
    for (const structureId of STARTER_STRUCTURE_IDS) {
      const structure = structures[structureId];
      const anchor = starterStructureAnchor(structureId);
      if (!structure || !anchor) continue;
      migratedStructures[structureId] = { ...structure, x: anchor.x, z: anchor.z };
    }

    const farms = (previous.farms ?? {}) as Record<string, Record<string, unknown>>;
    const migratedFarms = Object.fromEntries(
      Object.entries(farms).map(([farmId, farm]) => {
        const ids = Array.isArray(farm.placedStructureIds)
          ? farm.placedStructureIds.filter((id): id is string => typeof id === "string")
          : [];
        const placedStructureIds = farmId === "farm.starter_garden"
          ? [...new Set([...ids, ...STARTER_STRUCTURE_IDS])]
          : ids.filter((id) => !starterStructureIds.has(id));
        return [farmId, { ...farm, placedStructureIds }];
      })
    );

    return {
      ...previous,
      schemaVersion: 4,
      player: {
        ...player,
        workCapacity: { ...workCapacity, regeneratedAtMinute }
      },
      journal: { ...journal, cropRecords: migratedCropRecords },
      world: { ...world, structures: migratedStructures },
      farms: migratedFarms
    };
  },
  5: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const migratedBoats = Object.fromEntries(
      Object.entries(boats).map(([boatId, boat]) => {
        if (boat.isDocked !== true || boat.dockedMarketId !== HARBOR_DOCK.marketId) {
          return [boatId, boat];
        }
        return [boatId, {
          ...boat,
          x: HARBOR_DOCK.boatPosition.x,
          y: HARBOR_DOCK.boatPosition.y,
          z: HARBOR_DOCK.boatPosition.z,
          headingRadians: 0,
          speed: 0
        }];
      })
    );
    return { ...previous, schemaVersion: 5, boats: migratedBoats };
  },
  6: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = (previous.player ?? {}) as Record<string, unknown>;
    return {
      ...previous,
      schemaVersion: 6,
      player: {
        ...player,
        traversal: createFullPlayerTraversalState()
      }
    };
  },
  7: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const farms = (previous.farms ?? {}) as Record<string, Record<string, unknown>>;
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const starterIds = new Set<string>(STARTER_STRUCTURE_IDS);
    const structureFarm = new Map<string, string>();
    for (const [farmId, farm] of Object.entries(farms)) {
      const ids = Array.isArray(farm.placedStructureIds) ? farm.placedStructureIds : [];
      for (const id of ids) if (typeof id === "string") structureFarm.set(id, farmId);
    }

    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        const starter = starterIds.has(id) ? starterStructureAnchor(id) : undefined;
        if (starter) {
          return [id, { ...structure, x: starter.x, y: WorldLayout.terrainHeight(starter.x, starter.z), z: starter.z }];
        }
        const x = finite(structure.x);
        const z = finite(structure.z);
        const farmId = structureFarm.get(id);
        const mapped = farmId === "farm.starter_garden"
          ? { x: x + CURRENT_STARTER_FARM.x - V1_STARTER_FARM.x, z: z + CURRENT_STARTER_FARM.z - V1_STARTER_FARM.z }
          : farmId === "farm.player_homestead"
            ? { x: x + CURRENT_HOMESTEAD.x - V1_HOMESTEAD.x, z: z + CURRENT_HOMESTEAD.z - V1_HOMESTEAD.z }
            : mapLegacyLandPoint(x, z);
        const valid = WorldLayout.nearestValidGround(mapped);
        return [id, { ...structure, x: valid.x, y: WorldLayout.terrainHeight(valid.x, valid.z), z: valid.z }];
      })
    );

    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const migratedBoats = Object.fromEntries(
      Object.entries(boats).map(([id, boat]) => {
        const docked = boat.isDocked === true && boat.dockedMarketId === HARBOR_DOCK.marketId;
        const mapped = docked
          ? HARBOR_DOCK.boatPosition
          : mapLegacyWaterPoint(finite(boat.x), finite(boat.z, 42.5));
        return [id, {
          ...boat,
          x: mapped.x,
          y: 0,
          z: mapped.z,
          ...(docked ? { headingRadians: 0, speed: 0 } : {})
        }];
      })
    );

    const activeSchools = (world.activeSchools ?? {}) as Record<string, Record<string, unknown>>;
    const migratedSchools = Object.fromEntries(
      Object.entries(activeSchools).map(([id, school]) => [id, mapLegacySchool(school)])
    );

    const player = (previous.player ?? {}) as Record<string, unknown>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const activeBoat = activeBoatId ? migratedBoats[activeBoatId] : undefined;
    const playerPoint = activeBoat
      ? { x: finite(activeBoat.x), z: finite(activeBoat.z) }
      : mapLegacyLandPoint(finite(player.x), finite(player.z));

    return {
      ...previous,
      schemaVersion: 7,
      player: {
        ...player,
        x: playerPoint.x,
        y: activeBoat ? 0.5 : WorldLayout.terrainHeight(playerPoint.x, playerPoint.z) + 0.5,
        z: playerPoint.z,
        currentRegionId: WorldLayout.regionAt(playerPoint.x, playerPoint.z)
      },
      world: {
        ...world,
        // Historical schema 7 introduced layout revision 3. Keep versioned
        // migrations immutable; schema 12 performs the explicit v3 -> v4 step.
        layoutRevision: 3,
        structures: migratedStructures,
        activeSchools: migratedSchools
      },
      boats: migratedBoats
    };
  },
  8: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const quests = (previous.quests ?? {}) as Record<string, unknown>;
    return {
      ...previous,
      schemaVersion: 8,
      quests: {
        activeActId: typeof quests.activeActId === "string" ? quests.activeActId : "act1_homestead",
        activeQuestId: quests.activeQuestId !== undefined ? quests.activeQuestId : "quest.act1_welcome",
        activeStepIndex: typeof quests.activeStepIndex === "number" ? quests.activeStepIndex : 0,
        stepProgress: typeof quests.stepProgress === "object" && quests.stepProgress !== null ? quests.stepProgress : {},
        completedQuestIds: Array.isArray(quests.completedQuestIds) ? quests.completedQuestIds : [],
        unlockedDialogueIds: Array.isArray(quests.unlockedDialogueIds) ? quests.unlockedDialogueIds : [],
        hintsShown: typeof quests.hintsShown === "object" && quests.hintsShown !== null ? quests.hintsShown : {}
      }
    };
  },
  9: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const quests = (previous.quests ?? {}) as Record<string, unknown>;
    const completedQuestIds = Array.isArray(quests.completedQuestIds) ? quests.completedQuestIds : [];
    const unlockedFeatureIds = Array.isArray(quests.unlockedFeatureIds)
      ? quests.unlockedFeatureIds.filter((featureId): featureId is string => typeof featureId === "string")
      : [];
    if (completedQuestIds.includes("quest.act4_restore_rowboat") && !unlockedFeatureIds.includes("boat.player_rowboat")) {
      unlockedFeatureIds.push("boat.player_rowboat");
    }
    const world = (previous.world ?? {}) as Record<string, unknown>;
    return {
      ...previous,
      schemaVersion: 9,
      world: {
        ...world,
        storySchoolSpawned: typeof world.storySchoolSpawned === "boolean" ? world.storySchoolSpawned : false
      },
      quests: {
        ...quests,
        unlockedFeatureIds
      }
    };
  },
  10: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = { ...((world.structures ?? {}) as Record<string, Record<string, unknown>>) };
    const fishTableId = HARBOR_FISH_TABLE.structureId;
    const { x: fishTableX, z: fishTableZ } = HARBOR_FISH_TABLE.position;
    structures[fishTableId] = {
      ...(structures[fishTableId] ?? {}),
      id: fishTableId,
      type: HARBOR_FISH_TABLE.type,
      x: fishTableX,
      y: WorldLayout.terrainHeight(fishTableX, fishTableZ),
      z: fishTableZ
    };
    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        const x = finite(structure.x);
        const z = finite(structure.z);
        const y = finite(structure.y);
        if (y > 0) return [id, structure];
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );
    return {
      ...previous,
      schemaVersion: 10,
      world: {
        ...world,
        structures: migratedStructures
      }
    };
  },
  11: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const inventories = { ...((previous.inventories ?? {}) as Record<string, Record<string, unknown>>) };
    const fishCargo = { ...((previous.fishCargo ?? {}) as Record<string, Record<string, unknown>>) };
    const boats = Object.fromEntries(
      Object.entries((previous.boats ?? {}) as Record<string, Record<string, unknown>>).map(([id, boat]) => [
        id,
        { ...boat, fishCargoSlotIds: Array.isArray(boat.fishCargoSlotIds) ? [...boat.fishCargoSlotIds] : boat.fishCargoSlotIds }
      ])
    );
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const clock = (previous.clock ?? {}) as Record<string, unknown>;
    const minute = typeof clock.currentMinute === "number" && Number.isSafeInteger(clock.currentMinute)
      ? clock.currentMinute
      : 0;
    let troutIndex = 0;

    const troutUnits = countInventoryTroutUnits(inventories);
    const cargoCapacity = countEmptyFishCargoCapacity(player, boats);
    if (troutUnits > cargoCapacity) {
      throw new Error(
        `Save migration v11 failed: fish.trout quantity ${troutUnits} exceeds player carry and boat hold capacity ${cargoCapacity}`
      );
    }

    const placeTroutCargo = (): boolean => {
      troutIndex += 1;
      let cargoId = `cargo.migrated_trout_${troutIndex}`;
      while (fishCargo[cargoId]) {
        troutIndex += 1;
        cargoId = `cargo.migrated_trout_${troutIndex}`;
      }
      const base = {
        id: cargoId,
        speciesId: "fish.trout",
        weightKg: 3.2,
        quality: "common",
        caughtAtMinute: minute,
        freshness: 100,
        cargoClass: "small"
      };
      if (!player.carriedFishCargoId) {
        player.carriedFishCargoId = cargoId;
        fishCargo[cargoId] = { ...base, location: { type: "player", containerId: "player" } };
        return true;
      }
      for (const boatId of migrationBoatIds(player, boats)) {
        const boat = boats[boatId];
        const slots = Array.isArray(boat.fishCargoSlotIds) ? boat.fishCargoSlotIds : [];
        const empty = slots.findIndex((slotId, slotIndex) =>
          isTroutMigrationSlot(boat, slotIndex) && (slotId == null || slotId === "")
        );
        if (empty < 0) continue;
        slots[empty] = cargoId;
        boats[boatId] = { ...boat, fishCargoSlotIds: slots };
        fishCargo[cargoId] = {
          ...base,
          location: { type: "boat-hold", containerId: boatId, slotIndex: empty }
        };
        return true;
      }
      return false;
    };

    for (const [inventoryId, inventory] of Object.entries(inventories)) {
      if (!inventory || !Array.isArray(inventory.slots)) continue;
      const slots = inventory.slots.map((slot) => {
        if (!slot || typeof slot !== "object") return slot;
        const record = slot as Record<string, unknown>;
        if (record.itemId !== "fish.trout") return slot;
        const quantity = typeof record.quantity === "number" && Number.isSafeInteger(record.quantity)
          ? Math.max(0, record.quantity)
          : 0;
        for (let i = 0; i < quantity; i++) {
          if (!placeTroutCargo()) {
            // Never clear a slot unless every unit was placed.
            throw new Error(
              "Save migration v11 failed: fish.trout remaining after player carry and boat holds were full"
            );
          }
        }
        return {};
      });
      inventories[inventoryId] = { ...inventory, slots };
    }

    return {
      ...previous,
      schemaVersion: 11,
      inventories,
      fishCargo,
      boats,
      player
    };
  },
  12: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const hasActiveBoat = activeBoatId !== null && boats[activeBoatId] !== undefined;
    const playerX = finite(player.x);
    const playerZ = finite(player.z);
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        const x = finite(structure.x);
        const z = finite(structure.z);
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );

    return {
      ...previous,
      schemaVersion: 12,
      player: {
        ...player,
        ...(!hasActiveBoat ? { y: WorldLayout.terrainHeight(playerX, playerZ) + 0.5 } : {})
      },
      world: {
        ...world,
        layoutRevision: 4,
        structures: migratedStructures
      }
    };
  },
  13: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const hasActiveBoat = activeBoatId !== null && boats[activeBoatId] !== undefined;
    const playerX = finite(player.x);
    const playerZ = finite(player.z);
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const mill = { id: "struct.starter_mill", ...LAYOUT_5_MILL };
    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        if (id === mill.id) {
          return [id, {
            ...structure,
            x: mill.x,
            y: WorldLayout.terrainHeight(mill.x, mill.z),
            z: mill.z
          }];
        }
        const x = finite(structure.x);
        const z = finite(structure.z);
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );

    return {
      ...previous,
      schemaVersion: 13,
      player: {
        ...player,
        ...(!hasActiveBoat ? { y: WorldLayout.terrainHeight(playerX, playerZ) + 0.5 } : {})
      },
      world: {
        ...world,
        layoutRevision: 5,
        structures: migratedStructures
      }
    };
  },
  14: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const hasActiveBoat = activeBoatId !== null && boats[activeBoatId] !== undefined;
    const playerX = finite(player.x);
    const playerZ = finite(player.z);
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const mill = { id: "struct.starter_mill", ...LAYOUT_6_MILL };
    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        if (id === mill?.id) {
          return [id, {
            ...structure,
            x: mill.x,
            y: WorldLayout.terrainHeight(mill.x, mill.z),
            z: mill.z
          }];
        }
        const x = finite(structure.x);
        const z = finite(structure.z);
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );

    return {
      ...previous,
      schemaVersion: 14,
      player: {
        ...player,
        ...(!hasActiveBoat ? { y: WorldLayout.terrainHeight(playerX, playerZ) + 0.5 } : {})
      },
      world: {
        ...world,
        layoutRevision: 6,
        structures: migratedStructures
      }
    };
  },
  15: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const hasActiveBoat = activeBoatId !== null && boats[activeBoatId] !== undefined;
    const playerX = finite(player.x);
    const playerZ = finite(player.z);
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const currentStationAnchors = new Map<string, { x: number; z: number }>();

    for (const structureId of STARTER_STRUCTURE_IDS) {
      const anchor = starterStructureAnchor(structureId);
      if (anchor) currentStationAnchors.set(structureId, anchor);
    }
    currentStationAnchors.set(HARBOR_FISH_TABLE.structureId, HARBOR_FISH_TABLE.position);

    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        const anchor = currentStationAnchors.get(id);
        const x = anchor?.x ?? finite(structure.x);
        const z = anchor?.z ?? finite(structure.z);
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );

    return {
      ...previous,
      schemaVersion: 15,
      player: {
        ...player,
        ...(!hasActiveBoat ? { y: WorldLayout.terrainHeight(playerX, playerZ) + 0.5 } : {})
      },
      world: {
        ...world,
        layoutRevision: 7,
        structures: migratedStructures
      }
    };
  },
  16: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const clock = { ...((previous.clock ?? {}) as Record<string, unknown>) };
    const weather = { ...((previous.weather ?? {}) as Record<string, unknown>) };
    const previousSpeed = finite(clock.minutesPerRealSecond, 1);
    return {
      ...previous,
      schemaVersion: 16,
      clock: {
        ...clock,
        minutesPerRealSecond: previousSpeed === 1 ? DEFAULT_MINUTES_PER_REAL_SECOND : previousSpeed
      },
      weather: {
        ...weather,
        nextWeatherType: typeof weather.nextWeatherType === "string" ? weather.nextWeatherType : "cloudy"
      }
    };
  },
  17: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const activeBoatId = typeof player.activeBoatId === "string" ? player.activeBoatId : null;
    const hasActiveBoat = activeBoatId !== null && boats[activeBoatId] !== undefined;
    const playerX = finite(player.x);
    const playerZ = finite(player.z);
    const world = (previous.world ?? {}) as Record<string, unknown>;
    const structures = (world.structures ?? {}) as Record<string, Record<string, unknown>>;
    const migratedStructures = Object.fromEntries(
      Object.entries(structures).map(([id, structure]) => {
        const x = finite(structure.x);
        const z = finite(structure.z);
        return [id, { ...structure, x, y: WorldLayout.terrainHeight(x, z), z }];
      })
    );

    return {
      ...previous,
      schemaVersion: 17,
      player: {
        ...player,
        ...(!hasActiveBoat ? { y: WorldLayout.terrainHeight(playerX, playerZ) + 0.5 } : {})
      },
      world: {
        ...world,
        layoutRevision: 8,
        structures: migratedStructures
      }
    };
  },
  18: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const mounts = previous.mounts && typeof previous.mounts === "object" && !Array.isArray(previous.mounts)
      ? { ...(previous.mounts as Record<string, unknown>) }
      : {};
    if (!mounts[STARTER_DONKEY_ID]) mounts[STARTER_DONKEY_ID] = createStarterDonkeyState();
    return {
      ...previous,
      schemaVersion: 18,
      player: { ...player, activeMountId: null },
      mounts
    };
  },
  19: (state: unknown) => {
    const previous = state as GameState;
    const old = previous.sportFishing;
    let sportFishing = old;
    if (old) {
      const fish = { ...old } as FishingEncounterState;
      const player = previous.player;
      const school = old.schoolId ? previous.world.activeSchools[old.schoolId] : undefined;
      const bearing = school ? Math.atan2(school.x - player.x, school.z - player.z) : player.rotationY;
      const water = findFishingWater(player.x, player.z, bearing, Math.min(old.distanceMeters, FISHING_TUNING.maximumDistance),
        (x, z) => WorldLayout.isSailable(x, z));
      // Old saves had no fish position. Preserve resources and progress, shortening only
      // an unreachable legacy line so its new endpoint cannot start on land.
      if (water) fish.distanceMeters = water.distance;
      fish.dynamics = createFishingDynamics(fish, player.x, player.z, water?.bearing ?? bearing,
        previous.metadata.rngState ?? previous.worldSeed);
      sportFishing = fish;
    }
    return { ...previous, schemaVersion: 19, sportFishing };
  },
  20: (state: unknown) => {
    const previous = state as GameState;
    return {
      ...previous,
      schemaVersion: 20,
      player: {
        ...previous.player,
        ownedRodIds: ownedRodsThrough(previous.player.equippedRodId)
      }
    };
  },
  21: (state: unknown) => {
    // Legacy saves carried a smaller Work pool forward verbatim, which made a
    // single sport-fishing hook drain the whole meter. Rescale any non-canonical
    // pool to the 1,000 ceiling, preserving how full it was.
    const previous = state as Record<string, unknown>;
    const player = { ...((previous.player ?? {}) as Record<string, unknown>) };
    const work = { ...((player.workCapacity ?? {}) as Record<string, unknown>) };
    const oldMax = finite(work.maximum, 0);
    const oldCurrent = finite(work.current, oldMax);
    const maximum = WORK_CAPACITY_MAXIMUM;
    let current: number;
    if (oldMax === maximum) {
      current = Math.max(0, Math.min(maximum, oldCurrent));
    } else if (oldMax > 0) {
      current = Math.max(0, Math.min(maximum, Math.round((oldCurrent / oldMax) * maximum)));
    } else {
      current = maximum;
    }
    return {
      ...previous,
      schemaVersion: 21,
      player: { ...player, workCapacity: { ...work, current, maximum } }
    };
  },
  22: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const QUALITY_REMAP: Record<string, string> = {
      normal: "common",
      silver: "fine",
      gold: "exceptional",
      iridium: "trophy",
      prize: "trophy"
    };
    const remapQuality = (value: unknown): unknown => {
      if (typeof value !== "string") return value;
      return QUALITY_REMAP[value] ?? value;
    };
    const journal = { ...((previous.journal ?? {}) as Record<string, unknown>) };
    if (!Array.isArray(journal.unlockedKnowledge)) {
      journal.unlockedKnowledge = [];
    }
    const fishRecords = { ...((journal.fishRecords ?? {}) as Record<string, Record<string, unknown>>) };
    for (const [speciesId, record] of Object.entries(fishRecords)) {
      if (!record || typeof record !== "object") continue;
      fishRecords[speciesId] = { ...record, bestQuality: remapQuality(record.bestQuality) as string };
    }
    journal.fishRecords = fishRecords;
    let basicFishing = previous.basicFishing;
    if (basicFishing && typeof basicFishing === "object") {
      const session = { ...(basicFishing as Record<string, unknown>) };
      if (session.quality !== undefined) session.quality = remapQuality(session.quality);
      basicFishing = session;
    }
    const fishCargo = { ...((previous.fishCargo ?? {}) as Record<string, Record<string, unknown>>) };
    for (const [cargoId, cargo] of Object.entries(fishCargo)) {
      if (!cargo || typeof cargo !== "object") continue;
      fishCargo[cargoId] = { ...cargo, quality: remapQuality(cargo.quality) as string };
    }
    return {
      ...previous,
      schemaVersion: 22,
      journal,
      basicFishing,
      fishCargo
    };
  },
  23: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const clock = (previous.clock ?? {}) as Record<string, unknown>;
    const currentMinute = Math.max(0, Math.trunc(finite(clock.currentMinute, 8 * 60)));
    const season = seasonAtMinute(currentMinute);
    const oldMarkets = (previous.markets ?? {}) as Record<string, Record<string, unknown>>;
    const markets: Record<string, Record<string, unknown>> = {};

    ContentRegistry.initializeAndValidate();
    for (const [marketId, oldMarket] of Object.entries(oldMarkets)) {
      const definition = ContentRegistry.markets.get(marketId);
      if (!definition) {
        markets[marketId] = oldMarket;
        continue;
      }
      const oldCommodities = (oldMarket.commodities ?? {}) as Record<string, Record<string, unknown>>;
      const commodities: Record<string, Record<string, unknown>> = {};
      for (const authored of definition.commodities) {
        const oldCommodity = oldCommodities[authored.itemId] ?? {};
        commodities[authored.itemId] = {
          ...oldCommodity,
          itemId: authored.itemId,
          basePrice: authored.basePrice,
          demandIndex: 1,
          localSupply: authored.targetSupply,
          targetSupply: authored.targetSupply,
          consumptionRate: authored.consumptionRatePerHour,
          seasonalModifier: authored.seasonalFactors[season] ?? 1,
          lastTickMinute: currentMinute,
          recentSalesVolume: 0
        };
      }
      markets[marketId] = { ...oldMarket, commodities };
    }

    // Market ticks no longer consume the shared RNG stream. Existing rngState is
    // preserved, but post-migration future draws intentionally diverge from v22.
    return {
      ...previous,
      schemaVersion: 23,
      markets
    };
  },
  24: (state: unknown) => {
    const previous = state as GameState;
    const player = { ...previous.player };
    const activeBoatId = player.activeBoatId ?? null;
    const hasActiveBoat = activeBoatId !== null && previous.boats[activeBoatId] !== undefined;

    if (!hasActiveBoat) {
      const savedPlayerPoint = { x: player.x, z: player.z };
      const playerPoint = isValidSavedLandPose(savedPlayerPoint.x, savedPlayerPoint.z)
        ? savedPlayerPoint
        : WorldLayout.nearestValidGround(savedPlayerPoint);
      player.x = playerPoint.x;
      player.y = savedLandSupportHeight(playerPoint.x, playerPoint.z)
        + MOUNT_TUNING.playerPoseGroundOffsetMeters;
      player.z = playerPoint.z;
    }

    const structures = Object.fromEntries(
      Object.entries(previous.world.structures).map(([structureId, structure]) => {
        const savedPoint = { x: structure.x, z: structure.z };
        const point = isValidSavedLandPose(savedPoint.x, savedPoint.z)
          ? savedPoint
          : WorldLayout.nearestValidGround(savedPoint);
        return [structureId, {
          ...structure,
          x: point.x,
          y: WorldLayout.terrainHeight(point.x, point.z),
          z: point.z
        }];
      })
    ) as GameState["world"]["structures"];

    const mounts = Object.fromEntries(
      Object.entries(previous.mounts).map(([mountId, mount]) => {
        const point = nearestValidMountGround({ x: mount.x, z: mount.z });
        return [mountId, {
          ...mount,
          x: point.x,
          y: WorldLayout.traversalSurfaceHeight(point.x, point.z),
          z: point.z
        }];
      })
    ) as GameState["mounts"];

    if (!hasActiveBoat && player.activeMountId !== null) {
      const activeMount = mounts[player.activeMountId];
      if (activeMount) Object.assign(player, playerPoseFromMount(activeMount));
    }
    player.currentRegionId = WorldLayout.regionAt(player.x, player.z);

    const activeSchools = Object.fromEntries(
      Object.entries(previous.world.activeSchools).map(([schoolId, school]) => {
        if (WorldLayout.isSailable(school.x, school.z)) return [schoolId, school];
        const point = WorldLayout.nearestValidSailable({ x: school.x, z: school.z });
        return [schoolId, { ...school, x: point.x, z: point.z }];
      })
    ) as GameState["world"]["activeSchools"];

    let sportFishing = previous.sportFishing;
    if (sportFishing?.dynamics) {
      const endpoint = fishingEndpoint(sportFishing);
      if (!WorldLayout.isSailable(endpoint.x, endpoint.z)) {
        const water = findFishingWater(
          sportFishing.dynamics.originX,
          sportFishing.dynamics.originZ,
          sportFishing.dynamics.bearingRadians,
          Math.min(sportFishing.distanceMeters, FISHING_TUNING.maximumDistance),
          (x, z) => WorldLayout.isSailable(x, z)
        );
        if (water) {
          const lineLengthMeters = Math.max(
            FISHING_TUNING.minimumLineLength,
            Math.min(
              sportFishing.dynamics.lineLengthMeters,
              water.distance - sportFishing.lineTension / FISHING_TUNING.lineStiffness
            )
          );
          sportFishing = {
            ...sportFishing,
            distanceMeters: water.distance,
            dynamics: {
              ...sportFishing.dynamics,
              bearingRadians: water.bearing,
              headingRadians: water.bearing,
              lineLengthMeters
            }
          };
        }
      }
    }

    return {
      ...previous,
      schemaVersion: 24,
      player,
      mounts,
      sportFishing,
      world: {
        ...previous.world,
        layoutRevision: 9,
        structures,
        activeSchools
      }
    };
  },
  /**
   * v25 — calendar retune (DAYS_PER_SEASON 30 -> 6) plus shoulder-season
   * fish availability.
   *
   * Nothing about the state *shape* changes, but the meaning of a stored
   * `currentMinute` does: the same minute now lands in a different season. Two
   * consequences have to be settled exactly once, which is why this is a
   * version-gated migration rather than an every-load reconciliation.
   */
  25: (state: unknown) => {
    const previous = state as Record<string, unknown>;

    // Season, year and dayCount are all derived from currentMinute. Rebuilding
    // the clock re-derives them against the new constant.
    const clock = previous.clock
      ? new GameClock(previous.clock as Partial<ClockState>).getState()
      : (previous.clock as ClockState | undefined);

    // Refresh each commodity's seasonal price factor for its new season, using
    // the same expression fillMissingMarketCommodities uses for new entries.
    const season = clock ? seasonAtMinute(clock.currentMinute) : "spring";
    const markets = previous.markets as
      | Record<string, { commodities?: Record<string, { seasonalModifier: number }> }>
      | undefined;
    if (markets) {
      ContentRegistry.initializeAndValidate();
      for (const [marketId, definition] of ContentRegistry.markets.entries()) {
        const commodities = markets[marketId]?.commodities;
        if (!commodities) continue;
        for (const comm of definition.commodities) {
          const commodity = commodities[comm.itemId];
          if (!commodity) continue;
          commodity.seasonalModifier = comm.seasonalFactors[season] || 1.0;
        }
      }
    }

    const migrated = { ...previous, schemaVersion: 25, clock, markets };

    // An in-flight order for a now-out-of-season species can never be filled
    // and would hold its slot forever. Void once, refunding partials through
    // the normal expiry path; ContractDomain.tick() refills on the next tick.
    if (Array.isArray(previous.contracts)) {
      voidActiveContracts(migrated as unknown as GameState);
    }

    return migrated;
  },
  26: (state: unknown) => {
    ContentRegistry.initializeAndValidate();
    const previous = state as GameState;
    const sunreachFarm = WORLD_FARM_DEFINITIONS["farm.sunreach_terraces"];
    const previousFarms = previous.farms ?? {};
    const farms = previousFarms[sunreachFarm.id]
      ? previousFarms
      : {
          ...previousFarms,
          [sunreachFarm.id]: {
            id: sunreachFarm.id,
            regionId: sunreachFarm.regionId,
            widthMeters: sunreachFarm.widthMeters,
            depthMeters: sunreachFarm.depthMeters,
            climateId: sunreachFarm.climateId,
            soil: {
              fertility: sunreachFarm.fertility,
              moistureRetention: sunreachFarm.moistureRetention
            },
            placedCropIds: [],
            placedStructureIds: [...sunreachFarm.structureIds],
            leaseCost: sunreachFarm.leaseCost,
            leaseDueMinute: 0,
            accessType: sunreachFarm.accessType
          }
        };

    const structures = { ...previous.world.structures };
    for (const station of Object.values(WORLD_STATION_DEFINITIONS)) {
      if (station.islandId !== "island.sunreach" || structures[station.id]) continue;
      structures[station.id] = {
        id: station.id,
        type: station.type,
        x: station.position.x,
        y: WorldLayout.terrainHeight(station.position.x, station.position.z),
        z: station.position.z,
        rotationY: station.rotationY
      };
    }

    const activeSchools = Object.fromEntries(
      Object.entries(previous.world.activeSchools).map(([schoolId, school]) => [schoolId, {
        ...school,
        ecologyId: WorldLayout.fishingEcologyAt(school.x, school.z).id
      }])
    ) as GameState["world"]["activeSchools"];

    const basicFishing = previous.basicFishing
      ? { ...previous.basicFishing, ecologyId: "ecology.neva" as const }
      : null;
    const contracts = (previous.contracts ?? []).map((contract) => {
      const template = ContentRegistry.contractTemplates.get(contract.templateId);
      return {
        ...contract,
        deliveryMarketId: template?.deliveryMarketId
          ?? (contract.type === "produce" ? "market.village" : "market.harbor")
      };
    });

    return {
      ...previous,
      schemaVersion: 26,
      player: {
        ...previous.player,
        currentRegionId: WorldLayout.regionAt(previous.player.x, previous.player.z)
      },
      world: {
        ...previous.world,
        layoutRevision: 10,
        structures,
        activeSchools
      },
      farms,
      basicFishing,
      contracts
    };
  },
  27: (state: unknown) => {
    // The gallop budget moved onto the mount so riding no longer spends the
    // rider's sprint stamina. Existing saves carry no such field; start every
    // mount rested rather than at zero, which would read as a broken donkey.
    const previous = state as GameState;
    const mounts = Object.fromEntries(
      Object.entries(previous.mounts ?? {}).map(([mountId, mount]) => [
        mountId,
        {
          ...mount,
          gallopStamina: finite(
            (mount as { gallopStamina?: unknown }).gallopStamina,
            MOUNT_TUNING.maximumGallopStamina
          ),
          gallopRecoveryDelaySeconds: finite(
            (mount as { gallopRecoveryDelaySeconds?: unknown }).gallopRecoveryDelaySeconds,
            0
          ),
          gallopExhausted: (mount as { gallopExhausted?: unknown }).gallopExhausted === true
        }
      ])
    ) as GameState["mounts"];
    return { ...previous, schemaVersion: 27, mounts };
  },
  28: (state: unknown) => {
    const previous = state as GameState;
    const weatherType = previous.weather?.type ?? "clear";
    const seaRoughness = finite(previous.weather?.seaRoughness, 0);
    const oldSportFishing = previous.sportFishing;
    const oldDynamics = oldSportFishing?.dynamics;
    const sportFishing = oldSportFishing
      ? {
          ...oldSportFishing,
          dynamics: {
            ...createFishingDynamics(
              oldSportFishing,
              oldDynamics?.originX ?? previous.player.x,
              oldDynamics?.originZ ?? previous.player.z,
              oldDynamics?.bearingRadians ?? previous.player.rotationY,
              oldDynamics?.rngState ?? previous.metadata.rngState ?? previous.worldSeed
            ),
            ...(oldDynamics ?? {})
          },
          tackleSnapshot: { lureItemId: null },
          seaConditionSnapshot: { weatherType, seaRoughness }
        }
      : null;
    return {
      ...previous,
      schemaVersion: 28,
      player: {
        ...previous.player,
        preparedLureItemId: null
      },
      world: {
        ...previous.world,
        fishingPressureByHabitat: {}
      },
      sportFishing
    };
  },
  29: (state: unknown) => {
    // Quests move from one cursor to a cursor per track. The old single chain
    // is the main track verbatim, so no progress is replayed or lost. Also
    // drops `unlockedDialogueIds`, which was declared, validated and migrated
    // for twenty versions without ever being read or written.
    const previous = state as GameState & {
      quests: {
        activeQuestId?: string | null;
        activeStepIndex?: number;
        stepProgress?: Record<string, number>;
        unlockedDialogueIds?: string[];
      };
    };
    const legacy = previous.quests;
    const { activeQuestId, activeStepIndex, stepProgress, unlockedDialogueIds, ...carried } =
      legacy as unknown as Record<string, unknown>;
    void unlockedDialogueIds;
    return {
      ...previous,
      schemaVersion: 29,
      quests: {
        ...carried,
        tracks: {
          [MAIN_QUEST_TRACK_ID]: {
            activeQuestId: (activeQuestId as string | null | undefined) ?? null,
            activeStepIndex: finite(activeStepIndex as number | undefined, 0),
            stepProgress: (stepProgress as Record<string, number> | undefined) ?? {}
          }
        },
        focusedTrackId: MAIN_QUEST_TRACK_ID
      }
    };
  }
};


export function migrateSaveData(envelope: SaveEnvelope): SaveEnvelope {
  let currentVersion = envelope.schemaVersion;
  let state = envelope.state as unknown;

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[currentVersion + 1];
    if (migration) {
      state = migration(state);
      currentVersion += 1;
    } else {
      break;
    }
  }

  const migrated = state as GameState;
  fillMissingMarketCommodities(migrated);

  return {
    schemaVersion: currentVersion,
    state: migrated,
    savedAtUtcMs: envelope.savedAtUtcMs,
    checksum: envelope.checksum
  };
}

function fillMissingMarketCommodities(state: GameState): void {
  if (!state?.markets) return;
  ContentRegistry.initializeAndValidate();
  const season = state.clock ? seasonAtMinute(state.clock.currentMinute) : "spring";
  const lastTick = state.clock?.currentMinute ?? 8 * 60;
  for (const [marketId, definition] of ContentRegistry.markets.entries()) {
    const market = state.markets[marketId] ?? (state.markets[marketId] = {
      id: marketId,
      name: definition.name,
      regionId: definition.regionId,
      commodities: {}
    });
    if (!market.commodities) continue;
    for (const comm of definition.commodities) {
      if (market.commodities[comm.itemId]) continue;
      market.commodities[comm.itemId] = {
        itemId: comm.itemId,
        basePrice: comm.basePrice,
        demandIndex: 1.0,
        localSupply: comm.targetSupply,
        targetSupply: comm.targetSupply,
        consumptionRate: comm.consumptionRatePerHour,
        seasonalModifier: comm.seasonalFactors[season] || 1.0,
        lastTickMinute: lastTick,
        recentSalesVolume: 0
      };
    }
  }
}

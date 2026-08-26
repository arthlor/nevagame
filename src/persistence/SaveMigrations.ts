// src/persistence/SaveMigrations.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope } from "./SaveSchema";
import { GameState } from "../simulation/core/types";
import { STARTER_STRUCTURE_IDS, starterStructureAnchor } from "../world/FarmLayout";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, WORLD_LAYOUT_REVISION } from "../world/WorldAnchors";
import { WorldLayout } from "../world/WorldLayout";
import { createFullPlayerTraversalState } from "../simulation/navigation/PlayerTraversal";

export type MigrationFunction = (data: unknown) => unknown;

const V1_STARTER_FARM = { x: 0, z: 0 } as const;
const V1_HOMESTEAD = { x: -8, z: -10 } as const;
const CURRENT_STARTER_FARM = { x: -65, z: -55 } as const;
const CURRENT_HOMESTEAD = { x: 60, z: -60 } as const;
/** Layout revision 5 mill pad, west of the packed plaza. Frozen for the v13 hop. */
const LAYOUT_5_MILL = { x: 46, z: -58 } as const;

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
    for (const slotId of slots) {
      if (slotId == null || slotId === "") empty += 1;
    }
  }
  return empty;
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
        const empty = slots.findIndex((slotId) => slotId == null || slotId === "");
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
    const mill = starterStructureAnchor("struct.starter_mill");
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
        layoutRevision: WORLD_LAYOUT_REVISION,
        structures: migratedStructures
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

  return {
    schemaVersion: currentVersion,
    state: state as GameState,
    savedAtUtcMs: envelope.savedAtUtcMs,
    checksum: envelope.checksum
  };
}

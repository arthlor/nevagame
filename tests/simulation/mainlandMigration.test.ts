import { beforeAll, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateMainland50 } from "../../src/persistence/migrateMainland50";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { SeededRng } from "../../src/simulation/core/Rng";
import type { GameState } from "../../src/simulation/core/types";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { fishingEndpoint } from "../../src/simulation/fishing/FishingTuning";
import { CARRIAGE_TYPE_ID, STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { isValidMountPose, playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v49_layout21_mainland_predecessor.json";

// Independently retained before geography changed, by upgrading the existing
// synthetic v47 fixture to v49. Never generate this fixture from v50 output.
const legacy = (): SaveEnvelope => structuredClone(predecessor) as unknown as SaveEnvelope;
const NEW_MAINLAND = { x: -395, z: 55 };
const UNSUPPORTED_POSE = { x: WorldLayout.riverCenterX(-40), z: -40 };

function expectResourcesPreserved(before: GameState, after: GameState): void {
  // Compare against the same historical payload with schema-only v57/v58
  // fields backfilled. These assertions cover the independent terrain migration,
  // so they should not mistake those later schema defaults for lost state.
  const expected = headSchemaDevelopmentSave({
    schemaVersion: before.schemaVersion,
    savedAtUtcMs: 0,
    state: before
  }).state;
  for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "metadata", "weather"] as const) {
    expect(after[key], key).toEqual(expected[key]);
  }
  for (const key of ["money", "workCapacity", "proficiencies", "equipment", "ownedRodIds", "carriedFishCargoId", "activeBoatId", "activeMountId"] as const) {
    expect(after.player[key], key).toEqual(before.player[key]);
  }
  expect(after.world.fishingPressureByHabitat).toEqual(before.world.fishingPressureByHabitat);
  expect(after.world.lastSchoolSpawnMinute).toBe(before.world.lastSchoolSpawnMinute);
  expectMarketsPreserved(after, before);
}

function expectedStructuresAfterSunreachLayout28(
  structures: GameState["world"]["structures"]
): GameState["world"]["structures"] {
  const expected = structuredClone(structures);
  for (const structure of Object.values(expected)) {
    if (WorldLayout.terrainPatchAt(structure.x, structure.z)?.islandId === "island.sunreach") {
      structure.y = WorldLayout.terrainHeight(structure.x, structure.z);
    }
  }
  return expected;
}

function strandBoat(save: SaveEnvelope, active: boolean): void {
  const boat = save.state.boats["boat.player_rowboat"];
  Object.assign(boat, NEW_MAINLAND, { isDocked: false, dockedMarketId: null, speed: 2 });
  boat.fishCargoSlotIds[0] = "cargo.mainland_preserved";
  save.state.fishCargo["cargo.mainland_preserved"] = {
    id: "cargo.mainland_preserved", speciesId: "fish.trout", weightKg: 2, quality: "fine",
    caughtAtMinute: 475, freshness: 86, cargoClass: "small",
    location: { type: "boat-hold", containerId: boat.id, slotIndex: 0 }
  };
  if (active) Object.assign(save.state.player, NEW_MAINLAND, { y: 0.5, activeBoatId: boat.id });
}

beforeAll(() => ContentRegistry.initializeAndValidate());

describe("mainland save migration", () => {
  it("retains and validates historical layouts independently of the shipping revision", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(49);
    expect(saved.state.world.layoutRevision).toBe(21);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = 22;
    expect(validateSaveEnvelope(saved)).toBe(false);
    saved.schemaVersion = saved.state.schemaVersion = 46;
    saved.state.world.layoutRevision = 20;
    expect(validateSaveEnvelope(saved)).toBe(true);
  });

  it("preserves the working core, resources and predecessor while adding markets at saved time", () => {
    const saved = legacy();
    saved.state.crops["crop.mainland_preserved"] = {
      id: "crop.mainland_preserved", cropId: "crop.wheat", farmId: "farm.starter_garden", x: 0, z: -3.5,
      rotationRadians: 1.2, plantedAtMinute: 475, lastUpdatedMinute: 480, effectiveGrowthMinutes: 5,
      moisture: 73, health: 98, stage: "seeded", averageMoistureAccum: 146, moistureSampleCount: 2
    };
    saved.state.farms["farm.starter_garden"].placedCropIds.push("crop.mainland_preserved");
    saved.state.inventories["inv.player"].slots[6] = { itemId: "produce.wheat", quantity: 4, quality: "prize" };
    saved.state.metadata.rngState = 918273;
    const before = structuredClone(saved);
    const migrated = migrateSaveData(saved);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({ x: saved.state.player.x, z: saved.state.player.z });
    expect(migrated.state.world.structures).toEqual(expectedStructuresAfterSunreachLayout28(saved.state.world.structures));
    expect(migrated.state.boats).toEqual(saved.state.boats);
    expectResourcesPreserved(saved.state, migrated.state);
    for (const [id, market] of Object.entries(migrated.state.markets)) {
      if (saved.state.markets[id]) continue;
      expect(Object.values(market.commodities).every((entry) => entry.lastTickMinute === saved.state.clock.currentMinute
        && entry.localSupply === entry.targetSupply && entry.demandIndex === 1)).toBe(true);
    }
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
    expect(saved).toEqual(before);
  });

  it("repairs a head-schema development slot still on layout21 exactly once", () => {
    const saved = headSchemaDevelopmentSave(legacy());
    const migrated = migrateSaveData(saved);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });

  it("preserves valid mainland coordinates in an early development slot", () => {
    const saved = legacy();
    Object.assign(saved.state.player, NEW_MAINLAND);
    const migrated = migrateSaveData(saved);
    expect(migrated.state.player).toMatchObject(NEW_MAINLAND);
    expect(migrated.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(NEW_MAINLAND.x, NEW_MAINLAND.z) + 0.5, 6);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it.each([false, true])("recovers a cargo-bearing vessel displaced by the mainland (active=%s)", (active) => {
    const saved = legacy();
    strandBoat(saved, active);
    expect(WorldLayout.isSailable(NEW_MAINLAND.x, NEW_MAINLAND.z)).toBe(false);
    const migrated = migrateSaveData(saved);
    const boat = migrated.state.boats["boat.player_rowboat"];
    expect(WorldLayout.isSailable(boat.x, boat.z)).toBe(true);
    expect(boat.speed).toBe(0);
    expect(boat.isDocked).toBe(!active);
    if (active) expect(migrated.state.player).toMatchObject({ x: boat.x, z: boat.z, y: 0.5 });
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it.each([STARTER_DONKEY_ID, STARTER_CARRIAGE_ID])("recovers the whole %s footprint with its rider and cargo links", (id) => {
    const saved = legacy();
    const mount = saved.state.mounts[id];
    Object.assign(mount, UNSUPPORTED_POSE, { y: 999, gallopStamina: 38 });
    Object.assign(saved.state.player, UNSUPPORTED_POSE, { y: 999.5, activeMountId: id });
    if (mount.mountTypeId === CARRIAGE_TYPE_ID) {
      mount.fishCargoSlotIds![0] = "cargo.carriage_preserved";
      saved.state.fishCargo["cargo.carriage_preserved"] = {
        id: "cargo.carriage_preserved", speciesId: "fish.trout", weightKg: 2, quality: "fine",
        caughtAtMinute: 475, freshness: 86, cargoClass: "small", location: { type: "carriage", containerId: id, slotIndex: 0 }
      };
    }
    const migrated = migrateSaveData(saved);
    expect(isValidMountPose(migrated.state.mounts[id])).toBe(true);
    expect(migrated.state.player).toMatchObject(playerPoseFromMount(migrated.state.mounts[id]));
    expect(migrated.state.mounts[id].gallopStamina).toBe(38);
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it.each(["sunreach", "interior"])("preserves an unaffected %s player", (place) => {
    const saved = legacy();
    Object.assign(saved.state.player, place === "sunreach" ? SUNREACH_ANCHORS.dockPlayer : FARMHOUSE_INTERIOR_DOOR.enterSpawn);
    expect(migrateMainland50(saved.state).player).toEqual(saved.state.player);
  });

  it("preserves school timers, potential and ecology when new land covers its old water", () => {
    const saved = legacy();
    const school = {
      id: "school.mainland_coast", ecologyId: "ecology.neva" as const, habitatId: "coast", ...NEW_MAINLAND,
      radius: 8, spawnedAtMinute: 470, expiresAtMinute: 620, feedingFrenzyUntilMinute: 500,
      deepChumUntilMinute: 501, remainingCatchPotential: 2, speciesWeights: [{ speciesId: "fish.tuna", weight: 80 }]
    };
    saved.state.world.activeSchools[school.id] = school;
    const migrated = migrateSaveData(saved);
    const after = migrated.state.world.activeSchools[school.id];
    expect(after).toMatchObject({ ...school, x: expect.any(Number), z: expect.any(Number) });
    expect(WorldLayout.isSailable(after.x, after.z)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(after.x, after.z)).toBe("coast");
    expect(WorldLayout.fishingEcologyAt(after.x, after.z).id).toBe("ecology.neva");
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("preserves an in-flight fight and private RNG while repairing its water geometry", () => {
    const saved = legacy();
    Object.assign(saved.state.player, NEW_MAINLAND);
    saved.state.sportFishing = structuredClone(new FishingEncounter(
      { instanceId: "fish.mainland_fight", speciesId: "fish.trout", ecologyId: "ecology.neva", weightKg: 2, quality: "fine" },
      "rod.river", new SeededRng(913), 12,
      { originX: NEW_MAINLAND.x, originZ: NEW_MAINLAND.z, bearingRadians: Math.PI, isWater: () => true }
    ).getState());
    saved.state.sportFishing.dynamics!.landReadySeconds = 0.31;
    const migrated = migrateSaveData(saved);
    const { dynamics: beforeDynamics, ...beforeProgress } = saved.state.sportFishing;
    const { dynamics: afterDynamics, ...afterProgress } = migrated.state.sportFishing!;
    expect(afterProgress).toEqual(beforeProgress);
    expect(afterDynamics).toMatchObject({ ...beforeDynamics, originX: expect.any(Number), originZ: expect.any(Number),
      bearingRadians: expect.any(Number), headingRadians: expect.any(Number) });
    const endpoint = fishingEndpoint(migrated.state.sportFishing!);
    expect(WorldLayout.isSailable(endpoint.x, endpoint.z)).toBe(true);
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("preserves basic-fishing progress and the saved crosswind while repairing its cast", () => {
    const saved = legacy();
    Object.assign(saved.state.player, NEW_MAINLAND);
    saved.state.basicFishing = {
      ecologyId: "ecology.neva", habitatId: "river", phase: "minigame", remainingSeconds: 2.2,
      catchItemId: "fish.carp", willCatch: true, castDistanceMeters: 12, castLateralDriftMeters: 1.3,
      castPower: 0.9, catchProgress: 0.74, isPerfect: true, hasBait: true, fishY: 0.4, barY: 0.2,
      hasTreasure: true, treasureProgress: 0.6, treasureCaught: false, quality: "fine"
    };
    const migrated = migrateSaveData(saved);
    expect(migrated.state.basicFishing).toEqual(saved.state.basicFishing);
    const player = migrated.state.player;
    expect(WorldLayout.isSailable(player.x + Math.sin(player.rotationY) * 12 + Math.cos(player.rotationY) * 1.3,
      player.z + Math.cos(player.rotationY) * 12 - Math.sin(player.rotationY) * 1.3)).toBe(true);
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("preserves a won catch awaiting keep or release without reopening its water reach", () => {
    const saved = legacy();
    const encounter = { ...structuredClone(new FishingEncounter(
      { instanceId: "fish.mainland_landed", speciesId: "fish.trout", ecologyId: "ecology.neva", weightKg: 2, quality: "fine" },
      "rod.river", new SeededRng(812), 2,
      { originX: saved.state.player.x, originZ: saved.state.player.z, bearingRadians: 0, isWater: () => true }
    ).getState()), result: "landed" as const, awaitingLandingChoice: true, distanceMeters: 0 };
    encounter.dynamics!.depthMeters = 0;
    saved.state.sportFishing = encounter;
    expect(validateSaveEnvelope(saved)).toBe(true);
    const migrated = migrateSaveData(saved);
    expect(migrated.state.sportFishing).toEqual(encounter);
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
  });

  it("keeps a displaced offshore fight in marine water with its active skiff", () => {
    const saved = legacy();
    const definition = ContentRegistry.boats.get("boat.skiff")!;
    const boat = { ...structuredClone(saved.state.boats["boat.player_rowboat"]), id: "boat.player_skiff",
      boatTypeId: definition.id, ...NEW_MAINLAND, fuel: definition.fuelCapacity, isDocked: false,
      dockedMarketId: null, fishCargoSlotIds: definition.fishCargoSlots.map(() => null), supplyInventoryId: "inv.test_skiff" };
    saved.state.boats[boat.id] = boat;
    saved.state.inventories[boat.supplyInventoryId] = { id: boat.supplyInventoryId, slotCount: 8,
      slots: Array.from({ length: 8 }, () => ({})) };
    Object.assign(saved.state.player, NEW_MAINLAND, { y: 0.5, activeBoatId: boat.id });
    saved.state.sportFishing = structuredClone(new FishingEncounter(
      { instanceId: "fish.mainland_offshore", speciesId: "fish.blue_marlin", habitatId: "offshore",
        ecologyId: "ecology.neva", weightKg: 140, quality: "fine" },
      "rod.offshore", new SeededRng(731), 24,
      { originX: NEW_MAINLAND.x, originZ: NEW_MAINLAND.z, bearingRadians: Math.PI, isWater: () => true }
    ).getState());
    const migrated = migrateSaveData(saved);
    const endpoint = fishingEndpoint(migrated.state.sportFishing!);
    expect(WorldLayout.fishingHabitatAt(endpoint.x, endpoint.z)).toBe("offshore");
    expect(WorldLayout.fishingEcologyAt(endpoint.x, endpoint.z).id).toBe("ecology.neva");
    expect(migrated.state.player).toMatchObject({ x: migrated.state.boats[boat.id].x, z: migrated.state.boats[boat.id].z });
    expect(migrated.state.sportFishing!.fish).toEqual(saved.state.sportFishing.fish);
    expect(migrated.state.sportFishing!.dynamics!.rngState).toBe(saved.state.sportFishing.dynamics!.rngState);
    expect(migrated.state.sportFishing!.distanceMeters).toBe(saved.state.sportFishing.distanceMeters);
    expectResourcesPreserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("persists the migrated candidate and reloads without replaying the layout or changing cargo", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = legacy();
      strandBoat(saved, false);
      const migrated = migrateSaveData(saved);
      const repository = new IndexedDbSaveRepository();
      expect(await repository.saveGame(migrated.state)).toBe(true);
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") {
        expect(loaded.envelope.state).toEqual(migrated.state);
        expect(migrateSaveData(loaded.envelope)).toEqual(loaded.envelope);
      }
    } finally { restore(); }
  });

  it("leaves both stored slots unchanged when migration fails and the backup recovers", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    strandBoat(primary, true);
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
    });
    const transaction = db.transaction("game_saves", "readwrite");
    transaction.objectStore("game_saves").put(primary, "primary_save");
    transaction.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
    const read = (key: string) => new Promise<unknown>((resolve) => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    const water = vi.spyOn(WorldLayout, "isSailable").mockReturnValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => migrateMainland50(primary.state)).toThrow("no safe compatible boat mooring");
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally {
      water.mockRestore(); error.mockRestore(); warning.mockRestore(); restore();
    }
  });
});

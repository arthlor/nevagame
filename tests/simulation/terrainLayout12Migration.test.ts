import { beforeAll, describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateTerrainLayout12 } from "../../src/persistence/migrateTerrainLayout12";
import type { GameState } from "../../src/simulation/core/types";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { fishingEndpoint } from "../../src/simulation/fishing/FishingTuning";
import { isValidMountPose, playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import { SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { defaultMooringForBoatType } from "../../src/world/WorldMoorings";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import fixture from "../fixtures/save_v31_layout11.json";

const unsupportedEdge = { x: -210, z: -210 };

function legacy(): SaveEnvelope {
  return structuredClone(fixture) as SaveEnvelope;
}

function preserveResources(before: GameState, after: GameState): void {
  for (const key of ["crops", "farms", "inventories", "fishCargo", "markets", "contracts", "quests", "journal", "metadata", "clock"] as const) {
    expect(after[key], key).toEqual(before[key]);
  }
  expect(after.player.workCapacity).toEqual(before.player.workCapacity);
  expect(after.player.proficiencies).toEqual(before.player.proficiencies);
  expect(after.player.money).toBe(before.player.money);
  expect(after.world.fishingPressureByHabitat).toEqual(before.world.fishingPressureByHabitat);
}

function strandBoat(save: SaveEnvelope, active: boolean): string {
  const id = "boat.player_rowboat";
  Object.assign(save.state.boats[id], {
    x: -65, z: -60, y: 0, speed: 1.3, isDocked: false, dockedMarketId: null
  });
  const cargoId = "cargo.layout11_kept";
  save.state.boats[id].fishCargoSlotIds[0] = cargoId;
  save.state.fishCargo[cargoId] = {
    id: cargoId, speciesId: "fish.trout", weightKg: 2, quality: "fine", caughtAtMinute: 475,
    freshness: 84, cargoClass: "small", location: { type: "boat-hold", containerId: id, slotIndex: 0 }
  };
  if (active) Object.assign(save.state.player, { x: -65, z: -60, y: 0.5, activeBoatId: id });
  return id;
}

beforeAll(() => ContentRegistry.initializeAndValidate());

describe("layout 12 natural island coasts save migration", () => {
  it("validates the independent v31 fixture before any migration and rejects mismatched layouts", () => {
    const save = legacy();
    expect(save.schemaVersion).toBe(31);
    expect(save.state.schemaVersion).toBe(31);
    expect(save.state.world.layoutRevision).toBe(11);
    expect(validateSaveEnvelope(save)).toBe(true);
    save.state.world.layoutRevision = 12;
    expect(validateSaveEnvelope(save)).toBe(false);
    save.schemaVersion = save.state.schemaVersion = 32;
    save.state.world.layoutRevision = 11;
    expect(validateSaveEnvelope(save)).toBe(false);
    save.state.world.layoutRevision = 12;
    expect(validateSaveEnvelope(save)).toBe(true);
  });

  it("re-grounds an unmigrated planted save deterministically without changing resources or its input", () => {
    const before = legacy();
    const untouched = structuredClone(before);
    const after = migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.player).toMatchObject({ x: before.state.player.x, z: before.state.player.z });
    expect(after.state.player.y).toBe(WorldLayout.traversalSurfaceHeight(before.state.player.x, before.state.player.z) + 0.5);
    expect(after.state.player.traversal.isGrounded).toBe(true);
    for (const [id, structure] of Object.entries(before.state.world.structures)) {
      expect(after.state.world.structures[id]).toMatchObject({ ...structure, y: expect.any(Number) });
      expect(after.state.world.structures[id].y).toBe(WorldLayout.terrainHeight(structure.x, structure.z));
    }
    expect(after.state.boats).toEqual(before.state.boats);
    preserveResources(before.state, after.state);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(legacy())).toEqual(after);
    expect(migrateSaveData(structuredClone(after))).toEqual(after);
    expect(before).toEqual(untouched);
  });

  it.each([false, true])("recovers unsupported coastal land poses together with their rider (mounted=%s)", (mounted) => {
    const before = legacy();
    expect(WorldLayout.isWater(unsupportedEdge.x, unsupportedEdge.z)).toBe(true);
    Object.assign(before.state.player, unsupportedEdge, { y: 1 });
    if (mounted) {
      const mount = before.state.mounts[STARTER_DONKEY_ID];
      Object.assign(mount, unsupportedEdge, { y: 0.5, gallopStamina: 31, gallopRecoveryDelaySeconds: 0.3 });
      before.state.player.activeMountId = mount.id;
    }
    const after = migrateSaveData(before);
    expect(after.state.player).not.toMatchObject(unsupportedEdge);
    expect(WorldLayout.isWater(after.state.player.x, after.state.player.z)).toBe(false);
    expect(WorldLayout.isWalkable(after.state.player.x, after.state.player.z)).toBe(true);
    if (mounted) {
      const mount = after.state.mounts[STARTER_DONKEY_ID];
      expect(isValidMountPose(mount)).toBe(true);
      expect(after.state.player).toMatchObject(playerPoseFromMount(mount));
      expect(mount.gallopStamina).toBe(31);
      expect(mount.gallopRecoveryDelaySeconds).toBe(0.3);
    }
    preserveResources(before.state, after.state);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it.each(["sunreach", "interior"])("leaves a %s player's pose untouched", (location) => {
    const before = legacy();
    const point = location === "sunreach" ? SUNREACH_ANCHORS.dockPlayer : FARMHOUSE_INTERIOR_DOOR.enterSpawn;
    Object.assign(before.state.player, point);
    expect(migrateSaveData(before).state.player).toEqual(before.state.player);
  });

  it.each([false, true])("recovers an invalid vessel without losing its cargo or active rider (active=%s)", (active) => {
    const before = legacy();
    const id = strandBoat(before, active);
    const after = migrateSaveData(before);
    const mooring = defaultMooringForBoatType("boat.rowboat");
    expect(after.state.boats[id]).toEqual({
      ...before.state.boats[id], ...mooring.boatPosition, speed: 0,
      isDocked: !active, dockedMarketId: active ? null : mooring.marketId
    });
    if (active) expect(after.state.player).toMatchObject({
      activeBoatId: id, x: mooring.boatPosition.x, z: mooring.boatPosition.z,
      y: mooring.boatPosition.y + 0.5
    });
    preserveResources(before.state, after.state);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("keeps every basic-fishing progress field while repairing an unsupported origin", () => {
    const before = legacy();
    Object.assign(before.state.player, unsupportedEdge, { rotationY: 0 });
    before.state.basicFishing = {
      ecologyId: "ecology.neva", habitatId: "river", phase: "minigame", remainingSeconds: 2.2,
      catchItemId: "fish.carp", willCatch: true, castDistanceMeters: 12, castPower: 0.9,
      catchProgress: 0.74, isPerfect: true, hasBait: true, fishY: 0.4, barY: 0.2,
      hasTreasure: true, treasureProgress: 0.6, treasureCaught: false, quality: "fine"
    };
    const after = migrateSaveData(before).state;
    expect(after.basicFishing).toEqual(before.state.basicFishing);
    expect(WorldLayout.isSailable(
      after.player.x + Math.sin(after.player.rotationY) * 12,
      after.player.z + Math.cos(after.player.rotationY) * 12
    )).toBe(true);
    preserveResources(before.state, after);
  });

  it("preserves sport-fishing distance, depth, spool and landing progress while repairing geometry", () => {
    const before = legacy();
    Object.assign(before.state.player, unsupportedEdge);
    const encounter = new FishingEncounter(
      { instanceId: "fish.layout11_hooked", speciesId: "fish.trout", ecologyId: "ecology.neva", weightKg: 2, quality: "fine" },
      "rod.river", new SeededRng(913), 24,
      { originX: unsupportedEdge.x, originZ: unsupportedEdge.z, bearingRadians: Math.PI, isWater: () => true }
    );
    before.state.sportFishing = structuredClone(encounter.getState());
    Object.assign(before.state.sportFishing, { stamina: 5, lineIntegrity: 76, elapsedSeconds: 17 });
    Object.assign(before.state.sportFishing.dynamics!, { depthMeters: 0.2, landReadySeconds: 0.31 });
    const after = migrateSaveData(before).state;
    const { dynamics: oldDynamics, ...oldProgress } = before.state.sportFishing;
    const { dynamics, ...progress } = after.sportFishing!;
    expect(progress).toEqual(oldProgress);
    expect(dynamics).toMatchObject({
      ...oldDynamics, originX: after.player.x, originZ: after.player.z,
      bearingRadians: expect.any(Number), headingRadians: expect.any(Number)
    });
    expect(dynamics!.headingRadians - dynamics!.bearingRadians).toBeCloseTo(oldDynamics!.headingRadians - oldDynamics!.bearingRadians, 8);
    const endpoint = fishingEndpoint(after.sportFishing!);
    expect(WorldLayout.isSailable(endpoint.x, endpoint.z)).toBe(true);
    preserveResources(before.state, after);
  });

  it("relocates stranded schools within their habitat without renewing catch potential or timers", () => {
    const before = legacy();
    const school = {
      id: "school.layout11_stranded", ecologyId: "ecology.neva", habitatId: "river",
      x: -65, z: -60, radius: 8, spawnedAtMinute: 470, expiresAtMinute: 620,
      feedingFrenzyUntilMinute: 500, deepChumUntilMinute: 501, remainingCatchPotential: 2,
      speciesWeights: [{ speciesId: "fish.trout", weight: 80 }]
    } as const;
    before.state.world.activeSchools[school.id] = { ...school, speciesWeights: [...school.speciesWeights] };
    const after = migrateSaveData(before).state.world.activeSchools[school.id];
    expect(after).toMatchObject({ ...school, x: expect.any(Number), z: expect.any(Number) });
    expect(WorldLayout.isSailable(after.x, after.z)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(after.x, after.z)).toBe(school.habitatId);
    expect(WorldLayout.fishingEcologyAt(after.x, after.z).id).toBe(school.ecologyId);
  });

  it("fails atomically when safe recovery is unavailable", () => {
    const before = legacy();
    strandBoat(before, true);
    const untouched = structuredClone(before);
    const water = vi.spyOn(WorldLayout, "isSailable").mockReturnValue(false);
    try {
      expect(() => migrateTerrainLayout12(before.state)).toThrow("no safe compatible boat mooring");
      expect(before).toEqual(untouched);
    } finally { water.mockRestore(); }
  });

  it("retains both stored saves when the primary cannot migrate and the backup can", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    strandBoat(primary, true);
    // A current backup remains loadable even when no old-world boat can be
    // migrated. Layout 13 also validates docked harbor poses against the coast.
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
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
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally {
      water.mockRestore(); log.mockRestore(); warning.mockRestore(); restore();
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/save_v38_layout16.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { clearReach } from "../../src/persistence/terrainMigrationSupport";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

const legacy = () => structuredClone(fixture) as unknown as SaveEnvelope;

function preserveResources(after: SaveEnvelope, before: SaveEnvelope) {
  for (const key of ["inventories", "farms", "crops", "processingJobs", "boats", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "metadata", "markets"] as const) {
    expect(after.state[key], key).toEqual(before.state[key]);
  }
  for (const key of ["money", "proficiencies", "workCapacity", "equipment", "ownedRodIds"] as const) {
    expect(after.state.player[key], key).toEqual(before.state.player[key]);
  }
  expect({ ...after.state.world, layoutRevision: before.state.world.layoutRevision, structures: before.state.world.structures }).toEqual(before.state.world);
}

describe("Sunreach continuous shore migration (v39 / layout17)", () => {
  it("retains historical layout validation and leaves an unaffected Neva save intact", () => {
    const before = legacy();
    expect(validateSaveEnvelope(before)).toBe(true);
    const wrong = structuredClone(before);
    wrong.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expect(validateSaveEnvelope(wrong)).toBe(false);
    const after = migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.player).toEqual(before.state.player);
    expect(after.state.mounts).toEqual(before.state.mounts);
    expect(migrateSaveData(after)).toEqual(after);
    preserveResources(after, before);
  });

  it.each([false, true])("recovers a changed coastal pose on Sunreach with resources and rider attachment intact (mounted=%s)", (mounted) => {
    const before = legacy();
    // Layout16's retained numeric probe measured a tall dry edge here;
    // layout17 has a continuous, steep toe requiring nearby safe support.
    Object.assign(before.state.player, { x: 633.49, z: -2, y: 9.5, currentRegionId: "region.sunreach_ridge" });
    const mount = Object.values(before.state.mounts)[0];
    if (mounted) {
      Object.assign(mount, { x: 633.49, z: -2, y: 9, gallopStamina: 31, gallopRecoveryDelaySeconds: 0.3 });
      before.state.player.activeMountId = mount.id;
    }
    const untouched = structuredClone(before);
    const after = migrateSaveData(before);
    const player = after.state.player;
    expect(WorldLayout.terrainPatchAt(player.x, player.z)?.islandId).toBe("island.sunreach");
    expect(WorldLayout.isWater(player.x, player.z)).toBe(false);
    expect(WorldLayout.isWalkable(player.x, player.z)).toBe(true);
    expect(player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(player.x, player.z) + 0.5, 6);
    if (mounted) {
      const recovered = after.state.mounts[mount.id];
      expect(player).toMatchObject(playerPoseFromMount(recovered));
      expect({ ...recovered, x: mount.x, y: mount.y, z: mount.z }).toEqual(mount);
    }
    expect(before).toEqual(untouched);
    expect(migrateSaveData(structuredClone(untouched))).toEqual(after);
    expect(migrateSaveData(after)).toEqual(after);
    expect(validateSaveEnvelope(after)).toBe(true);
    preserveResources(after, before);
  });

  it.each([false, true])("re-seats a Neva road-end save without moving its XZ pose (mounted=%s)", (mounted) => {
    const before = legacy();
    // Measured before closing the harbor-rocky-landing cap's missing face.
    const point = { x: 83.17887874389554, z: 52.54650397467855 };
    const oldGround = 1.2833022195588484;
    Object.assign(before.state.player, point, { y: oldGround + 0.5, currentRegionId: "region.harbor" });
    const mount = Object.values(before.state.mounts)[0];
    if (mounted) {
      Object.assign(mount, point, { y: oldGround, gallopStamina: 31 });
      before.state.player.activeMountId = mount.id;
    }
    const untouched = structuredClone(before);
    const after = migrateSaveData(before);
    expect(after.state.player).toMatchObject({ ...point, currentRegionId: "region.harbor" });
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(point.x, point.z) + 0.5, 6);
    expect(after.state.player.y).toBeGreaterThan(before.state.player.y);
    if (mounted) {
      expect(after.state.player).toMatchObject(playerPoseFromMount(after.state.mounts[mount.id]));
      expect({ ...after.state.mounts[mount.id], y: mount.y }).toEqual(mount);
    }
    expect(before).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
    expect(validateSaveEnvelope(after)).toBe(true);
    preserveResources(after, before);
  });

  it("preserves an occupied terrace and active bank-fishing progress at the cove", () => {
    const before = legacy();
    Object.assign(before.state.player, { x: 355, z: 58, y: 0.7963696122169495, rotationY: -Math.PI / 2, currentRegionId: "region.sunreach_cove" });
    const farm = before.state.farms["farm.sunreach_terraces"];
    const cropId = "crop.shore_migration";
    farm.placedCropIds.push(cropId);
    before.state.crops[cropId] = {
      id: cropId, cropId: "crop.sunflower", farmId: farm.id, x: 0, z: 0, rotationRadians: 0,
      plantedAtMinute: before.state.clock.currentMinute, lastUpdatedMinute: before.state.clock.currentMinute,
      effectiveGrowthMinutes: 0, moisture: 72, health: 100, stage: "seeded", averageMoistureAccum: 72, moistureSampleCount: 1
    };
    before.state.basicFishing = {
      ecologyId: "ecology.sunreach", habitatId: "coast", phase: "minigame", remainingSeconds: 2.2,
      catchItemId: "fish.sardine", willCatch: true, castDistanceMeters: 12, castPower: 0.9,
      catchProgress: 0.74, isPerfect: true, hasBait: true, fishY: 0.4, barY: 0.2,
      hasTreasure: true, treasureProgress: 0.6, treasureCaught: false, quality: "fine"
    };
    const after = migrateSaveData(before);
    expect(after.state.basicFishing).toEqual(before.state.basicFishing);
    expect(clearReach(after.state.player, before.state.player.rotationY, 12)).toBe(true);
    expect(after.state.player.currentRegionId).toBe(before.state.player.currentRegionId);
    expect(validateSaveEnvelope(after)).toBe(true);
    preserveResources(after, before);
  });

  it.each(["interior", "boat"])("leaves the %s player and vessel truth unchanged", (where) => {
    const before = legacy();
    if (where === "interior") Object.assign(before.state.player, FARMHOUSE_INTERIOR_DOOR.enterSpawn);
    else {
      const boat = Object.values(before.state.boats)[0];
      Object.assign(boat, { x: 343, z: 58, y: 0 });
      Object.assign(before.state.player, { x: 343, z: 58, y: 0.5, activeBoatId: boat.id });
    }
    const after = migrateSaveData(before);
    expect(after.state.player).toEqual(before.state.player);
    preserveResources(after, before);
  });

  it("keeps an active Sunreach sport catch, tackle, line geometry and private RNG", () => {
    const before = legacy();
    const point = { x: 355, z: 58 };
    Object.assign(before.state.player, point, { rotationY: -Math.PI / 2 });
    const encounter = new FishingEncounter(
      { instanceId: "fish.shore_migration", speciesId: "fish.amberjack", ecologyId: "ecology.sunreach", weightKg: 22, quality: "fine" },
      "rod.heavy_sport", new SeededRng(913), 24,
      { originX: point.x, originZ: point.z, bearingRadians: -Math.PI / 2, isWater: () => true }
    );
    before.state.sportFishing = structuredClone(encounter.getState());
    const after = migrateSaveData(before);
    expect(after.state.sportFishing).toEqual(before.state.sportFishing);
    expect(validateSaveEnvelope(after)).toBe(true);
    preserveResources(after, before);
  });

  it("preserves both stored slots when a shore migration fails and loads the valid backup", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    Object.assign(primary.state.player, { x: 355, z: 58 });
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
    const originalWalkable = WorldLayout.isWalkable.bind(WorldLayout);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) => x < 320 && originalWalkable(x, z));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally { walkable.mockRestore(); error.mockRestore(); warn.mockRestore(); restore(); }
  });
});

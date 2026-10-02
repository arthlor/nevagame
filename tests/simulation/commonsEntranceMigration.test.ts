import { describe, expect, it, vi } from "vitest";
import predecessor from "../fixtures/save_v78_layout42_commons_entrance_predecessor.json";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import * as support from "../../src/persistence/terrainMigrationSupport";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("Commons entrance schema79/layout43 recovery", () => {
  it("retains an independently valid predecessor and re-grounds only the entrance pose", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(78);
    expect(saved.state.world.layoutRevision).toBe(42);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.player.y = 90;
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(after.state.player.x).toBe(before.state.player.x);
    expect(after.state.player.z).toBe(before.state.player.z);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(after.state.player.x, after.state.player.z) + 0.5, 6);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const expected = structuredClone(before);
    expected.schemaVersion = expected.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expected.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expected.state.player = structuredClone(after.state.player);
    expect(after).toEqual(expected);
    expect(saved).toEqual(before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("preserves planted crop identity, footprint coordinates, growth, seed lots, Work and progress", () => {
    const saved = legacy();
    const sim = new Simulation(saved.state);
    Object.assign(sim.state.player, { x: 77, z: -78, y: WorldLayout.traversalSurfaceHeight(77, -78) + 0.5 });
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [{ itemId: "seed.wheat", quantity: 2 }]);
    expect(sim.plantCrop("farm.player_homestead", "crop.wheat", 77, -78).success).toBe(true);
    const before = { ...saved, state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(before)).toBe(true);
    const after = migrateSaveData(before);
    for (const key of ["crops", "farms", "inventories", "processingJobs", "fishCargo", "boats", "markets", "contracts", "quests", "journal", "clock", "weather", "metadata"] as const) {
      expect(after.state[key], key).toEqual(before.state[key]);
    }
    expect(after.state.player.workCapacity).toEqual({ ...before.state.player.workCapacity, offlineRegenSeconds: 0 });
    expect(after.state.player.proficiencies).toEqual(before.state.player.proficiencies);
    expect(after.state.worldSeed).toBe(before.state.worldSeed);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("leaves actors outside the entrance envelope intact", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { x: -65, z: -55, y: 87 });
    const after = migrateSaveData(saved);
    expect(after.state.player).toEqual({
      ...saved.state.player,
      workCapacity: { ...saved.state.player.workCapacity, offlineRegenSeconds: 0 }
    });
    expect(after.state.mounts).toEqual(saved.state.mounts);
    expect(after.state.world.structures).toEqual(saved.state.world.structures);
  });

  it("repairs a current-schema development save still carrying the predecessor layout", () => {
    const saved = legacy();
    saved.schemaVersion = saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    saved.state.player.workCapacity.offlineRegenSeconds = 0;
    expect(validateSaveEnvelope(saved)).toBe(false);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("keeps primary and backup slots unchanged if entrance recovery fails", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("neva_save_db", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const write = db.transaction("game_saves", "readwrite");
    write.objectStore("game_saves").put(primary, "primary_save");
    write.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>((resolve) => { write.oncomplete = () => resolve(); });
    const recovery = vi.spyOn(support, "nearestPoint").mockImplementation(() => { throw new Error("No safe entrance support"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const read = (key: string) => new Promise<unknown>((resolve) => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally {
      recovery.mockRestore(); error.mockRestore(); warning.mockRestore(); db.close(); restore();
    }
  });
});

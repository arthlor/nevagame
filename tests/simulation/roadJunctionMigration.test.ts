import { describe, expect, it, vi } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { ROAD_JUNCTION_LAYOUT_REVISION, migrateRoadJunctions62 } from "../../src/persistence/migrateRoadJunctions62";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v61_layout31_road_predecessor.json";
import { expectBoatsPreserved, expectInventoriesPreserved, expectMarketsPreserved } from "../helpers/migrationPreservation";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts",
  "quests", "journal", "clock", "weather"] as const;
const FOREST_FORK = { x: -425, z: -180 };

async function openSaveDb(): Promise<IDBDatabase> {
  const request = indexedDB.open("neva_save_db", 1);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rawSlot(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

describe("mainland road junction layout32 recovery", () => {
  it("retains a validated schema61/layout31 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(61);
    expect(saved.state.world.layoutRevision).toBe(31);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(ROAD_JUNCTION_LAYOUT_REVISION).toBe(32);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(62);
  });

  it("re-grounds a supported actor at a joined mainland fork without changing progress", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { ...FOREST_FORK, y: 99, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(FOREST_FORK);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(FOREST_FORK.x, FOREST_FORK.z) + 0.5, 6);
    for (const key of PRESERVED) if (key !== "inventories") expect(after.state[key], key).toEqual(before.state[key]);
    expectInventoriesPreserved(after.state, before.state);
    expectBoatsPreserved(after.state, before.state);
    expectMarketsPreserved(after.state, before.state);
    expect(after.state.player.money).toBe(before.state.player.money);
    expect(after.state.player.proficiencies).toEqual(before.state.player.proficiencies);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs a head-schema save that still records layout31", () => {
    const saved = headSchemaDevelopmentSave(legacy());
    expect(validateSaveEnvelope(saved)).toBe(false);
    const after = migrateSaveData(saved);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("keeps a migrated copy of the old primary as the durable backup", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const db = await openSaveDb();
      const old = legacy();
      await new Promise<void>((resolve) => {
        const transaction = db.transaction("game_saves", "readwrite");
        transaction.objectStore("game_saves").put(old, "primary_save");
        transaction.oncomplete = () => resolve();
      });
      const repository = new IndexedDbSaveRepository();
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status !== "loaded") return;
      expect(validateSaveEnvelope(loaded.envelope)).toBe(true);
      expect(await rawSlot(db, "primary_save")).toEqual(old);
      const next = structuredClone(loaded.envelope.state);
      next.player.money += 7;
      expect(await repository.saveGame(next)).toBe(true);
      expect(await rawSlot(db, "backup_save")).toEqual(loaded.envelope);
      expect((await rawSlot(db, "primary_save") as SaveEnvelope).state.player.money).toBe(next.player.money);
    } finally { restore(); }
  });

  it("leaves the predecessor untouched if no safe land support can be found", () => {
    const saved = legacy();
    const before = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateRoadJunctions62(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(before);
    } finally { walkable.mockRestore(); }
  });
});

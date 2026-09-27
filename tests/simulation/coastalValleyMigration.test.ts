import { describe, expect, it, vi } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { COASTAL_VALLEY_LAYOUT_REVISION, migrateCoastalValley63 } from "../../src/persistence/migrateCoastalValley63";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v62_layout32_valley_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts",
  "quests", "journal", "clock", "weather", "boats", "markets"] as const;
const FOREST_FORK = { x: WorldLayout.riverCenterX(-100) + 20, z: -100 };

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

describe("coastal valley layout33 recovery", () => {
  it("retains a validated schema62/layout32 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(62);
    expect(saved.state.world.layoutRevision).toBe(32);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(COASTAL_VALLEY_LAYOUT_REVISION).toBe(33);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(63);
  });

  it("re-grounds a supported actor at a new low meadow without changing progress", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { ...FOREST_FORK, y: 99, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(FOREST_FORK);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(FOREST_FORK.x, FOREST_FORK.z) + 0.5, 6);
    expect(after.state.player.money).toBe(before.state.player.money);
    expect(after.state.player.proficiencies).toEqual(before.state.player.proficiencies);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
    // Later layout steps own their own changes (trade markets, harbor
    // moorings), so the layout-33 step's preservation is checked on its own.
    const step = migrateCoastalValley63(structuredClone(before.state));
    expect(step.world.layoutRevision).toBe(COASTAL_VALLEY_LAYOUT_REVISION);
    for (const key of PRESERVED) expect(step[key], key).toEqual(before.state[key]);
  });

  it("repairs a head-schema save that still records layout32", () => {
    // A current-schema save whose world stamp lags: every schema field is
    // present, only the layout revision is stale.
    const saved = migrateSaveData(legacy());
    saved.state.world.layoutRevision = 32;
    expect(saved.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(saved)).toBe(false);
    const after = migrateSaveData(saved);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("recovers a ground pack from the widened inlet without changing the catch", () => {
    const saved = legacy();
    const section = WorldLayout.riverSectionAt(76);
    const location = { type: "ground" as const, containerId: "ground", x: section.centerX + section.rightWaterWidth - 0.8, z: 76 };
    const pack = { id: "cargo.valley", speciesId: "fish.trout", weightKg: 3, quality: "fine" as const,
      caughtAtMinute: saved.state.clock.currentMinute, freshness: 91, cargoClass: "small" as const, location };
    saved.state.fishCargo[pack.id] = pack;
    const after = migrateSaveData(saved);
    const recovered = after.state.fishCargo[pack.id];
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(WorldLayout.isWater(recovered.location.x!, recovered.location.z!)).toBe(false);
    expect(WorldLayout.isWalkable(recovered.location.x!, recovered.location.z!)).toBe(true);
    expect({ ...recovered, location }).toEqual(pack);
    expect(saved.state.fishCargo[pack.id]).toEqual(pack);
    expect(migrateSaveData(after)).toEqual(after);
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
      expect(() => migrateCoastalValley63(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(before);
    } finally { walkable.mockRestore(); }
  });
});

import { describe, expect, it } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateProcessingWorkTiers58 } from "../../src/persistence/migrateProcessingWorkTiers58";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v57_processing_work_predecessor.json";

const JOB_ID = "job.v57_wheat_milling";

function oldSave(): SaveEnvelope {
  return structuredClone(predecessor) as unknown as SaveEnvelope;
}

async function openSaveDb(): Promise<IDBDatabase> {
  const request = indexedDB.open("neva_save_db", 1);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("game_saves")) {
        request.result.createObjectStore("game_saves");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeRawSlot(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("game_saves", "readwrite");
    transaction.objectStore("game_saves").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readRawSlot(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe("v57 processing Work tier migration", () => {
  it("retains the paid Work, promised XP, pending output and other save truth", () => {
    const legacy = oldSave();
    const original = structuredClone(legacy);
    const job = legacy.state.processingJobs[JOB_ID];
    expect(legacy.schemaVersion).toBe(57);
    expect(legacy.state.world.layoutRevision).toBe(28);
    expect(job).toMatchObject({
      recipeId: "recipe.wheat_to_grain",
      status: "active",
      workTier: "standard",
      baseWork: 35,
      chargedWork: 35,
      xpReward: 35
    });
    expect(validateSaveEnvelope(legacy)).toBe(true);

    const oneStep = migrateProcessingWorkTiers58(legacy.state);
    expect(oneStep).toEqual({ ...original.state, schemaVersion: 58 });
    expect(legacy).toEqual(original);

    const migrated = migrateSaveData(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.processingJobs[JOB_ID]).toEqual(job);
    expect(legacy).toEqual(original);
    expect(migrateSaveData(migrated)).toEqual(migrated);

    const simulation = new Simulation(migrated.state);
    const station = simulation.state.world.structures[job.stationId];
    const front = getProcessingStationFrontPosition(job.stationId, station);
    expect(front).not.toBeNull();
    simulation.state.player.x = front!.x;
    simulation.state.player.z = front!.z;
    simulation.advanceGameMinutes(job.effectiveDurationMinutes);
    expect(simulation.state.processingJobs[JOB_ID].status).toBe("complete");

    const inventory = simulation.state.inventories[simulation.state.player.inventoryId];
    const countBefore = InventoryManager.getItemCount(inventory, "item.ground_grain");
    const xpBefore = simulation.state.player.proficiencies.processing;
    const workBefore = simulation.state.player.workCapacity.current;
    expect(simulation.collectProcessingJob(JOB_ID)).toMatchObject({ success: true });
    expect(InventoryManager.getItemCount(inventory, "item.ground_grain")).toBe(countBefore + 2);
    expect(simulation.state.player.proficiencies.processing).toBe(xpBefore + 35);
    expect(simulation.state.player.workCapacity.current).toBe(workBefore);
    expect(simulation.state.processingJobs[JOB_ID]).toBeUndefined();
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: legacy.savedAtUtcMs,
      state: simulation.state
    })).toBe(true);
  });

  it("keeps a migrated copy of the v57 primary as the durable backup", async () => {
    const restoreIndexedDB = installMemoryIndexedDB();
    const db = await openSaveDb();
    try {
      const legacy = oldSave();
      await writeRawSlot(db, "primary_save", legacy);
      const repository = new IndexedDbSaveRepository();
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status !== "loaded") return;
      expect(loaded.envelope.state.processingJobs[JOB_ID].chargedWork).toBe(35);
      expect(await readRawSlot(db, "primary_save")).toEqual(legacy);

      const previousSnapshot = structuredClone(loaded.envelope);
      expect(await repository.saveGame(loaded.envelope.state)).toBe(true);
      const backup = await readRawSlot(db, "backup_save");
      const primary = await readRawSlot(db, "primary_save");
      expect(backup).toEqual(previousSnapshot);
      expect(validateSaveEnvelope(backup)).toBe(true);
      expect(validateSaveEnvelope(primary)).toBe(true);
      expect((backup as SaveEnvelope).state.processingJobs[JOB_ID]).toEqual(
        legacy.state.processingJobs[JOB_ID]
      );
    } finally {
      db.close();
      restoreIndexedDB();
    }
  });
});

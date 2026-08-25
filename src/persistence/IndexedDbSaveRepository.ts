// src/persistence/IndexedDbSaveRepository.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope, validateSaveEnvelope } from "./SaveSchema";
import { migrateSaveData } from "./SaveMigrations";
import { GameState } from "../simulation/core/types";

const DB_NAME = "neva_save_db";
const STORE_NAME = "game_saves";
const PRIMARY_KEY = "primary_save";
const BACKUP_KEY = "backup_save";

export interface SaveSummary {
  dayCount: number;
  season: string;
  money: number;
  savedAtUtcMs: number;
}

export type LoadGameResult =
  | { status: "loaded"; envelope: SaveEnvelope }
  | { status: "empty" }
  | { status: "corrupt" }
  | { status: "unavailable" };

export class IndexedDbSaveRepository {
  private async getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
          const target = e.target as IDBOpenDBRequest;
          const db = target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error("[IndexedDbSaveRepository] Failed to open IndexedDB", request.error);
          resolve(null);
        };
      } catch (error) {
        console.error("[IndexedDbSaveRepository] Failed to open IndexedDB", error);
        resolve(null);
      }
    });
  }

  public async saveGame(state: GameState): Promise<boolean> {
    const savedAtUtcMs = Date.now();

    const db = await this.getDb();
    if (!db) {
      // Never treat RAM as a durable save, and never promote it into IndexedDB later.
      return false;
    }

    state.metadata.lastSavedUtcMs = savedAtUtcMs;
    const envelope: SaveEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs,
      // Overlay pause is UI-only; never persist it or a paused save would freeze on load.
      state: {
        ...state,
        clock: { ...state.clock, isPaused: false }
      }
    };

    const existing = await this.readAndMigrate(db, PRIMARY_KEY);
    if (existing) {
      const backedUp = await this.writeRawToDb(db, BACKUP_KEY, existing);
      if (!backedUp) {
        console.error("[IndexedDbSaveRepository] Failed to write backup save");
      }
    }

    return this.writeRawToDb(db, PRIMARY_KEY, envelope);
  }

  public async loadGame(): Promise<SaveEnvelope | null> {
    const result = await this.loadGameResult();
    return result.status === "loaded" ? result.envelope : null;
  }

  public async loadGameResult(): Promise<LoadGameResult> {
    const db = await this.getDb();
    if (!db) {
      return { status: "unavailable" };
    }

    const primaryRaw = await this.readRawFromDb(db, PRIMARY_KEY);
    const primary = this.migrateAndValidate(primaryRaw);
    if (primary) return { status: "loaded", envelope: primary };

    const backupRaw = await this.readRawFromDb(db, BACKUP_KEY);
    const backup = this.migrateAndValidate(backupRaw);
    if (backup) {
      console.warn("Primary save missing or corrupted. Restored from backup.");
      return { status: "loaded", envelope: backup };
    }

    if (primaryRaw == null && backupRaw == null) return { status: "empty" };
    return { status: "corrupt" };
  }

  public async clearSaves(): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.error("[IndexedDbSaveRepository] Failed to clear saves", tx.error);
          resolve();
        };
      } catch (error) {
        console.error("[IndexedDbSaveRepository] Failed to clear saves", error);
        resolve();
      }
    });
  }

  private migrateAndValidate(raw: unknown): SaveEnvelope | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as SaveEnvelope;
    if (typeof candidate.schemaVersion !== "number" || !Number.isInteger(candidate.schemaVersion)) return null;
    if (typeof candidate.savedAtUtcMs !== "number" || !Number.isFinite(candidate.savedAtUtcMs) || candidate.savedAtUtcMs < 0) {
      return null;
    }
    if (!candidate.state || typeof candidate.state !== "object") return null;

    let migrated: SaveEnvelope;
    try {
      migrated = migrateSaveData(candidate);
    } catch (error) {
      console.error("[IndexedDbSaveRepository] Save migration failed", error);
      return null;
    }
    if (migrated.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
    if (!validateSaveEnvelope(migrated)) return null;
    return migrated;
  }

  private async readAndMigrate(db: IDBDatabase, key: string): Promise<SaveEnvelope | null> {
    return this.migrateAndValidate(await this.readRawFromDb(db, key));
  }

  private async writeRawToDb(db: IDBDatabase, key: string, data: SaveEnvelope): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(data, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => {
          console.error("[IndexedDbSaveRepository] Failed to write save", tx.error);
          resolve(false);
        };
      } catch (error) {
        console.error("[IndexedDbSaveRepository] Failed to write save", error);
        resolve(false);
      }
    });
  }

  private async readRawFromDb(db: IDBDatabase, key: string): Promise<unknown> {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => {
          console.error("[IndexedDbSaveRepository] Failed to read save", req.error);
          resolve(null);
        };
      } catch (error) {
        console.error("[IndexedDbSaveRepository] Failed to read save", error);
        resolve(null);
      }
    });
  }
}

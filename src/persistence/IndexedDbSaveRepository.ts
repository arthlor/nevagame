// src/persistence/IndexedDbSaveRepository.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope, validateSaveEnvelope } from "./SaveSchema";
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

export class IndexedDbSaveRepository {
  private inMemoryStore: Map<string, SaveEnvelope> = new Map();

  private async getDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") {
      return null;
    }
    return new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const target = e.target as IDBOpenDBRequest;
        const db = target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  public async saveGame(state: GameState): Promise<boolean> {
    // Stamp the save time so offline progression computes elapsed time from
    // the actual save, not from game start.
    state.metadata.lastSavedUtcMs = Date.now();

    const envelope: SaveEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: Date.now(),
      state
    };

    // 1. Keep backup of existing primary before overwrite
    const existing = await this.loadGame();
    if (existing) {
      await this.writeRaw(BACKUP_KEY, existing);
    }

    // 2. Write primary
    return this.writeRaw(PRIMARY_KEY, envelope);
  }

  public async loadGame(): Promise<SaveEnvelope | null> {
    const primary = await this.readRaw(PRIMARY_KEY);
    if (primary && validateSaveEnvelope(primary)) {
      return primary;
    }

    // Try backup if primary corrupt/missing
    const backup = await this.readRaw(BACKUP_KEY);
    if (backup && validateSaveEnvelope(backup)) {
      console.warn("Primary save missing or corrupted. Restored from backup.");
      return backup;
    }

    return null;
  }

  public async clearSaves(): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      this.inMemoryStore.clear();
      return;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  private async writeRaw(key: string, data: SaveEnvelope): Promise<boolean> {
    const db = await this.getDb();
    if (!db) {
      this.inMemoryStore.set(key, data);
      return true;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  private async readRaw(key: string): Promise<SaveEnvelope | null> {
    const db = await this.getDb();
    if (!db) {
      return this.inMemoryStore.get(key) || null;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}

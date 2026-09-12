// src/persistence/IndexedDbSaveRepository.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope, validateSaveEnvelope } from "./SaveSchema";
import { migrateSaveData } from "./SaveMigrations";
import { GameState } from "../simulation/core/types";
import { WORLD_LAYOUT_REVISION } from "../world/WorldAnchors";

const DB_NAME = "neva_save_db";
const STORE_NAME = "game_saves";
const PRIMARY_KEY = "primary_save";
const BACKUP_KEY = "backup_save";
export const SAVE_OPERATION_TIMEOUT_MS = 10_000;

export interface SaveSummary {
  dayCount: number;
  season: string;
  year: number;
  regionId: string;
  money: number;
  savedAtUtcMs: number;
}

export type LoadGameResult =
  | { status: "loaded"; envelope: SaveEnvelope }
  | { status: "empty" }
  | { status: "corrupt" }
  | { status: "incompatible" }
  | { status: "unavailable" };

export interface SaveInspection {
  result: LoadGameResult;
  summary: SaveSummary | null;
}

export class IndexedDbSaveRepository {
  private db: IDBDatabase | null = null;
  private openPromise: Promise<IDBDatabase | null> | null = null;
  private operationQueue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(operation, operation);
    this.operationQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private forgetDb(db: IDBDatabase): void {
    if (this.db === db) this.db = null;
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (this.db) return this.db;
    if (this.openPromise) return this.openPromise;
    if (typeof indexedDB === "undefined") {
      return null;
    }

    this.openPromise = this.openDb();
    try {
      const db = await this.openPromise;
      if (db) {
        this.db = db;
        db.onclose = () => this.forgetDb(db);
        db.onerror = () => this.forgetDb(db);
      }
      return db;
    } finally {
      this.openPromise = null;
    }
  }

  private openDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (settled) { db?.close(); return; }
        settled = true;
        clearTimeout(timer);
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), SAVE_OPERATION_TIMEOUT_MS);
      try {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            this.forgetDb(request.result);
            request.result.close();
          };
          finish(request.result);
        };
        request.onblocked = () => finish(null);
        request.onerror = () => finish(null);
      } catch { finish(null); }
    });
  }

  private transaction<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, result: (value: T) => void) => void,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const tx = db.transaction(STORE_NAME, mode);
      let value: T;
      let settled = false;
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(reason);
      };
      const abort = () => {
        try { tx.abort(); } catch { /* A completed transaction cannot be aborted. */ }
        fail(signal?.reason ?? new Error("Save operation timed out"));
      };
      const timer = setTimeout(abort, SAVE_OPERATION_TIMEOUT_MS);
      signal?.addEventListener("abort", abort, { once: true });
      tx.oncomplete = () => { if (!settled) { settled = true; cleanup(); resolve(value); } };
      tx.onerror = () => fail(tx.error ?? new Error("Save storage failed"));
      tx.onabort = () => fail(tx.error ?? new Error("Save transaction aborted"));
      try { operation(tx.objectStore(STORE_NAME), result => { value = result; }); }
      catch (error) { try { tx.abort(); } catch { /* Already inactive. */ } fail(error); }
    });
  }

  public async saveGame(state: GameState, signal?: AbortSignal): Promise<boolean> {
    const savedAtUtcMs = Date.now();
    // Freeze gameplay truth before any await so nested player/inventory/fishing
    // mutations during IDB cannot tear the envelope.
    const snapshot = structuredClone(state);
    snapshot.clock.isPaused = false;
    snapshot.metadata.lastSavedUtcMs = savedAtUtcMs;
    const envelope: SaveEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs,
      state: snapshot
    };

    return this.enqueue(() => this.persistEnvelope(state, envelope, savedAtUtcMs, signal));
  }

  public async loadGame(): Promise<SaveEnvelope | null> {
    const result = await this.loadGameResult();
    return result.status === "loaded" ? result.envelope : null;
  }

  /**
   * Reads and validates only the save slots so the title screen can choose a
   * truthful Continue/New Game action. It does not construct a Simulation or
   * touch the renderer, physics, or gameplay clock.
   */
  public async inspectGame(signal?: AbortSignal): Promise<SaveInspection> {
    return this.enqueue(async () => {
      const result = await this.readGameResult(signal);
      return {
        result,
        summary: result.status === "loaded" ? this.summarize(result.envelope) : null
      };
    });
  }

  public async loadGameResult(): Promise<LoadGameResult> {
    return this.enqueue(() => this.readGameResult());
  }

  public async clearSaves(): Promise<void> {
    return this.enqueue(async () => {
      const db = await this.getDb();
      if (!db) return;
      await this.transaction<void>(db, "readwrite", store => { store.clear(); });
    });
  }

  private async persistEnvelope(
    liveState: GameState,
    envelope: SaveEnvelope,
    savedAtUtcMs: number,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      signal?.throwIfAborted();
      const db = await this.getDb();
      if (!db || !validateSaveEnvelope(envelope)) return false;
      signal?.throwIfAborted();
      // Both slots change in the same transaction. A failed primary put cannot
      // overwrite the backup, including when startup recovered from that backup.
      // The displaced primary is always backed up: migrated when this build can
      // open it, verbatim when an incompatible (e.g. newer) build wrote it, so
      // replacing it is never the only copy's end. Only unreadable data is left
      // behind, and so never displaces a recovered backup.
      await this.transaction<void>(db, "readwrite", store => {
        const request = store.get(PRIMARY_KEY);
        request.onsuccess = () => {
          try {
            const raw: unknown = request.result;
            const previous = this.migrateAndValidate(raw);
            if (previous === "incompatible") store.put(raw, BACKUP_KEY);
            else if (previous) store.put(previous, BACKUP_KEY);
            store.put(envelope, PRIMARY_KEY);
          } catch {
            request.transaction?.abort();
          }
        };
      }, signal);
      liveState.metadata.lastSavedUtcMs = savedAtUtcMs;
      return true;
    } catch (error) {
      console.warn("[IndexedDbSaveRepository] Save was not committed", error);
      return false;
    }
  }

  private migrateAndValidate(raw: unknown): SaveEnvelope | "incompatible" | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as SaveEnvelope;
    if (typeof candidate.schemaVersion !== "number" || !Number.isInteger(candidate.schemaVersion)) return null;
    if (typeof candidate.savedAtUtcMs !== "number" || !Number.isFinite(candidate.savedAtUtcMs) || candidate.savedAtUtcMs < 0) {
      return null;
    }
    if (!candidate.state || typeof candidate.state !== "object") return null;

    const state = candidate.state as Partial<GameState>;
    const world = state.world as Partial<GameState["world"]> | undefined;
    const structurallyReadable = state.schemaVersion === candidate.schemaVersion
      && Number.isSafeInteger(state.worldSeed)
      && !!world
      && Number.isSafeInteger(world.layoutRevision);
    if (structurallyReadable && candidate.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return "incompatible";
    }
    if (
      structurallyReadable
      && candidate.schemaVersion === CURRENT_SCHEMA_VERSION
      && world.layoutRevision !== WORLD_LAYOUT_REVISION
    ) {
      return "incompatible";
    }

    let migrated: SaveEnvelope;
    try {
      migrated = migrateSaveData(candidate);
    } catch (error) {
      console.error("[IndexedDbSaveRepository] Save migration failed", error);
      return null;
    }
    try {
      if (migrated.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
      if (!validateSaveEnvelope(migrated)) return null;
      return migrated;
    } catch {
      // A malformed primary must behave like any other corrupt slot so the
      // caller can still attempt the backup before reporting the database as
      // unavailable.
      return null;
    }
  }

  private async readGameResult(signal?: AbortSignal): Promise<LoadGameResult> {
    try {
      signal?.throwIfAborted();
      const db = await this.getDb();
      signal?.throwIfAborted();
      if (!db) {
        return { status: "unavailable" };
      }

      const primaryRaw = await this.readRawFromDb(db, PRIMARY_KEY, signal);
      const primary = this.migrateAndValidate(primaryRaw);
      if (primary && primary !== "incompatible") return { status: "loaded", envelope: primary };

      const backupRaw = await this.readRawFromDb(db, BACKUP_KEY, signal);
      const backup = this.migrateAndValidate(backupRaw);
      if (backup && backup !== "incompatible") {
        console.warn("Primary save missing or corrupted. Restored from backup.");
        return { status: "loaded", envelope: backup };
      }

      if (primaryRaw == null && backupRaw == null) return { status: "empty" };
      if (primary === "incompatible" || backup === "incompatible") return { status: "incompatible" };
      return { status: "corrupt" };
    } catch { return { status: "unavailable" }; }
  }

  private summarize(envelope: SaveEnvelope): SaveSummary {
    return {
      dayCount: envelope.state.clock.dayCount,
      season: envelope.state.clock.season,
      year: envelope.state.clock.year,
      regionId: envelope.state.player.currentRegionId,
      money: envelope.state.player.money,
      savedAtUtcMs: envelope.savedAtUtcMs
    };
  }

  private async readRawFromDb(db: IDBDatabase, key: string, signal?: AbortSignal): Promise<unknown> {
    return this.transaction<unknown>(db, "readonly", (store, result) => {
      const request = store.get(key);
      request.onsuccess = () => result(request.result ?? null);
    }, signal);
  }
}

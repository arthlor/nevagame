// tests/simulation/persistence.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { Simulation } from "../../src/simulation/Simulation";
import {
  CURRENT_SCHEMA_VERSION,
  validateSaveEnvelope,
  type SaveEnvelope
} from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import { STARTER_FARM_LAYOUT, starterStructureAnchor } from "../../src/world/FarmLayout";
import { HARBOR_DOCK, HARBOR_FISH_TABLE, WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import saveV11Layout3 from "../fixtures/save_v11_layout3.json";
import saveV12Layout4 from "../fixtures/save_v12_layout4.json";
import saveV13Layout5 from "../fixtures/save_v13_layout5.json";
import saveV14Layout6 from "../fixtures/save_v14_layout6.json";

function patchIndexedDbPuts(shouldFail: (key: IDBValidKey) => boolean): void {
  const factory = globalThis.indexedDB as unknown as {
    open: (name: string, version?: number) => IDBOpenDBRequest;
  };
  const originalOpen = factory.open.bind(factory);
  factory.open = ((name: string, version?: number) => {
    const request = originalOpen(name, version) as IDBOpenDBRequest & { onsuccess: (() => void) | null };
    let onsuccess: (() => void) | null = null;
    Object.defineProperty(request, "onsuccess", {
      configurable: true,
      get: () => onsuccess,
      set: (fn: (() => void) | null) => {
        onsuccess = () => {
          const db = request.result as IDBDatabase;
          const originalTransaction = db.transaction.bind(db);
          db.transaction = ((storeName: string, mode?: IDBTransactionMode) => {
            const tx = originalTransaction(storeName, mode);
            const originalObjectStore = tx.objectStore.bind(tx);
            tx.objectStore = ((objectStoreName: string) => {
              const store = originalObjectStore(objectStoreName);
              const originalPut = store.put.bind(store);
              store.put = ((value: unknown, key?: IDBValidKey) => {
                if (key !== undefined && shouldFail(key)) {
                  throw new Error("forced IndexedDB put failure");
                }
                return originalPut(value, key);
              }) as typeof store.put;
              return store;
            }) as typeof tx.objectStore;
            return tx;
          }) as typeof db.transaction;
          fn?.();
        };
      }
    });
    return request;
  }) as typeof factory.open;
}

async function putRawSave(key: string, value: unknown): Promise<void> {
  const dbOpen = indexedDB.open("neva_save_db", 1);
  await new Promise<void>((resolve, reject) => {
    dbOpen.onerror = () => reject(new Error("open failed"));
    dbOpen.onsuccess = () => resolve();
    dbOpen.onupgradeneeded = () => {
      const db = (dbOpen as unknown as { result: IDBDatabase }).result;
      if (!db.objectStoreNames.contains("game_saves")) db.createObjectStore("game_saves");
    };
  });
  const db = (dbOpen as unknown as { result: IDBDatabase }).result;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("game_saves", "readwrite");
    tx.objectStore("game_saves").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("put failed"));
  });
}

describe("Persistence & Offline Progression", () => {
  it("does not report a durable save when IndexedDB is unavailable", async () => {
    const previous = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    try {
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState(12345);
      state.player.money = 550;
      const lastSavedUtcMs = state.metadata.lastSavedUtcMs;
      expect(await repo.saveGame(state)).toBe(false);
      expect(state.metadata.lastSavedUtcMs).toBe(lastSavedUtcMs);
      expect(await repo.loadGame()).toBeNull();
      expect(await repo.loadGameResult()).toEqual({ status: "unavailable" });
      expect(await repo.inspectGame()).toEqual({
        result: { status: "unavailable" },
        summary: null
      });
    } finally {
      if (previous !== undefined) {
        (globalThis as { indexedDB: IDBFactory }).indexedDB = previous;
      }
    }
  });

  describe("IndexedDB durable save slots", () => {
    let restoreIndexedDB: () => void;

    beforeEach(() => {
      restoreIndexedDB = installMemoryIndexedDB();
    });

    afterEach(async () => {
      await new IndexedDbSaveRepository().clearSaves();
      restoreIndexedDB();
    });

    it("saves and loads game state reliably", async () => {
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState(12345);
      state.player.money = 550;

      const saveSuccess = await repo.saveGame(state);
      expect(saveSuccess).toBe(true);

      const inspection = await repo.inspectGame();
      expect(inspection.result.status).toBe("loaded");
      expect(inspection.summary).toMatchObject({
        dayCount: state.clock.dayCount,
        season: state.clock.season,
        year: state.clock.year,
        regionId: state.player.currentRegionId,
        money: 550,
        savedAtUtcMs: state.metadata.lastSavedUtcMs
      });

      const loaded = await repo.loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded?.state.player.money).toBe(550);
      expect(loaded?.state.worldSeed).toBe(12345);
    });


    it("clears overlay pause on save so restore is playable", async () => {
      const repo = new IndexedDbSaveRepository();
      const sim = new Simulation();
      sim.clock.setPaused(true);
      sim.tick(1);
      expect(sim.clock.isPaused()).toBe(true);
      expect(await repo.saveGame(sim.state)).toBe(true);
      expect(sim.clock.isPaused()).toBe(true);

      const loaded = await repo.loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded!.state.clock.isPaused).toBe(false);
      const restored = new Simulation(loaded!.state);
      expect(restored.clock.isPaused()).toBe(false);
      const start = restored.state.clock.currentMinute;
      restored.advanceGameMinutes(8);
      expect(restored.state.clock.currentMinute).toBe(start + 8);
    });

    it("migrates then validates so a v5 save loads at CURRENT_SCHEMA_VERSION", async () => {
      const repo = new IndexedDbSaveRepository();
      const legacy = structuredClone(createInitialGameState());
      legacy.schemaVersion = 5;
      legacy.player.money = 731;
      delete (legacy.player as Partial<typeof legacy.player>).traversal;
      const raw = { schemaVersion: 5, savedAtUtcMs: 1, state: legacy };
      expect(validateSaveEnvelope(raw as never)).toBe(true);

      const dbOpen = indexedDB.open("neva_save_db", 1);
      await new Promise<void>((resolve, reject) => {
        dbOpen.onerror = () => reject(new Error("open failed"));
        dbOpen.onsuccess = () => resolve();
        dbOpen.onupgradeneeded = () => {
          const db = (dbOpen as unknown as { result: IDBDatabase }).result;
          if (!db.objectStoreNames.contains("game_saves")) db.createObjectStore("game_saves");
        };
      });
      const db = (dbOpen as unknown as { result: IDBDatabase }).result;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("game_saves", "readwrite");
        tx.objectStore("game_saves").put(raw, "primary_save");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("put failed"));
      });

      const loaded = await repo.loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(loaded?.state.player.money).toBe(731);
      expect(loaded?.state.player.traversal).toBeDefined();
      expect(validateSaveEnvelope(loaded)).toBe(true);
    });

    it("loads a valid v14/layout-6 save through the v15/layout-7 migration", async () => {
      const repo = new IndexedDbSaveRepository();
      const legacy = structuredClone(createInitialGameState());
      legacy.schemaVersion = 14;
      legacy.world.layoutRevision = 6;
      legacy.player.money = 731;
      for (const stationId of [
        "struct.starter_mill",
        "struct.workbench",
        "struct.starter_compost",
        HARBOR_FISH_TABLE.structureId
      ]) {
        const historical = saveV14Layout6.state.world.structures[stationId as keyof typeof saveV14Layout6.state.world.structures];
        const station = legacy.world.structures[stationId];
        station.x = historical.x;
        station.y = historical.y;
        station.z = historical.z;
      }
      await putRawSave("primary_save", { schemaVersion: 14, savedAtUtcMs: 1, state: legacy });

      const result = await repo.loadGameResult();
      expect(result.status).toBe("loaded");
      if (result.status !== "loaded") throw new Error(`Expected migrated save, got ${result.status}`);
      expect(result.envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.envelope.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
      expect(result.envelope.state.player.money).toBe(731);
      for (const stationId of ["struct.starter_mill", "struct.workbench", "struct.starter_compost"]) {
        const anchor = starterStructureAnchor(stationId)!;
        expect(result.envelope.state.world.structures[stationId]).toMatchObject({ x: anchor.x, z: anchor.z });
      }
      expect(result.envelope.state.world.structures[HARBOR_FISH_TABLE.structureId]).toMatchObject({
        x: HARBOR_FISH_TABLE.position.x,
        z: HARBOR_FISH_TABLE.position.z
      });
      expect(validateSaveEnvelope(result.envelope)).toBe(true);
    });

    it("rejects a save that cannot reach CURRENT_SCHEMA_VERSION after migrations", async () => {
      const repo = new IndexedDbSaveRepository();
      const dbOpen = indexedDB.open("neva_save_db", 1);
      await new Promise<void>((resolve) => {
        dbOpen.onsuccess = () => resolve();
        dbOpen.onupgradeneeded = () => {
          const db = (dbOpen as unknown as { result: IDBDatabase }).result;
          if (!db.objectStoreNames.contains("game_saves")) db.createObjectStore("game_saves");
        };
      });
      const db = (dbOpen as unknown as { result: IDBDatabase }).result;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("game_saves", "readwrite");
        tx.objectStore("game_saves").put(
          { schemaVersion: 0, savedAtUtcMs: 1, state: createInitialGameState() },
          "primary_save"
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("put failed"));
      });

      expect(await repo.loadGame()).toBeNull();
      expect(await repo.loadGameResult()).toEqual({ status: "corrupt" });
    });

    it("uses a valid backup when primary fails migrate+validate", async () => {
      const repo = new IndexedDbSaveRepository();
      const good = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 2,
        state: createInitialGameState()
      };
      good.state.player.money = 880;
      const dbOpen = indexedDB.open("neva_save_db", 1);
      await new Promise<void>((resolve) => {
        dbOpen.onsuccess = () => resolve();
        dbOpen.onupgradeneeded = () => {
          const db = (dbOpen as unknown as { result: IDBDatabase }).result;
          if (!db.objectStoreNames.contains("game_saves")) db.createObjectStore("game_saves");
        };
      });
      const db = (dbOpen as unknown as { result: IDBDatabase }).result;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("game_saves", "readwrite");
        tx.objectStore("game_saves").put({ schemaVersion: 0, savedAtUtcMs: 1, state: {} }, "primary_save");
        tx.objectStore("game_saves").put(good, "backup_save");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("put failed"));
      });

      const loaded = await repo.loadGame();
      expect(loaded?.state.player.money).toBe(880);
    });

    it("deep-snapshots nested state before any await so later mutations cannot tear the save", async () => {
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState(12345);
      state.clock.isPaused = true;
      state.player.money = 140;
      const originalX = state.player.x;
      const inventory = state.inventories[state.player.inventoryId];
      inventory.slots[0] = { itemId: "seed.wheat", quantity: 10 };
      state.metadata.lastSavedUtcMs = 1;
      const lastSavedBefore = state.metadata.lastSavedUtcMs;

      const pending = repo.saveGame(state);
      expect(state.metadata.lastSavedUtcMs).toBe(lastSavedBefore);
      expect(state.clock.isPaused).toBe(true);

      state.player.money = 999;
      state.player.x = originalX + 40;
      inventory.slots[0].quantity = 1;
      state.basicFishing = {
        habitatId: "river",
        phase: "minigame",
        remainingSeconds: 1.5,
        willCatch: true
      };

      expect(await pending).toBe(true);
      expect(state.clock.isPaused).toBe(true);
      expect(state.player.money).toBe(999);
      expect(state.metadata.lastSavedUtcMs).toBeGreaterThan(lastSavedBefore);

      const loaded = await repo.loadGame();
      expect(loaded).not.toBeNull();
      expect(loaded!.state.clock.isPaused).toBe(false);
      expect(loaded!.state.player.money).toBe(140);
      expect(loaded!.state.player.x).toBe(originalX);
      expect(loaded!.state.inventories[loaded!.state.player.inventoryId].slots[0]).toEqual({
        itemId: "seed.wheat",
        quantity: 10
      });
      expect(loaded!.state.basicFishing).toBeNull();
      expect(loaded!.state.metadata.lastSavedUtcMs).toBe(state.metadata.lastSavedUtcMs);
      expect(loaded!.savedAtUtcMs).toBe(state.metadata.lastSavedUtcMs);
    });

    it("retries IndexedDB open on a later saveGame after an unavailable attempt", async () => {
      const restore = restoreIndexedDB;
      restore();
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState();
      state.player.money = 321;
      state.metadata.lastSavedUtcMs = 1;
      const lastSavedBefore = state.metadata.lastSavedUtcMs;
      expect(await repo.saveGame(state)).toBe(false);
      expect(await repo.loadGameResult()).toEqual({ status: "unavailable" });
      expect(state.metadata.lastSavedUtcMs).toBe(lastSavedBefore);

      restoreIndexedDB = installMemoryIndexedDB();
      expect(await repo.saveGame(state)).toBe(true);
      const loaded = await repo.loadGame();
      expect(loaded?.state.player.money).toBe(321);
      expect(state.metadata.lastSavedUtcMs).toBe(loaded!.savedAtUtcMs);
    });

    it("serializes overlapping writes so the later snapshot wins and previous primary becomes backup", async () => {
      const repo = new IndexedDbSaveRepository();
      const state = createInitialGameState();
      state.player.money = 111;
      const first = repo.saveGame(state);
      state.player.money = 222;
      const second = repo.saveGame(state);
      expect(await first).toBe(true);
      expect(await second).toBe(true);

      const loaded = await repo.loadGame();
      expect(loaded?.state.player.money).toBe(222);

      const dbOpen = indexedDB.open("neva_save_db", 1);
      await new Promise<void>((resolve, reject) => {
        dbOpen.onerror = () => reject(new Error("open failed"));
        dbOpen.onsuccess = () => resolve();
      });
      const db = (dbOpen as unknown as { result: IDBDatabase }).result;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("game_saves", "readwrite");
        tx.objectStore("game_saves").put({ schemaVersion: 0, savedAtUtcMs: 1, state: {} }, "primary_save");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error("put failed"));
      });
      const restored = await repo.loadGame();
      expect(restored?.state.player.money).toBe(111);
    });

    it("does not overwrite primary when backup put fails", async () => {
      const failPuts = { backup: false };
      patchIndexedDbPuts((key) => failPuts.backup && key === "backup_save");
      const repo = new IndexedDbSaveRepository();
      const first = createInitialGameState();
      first.player.money = 400;
      expect(await repo.saveGame(first)).toBe(true);

      failPuts.backup = true;
      const second = createInitialGameState();
      second.player.money = 800;
      const lastSavedBefore = second.metadata.lastSavedUtcMs;
      expect(await repo.saveGame(second)).toBe(false);
      expect(second.metadata.lastSavedUtcMs).toBe(lastSavedBefore);

      const loaded = await repo.loadGame();
      expect(loaded?.state.player.money).toBe(400);
    });


    it("falls through to backup when v11 trout overflow fails migration", async () => {
      const repo = new IndexedDbSaveRepository();
      const good = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        savedAtUtcMs: 2,
        state: createInitialGameState()
      };
      good.state.player.money = 640;
      const overflow = structuredClone(createInitialGameState());
      overflow.schemaVersion = 10;
      overflow.player.money = 12;
      const holdSlots = overflow.boats["boat.player_rowboat"].fishCargoSlotIds.length;
      overflow.inventories[overflow.player.inventoryId].slots[0] = {
        itemId: "fish.trout",
        quantity: 1 + holdSlots + 1
      };
      await putRawSave("primary_save", { schemaVersion: 10, savedAtUtcMs: 1, state: overflow });
      await putRawSave("backup_save", good);

      const loaded = await repo.loadGame();
      expect(loaded?.state.player.money).toBe(640);
    });

    it("does not promote session RAM into IndexedDB when storage returns", async () => {
      const restore = restoreIndexedDB;
      restore();
      delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      const ramRepo = new IndexedDbSaveRepository();
      const ramState = createInitialGameState();
      ramState.player.money = 1;
      expect(await ramRepo.saveGame(ramState)).toBe(false);

      restoreIndexedDB = installMemoryIndexedDB();
      const durableRepo = new IndexedDbSaveRepository();
      const durableState = createInitialGameState();
      durableState.player.money = 999;
      expect(await durableRepo.saveGame(durableState)).toBe(true);
      const loaded = await ramRepo.loadGame();
      expect(loaded?.state.player.money).toBe(999);
    });
  });

  it("advances offline progression deterministically", () => {
    const sim = new Simulation();
    sim.state.player.x = STARTER_FARM_LAYOUT.origin.x;
    sim.state.player.z = STARTER_FARM_LAYOUT.origin.z;
    sim.plantCrop(
      "farm.starter_garden",
      "crop.wheat",
      STARTER_FARM_LAYOUT.origin.x,
      STARTER_FARM_LAYOUT.origin.z
    );

    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 400_000; // 400 real seconds at 0.4 = 160 game minutes (wheat 180m / 1.2 climate)

    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(160);
    expect(summary.cropsMaturedCount).toBe(1);

    const cropId = Object.keys(sim.state.crops)[0];
    expect(sim.state.crops[cropId].stage).toBe("mature");
  });

  it("caps wall clock first so 3 real hours simulate 3*3600*0.4 game minutes", () => {
    const sim = new Simulation();
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 3 * 3600 * 1000;
    const summary = applyOfflineProgression(sim.state, now);
    expect(summary.simulatedGameMinutes).toBe(Math.floor(3 * 3600 * 0.4));
  });

  it("regenerates work capacity during offline progression", () => {
    const sim = new Simulation();
    const now = Date.now();
    sim.state.player.workCapacity.current = 0;
    sim.state.metadata.lastSavedUtcMs = now - 150_000;

    applyOfflineProgression(sim.state, now);

    expect(sim.state.player.workCapacity.current).toBe(100);
    expect(sim.state.player.workCapacity.regeneratedAtMinute).toBe(sim.state.clock.currentMinute);
  });

  it("advances offline markets hour by hour without supply overshooting its target", () => {
    const sim = new Simulation();
    const wheat = sim.state.markets["market.village"].commodities["produce.wheat"];
    const now = Date.now();
    sim.state.metadata.lastSavedUtcMs = now - 72 * 3600 * 1000;

    applyOfflineProgression(sim.state, now);

    expect(wheat.localSupply).toBeLessThanOrEqual(wheat.targetSupply);
    expect(wheat.localSupply).toBeGreaterThan(0);
    expect(wheat.lastTickMinute).toBe(sim.state.clock.currentMinute);
  });

  it("rejects poisoned numeric state before it can be restored", () => {
    const state = createInitialGameState();
    const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 1, state };
    expect(validateSaveEnvelope(envelope)).toBe(true);

    state.player.money = Number.NaN;
    expect(validateSaveEnvelope(envelope)).toBe(false);
    state.player.money = 100;
    state.inventories[state.player.inventoryId].slots[0].quantity = Infinity;
    expect(validateSaveEnvelope(envelope)).toBe(false);
  });

  it("rejects missing and poisoned simulation branches before offline progression", () => {
    const validEnvelope = () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    });

    const missingWeather = validEnvelope();
    delete (missingWeather.state as { weather?: unknown }).weather;
    expect(validateSaveEnvelope(missingWeather)).toBe(false);

    const poisonedMarket = validEnvelope();
    poisonedMarket.state.markets["market.village"].commodities["produce.wheat"].basePrice = Number.NaN;
    expect(validateSaveEnvelope(poisonedMarket)).toBe(false);

    const poisonedCapacity = validEnvelope();
    poisonedCapacity.state.player.workCapacity.current = Number.POSITIVE_INFINITY;
    expect(validateSaveEnvelope(poisonedCapacity)).toBe(false);

    const poisonedTraversal = validEnvelope();
    poisonedTraversal.state.player.traversal.sprintStamina =
      PLAYER_TRAVERSAL_TUNING.maximumSprintStamina + 1;
    expect(validateSaveEnvelope(poisonedTraversal)).toBe(false);

    const poisonedXp = validEnvelope();
    poisonedXp.state.player.proficiencies.fishing = Number.NaN;
    expect(validateSaveEnvelope(poisonedXp)).toBe(false);

    const poisonedSchool = validEnvelope();
    poisonedSchool.state.world.activeSchools["school.bad"] = {
      id: "school.bad",
      habitatId: "lake",
      x: Number.NaN,
      z: 45,
      radius: 8,
      spawnedAtMinute: 480,
      expiresAtMinute: 660,
      remainingCatchPotential: 3,
      speciesWeights: [{ speciesId: "fish.trout", weight: 1 }]
    };
    expect(validateSaveEnvelope(poisonedSchool)).toBe(false);
  });

  it("rejects cargo pointers that disagree with the player or duplicate boat slots", () => {
    const playerPointerToBoatCargo = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    };
    const rowboat = playerPointerToBoatCargo.state.boats["boat.player_rowboat"];
    rowboat.fishCargoSlotIds[0] = "cargo.pointer_mismatch";
    playerPointerToBoatCargo.state.fishCargo["cargo.pointer_mismatch"] = {
      id: "cargo.pointer_mismatch",
      speciesId: "fish.trout",
      weightKg: 4.6,
      quality: "common",
      caughtAtMinute: 0,
      freshness: 100,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: rowboat.id, slotIndex: 0 }
    };
    playerPointerToBoatCargo.state.player.carriedFishCargoId = "cargo.pointer_mismatch";
    expect(validateSaveEnvelope(playerPointerToBoatCargo)).toBe(false);

    const duplicateBoatSlot = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: createInitialGameState()
    };
    const duplicateRowboat = duplicateBoatSlot.state.boats["boat.player_rowboat"];
    duplicateRowboat.fishCargoSlotIds[0] = "cargo.duplicate";
    duplicateRowboat.fishCargoSlotIds[1] = "cargo.duplicate";
    duplicateBoatSlot.state.fishCargo["cargo.duplicate"] = {
      id: "cargo.duplicate",
      speciesId: "fish.trout",
      weightKg: 4.6,
      quality: "common",
      caughtAtMinute: 0,
      freshness: 100,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: duplicateRowboat.id, slotIndex: 0 }
    };
    expect(validateSaveEnvelope(duplicateBoatSlot)).toBe(false);
  });

  it("migrates v5 saves to full traversal stamina without changing other player truth", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 5;
    legacy.player.money = 731;
    delete (legacy.player as Partial<typeof legacy.player>).traversal;
    const migrated = migrateSaveData({
      schemaVersion: 5,
      savedAtUtcMs: 1,
      state: legacy
    } as never);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.player.money).toBe(731);
    expect(migrated.state.player.traversal).toMatchObject({
      sprintStamina: PLAYER_TRAVERSAL_TUNING.maximumSprintStamina,
      sprintRecoveryDelaySeconds: 0,
      sprintExhausted: false,
      isGrounded: true
    });
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("migrates the v11 layout fixture by re-grounding land truth and preserving unrelated state", () => {
    const legacy = structuredClone(saveV11Layout3) as unknown as SaveEnvelope;
    const preserved = {
      playerX: legacy.state.player.x,
      playerZ: legacy.state.player.z,
      playerRotationY: legacy.state.player.rotationY,
      proficiencies: structuredClone(legacy.state.player.proficiencies),
      crops: structuredClone(legacy.state.crops),
      inventories: structuredClone(legacy.state.inventories),
      fishCargo: structuredClone(legacy.state.fishCargo),
      markets: structuredClone(legacy.state.markets),
      quests: structuredClone(legacy.state.quests),
      boats: structuredClone(legacy.state.boats),
      rngState: legacy.state.metadata.rngState
    };
    const migrated = migrateSaveData(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({
      x: preserved.playerX,
      z: preserved.playerZ,
      rotationY: preserved.playerRotationY
    });
    expect(migrated.state.player.proficiencies).toEqual(preserved.proficiencies);
    expect(migrated.state.player.y).toBeCloseTo(
      WorldLayout.terrainHeight(preserved.playerX, preserved.playerZ) + 0.5,
      6
    );
    const structure = migrated.state.world.structures["struct.fixture_workbench"];
    expect(structure).toMatchObject({ x: -48, z: -60, rotationY: 0.75 });
    expect(structure.y).toBeCloseTo(WorldLayout.terrainHeight(-48, -60), 6);
    expect(migrated.state.crops).toEqual(preserved.crops);
    expect(migrated.state.inventories).toEqual(preserved.inventories);
    expect(migrated.state.fishCargo).toEqual(preserved.fishCargo);
    expect(migrated.state.markets).toEqual(preserved.markets);
    expect(migrated.state.quests).toEqual(preserved.quests);
    expect(migrated.state.boats).toEqual(preserved.boats);
    expect(migrated.state.metadata.rngState).toBe(preserved.rngState);
  });

  it("migrates the v12 layout fixture by moving the mill and preserving unrelated state", () => {
    const legacy = structuredClone(saveV12Layout4) as unknown as SaveEnvelope;
    const preserved = {
      playerX: legacy.state.player.x,
      playerZ: legacy.state.player.z,
      playerRotationY: legacy.state.player.rotationY,
      millRotationY: legacy.state.world.structures["struct.starter_mill"].rotationY,
      workbench: structuredClone(legacy.state.world.structures["struct.fixture_workbench"]),
      crops: structuredClone(legacy.state.crops),
      rngState: legacy.state.metadata.rngState
    };
    const mill = starterStructureAnchor("struct.starter_mill")!;
    const migrated = migrateSaveData(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({
      x: preserved.playerX,
      z: preserved.playerZ,
      rotationY: preserved.playerRotationY
    });
    expect(migrated.state.world.structures["struct.starter_mill"]).toMatchObject({
      x: mill.x,
      z: mill.z,
      rotationY: preserved.millRotationY
    });
    expect(migrated.state.world.structures["struct.starter_mill"].y).toBeCloseTo(
      WorldLayout.terrainHeight(mill.x, mill.z),
      6
    );
    expect(migrated.state.world.structures["struct.fixture_workbench"]).toMatchObject({
      x: preserved.workbench.x,
      z: preserved.workbench.z,
      rotationY: preserved.workbench.rotationY
    });
    expect(migrated.state.crops).toEqual(preserved.crops);
    expect(migrated.state.metadata.rngState).toBe(preserved.rngState);
  });

  it("migrates the v13 layout fixture by moving the mill off the packed plaza", () => {
    const legacy = structuredClone(saveV13Layout5) as unknown as SaveEnvelope;
    const preserved = {
      playerX: legacy.state.player.x,
      playerZ: legacy.state.player.z,
      playerRotationY: legacy.state.player.rotationY,
      millRotationY: legacy.state.world.structures["struct.starter_mill"].rotationY,
      workbench: structuredClone(legacy.state.world.structures["struct.fixture_workbench"]),
      crops: structuredClone(legacy.state.crops),
      rngState: legacy.state.metadata.rngState
    };
    const mill = starterStructureAnchor("struct.starter_mill")!;
    const migrated = migrateSaveData(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({
      x: preserved.playerX,
      z: preserved.playerZ,
      rotationY: preserved.playerRotationY
    });
    expect(migrated.state.world.structures["struct.starter_mill"]).toMatchObject({
      x: mill.x,
      z: mill.z,
      rotationY: preserved.millRotationY
    });
    expect(migrated.state.world.structures["struct.starter_mill"].y).toBeCloseTo(
      WorldLayout.terrainHeight(mill.x, mill.z),
      6
    );
    expect(migrated.state.world.structures["struct.fixture_workbench"]).toMatchObject({
      x: preserved.workbench.x,
      z: preserved.workbench.z,
      rotationY: preserved.workbench.rotationY
    });
    expect(migrated.state.crops).toEqual(preserved.crops);
    expect(migrated.state.metadata.rngState).toBe(preserved.rngState);
  });

  it("migrates the v14 layout fixture to current station anchors without changing unrelated truth", () => {
    const legacy = structuredClone(saveV14Layout6) as unknown as SaveEnvelope;
    const preserved = {
      playerX: legacy.state.player.x,
      playerZ: legacy.state.player.z,
      playerRotationY: legacy.state.player.rotationY,
      workbench: structuredClone(legacy.state.world.structures["struct.fixture_workbench"]),
      crops: structuredClone(legacy.state.crops),
      inventories: structuredClone(legacy.state.inventories),
      fishCargo: structuredClone(legacy.state.fishCargo),
      markets: structuredClone(legacy.state.markets),
      quests: structuredClone(legacy.state.quests),
      boats: structuredClone(legacy.state.boats),
      rngState: legacy.state.metadata.rngState
    };

    const migrated = migrateSaveData(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({
      x: preserved.playerX,
      z: preserved.playerZ,
      rotationY: preserved.playerRotationY
    });
    expect(migrated.state.player.y).toBeCloseTo(
      WorldLayout.terrainHeight(preserved.playerX, preserved.playerZ) + 0.5,
      6
    );
    for (const stationId of ["struct.starter_mill", "struct.workbench", "struct.starter_compost"]) {
      const anchor = starterStructureAnchor(stationId)!;
      expect(migrated.state.world.structures[stationId]).toMatchObject({ x: anchor.x, z: anchor.z });
      expect(migrated.state.world.structures[stationId].y).toBeCloseTo(
        WorldLayout.terrainHeight(anchor.x, anchor.z),
        6
      );
    }
    expect(migrated.state.world.structures[HARBOR_FISH_TABLE.structureId]).toMatchObject({
      x: HARBOR_FISH_TABLE.position.x,
      z: HARBOR_FISH_TABLE.position.z
    });
    expect(migrated.state.world.structures["struct.fixture_workbench"]).toMatchObject({
      x: preserved.workbench.x,
      z: preserved.workbench.z,
      rotationY: preserved.workbench.rotationY
    });
    expect(migrated.state.crops).toEqual(preserved.crops);
    expect(migrated.state.inventories).toEqual(preserved.inventories);
    expect(migrated.state.fishCargo).toEqual(preserved.fishCargo);
    expect(migrated.state.markets).toEqual(preserved.markets);
    expect(migrated.state.quests).toEqual(preserved.quests);
    expect(migrated.state.boats).toEqual(preserved.boats);
    expect(migrated.state.metadata.rngState).toBe(preserved.rngState);
  });

  it("leaves active-boat waterline and player height unchanged in the v12 layout migration", () => {
    const legacy = structuredClone(saveV11Layout3) as unknown as SaveEnvelope;
    legacy.state.player.activeBoatId = "boat.fixture";
    legacy.state.player.y = 0.5;
    const boatBefore = structuredClone(legacy.state.boats["boat.fixture"]);
    const migrated = migrateSaveData(legacy);

    expect(migrated.state.player.y).toBe(0.5);
    expect(migrated.state.boats["boat.fixture"]).toEqual(boatBefore);
  });


  it("migrates a v10 trout stack that fits in 1 carry plus boat holds into cargo", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 10;
    const inventory = legacy.inventories[legacy.player.inventoryId];
    const holdSlots = legacy.boats["boat.player_rowboat"].fishCargoSlotIds.length;
    const capacity = 1 + holdSlots;
    inventory.slots[0] = { itemId: "fish.trout", quantity: capacity };
    const migrated = migrateSaveData({ schemaVersion: 10, savedAtUtcMs: 1, state: legacy });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.inventories[migrated.state.player.inventoryId].slots[0].itemId).toBeUndefined();
    const troutCargo = Object.values(migrated.state.fishCargo).filter((cargo) => cargo.speciesId === "fish.trout");
    expect(troutCargo).toHaveLength(capacity);
    expect(migrated.state.player.carriedFishCargoId).toBeTruthy();
  });

  it("fails schema 11 trout migration when quantity exceeds 1 carry plus boat holds", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 10;
    const inventory = legacy.inventories[legacy.player.inventoryId];
    const holdSlots = legacy.boats["boat.player_rowboat"].fishCargoSlotIds.length;
    const overflow = 1 + holdSlots + 1;
    inventory.slots[0] = { itemId: "fish.trout", quantity: overflow };
    const slotBefore = { ...inventory.slots[0] };
    expect(() => migrateSaveData({ schemaVersion: 10, savedAtUtcMs: 1, state: legacy } as never)).toThrow(
      /fish\.trout quantity .* exceeds player carry and boat hold capacity/
    );
    expect(inventory.slots[0]).toEqual(slotBefore);
  });

  it("migrates v10 trout stacks into skiff holds without using external hooks", () => {
    const legacy = structuredClone(createInitialGameState());
    legacy.schemaVersion = 10;
    const rowboat = legacy.boats["boat.player_rowboat"];
    const skiffSupplyId = "inv.skiff_supply";
    legacy.inventories[skiffSupplyId] = {
      id: skiffSupplyId,
      slotCount: 8,
      slots: Array.from({ length: 8 }, () => ({}))
    };
    legacy.boats["boat.player_skiff"] = {
      ...structuredClone(rowboat),
      id: "boat.player_skiff",
      boatTypeId: "boat.skiff",
      fishCargoSlotIds: Array.from({ length: 6 }, () => null),
      supplyInventoryId: skiffSupplyId,
      isDocked: false,
      dockedMarketId: null
    };
    legacy.player.activeBoatId = "boat.player_skiff";
    legacy.inventories[legacy.player.inventoryId].slots[0] = { itemId: "fish.trout", quantity: 5 };

    const migrated = migrateSaveData({ schemaVersion: 10, savedAtUtcMs: 1, state: legacy });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrated.state.boats["boat.player_skiff"].fishCargoSlotIds.slice(0, 4).every(Boolean)).toBe(true);
    expect(migrated.state.boats["boat.player_skiff"].fishCargoSlotIds.slice(4)).toEqual([null, null]);
    for (const cargoId of migrated.state.boats["boat.player_skiff"].fishCargoSlotIds.slice(0, 4)) {
      expect(cargoId && migrated.state.fishCargo[cargoId]?.location).toMatchObject({
        type: "boat-hold",
        containerId: "boat.player_skiff"
      });
    }
  });

  it("maps a complete pre-release v6 world into layout revision 3 without discarding simulation truth", () => {
    const legacy = structuredClone(createInitialGameState(91827));
    legacy.schemaVersion = 6;
    delete (legacy.world as Partial<typeof legacy.world>).layoutRevision;

    legacy.player.x = 10;
    legacy.player.y = 0.5;
    legacy.player.z = 60;
    legacy.player.currentRegionId = "region.coast";
    legacy.player.activeBoatId = "boat.active_skiff";
    legacy.player.money = 847;
    legacy.player.proficiencies.fishing = 731;

    legacy.crops["crop.v6_wheat"] = {
      id: "crop.v6_wheat",
      cropId: "crop.wheat",
      farmId: "farm.starter_garden",
      x: 1.25,
      z: -1.75,
      rotationRadians: 0.42,
      plantedAtMinute: 410,
      lastUpdatedMinute: 470,
      effectiveGrowthMinutes: 44,
      moisture: 63,
      health: 92,
      stage: "growing",
      averageMoistureAccum: 3010,
      moistureSampleCount: 48
    };
    legacy.farms["farm.starter_garden"].placedCropIds.push("crop.v6_wheat");
    legacy.world.structures["struct.starter_mill"].x = 2;
    legacy.world.structures["struct.starter_mill"].z = -3;
    legacy.world.structures["struct.v6_custom"] = {
      id: "struct.v6_custom",
      type: "workbench",
      x: 2.5,
      y: 0,
      z: 1.5
    };
    legacy.farms["farm.starter_garden"].placedStructureIds.push("struct.v6_custom");

    const boatTemplate = legacy.boats["boat.player_rowboat"];
    legacy.boats["boat.active_skiff"] = {
      ...structuredClone(boatTemplate),
      id: "boat.active_skiff",
      x: 10,
      z: 60,
      headingRadians: 1.17,
      speed: 2.4,
      fuel: 37,
      durability: 72,
      isDocked: false,
      dockedMarketId: null,
      fishCargoSlotIds: ["cargo.v6_trout", null]
    };
    legacy.boats["boat.player_rowboat"].x = 35;
    legacy.boats["boat.player_rowboat"].z = 45;
    legacy.fishCargo["cargo.v6_trout"] = {
      id: "cargo.v6_trout",
      speciesId: "fish.trout",
      weightKg: 4.6,
      quality: "exceptional",
      caughtAtMinute: 462,
      freshness: 88,
      cargoClass: "small",
      location: { type: "boat-hold", containerId: "boat.active_skiff", slotIndex: 0 }
    };

    legacy.world.activeSchools["school.v6_coast"] = {
      id: "school.v6_coast",
      habitatId: "coast",
      x: 10,
      z: 65,
      radius: 9,
      spawnedAtMinute: 450,
      expiresAtMinute: 660,
      feedingFrenzyUntilMinute: 510,
      remainingCatchPotential: 2,
      speciesWeights: [{ speciesId: "fish.trout", weight: 1 }]
    };
    legacy.sportFishing = {
      fish: { instanceId: "fish.v6_active", speciesId: "fish.trout", weightKg: 4.6, quality: "fine" },
      rodId: "rod.willow",
      stamina: 72,
      maxStamina: 100,
      distanceMeters: 11,
      lineTension: 48,
      lineIntegrity: 91,
      fishDirection: 0.7,
      behavior: "run-left",
      behaviorUntilSeconds: 2.1,
      elapsedSeconds: 4.2,
      rodDirectionAngle: -0.4,
      isReeling: true,
      isSlacking: false,
      isBracing: false,
      slackTimerSeconds: 0,
      snapTimerSeconds: 0,
      result: "active"
    };

    const preserved = {
      crop: structuredClone(legacy.crops["crop.v6_wheat"]),
      cargo: structuredClone(legacy.fishCargo["cargo.v6_trout"]),
      fishing: structuredClone(legacy.sportFishing),
      inventory: structuredClone(legacy.inventories[legacy.player.inventoryId]),
      markets: structuredClone(legacy.markets),
      rngState: legacy.metadata.rngState
    };
    const migrated = migrateSaveData({ schemaVersion: 6, savedAtUtcMs: 2, state: legacy });

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);

    expect(migrated.state.crops["crop.v6_wheat"]).toEqual(preserved.crop);
    expect(migrated.state.world.structures["struct.starter_mill"]).toMatchObject({
      x: starterStructureAnchor("struct.starter_mill")!.x,
      z: starterStructureAnchor("struct.starter_mill")!.z
    });
    expect(migrated.state.world.structures["struct.v6_custom"]).toMatchObject({ x: -62.5, z: -53.5 });
    expect(migrated.state.boats["boat.player_rowboat"]).toMatchObject({
      x: HARBOR_DOCK.boatPosition.x,
      z: HARBOR_DOCK.boatPosition.z,
      isDocked: true,
      speed: 0
    });
    const activeBoat = migrated.state.boats["boat.active_skiff"];
    expect(WorldLayout.isSailable(activeBoat.x, activeBoat.z)).toBe(true);
    expect(activeBoat).toMatchObject({
      headingRadians: 1.17,
      speed: 2.4,
      fuel: 37,
      durability: 72,
      fishCargoSlotIds: ["cargo.v6_trout", null]
    });
    expect(migrated.state.player).toMatchObject({
      x: activeBoat.x,
      z: activeBoat.z,
      activeBoatId: "boat.active_skiff",
      money: 847
    });
    expect(migrated.state.world.activeSchools["school.v6_coast"]).toMatchObject({
      id: "school.v6_coast",
      habitatId: "coast",
      spawnedAtMinute: 450,
      expiresAtMinute: 660,
      feedingFrenzyUntilMinute: 510,
      remainingCatchPotential: 2
    });
    expect(migrated.state.sportFishing).toEqual(preserved.fishing);
    expect(migrated.state.fishCargo["cargo.v6_trout"]).toEqual(preserved.cargo);
    expect(migrated.state.inventories[migrated.state.player.inventoryId]).toEqual(preserved.inventory);
    expect(migrated.state.markets).toEqual(preserved.markets);
    expect(migrated.state.metadata.rngState).toBe(preserved.rngState);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });
});

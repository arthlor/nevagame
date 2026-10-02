import { describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { Simulation } from "../../src/simulation/Simulation";
import type { WorkCapacityState } from "../../src/simulation/core/types";
import {
  applyOfflineWorkRegen,
  applyPassiveWorkRegen,
  earnWorkCapacity,
  quoteEarnWorkCapacity,
  restoreWorkOnRest
} from "../../src/simulation/domains/ProgressionDomain";
import { applyOfflineProgression, MAX_OFFLINE_MS } from "../../src/persistence/offlineDelta";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateWorkRecovery80 } from "../../src/persistence/migrateWorkRecovery80";
import * as recoveryMigration from "../../src/persistence/migrateWorkRecovery80";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v79_work_recovery_predecessor.json";

function work(): WorkCapacityState {
  return {
    current: 100, maximum: 750, regeneratedAtMinute: 480,
    passiveRegenSeconds: 0, offlineRegenSeconds: 0,
    earningsDay: 0, earnedToday: 300, mealsToday: 3, laborUsedToday: ["labor.firewood"]
  };
}

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("real-time Work recovery", () => {
  it("grants ten online and five offline per five real minutes, outside the earned cap", () => {
    const capacity = work();
    expect(applyPassiveWorkRegen(capacity, 299.5)).toBe(0);
    expect(applyPassiveWorkRegen(capacity, 0.5)).toBe(10);
    expect(applyOfflineWorkRegen(capacity, 299)).toBe(0);
    expect(applyOfflineWorkRegen(capacity, 1)).toBe(5);
    expect(capacity.current).toBe(115);
    expect(capacity.earnedToday).toBe(300);
    expect(capacity.mealsToday).toBe(3);
    expect(capacity.laborUsedToday).toEqual(["labor.firewood"]);
  });

  it("preserves independent partial intervals across online/offline transitions", () => {
    const capacity = work();
    applyPassiveWorkRegen(capacity, 290);
    applyOfflineWorkRegen(capacity, 10);
    expect(capacity.current).toBe(100);
    expect(capacity.passiveRegenSeconds).toBe(290);
    expect(capacity.offlineRegenSeconds).toBe(10);
    expect(applyOfflineWorkRegen(capacity, 290)).toBe(5);
    expect(applyPassiveWorkRegen(capacity, 10)).toBe(10);
    expect(capacity.current).toBe(115);
  });

  it("discards both partial intervals at the ceiling and never banks full-pool time", () => {
    const capacity = work();
    Object.assign(capacity, { current: 747, passiveRegenSeconds: 290, offlineRegenSeconds: 250 });
    expect(applyPassiveWorkRegen(capacity, 40)).toBe(3);
    expect(capacity).toMatchObject({ current: 750, passiveRegenSeconds: 0, offlineRegenSeconds: 0 });
    applyOfflineWorkRegen(capacity, 900);
    capacity.current = 700;
    expect(applyOfflineWorkRegen(capacity, 299)).toBe(0);
    expect(applyPassiveWorkRegen(capacity, 299)).toBe(0);
    expect(capacity.current).toBe(700);
  });

  it("discards recovery carry when an earned boost, manual rest or refund fills the pool", () => {
    const earned = work();
    Object.assign(earned, { current: 745, earnedToday: 0, passiveRegenSeconds: 299, offlineRegenSeconds: 299 });
    expect(earnWorkCapacity(earned, 10, 480)).toBe(5);
    expect(earned).toMatchObject({ current: 750, passiveRegenSeconds: 0, offlineRegenSeconds: 0 });
    const rested = work();
    Object.assign(rested, { current: 700, passiveRegenSeconds: 299, offlineRegenSeconds: 299 });
    expect(restoreWorkOnRest(rested, 1920)).toBe(50);
    expect(rested).toMatchObject({ current: 750, passiveRegenSeconds: 0, offlineRegenSeconds: 0 });
    const sim = new Simulation();
    Object.assign(sim.state.player.workCapacity, { current: 745, passiveRegenSeconds: 299, offlineRegenSeconds: 299 });
    sim.progression.creditWork(10);
    expect(sim.state.player.workCapacity).toMatchObject({ current: 750, passiveRegenSeconds: 0, offlineRegenSeconds: 0 });
  });

  it("recovers while paused and accepts a real elapsed gap separately from a bounded gameplay step", () => {
    const sim = new Simulation();
    sim.state.player.workCapacity.current = 100;
    const minute = sim.clock.getState().currentMinute;
    sim.clock.setPaused(true);
    sim.tick(0.1, 300);
    expect(sim.state.clock.currentMinute).toBe(minute);
    expect(sim.state.player.workCapacity.current).toBe(110);
    sim.clock.setPaused(false);
    sim.tick(0.1, 300);
    expect(sim.state.clock.currentMinute).toBe(minute);
    expect(sim.state.player.workCapacity.current).toBe(120);
    sim.advanceGameMinutes(1440);
    expect(sim.state.player.workCapacity.current).toBe(120);
  });

  it("ignores invalid elapsed input", () => {
    const capacity = work();
    const before = structuredClone(capacity);
    for (const seconds of [-10, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyPassiveWorkRegen(capacity, seconds)).toBe(0);
      expect(applyOfflineWorkRegen(capacity, seconds)).toBe(0);
    }
    expect(capacity).toEqual(before);
  });

  it("processes sub-minute and frozen-clock offline time once, including after a backward clock correction", () => {
    const state = createInitialGameState();
    state.player.workCapacity.current = 100;
    state.metadata.lastSavedUtcMs = 1_000_000;
    state.clock.minutesPerRealSecond = 0;
    const minute = state.clock.currentMinute;
    applyOfflineProgression(state, 1_299_000);
    expect(state.player.workCapacity).toMatchObject({ current: 100, offlineRegenSeconds: 299 });
    applyOfflineProgression(state, 1_299_000);
    applyOfflineProgression(state, 1_250_000);
    expect(state.player.workCapacity.offlineRegenSeconds).toBe(299);
    expect(state.metadata.lastSavedUtcMs).toBe(1_299_000);
    expect(applyOfflineProgression(state, 1_300_000).workRecovered).toBe(5);
    expect(state.player.workCapacity).toMatchObject({ current: 105, offlineRegenSeconds: 0 });
    expect(state.clock.currentMinute).toBe(minute);
  });

  it("caps offline recovery at the existing maximum absence and consumes the complete timestamp", () => {
    const state = createInitialGameState();
    Object.assign(state.player.workCapacity, { current: 0, maximum: 10_000 });
    state.clock.minutesPerRealSecond = 0;
    state.metadata.lastSavedUtcMs = 0;
    applyOfflineProgression(state, MAX_OFFLINE_MS * 2);
    expect(state.player.workCapacity.current).toBe(4_320);
    expect(state.metadata.lastSavedUtcMs).toBe(MAX_OFFLINE_MS * 2);
    applyOfflineProgression(state, MAX_OFFLINE_MS * 2);
    expect(state.player.workCapacity.current).toBe(4_320);
  });

  it("previews earned Work without changing tallies and matches the eventual grant", () => {
    const capacity = work();
    Object.assign(capacity, { current: 744, earnedToday: 298 });
    const before = structuredClone(capacity);
    expect(quoteEarnWorkCapacity(capacity, 10, 480)).toBe(2);
    expect(quoteEarnWorkCapacity(capacity, 10, 1440)).toBe(6);
    expect(capacity).toEqual(before);
    expect(earnWorkCapacity(capacity, 10, 1440)).toBe(6);
    expect(capacity.earnedToday).toBe(6);
    expect(capacity.earningsDay).toBe(1);
  });
});

describe("schema 80 Work recovery persistence", () => {
  it("migrates an independently valid v79 fixture without refilling or changing the world", () => {
    const before = legacy();
    expect(before.schemaVersion).toBe(79);
    expect(validateSaveEnvelope(before)).toBe(true);
    const after = migrateSaveData(before);
    const expected = structuredClone(before);
    expected.schemaVersion = expected.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expected.state.player.workCapacity.offlineRegenSeconds = 0;
    expect(after).toEqual(expected);
    expect(after.state.player.workCapacity).toMatchObject({ current: 123, passiveRegenSeconds: 149.25, offlineRegenSeconds: 0, earnedToday: 75 });
    expect(after.state.world.layoutRevision).toBe(43);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
    expect(before).toEqual(legacy());
  });

  it("normalizes legacy whole intervals and discards carry from a full pool", () => {
    const state = legacy().state;
    state.player.workCapacity.passiveRegenSeconds = 749.5;
    expect(migrateWorkRecovery80(state).player.workCapacity.passiveRegenSeconds).toBe(149.5);
    const full = legacy().state;
    full.player.workCapacity.current = full.player.workCapacity.maximum;
    expect(migrateWorkRecovery80(full).player.workCapacity).toMatchObject({ passiveRegenSeconds: 0, offlineRegenSeconds: 0 });
  });

  it("backfills the conservative paid basic-cast snapshot while leaving an uncharged cast alone", () => {
    const paid = legacy();
    paid.state.basicFishing = { ecologyId: "ecology.neva", habitatId: "river", phase: "waiting-bite", remainingSeconds: 5, willCatch: false };
    expect(validateSaveEnvelope(paid)).toBe(true);
    const migrated = migrateSaveData(paid);
    expect(migrated.state.basicFishing?.workCharged).toBe(10);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    const charging = legacy();
    charging.state.basicFishing = { ecologyId: "ecology.neva", habitatId: "river", phase: "charging-cast", remainingSeconds: 0, willCatch: false };
    expect(migrateSaveData(charging).state.basicFishing?.workCharged).toBeUndefined();
  });

  it("requires finite recovery remainders smaller than one interval in current saves", () => {
    const valid = migrateSaveData(legacy());
    for (const key of ["passiveRegenSeconds", "offlineRegenSeconds"] as const) {
      for (const invalid of [undefined, -1, 300, Number.NaN, Number.POSITIVE_INFINITY]) {
        const poisoned = structuredClone(valid);
        poisoned.state.player.workCapacity[key] = invalid;
        expect(validateSaveEnvelope(poisoned), `${key}=${invalid}`).toBe(false);
      }
    }
  });

  it("freezes online carry and its exact UTC anchor before asynchronous saving, then resumes each rate once", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const repository = new IndexedDbSaveRepository();
      const state = migrateSaveData(legacy()).state;
      state.clock.minutesPerRealSecond = 0;
      state.player.workCapacity.current = 100;
      state.player.workCapacity.passiveRegenSeconds = 0;
      applyPassiveWorkRegen(state.player.workCapacity, 299.5);
      const saving = repository.saveGame(state, undefined, 1_000_000);
      applyPassiveWorkRegen(state.player.workCapacity, 0.5);
      expect(await saving).toBe(true);
      const loaded = await repository.loadGame();
      expect(loaded?.savedAtUtcMs).toBe(1_000_000);
      expect(loaded?.state.metadata.lastSavedUtcMs).toBe(1_000_000);
      expect(loaded?.state.player.workCapacity).toMatchObject({ current: 100, passiveRegenSeconds: 299.5 });
      const resumed = loaded!.state;
      applyOfflineProgression(resumed, 1_300_000);
      applyOfflineProgression(resumed, 1_300_000);
      expect(resumed.player.workCapacity.current).toBe(105);
      applyPassiveWorkRegen(resumed.player.workCapacity, 0.5);
      expect(resumed.player.workCapacity.current).toBe(115);
      expect(validateSaveEnvelope({ ...loaded!, state: resumed })).toBe(true);
    } finally {
      restore();
    }
  });

  it("preserves both save slots and falls back to backup when Work recovery migration fails", async () => {
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
    const migration = vi.spyOn(recoveryMigration, "migrateWorkRecovery80").mockImplementation(() => {
      throw new Error("Forced Work recovery migration failure");
    });
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
      migration.mockRestore(); error.mockRestore(); warning.mockRestore(); db.close(); restore();
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { GameApp } from "../../src/app/GameApp";
import { applyPassiveWorkRegen } from "../../src/simulation/domains/ProgressionDomain";
import type { WorkCapacityState } from "../../src/simulation/core/types";
import { localeStore } from "../../src/i18n/localeStore";
import type { OfflineProgressionSummary } from "../../src/persistence/offlineDelta";

type RecoveryMethods = {
  takeOnlineWorkSeconds: (nowUtcMs?: number) => number;
  saveCurrentGame: (signal?: AbortSignal) => Promise<boolean>;
  notifyAwaySummary: (summary: OfflineProgressionSummary) => void;
};
const methods = GameApp.prototype as unknown as RecoveryMethods;

function appAt(utcMs: number) {
  const capacity: WorkCapacityState = {
    current: 100, maximum: 750, regeneratedAtMinute: 480,
    passiveRegenSeconds: 0, offlineRegenSeconds: 0
  };
  return Object.assign(Object.create(GameApp.prototype), {
    bootReady: true,
    isRunning: true,
    lastWorkRecoveryUtcMs: utcMs,
    sim: {
      state: { player: { workCapacity: capacity }, metadata: { lastSavedUtcMs: utcMs } },
      progression: { tickPassiveWorkRegen: (seconds: number) => applyPassiveWorkRegen(capacity, seconds) }
    },
    saveRepo: { saveGame: vi.fn(async () => true) }
  });
}

describe("ready-game Work recovery clock", () => {
  afterEach(() => { vi.restoreAllMocks(); localeStore.set("en"); });

  it("counts a throttled/background elapsed gap once, independently of presentation time", () => {
    const app = appAt(1_000_000);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_000_100)).toBe(0.1);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_300_100)).toBe(300);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_300_100)).toBe(0);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_250_100)).toBe(0);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_300_600)).toBe(0.5);
  });

  it("excludes title/loading and stopped lifecycle states", () => {
    const app = appAt(1_000_000);
    app.bootReady = false;
    expect(methods.takeOnlineWorkSeconds.call(app, 1_300_000)).toBe(0);
    expect(app.lastWorkRecoveryUtcMs).toBe(1_000_000);
    app.bootReady = true;
    app.isRunning = false;
    expect(methods.takeOnlineWorkSeconds.call(app, 1_300_000)).toBe(0);
  });

  it("accounts time up to the save snapshot and passes that exact anchor to persistence", async () => {
    const app = appAt(1_000_000);
    vi.spyOn(Date, "now").mockReturnValue(1_300_500);
    const signal = new AbortController().signal;
    expect(await methods.saveCurrentGame.call(app, signal)).toBe(true);
    expect(app.sim.state.player.workCapacity).toMatchObject({ current: 110, passiveRegenSeconds: 0.5 });
    expect(app.saveRepo.saveGame).toHaveBeenCalledWith(app.sim.state, signal, 1_300_500);
    expect(methods.takeOnlineWorkSeconds.call(app, 1_301_000)).toBe(0.5);
  });

  it("never moves the persisted anchor backward after a system-clock correction", async () => {
    const app = appAt(1_300_000);
    vi.spyOn(Date, "now").mockReturnValue(1_250_000);
    await methods.saveCurrentGame.call(app);
    expect(app.saveRepo.saveGame).toHaveBeenCalledWith(app.sim.state, undefined, 1_300_000);
    expect(app.sim.state.player.workCapacity.current).toBe(100);
  });

  it("shows the actual offline grant through the shared notice path, even with a frozen world clock", () => {
    const app = { notify: vi.fn() };
    const summary: OfflineProgressionSummary = {
      elapsedRealMinutes: 5, simulatedGameMinutes: 0, workRecovered: 3,
      cropsMaturedCount: 0, cropsWitheredCount: 0, jobsCompletedCount: 0,
      cargoSpoiledCount: 0, contractsExpiredCount: 0
    };
    methods.notifyAwaySummary.call(app, summary);
    expect(app.notify).toHaveBeenLastCalledWith("While you were away · +3 Work recovered", "info", 6000);
    localeStore.set("tr");
    methods.notifyAwaySummary.call(app, summary);
    expect(app.notify).toHaveBeenLastCalledWith("Uzakta olduğun sürede · +3 Emek", "info", 6000);
    app.notify.mockClear();
    methods.notifyAwaySummary.call(app, { ...summary, workRecovered: 0 });
    expect(app.notify).not.toHaveBeenCalled();
  });
});

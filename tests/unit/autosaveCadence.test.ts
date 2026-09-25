import { afterEach, describe, expect, it, vi } from "vitest";
import { GameApp } from "../../src/app/GameApp";

type AutosaveMethods = {
  requestAutosave: () => void;
  flushAutosave: () => Promise<void>;
  requestPeriodicAutosave: (nowMs: number) => void;
};

const methods = GameApp.prototype as unknown as AutosaveMethods;

function fakeApp(saveGame: () => Promise<boolean>) {
  const notify = vi.fn();
  const app = {
    isRunning: true,
    bootReady: true,
    persistenceDisabled: false,
    durableWritesEnabled: true,
    autosaveInFlight: false,
    autosaveRequested: false,
    autosaveFlushQueued: false,
    lastAutosaveMs: 0,
    lastPeriodicAutosaveRequestMs: Number.NEGATIVE_INFINITY,
    autosaveFailureNotified: false,
    saveRepo: { saveGame: vi.fn(saveGame) },
    // The repository is faked, so the saved state is never inspected.
    sim: { state: {} },
    notify,
    requestAutosave: methods.requestAutosave,
    flushAutosave: methods.flushAutosave
  };
  return app;
}

/** Runs the periodic trigger once per simulated frame, letting each flush settle. */
async function runFrames(app: ReturnType<typeof fakeApp>, clock: { now: number }, untilMs: number, stepMs: number) {
  for (; clock.now <= untilMs; clock.now += stepMs) {
    methods.requestPeriodicAutosave.call(app, clock.now);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("periodic autosave cadence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries a refused periodic autosave once per interval instead of every frame", async () => {
    const clock = { now: 0 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const app = fakeApp(async () => false);

    await runFrames(app, clock, 150_000, 250);

    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(2);
    expect(app.notify).toHaveBeenCalledTimes(1);
    expect(app.notify.mock.calls[0]?.[1]).toBe("warning");
  });

  it("keeps the normal cadence after success and warns again on a new failure run", async () => {
    const clock = { now: 0 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const results = [false, true, false];
    const app = fakeApp(async () => results.shift() ?? true);

    await runFrames(app, clock, 185_000, 250);

    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(3);
    expect(app.notify).toHaveBeenCalledTimes(2);
    expect(app.lastAutosaveMs).toBe(120_000);
  });

  it("does not save early after a recent success", async () => {
    const clock = { now: 0 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const app = fakeApp(async () => true);
    app.lastAutosaveMs = 50_000;

    await runFrames(app, clock, 109_000, 250);
    expect(app.saveRepo.saveGame).not.toHaveBeenCalled();

    await runFrames(app, clock, 111_000, 250);
    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(1);
    expect(app.notify).not.toHaveBeenCalled();
  });

  it("throttles event-triggered retries after a failed write and resumes after the retry interval", async () => {
    const clock = { now: 70_000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const app = fakeApp(async () => false);

    methods.requestAutosave.call(app);
    await new Promise((resolve) => setImmediate(resolve));
    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 10; index += 1) methods.requestAutosave.call(app);
    await new Promise((resolve) => setImmediate(resolve));
    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(1);

    clock.now += 60_000;
    methods.requestAutosave.call(app);
    await new Promise((resolve) => setImmediate(resolve));
    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(2);
    expect(app.notify).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected storage call as a failed write instead of an unhandled rejection", async () => {
    const clock = { now: 60_000 };
    vi.spyOn(performance, "now").mockImplementation(() => clock.now);
    const app = fakeApp(async () => { throw new Error("storage unavailable"); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    methods.requestAutosave.call(app);
    await new Promise((resolve) => setImmediate(resolve));

    expect(app.saveRepo.saveGame).toHaveBeenCalledTimes(1);
    expect(app.notify).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("[GameApp] Autosave failed", expect.any(Error));
  });
});

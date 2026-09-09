import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioManager } from "../../src/audio/AudioManager";

interface ContextHarness {
  state: AudioContextState;
  currentTime: number;
  resume: () => Promise<void>;
  suspend: () => Promise<void>;
  close: () => Promise<void>;
}

const managers: AudioManager[] = [];

function createHarness() {
  const context: ContextHarness = {
    state: "suspended",
    currentTime: 0,
    resume: vi.fn(async () => { context.state = "running"; }),
    suspend: vi.fn(async () => { context.state = "suspended"; }),
    close: vi.fn(async () => { context.state = "closed"; })
  };
  const manager = new AudioManager();
  managers.push(manager);
  const harness = manager as unknown as {
    context: ContextHarness | null;
    startTheme: () => void;
    startAmbience: () => void;
    startLoopCue: () => Promise<void>;
  };
  harness.context = context;
  const startTheme = vi.spyOn(harness, "startTheme").mockImplementation(() => {});
  const startAmbience = vi.spyOn(harness, "startAmbience").mockImplementation(() => {});
  const startLoopCue = vi.spyOn(harness, "startLoopCue").mockResolvedValue();
  return { manager, context, startTheme, startAmbience, startLoopCue };
}

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AudioManager lifecycle", () => {
  it("resumes a context suspended after an earlier successful unlock", async () => {
    const { manager, context } = createHarness();
    await manager.unlock();
    expect(context.state).toBe("running");
    context.state = "suspended";

    await manager.unlock();

    expect(context.state).toBe("running");
    expect(context.resume).toHaveBeenCalledTimes(2);
  });

  it("shares a pending resume attempt without resuming an already running context", async () => {
    const { manager, context } = createHarness();
    let resolveResume!: () => void;
    const pending = new Promise<void>((resolve) => { resolveResume = resolve; });
    vi.mocked(context.resume).mockImplementationOnce(async () => {
      await pending;
      context.state = "running";
    });
    const first = manager.unlock();
    const second = manager.unlock();
    expect(second).toBe(first);
    expect(context.resume).toHaveBeenCalledTimes(1);
    resolveResume();
    await Promise.all([first, second]);
    await manager.unlock();
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh unlock after a rejected resume", async () => {
    const { manager, context } = createHarness();
    const failure = new Error("Resume denied");
    vi.mocked(context.resume).mockRejectedValueOnce(failure);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    await manager.unlock();
    expect(warning).toHaveBeenCalledWith("Audio could not be started.", failure);
    expect(context.state).toBe("suspended");
    await manager.unlock();
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(context.state).toBe("running");
  });

  it("handles a visibility-resume rejection and permits later user-input recovery", async () => {
    const { manager, context, startLoopCue } = createHarness();
    await manager.unlock();
    context.state = "suspended";
    manager.setActionLoop("fishing-reel", true);
    const failure = new Error("Visibility resume denied");
    vi.mocked(context.resume).mockRejectedValueOnce(failure);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(warning).toHaveBeenCalledWith("Audio could not be started.", failure));
    expect(startLoopCue).not.toHaveBeenCalled();
    await manager.unlock();
    expect(context.resume).toHaveBeenCalledTimes(3);
    expect(context.state).toBe("running");
  });

  it("restores requested action loops with their positions after visibility resume", async () => {
    const { manager, context, startLoopCue } = createHarness();
    const position = { x: 4, y: 0, z: 8 };
    manager.setActionLoop("boat-row", true, position);

    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(startLoopCue).toHaveBeenCalledExactlyOnceWith("boat-row", position));
    expect(context.state).toBe("running");
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it("handles a rejected hidden-tab suspension without an unhandled rejection", async () => {
    const { manager, context } = createHarness();
    await manager.unlock();
    const failure = new Error("Suspension denied");
    vi.mocked(context.suspend).mockRejectedValueOnce(failure);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.assign(document, { visibilityState: "hidden" });

    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(warning).toHaveBeenCalledWith("Audio could not be suspended.", failure));
  });

  it("does not restart music, ambience or actions after disposal during resume", async () => {
    const { manager, context, startTheme, startAmbience, startLoopCue } = createHarness();
    let resolveResume!: () => void;
    const pending = new Promise<void>((resolve) => { resolveResume = resolve; });
    vi.mocked(context.resume).mockReturnValueOnce(pending);
    manager.setActionLoop("boat-row", true);
    document.dispatchEvent(new Event("visibilitychange"));
    const unlocking = manager.unlock();
    manager.dispose();
    resolveResume();
    await unlocking;

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(startTheme).not.toHaveBeenCalled();
    expect(startAmbience).not.toHaveBeenCalled();
    expect(startLoopCue).not.toHaveBeenCalled();
  });
});

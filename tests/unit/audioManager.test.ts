import { describe, expect, it, vi } from "vitest";
import { AudioManager } from "../../src/audio/AudioManager";

type LoopVoice = {
  source: { stop: ReturnType<typeof vi.fn>; disconnect: () => void };
  gain: {
    gain: { cancelScheduledValues: () => void; linearRampToValueAtTime: () => void };
    disconnect: () => void;
  };
  panner: null;
};

type AudioHarness = {
  context: { state: AudioContextState; currentTime: number; close: () => Promise<void> } | null;
  loops: Map<string, LoopVoice>;
  actionLoops: Map<string, unknown>;
};

function fakeVoice(): LoopVoice {
  return {
    source: { stop: vi.fn(), disconnect: () => undefined },
    gain: {
      gain: {
        cancelScheduledValues: () => undefined,
        linearRampToValueAtTime: () => undefined
      },
      disconnect: () => undefined
    },
    panner: null
  };
}

function harnessOf(manager: AudioManager): AudioHarness {
  return manager as unknown as AudioHarness;
}

describe("AudioManager.setActionLoop", () => {
  it("stops a reel/row loop when disabled even if AudioContext is suspended", () => {
    const manager = new AudioManager();
    const harness = harnessOf(manager);
    const voice = fakeVoice();
    harness.context = { state: "suspended", currentTime: 1.25, close: () => Promise.resolve() };
    harness.loops.set("fishing-reel", voice);
    harness.actionLoops.set("fishing-reel", true);

    manager.setActionLoop("fishing-reel", false);

    expect(harness.actionLoops.has("fishing-reel")).toBe(false);
    expect(harness.loops.has("fishing-reel")).toBe(false);
    expect(voice.source.stop).toHaveBeenCalled();
    manager.dispose();
  });

  it("keeps a still-requested loop recorded so resume can restart it", () => {
    const manager = new AudioManager();
    const harness = harnessOf(manager);
    harness.context = { state: "suspended", currentTime: 0, close: () => Promise.resolve() };
    manager.setActionLoop("boat-row", true, { x: 1, y: 0, z: 2 });
    expect(harness.actionLoops.has("boat-row")).toBe(true);
    expect(harness.loops.has("boat-row")).toBe(false);
    manager.dispose();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphicsQualitySettings, type AutoQualityChange } from "../../src/render/config/GraphicsQualitySettings";
import type { ReductionStep } from "../../src/render/config/GraphicsEffectSettings";
import type { QualityTier } from "../../src/render/config/VisualRenderConfig";

const LADDERS: Record<QualityTier, ReductionStep[]> = {
  high: ["bloom", "ambient-occlusion", "resolution", "resolution"],
  medium: ["resolution", "resolution"],
  low: ["resolution", "resolution"]
};

function stubBrowser(storedPreference: string | null = null): void {
  const values = new Map<string, string>(storedPreference ? [["neva.graphics-quality.v1", storedPreference]] : []);
  vi.stubGlobal("window", {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    }
  });
  vi.stubGlobal("navigator", { deviceMemory: 16, hardwareConcurrency: 10, maxTouchPoints: 0 });
}

function autoController(storedPreference: string | null = null): GraphicsQualitySettings {
  stubBrowser(storedPreference);
  const settings = new GraphicsQualitySettings();
  settings.setReductionLadderSource((tier) => LADDERS[tier]);
  return settings;
}

interface Change { atMs: number; change: Exclude<AutoQualityChange, false>; tier: QualityTier; level: number }

/** Feeds frames of `frameMs` (and optional GPU cost) for `seconds`, recording each Auto decision. */
function play(settings: GraphicsQualitySettings, clock: { nowMs: number }, seconds: number, frameMs: number, gpuMs: number | null): Change[] {
  const changes: Change[] = [];
  const end = clock.nowMs + seconds * 1000;
  while (clock.nowMs < end) {
    clock.nowMs += frameMs;
    const change = settings.sampleFrame(frameMs / 1000, clock.nowMs, gpuMs);
    if (change) changes.push({ atMs: clock.nowMs, change, tier: settings.effectiveTier, level: settings.activeReductionSteps.length });
  }
  return changes;
}

afterEach(() => vi.unstubAllGlobals());

describe("Auto graphics quality", () => {
  it("never overrides an explicit tier choice", () => {
    const settings = autoController("high");
    const clock = { nowMs: 0 };
    expect(play(settings, clock, 60, 50, 45)).toEqual([]);
    expect(settings.effectiveTier).toBe("high");
    expect(settings.reductions).toEqual({ sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 0 });
    expect(settings.reductionsFor("high")).toEqual({ sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 0 });
  });

  it("walks sustained GPU pressure down the ladder one step per cooldown, then drops one tier", () => {
    const settings = autoController();
    expect(settings.effectiveTier).toBe("high");
    const clock = { nowMs: 0 };
    const changes = play(settings, clock, 25, 40, 36);
    expect(changes.map(({ change, tier, level }) => [change, tier, level])).toEqual([
      ["effects", "high", 1],
      ["effects", "high", 2],
      ["effects", "high", 3],
      ["effects", "high", 4],
      ["tier", "medium", 0]
    ]);
    for (let index = 1; index < changes.length; index += 1) {
      expect(changes[index]!.atMs - changes[index - 1]!.atMs).toBeGreaterThanOrEqual(5_000);
    }
    expect(settings.pressureSource).toBe("gpu");
    // The lower tier starts from its own full request.
    expect(settings.reductions).toEqual({ sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 0 });
  });

  it("skips GPU-only reductions and drops the tier when timing shows the CPU is the limit", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    const [first] = play(settings, clock, 12, 40, 8);
    expect(first).toMatchObject({ change: "tier", tier: "medium", level: 0 });
    expect(settings.pressureSource).toBe("cpu");
  });

  it("walks the ladder conservatively on frame time alone when GPU timing is unavailable", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    const [first] = play(settings, clock, 12, 40, null);
    expect(first).toMatchObject({ change: "effects", tier: "high", level: 1 });
    expect(settings.pressureSource).toBe("frame-time");
  });

  it("cannot see headroom on a 60 Hz display without GPU timing, and recovers one step at a time with it", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    const reduced = play(settings, clock, 12, 40, 36);
    expect(reduced.map(({ level }) => level)).toEqual([1, 2]);
    // Vsync holds the average at 16.7 ms, so frame time alone never shows headroom.
    expect(play(settings, clock, 90, 1000 / 60, null)).toEqual([]);
    const recovered = play(settings, clock, 30, 1000 / 60, 6);
    expect(recovered.map(({ change, level }) => [change, level])).toEqual([["effects", 1], ["effects", 0]]);
    expect(recovered[1]!.atMs - recovered[0]!.atMs).toBeGreaterThanOrEqual(10_000);
    expect(settings.reductions).toEqual({ sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 0 });
  });

  it("waits longer before retrying a recovered step that did not hold", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    play(settings, clock, 6, 40, 36);
    expect(settings.activeReductionSteps).toEqual(["bloom"]);
    expect(settings.recoveryDelaySeconds).toBe(10);
    const [recovery] = play(settings, clock, 20, 1000 / 60, 6);
    expect(recovery).toMatchObject({ change: "effects", level: 0 });
    // The restored effect pushes frames over budget again right away.
    const [relapse] = play(settings, clock, 12, 40, 36);
    expect(relapse).toMatchObject({ change: "effects", level: 1 });
    expect(relapse!.atMs - recovery!.atMs).toBeLessThan(20_000);
    expect(settings.recoveryDelaySeconds).toBe(20);
    const retry = play(settings, clock, 40, 1000 / 60, 6);
    expect(retry[0]!.atMs - relapse!.atMs).toBeGreaterThanOrEqual(20_000);
  });

  it("ignores frames inside a sampling hold", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    settings.holdSampling(clock.nowMs, 10_000);
    expect(play(settings, clock, 9.9, 60, 55)).toEqual([]);
    // Pressure is measured afresh once the hold ends.
    const [first] = play(settings, clock, 6, 60, 55);
    expect(first!.atMs).toBeGreaterThanOrEqual(10_000 + 2_500);
  });

  it("re-enters a richer tier fully reduced and keeps a tier it is leaving reduced during the handoff", () => {
    const settings = autoController();
    const clock = { nowMs: 0 };
    play(settings, clock, 25, 40, 36);
    expect(settings.effectiveTier).toBe("medium");
    // The renderer is still drawing High until the handoff crosses the tier.
    expect(settings.reductionsFor("high")).toEqual({ sunShafts: false, bloom: true, ambientOcclusion: true, resolutionStep: 2 });
    expect(settings.reductionsFor("low")).toEqual({ sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 0 });
    expect(settings.reductionsFor("medium")).toEqual(settings.reductions);

    const raised = play(settings, clock, 14, 10, 4);
    expect(raised.map(({ change, tier, level }) => [change, tier, level])).toEqual([["tier", "high", LADDERS.high.length]]);
    expect(settings.reductions).toEqual({ sunShafts: false, bloom: true, ambientOcclusion: true, resolutionStep: 2 });
  });

  it("starts again from the full request when the player changes what the ladder reduces", () => {
    stubBrowser();
    const settings = new GraphicsQualitySettings();
    // Like the application's source, this reads the player's current choices on each call.
    let highLadder: ReductionStep[] = LADDERS.high;
    settings.setReductionLadderSource((tier) => tier === "high" ? highLadder : LADDERS[tier]);
    const clock = { nowMs: 0 };
    play(settings, clock, 6, 40, 36);
    expect(settings.activeReductionSteps).toEqual(["bloom"]);
    expect(settings.refreshReductionLadder()).toBe(false);
    highLadder = ["ambient-occlusion", "resolution", "resolution"];
    expect(settings.refreshReductionLadder()).toBe(true);
    expect(settings.activeReductionSteps).toEqual([]);
  });
});

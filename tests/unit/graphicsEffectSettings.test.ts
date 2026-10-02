import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  DEFAULT_GRAPHICS_EFFECTS,
  GraphicsEffectSettingsStore,
  GraphicsRuntimeStatusStore,
  NO_AUTO_REDUCTIONS,
  cloneGraphicsEffectPreferences,
  effectiveCustomChoices,
  isDefaultGraphicsEffectPreferences,
  parseGraphicsEffectPreferences,
  reductionLadder,
  reductionsAtLevel,
  resolveGraphicsEffects,
  type GraphicsEffectPreferences,
  type GraphicsRuntimeStatus
} from "../../src/render/config/GraphicsEffectSettings";

const STORAGE_KEY = "neva.graphics-effects.v1";

function stubStorage(initial: Record<string, string> = {}, options: { throwOnWrite?: boolean } = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      if (options.throwOnWrite) throw new Error("quota");
      values.set(key, value);
    })
  };
  vi.stubGlobal("window", { localStorage });
  return { values, localStorage };
}

function preferences(patch: Partial<GraphicsEffectPreferences> = {}, custom: Partial<GraphicsEffectPreferences["custom"]> = {}): GraphicsEffectPreferences {
  const value = cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  return { ...value, ...patch, custom: { ...value.custom, ...custom } };
}

afterEach(() => vi.unstubAllGlobals());

describe("graphics effect preferences", () => {
  it("falls back field by field, so one bad value never resets every choice", () => {
    const parsed = parseGraphicsEffectPreferences({
      version: 1,
      postProcessing: "custom",
      brightness: "bright",
      renderResolution: 0.5,
      custom: { ambientOcclusion: "ultra", glow: "hdr", edgeSmoothing: "fast", aoStrength: Number.NaN, colorFinish: { warmth: 0.02 } }
    });
    expect(parsed).toEqual({
      postProcessing: "custom",
      brightness: 1,
      renderResolution: "auto",
      custom: {
        ambientOcclusion: "auto",
        aoStrength: 1,
        glow: "hdr",
        sunShafts: true,
        edgeSmoothing: "fast",
        colorFinish: { saturation: 1, contrast: 1, warmth: 0.02 }
      }
    });
    expect(parseGraphicsEffectPreferences(null)).toEqual(DEFAULT_GRAPHICS_EFFECTS);
    expect(parseGraphicsEffectPreferences("auto")).toEqual(DEFAULT_GRAPHICS_EFFECTS);
  });

  it("clamps every number to the VisualRenderConfig bounds and rejects other storage versions", () => {
    const bounds = CANONICAL_RENDER_CONFIG.postProcessing;
    const parsed = parseGraphicsEffectPreferences({
      brightness: 9,
      custom: { aoStrength: -3, colorFinish: { saturation: 4, contrast: 0, warmth: -1 } }
    });
    expect(parsed.brightness).toBe(bounds.brightness.max);
    expect(parsed.custom.aoStrength).toBe(bounds.ambientOcclusion.strength.min);
    expect(parsed.custom.colorFinish).toEqual({
      saturation: bounds.colorFinish.saturation.max,
      contrast: bounds.colorFinish.contrast.min,
      warmth: bounds.colorFinish.warmth.min
    });
    expect(parseGraphicsEffectPreferences({ version: 2, brightness: 1.2 })).toEqual(DEFAULT_GRAPHICS_EFFECTS);
    for (const scale of bounds.renderResolution.manualScales) {
      expect(parseGraphicsEffectPreferences({ renderResolution: scale }).renderResolution).toBe(scale);
    }
  });

  it("persists versioned choices, reloads them and resets to the defaults", () => {
    const storage = stubStorage();
    const store = new GraphicsEffectSettingsStore();
    store.set({ brightness: 1.1, renderResolution: 0.85 });
    store.customize({ glow: "hdr" });
    const stored = JSON.parse(storage.values.get(STORAGE_KEY)!);
    expect(stored).toMatchObject({ version: 1, brightness: 1.1, renderResolution: 0.85, postProcessing: "custom", custom: { glow: "hdr" } });

    const reloaded = new GraphicsEffectSettingsStore();
    expect(reloaded.get()).toEqual(store.get());

    reloaded.reset();
    expect(reloaded.get()).toEqual(DEFAULT_GRAPHICS_EFFECTS);
    expect(isDefaultGraphicsEffectPreferences(reloaded.get())).toBe(true);
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toMatchObject({ version: 1, ...DEFAULT_GRAPHICS_EFFECTS });
    // Graphics reset writes only its own key.
    expect([...storage.values.keys()]).toEqual([STORAGE_KEY]);
  });

  it("starts a custom edit from what Auto or Off was rendering", () => {
    stubStorage();
    const store = new GraphicsEffectSettingsStore();
    store.set({ postProcessing: "off" });
    expect(effectiveCustomChoices(store.get())).toMatchObject({ ambientOcclusion: "off", edgeSmoothing: "off", glow: "subtle" });
    store.customize({ aoStrength: 1.2 });
    expect(store.get().postProcessing).toBe("custom");
    expect(store.get().custom).toMatchObject({ ambientOcclusion: "off", edgeSmoothing: "off", aoStrength: 1.2 });

    const fromAuto = new GraphicsEffectSettingsStore(cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS));
    fromAuto.customize({ colorFinish: { saturation: 1.1, contrast: 1, warmth: 0 } });
    expect(fromAuto.get().custom).toEqual({ ...DEFAULT_GRAPHICS_EFFECTS.custom, colorFinish: { saturation: 1.1, contrast: 1, warmth: 0 } });
  });

  it("notifies subscribers once per real change and keeps choices when storage fails", () => {
    const storage = stubStorage({}, { throwOnWrite: true });
    const store = new GraphicsEffectSettingsStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.set({ brightness: 1.2 });
    store.set({ brightness: 1.2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().brightness).toBe(1.2);
    expect(storage.localStorage.setItem).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ brightness: 0.9 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("publishes runtime status only when it changes", () => {
    const status = new GraphicsRuntimeStatusStore();
    const listener = vi.fn();
    status.subscribe(listener);
    const value: GraphicsRuntimeStatus = {
      tier: "high",
      rendering: true,
      enhancedPath: true,
      requested: resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, "high"),
      active: resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, "high"),
      reductions: [],
      renderSize: { width: 1920, height: 1080, pixelRatio: 1 },
      preparing: false,
      pressureSignal: "gpu-timing",
      fallbackReason: null,
      failedStages: []
    };
    status.publish(value);
    status.publish({ ...value });
    status.publish({ ...value, preparing: true });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(status.get()?.preparing).toBe(true);
  });
});

describe("resolving effects for a tier", () => {
  it("offers full-screen effects only on the enhanced High path", () => {
    const everything = preferences({ postProcessing: "custom" }, {
      ambientOcclusion: "high", glow: "hdr", edgeSmoothing: "fast", colorFinish: { saturation: 1.1, contrast: 1.05, warmth: 0.02 }
    });
    expect(resolveGraphicsEffects(everything, "high")).toMatchObject({
      ambientOcclusion: "gtao", hdrBloom: true, practicalGlow: false, fxaa: true,
      colorFinish: { saturation: 1.1, contrast: 1.05, warmth: 0.02 }
    });
    for (const tier of ["low", "medium"] as const) {
      const resolved = resolveGraphicsEffects(everything, tier);
      expect(resolved.hdrBloom).toBe(false);
      // The sprites keep lamps glowing where HDR bloom cannot run.
      expect(resolved.practicalGlow).toBe(true);
      expect(resolved.fxaa).toBe(false);
      expect(resolved.colorFinish).toEqual({ saturation: 1, contrast: 1, warmth: 0 });
      expect(resolved.ambientOcclusion).toBe(CANONICAL_RENDER_CONFIG.quality[tier].ambientOcclusion);
    }
  });

  it("keeps the defaults equal to each tier's own behaviour", () => {
    for (const tier of ["low", "medium", "high"] as const) {
      const resolved = resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, tier);
      const quality = CANONICAL_RENDER_CONFIG.quality[tier];
      expect(resolved.ambientOcclusion).toBe(quality.ambientOcclusion);
      expect(resolved).toMatchObject({ hdrBloom: false, practicalGlow: true, brightness: 1, resolutionScale: 1 });
      expect(resolved.fxaa).toBe(quality.enhancedPostPath);
      expect(resolved.colorFinish).toEqual({ saturation: 1, contrast: 1, warmth: 0 });
    }
  });

  it("keeps Medium's contact discs under Post-processing Off but removes them for an explicit Custom Off", () => {
    expect(resolveGraphicsEffects(preferences({ postProcessing: "off" }), "medium").ambientOcclusion).toBe("contact");
    expect(resolveGraphicsEffects(preferences({ postProcessing: "off" }), "high")).toMatchObject({ ambientOcclusion: "off", fxaa: false, hdrBloom: false });
    expect(resolveGraphicsEffects(preferences({ postProcessing: "custom" }, { ambientOcclusion: "off" }), "medium").ambientOcclusion).toBe("off");
  });

  it("applies Auto's temporary reductions without touching the saved choices", () => {
    const saved = preferences({ postProcessing: "custom" }, { glow: "hdr" });
    const before = JSON.stringify(saved);
    const reduced = resolveGraphicsEffects(saved, "high", { sunShafts: false, bloom: true, ambientOcclusion: true, resolutionStep: 2 });
    expect(reduced).toMatchObject({ hdrBloom: false, practicalGlow: true, ambientOcclusion: "gtao", aoReduced: true });
    expect(reduced.resolutionScale).toBe(CANONICAL_RENDER_CONFIG.postProcessing.renderResolution.autoScales[2]);
    expect(JSON.stringify(saved)).toBe(before);
    // A manual resolution is the player's explicit choice; Auto never scales it.
    expect(resolveGraphicsEffects(preferences({ renderResolution: 0.7 }), "high", { ...NO_AUTO_REDUCTIONS, resolutionStep: 2 }).resolutionScale).toBe(0.7);
  });
});

describe("Auto reduction ladder", () => {
  it("suspends sunlight first without lowering resolution or overwriting its preference", () => {
    const saved = preferences();
    const ladder = reductionLadder(saved, "high");
    expect(ladder[0]).toBe("sun-shafts");
    expect(resolveGraphicsEffects(saved, "high", reductionsAtLevel(ladder, 1))).toMatchObject({
      sunShafts: false, aoReduced: false, resolutionScale: 1
    });
    expect(saved.custom.sunShafts).toBe(true);
    expect(resolveGraphicsEffects(saved, "high").sunShafts).toBe(true);
    for (const tier of ["low", "medium"] as const) expect(resolveGraphicsEffects(saved, tier).sunShafts).toBe(false);
    expect(resolveGraphicsEffects(preferences({ postProcessing: "off" }), "high").sunShafts).toBe(false);
    expect(resolveGraphicsEffects(preferences({ postProcessing: "custom" }, { sunShafts: false }), "high").sunShafts).toBe(false);
  });

  it("orders optional bloom, then AO, then resolution before a tier drop", () => {
    const withBloom = preferences({ postProcessing: "custom" }, { glow: "hdr" });
    const steps = CANONICAL_RENDER_CONFIG.postProcessing.renderResolution.autoScales.length - 1;
    expect(reductionLadder(withBloom, "high")).toEqual(["sun-shafts", "bloom", "ambient-occlusion", ...Array(steps).fill("resolution")]);
    expect(reductionLadder(DEFAULT_GRAPHICS_EFFECTS, "high")).toEqual(["sun-shafts", "ambient-occlusion", ...Array(steps).fill("resolution")]);
    expect(reductionLadder(DEFAULT_GRAPHICS_EFFECTS, "medium")).toEqual(Array(steps).fill("resolution"));
    expect(reductionLadder(preferences({ renderResolution: 1 }), "low")).toEqual([]);
  });

  it("maps each ladder level to the reductions applied so far", () => {
    const ladder = reductionLadder(preferences({ postProcessing: "custom" }, { glow: "hdr" }), "high");
    expect(reductionsAtLevel(ladder, 0)).toEqual(NO_AUTO_REDUCTIONS);
    expect(reductionsAtLevel(ladder, 2)).toEqual({ sunShafts: true, bloom: true, ambientOcclusion: false, resolutionStep: 0 });
    expect(reductionsAtLevel(ladder, 4)).toEqual({ sunShafts: true, bloom: true, ambientOcclusion: true, resolutionStep: 1 });
    expect(reductionsAtLevel(ladder, 99)).toEqual({ sunShafts: true, bloom: true, ambientOcclusion: true, resolutionStep: ladder.length - 3 });
  });
});

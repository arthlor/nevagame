import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GRAPHICS_EFFECTS,
  cloneGraphicsEffectPreferences,
  resolveGraphicsEffects,
  type CustomEffectChoices,
  type GraphicsEffectPreferences
} from "../../src/render/config/GraphicsEffectSettings";
import { FxaaStage } from "../../src/render/pipeline/FxaaStage";
import { GtaoStage } from "../../src/render/pipeline/GtaoStage";
import { HdrBloomStage } from "../../src/render/pipeline/HdrBloomStage";
import { createPipelineHarness } from "../helpers/fakeWebGLRenderer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function custom(patch: Partial<CustomEffectChoices>, rest: Partial<GraphicsEffectPreferences> = {}): GraphicsEffectPreferences {
  const preferences = cloneGraphicsEffectPreferences(DEFAULT_GRAPHICS_EFFECTS);
  return { ...preferences, ...rest, postProcessing: "custom", custom: { ...preferences.custom, ...patch } };
}

function compiledMaterialNames(compileAsync: { mock: { calls: unknown[][] } }): string[] {
  return compileAsync.mock.calls.map(([object]) => {
    const material = (object as { material?: THREE.Material }).material;
    return material && !Array.isArray(material) ? material.name : "";
  }).filter(Boolean);
}

function targetIds(diagnostics: { renderTargets: readonly { id: string }[] }): string[] {
  return diagnostics.renderTargets.map((target) => target.id);
}

describe("render path selection", () => {
  it.each(["low", "medium"] as const)("draws %s directly and never compiles a post-processing program", async (tier) => {
    const harness = await createPipelineHarness({ tier });
    try {
      expect(harness.frame()).toMatchObject({ scene: 1, finalColor: 0, fxaa: 0, bloom: 0, gtao: 0, waterSnapshot: 0 });
      expect(compiledMaterialNames(harness.renderer.compileAsync).filter((name) => name.startsWith("neva_"))).toEqual([]);
      const diagnostics = harness.pipeline.diagnostics();
      expect(diagnostics.path).toBe("direct");
      expect(targetIds(diagnostics)).toEqual([]);
      expect(harness.pipeline.isPreparing()).toBe(false);
    } finally { harness.dispose(); }
  });

  it("prepares the High path, its final pass and the requested stages before entry", async () => {
    const harness = await createPipelineHarness();
    try {
      expect(harness.pipeline.isPreparing()).toBe(false);
      expect(compiledMaterialNames(harness.renderer.compileAsync)).toEqual(
        expect.arrayContaining(["neva_final_color", "neva_fxaa"])
      );
      expect(harness.pipeline.activeEffects()).toEqual({ gtao: true, hdrBloom: false, sunShafts: false, fxaa: true, colorFinish: false });
      expect(harness.frame()).toMatchObject({ scene: 1, finalColor: 1, fxaa: 1, bloom: 0, gtao: 2 });
    } finally { harness.dispose(); }
  });

  it("falls back to direct rendering when the final pass cannot compile", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const harness = await createPipelineHarness({ failCompile: (name) => name === "neva_final_color" });
    try {
      expect(harness.pipeline.diagnostics()).toMatchObject({ path: "direct-fallback" });
      expect(harness.pipeline.diagnostics().fallbackReason).toContain("neva_final_color");
      expect(harness.frame()).toMatchObject({ scene: 1, finalColor: 0, waterSnapshot: 0 });
      expect(harness.sceneTargetDuringDraw).toBeNull();
      expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(0);
      expect(warn).toHaveBeenCalled();
    } finally { harness.dispose(); }
  });
});

describe("optional effects on the High path", () => {
  it("keeps the scene target and water optics with ambient occlusion off", async () => {
    const harness = await createPipelineHarness();
    try {
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ ambientOcclusion: "off" }), "high"));
      const draws = harness.frame();
      expect(draws).toMatchObject({ scene: 1, gtao: 0, waterSnapshot: 1, finalColor: 1 });
      expect(harness.sceneTargetDuringDraw?.texture.name).toBe("enhanced.sceneLinear");
      expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(1);
      const ids = targetIds(harness.pipeline.diagnostics());
      expect(ids).toEqual(expect.arrayContaining(["enhanced.scene", "water.opaqueSnapshot"]));
      expect(ids.some((id) => id.startsWith("gtao."))).toBe(false);
    } finally { harness.dispose(); }
  });

  it("records a settings change without compiling, then takes the stage over once it is ready", async () => {
    const harness = await createPipelineHarness();
    try {
      const compilesBefore = harness.renderer.compileAsync.mock.calls.length;
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ glow: "hdr" }), "high"));
      expect(harness.renderer.compileAsync.mock.calls.length).toBe(compilesBefore);
      expect(harness.pipeline.activeEffects().hdrBloom).toBe(false);
      expect(harness.pipeline.isHdrBloomActive()).toBe(false);
      expect(harness.pipeline.isPreparing()).toBe(true);
      // The frame that starts creation still draws, without bloom.
      expect(harness.frame().bloom).toBe(0);
      await harness.settle();
      expect(harness.pipeline.isPreparing()).toBe(false);
      expect(harness.pipeline.isHdrBloomActive()).toBe(true);
      const draws = harness.frame();
      // Prefilter, three downsamples and three upsamples, then one final pass.
      expect(draws.bloom).toBe(7);
      expect(draws.finalColor).toBe(1);
    } finally { harness.dispose(); }
  });

  it("does no work for disabled effects and releases their targets", async () => {
    const harness = await createPipelineHarness();
    try {
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ glow: "hdr" }), "high"));
      harness.frame();
      await harness.settle();
      expect(targetIds(harness.pipeline.diagnostics())).toEqual(
        expect.arrayContaining(["enhanced.output", "bloom.mip0", "gtao.gather"])
      );
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ sunShafts: false, glow: "subtle", edgeSmoothing: "off", ambientOcclusion: "off" }), "high"));
      expect(harness.frame()).toMatchObject({ bloom: 0, fxaa: 0, gtao: 0, finalColor: 1 });
      const ids = targetIds(harness.pipeline.diagnostics());
      expect(ids.filter((id) => !id.startsWith("water."))).toEqual(["enhanced.scene"]);
    } finally { harness.dispose(); }
  });

  it("disposes every stage it creates across repeated toggles and ends with the same targets", async () => {
    const created = {
      gtao: vi.spyOn(GtaoStage, "create"),
      bloom: vi.spyOn(HdrBloomStage.prototype, "prepare"),
      fxaa: vi.spyOn(FxaaStage, "create")
    };
    const disposed = {
      gtao: vi.spyOn(GtaoStage.prototype, "dispose"),
      bloom: vi.spyOn(HdrBloomStage.prototype, "dispose"),
      fxaa: vi.spyOn(FxaaStage.prototype, "dispose")
    };
    const harness = await createPipelineHarness();
    const everything = resolveGraphicsEffects(custom({ glow: "hdr" }), "high");
    const nothing = resolveGraphicsEffects(custom({ sunShafts: false, glow: "off", edgeSmoothing: "off", ambientOcclusion: "off" }), "high");
    try {
      harness.pipeline.setEffects(everything);
      harness.frame();
      await harness.settle();
      // The display-output target is allocated by the first frame that smooths edges.
      harness.frame();
      const initialTargets = targetIds(harness.pipeline.diagnostics());
      for (let cycle = 0; cycle < 4; cycle += 1) {
        harness.pipeline.setEffects(nothing);
        harness.frame();
        harness.pipeline.setEffects(everything);
        harness.frame();
        await harness.settle();
        harness.frame();
      }
      expect(targetIds(harness.pipeline.diagnostics())).toEqual(initialTargets);
      for (const kind of ["gtao", "bloom", "fxaa"] as const) {
        expect(created[kind].mock.calls.length).toBe(5);
        // One of each is still installed.
        expect(disposed[kind].mock.calls.length).toBe(4);
      }
    } finally {
      harness.dispose();
    }
    for (const kind of ["gtao", "bloom", "fxaa"] as const) expect(disposed[kind].mock.calls.length).toBe(5);
  });

  it("reports a stage that fails to compile, keeps drawing without it and retries on a new request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let fxaaCompiles = false;
    const harness = await createPipelineHarness({ failCompile: (name) => name === "neva_fxaa" && !fxaaCompiles });
    try {
      expect(harness.pipeline.diagnostics().failedStages).toEqual(["fxaa"]);
      expect(harness.pipeline.diagnostics().path).toBe("enhanced");
      expect(harness.frame()).toMatchObject({ fxaa: 0, finalColor: 1, gtao: 2 });
      expect(harness.pipeline.isPreparing()).toBe(false);
      fxaaCompiles = true;
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ edgeSmoothing: "off" }), "high"));
      harness.pipeline.setEffects(resolveGraphicsEffects(custom({ edgeSmoothing: "fast" }), "high"));
      harness.frame();
      await harness.settle();
      expect(harness.pipeline.diagnostics().failedStages).toEqual([]);
      expect(harness.frame().fxaa).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally { harness.dispose(); }
  });

  it("defers a render-resolution change to the next frame and resizes AO with it", async () => {
    const harness = await createPipelineHarness();
    try {
      harness.frame();
      const scene = () => harness.pipeline.diagnostics().renderTargets.find((target) => target.id === "enhanced.scene")!;
      expect([scene().width, scene().height]).toEqual([320, 180]);
      harness.pipeline.setEffects(resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, "high", { sunShafts: false, bloom: false, ambientOcclusion: false, resolutionStep: 2 }));
      expect([scene().width, scene().height]).toEqual([320, 180]);
      const draws = harness.frame();
      expect([scene().width, scene().height]).toEqual([256, 144]);
      // The retained AO no longer matches the scene, so it is gathered afresh.
      expect(draws.gtao).toBe(2);
      expect(harness.pipeline.runtimeState().renderSize).toEqual({ width: 256, height: 144, pixelRatio: 0.8 });
    } finally { harness.dispose(); }
  });
});

describe("retained AO invalidation", () => {
  it("gathers afresh after a resize, a projection change or a camera replacement", async () => {
    const harness = await createPipelineHarness();
    try {
      expect(harness.frame().gtao).toBe(2);
      expect(harness.frame().gtao).toBe(0);
      harness.pipeline.resize(400, 240);
      harness.frame();
      expect(harness.frame().gtao).toBe(0);
      harness.pipeline.resize(320, 180);
      expect(harness.frame().gtao).toBe(2);
      harness.camera.fov += 8;
      harness.camera.updateProjectionMatrix();
      expect(harness.frame().gtao).toBe(2);
      expect(harness.frame().gtao).toBe(0);
      const replacement = harness.camera.clone();
      expect(harness.frame(replacement).gtao).toBe(2);
      expect(harness.frame(replacement).gtao).toBe(0);
    } finally { harness.dispose(); }
  });

  it("reuses AO across a small move but not across a cut", async () => {
    const harness = await createPipelineHarness();
    try {
      expect(harness.frame().gtao).toBe(2);
      // While moving, AO refreshes every other frame, so the frame after a gather reuses it...
      harness.camera.position.x += 0.05;
      expect(harness.frame().gtao).toBe(0);
      harness.camera.position.x += 0.05;
      expect(harness.frame().gtao).toBe(2);
      // ...unless the camera jumped, which invalidates the retained gather at once.
      harness.camera.position.x += 10;
      expect(harness.frame().gtao).toBe(2);
    } finally { harness.dispose(); }
  });
});

describe("context loss and restore", () => {
  it("stops drawing while lost, then rebuilds the path and notifies listeners on restore", async () => {
    const harness = await createPipelineHarness();
    const restored = vi.fn();
    harness.pipeline.onContextRestored(restored);
    try {
      harness.fake.dispatch("webglcontextlost");
      expect(harness.frame()).toMatchObject({ scene: 0, finalColor: 0 });
      // three.js replaces `renderer.info` when it rebuilds the context.
      harness.renderer.info.autoReset = true;
      harness.fake.dispatch("webglcontextrestored");
      expect(restored).toHaveBeenCalledTimes(1);
      expect(harness.renderer.info.autoReset).toBe(false);
      expect(harness.renderer.shadowMap.needsUpdate).toBe(true);
      expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(0);
      expect(harness.pipeline.diagnostics()).toMatchObject({ contextRestores: 1, path: "enhanced-preparing" });
      // Until the rebuilt path is ready the frame is drawn directly.
      expect(harness.frame()).toMatchObject({ scene: 1, finalColor: 0 });
      await harness.settle();
      expect(harness.pipeline.diagnostics().path).toBe("enhanced");
      expect(harness.frame()).toMatchObject({ scene: 1, finalColor: 1, waterSnapshot: 1 });
    } finally { harness.dispose(); }
    expect(harness.fake.listenerCount("webglcontextlost")).toBe(0);
    expect(harness.fake.listenerCount("webglcontextrestored")).toBe(0);
  });
});

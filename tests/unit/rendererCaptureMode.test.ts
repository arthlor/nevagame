import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPipelineHarness } from "../helpers/fakeWebGLRenderer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("capture-mode AO and water continuity", () => {
  it.each([1, 2, 4, 5])("gathers real AO after starting with %i no-post frames", async frames => {
    const harness = await createPipelineHarness();
    try {
      harness.pipeline.setCaptureRenderMode("no-post");
      for (let frame = 0; frame < frames; frame++) expect(harness.frame().gtao).toBe(0);
      harness.pipeline.setCaptureRenderMode("final");
      // A fresh gather is the GTAO pass plus its denoise, into AO's own targets.
      expect(harness.frame().gtao).toBe(2);
      expect(harness.pipeline.isGtaoActive()).toBe(true);
    } finally { harness.dispose(); }
  });

  it("does not reuse a previous camera's AO after a no-post interval", async () => {
    const harness = await createPipelineHarness();
    try {
      expect(harness.frame().gtao).toBe(2);
      harness.pipeline.setCaptureRenderMode("no-post");
      harness.camera.position.x += 20;
      expect(harness.frame().gtao).toBe(0);
      harness.pipeline.setCaptureRenderMode("final");
      expect(harness.frame().gtao).toBe(2);
      // An unchanged view reuses the gather; the final pass composites it.
      harness.pipeline.setCaptureRenderMode("final");
      const reused = harness.frame();
      expect(reused.gtao).toBe(0);
      expect(reused.finalColor).toBe(1);
    } finally { harness.dispose(); }
  });

  it("keeps one scene draw, one output conversion and independent water snapshots in both modes", async () => {
    const harness = await createPipelineHarness();
    try {
      let color: THREE.Texture | null = null;
      let depth: THREE.DepthTexture | null = null;
      for (const mode of ["final", "no-post", "final"] as const) {
        harness.pipeline.setCaptureRenderMode(mode);
        const draws = harness.frame();
        expect(draws.scene).toBe(1);
        expect(draws.waterSnapshot).toBe(1);
        expect(draws.finalColor).toBe(1);
        // Edge smoothing reads the encoded output, so no-post skips it with the other options.
        expect(draws.fxaa).toBe(mode === "final" ? 1 : 0);
        expect(harness.renderer.copyTextureToTexture).not.toHaveBeenCalled();
        expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(1);
        expect(harness.pipeline.diagnostics()).toMatchObject({ renderMode: mode, qualityTier: "high", path: "enhanced", gtaoActive: mode === "final" });
        color ??= harness.uniforms.uOpaqueColor.value;
        depth ??= harness.uniforms.uOpaqueDepth.value;
        expect(harness.uniforms.uOpaqueColor.value).toBe(color);
        expect(harness.uniforms.uOpaqueDepth.value).toBe(depth);
        expect(harness.uniforms.uOpaqueColor.value).not.toBe(harness.sceneTargetDuringDraw?.texture);
      }
      harness.pipeline.setQuality("medium");
      const direct = harness.frame();
      expect(direct).toMatchObject({ scene: 1, waterSnapshot: 0, finalColor: 0, fxaa: 0, gtao: 0 });
      expect(harness.sceneTargetDuringDraw).toBeNull();
      expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(0);
      expect(harness.uniforms.uOpaqueColor.value).toBeNull();
      expect(harness.uniforms.uOpaqueDepth.value).toBeNull();
    } finally { harness.dispose(); }
  });
});

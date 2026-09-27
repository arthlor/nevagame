import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTargetDiagnostic } from "../../src/render/pipeline/RendererPipeline";
import { createPipelineHarness } from "../helpers/fakeWebGLRenderer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("opaque water snapshot ownership", () => {
  it("snapshots color/depth in one GPU draw per frame and releases each resized/tier target", async () => {
    const harness = await createPipelineHarness({ waterDrawsPerFrame: 3 });
    const disposals: ReturnType<typeof vi.spyOn>[] = [];
    try {
      for (let cycle = 0; cycle < 3; cycle++) {
        const width = 320 + cycle * 80;
        harness.pipeline.setQuality("high");
        harness.pipeline.resize(width, 180);
        await harness.pipeline.prepareForCapture(harness.camera);
        const draws = harness.frame();
        // Three water draws inside the scene still take a single snapshot.
        expect(draws.waterSnapshot).toBe(1);
        expect(harness.renderer.copyTextureToTexture).not.toHaveBeenCalled();
        const source = harness.sceneTargetDuringDraw!;
        expect(source.depthTexture).toBeTruthy();
        expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(1);
        expect(harness.uniforms.uOpaqueColor.value).not.toBe(source.texture);
        expect(harness.uniforms.uOpaqueDepth.value).not.toBe(source.depthTexture);
        expect(harness.uniforms.uOpticsViewport.value.toArray()).toEqual([width, 180]);
        const snapshot = harness.renderer.initRenderTarget.mock.calls.at(-1)![0] as THREE.WebGLRenderTarget;
        expect(snapshot.texture).toBe(harness.uniforms.uOpaqueColor.value);
        disposals.push(vi.spyOn(snapshot, "dispose"));
        harness.pipeline.setQuality("medium");
        expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(0);
        expect(harness.uniforms.uOpaqueColor.value).toBeNull();
        expect(harness.uniforms.uOpaqueDepth.value).toBeNull();
        expect(harness.pipeline.diagnostics().renderTargets).toHaveLength(0);
      }
    } finally {
      harness.dispose();
    }
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("accounts for RGBA16F color and the actual 32-bit sampled depth allocation", () => {
    const target = new THREE.WebGLRenderTarget(320, 180, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(320, 180, THREE.UnsignedIntType) });
    expect(renderTargetDiagnostic("water", target).estimatedBytes).toBe(320 * 180 * 12);
    target.dispose();
  });
});

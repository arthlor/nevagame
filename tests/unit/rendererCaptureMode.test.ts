import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RendererPipeline } from "../../src/render/pipeline/RendererPipeline";
import { createCoastalUniforms } from "../../src/render/water/CoastalOptics";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function captureHarness() {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  let active: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    info: { autoReset: true, reset: vi.fn(), memory: { geometries: 0, textures: 0 } },
    getContext: () => ({}), getPixelRatio: () => 1, compileAsync: async () => {},
    shadowMap: { needsUpdate: false }, getRenderTarget: () => active,
    setRenderTarget: (target: THREE.WebGLRenderTarget | null) => { active = target; },
    initRenderTarget: vi.fn(), copyTextureToTexture: vi.fn(), render: vi.fn()
  };
  const webgl = renderer as unknown as THREE.WebGLRenderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const uniforms = createCoastalUniforms(null, new THREE.Vector4(0, 0, 20, 20));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShaderMaterial());
  scene.add(water);
  const sceneDraw = vi.spyOn(RenderPass.prototype, "render").mockImplementation((_renderer, _write, read) => {
    active = read;
    for (let surface = 0; surface < 2; surface++) {
      water.onBeforeRender(webgl, scene, camera, water.geometry, water.material, null!);
    }
  });
  const output = vi.spyOn(OutputPass.prototype, "render").mockImplementation(() => {});
  const aoDraw = vi.spyOn(GTAOPass.prototype, "renderPass").mockImplementation(() => {});
  const pipeline = new RendererPipeline(webgl, scene, "high");
  pipeline.bindWaterCapture([water], uniforms);
  pipeline.resize(320, 180);
  await pipeline.prepareForCapture(camera);
  return {
    pipeline, camera, renderer, uniforms, sceneDraw, output, aoDraw,
    frame: () => {
      aoDraw.mockClear();
      sceneDraw.mockClear();
      output.mockClear();
      renderer.copyTextureToTexture.mockClear();
      pipeline.render(camera);
      return aoDraw.mock.calls.map(call => call[1]);
    },
    dispose: () => { pipeline.dispose(); water.geometry.dispose(); water.material.dispose(); }
  };
}

describe("capture-mode AO and water continuity", () => {
  it.each([1, 2, 4, 5])("gathers real AO after starting with %i no-post frames", async frames => {
    const harness = await captureHarness();
    try {
      harness.pipeline.setCaptureRenderMode("no-post");
      for (let frame = 0; frame < frames; frame++) expect(harness.frame()).toEqual([]);
      harness.pipeline.setCaptureRenderMode("final");
      expect(harness.frame()).toHaveLength(4);
      expect(harness.pipeline.isGtaoActive()).toBe(true);
    } finally { harness.dispose(); }
  });

  it("does not reuse a previous camera's AO after a no-post interval", async () => {
    const harness = await captureHarness();
    try {
      expect(harness.frame()).toHaveLength(4);
      harness.pipeline.setCaptureRenderMode("no-post");
      harness.camera.position.x += 20;
      expect(harness.frame()).toEqual([]);
      harness.pipeline.setCaptureRenderMode("final");
      expect(harness.frame()).toHaveLength(4);
      harness.pipeline.setCaptureRenderMode("final");
      expect(harness.frame()).toHaveLength(2);
    } finally { harness.dispose(); }
  });

  it("keeps one scene draw, output conversion and independent water snapshots in both modes", async () => {
    const harness = await captureHarness();
    try {
      let color: THREE.Texture | null = null;
      let depth: THREE.DepthTexture | null = null;
      for (const mode of ["final", "no-post", "final"] as const) {
        harness.pipeline.setCaptureRenderMode(mode);
        harness.frame();
        expect(harness.sceneDraw).toHaveBeenCalledTimes(1);
        expect(harness.output).toHaveBeenCalledTimes(1);
        expect(harness.renderer.render).not.toHaveBeenCalled();
        expect(harness.renderer.copyTextureToTexture).toHaveBeenCalledTimes(2);
        expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(1);
        expect(harness.pipeline.diagnostics()).toMatchObject({ renderMode: mode, qualityTier: "high", gtaoActive: mode === "final" });
        for (const [source, destination] of harness.renderer.copyTextureToTexture.mock.calls) expect(source).not.toBe(destination);
        color ??= harness.uniforms.uOpaqueColor.value;
        depth ??= harness.uniforms.uOpaqueDepth.value;
        expect(harness.uniforms.uOpaqueColor.value).toBe(color);
        expect(harness.uniforms.uOpaqueDepth.value).toBe(depth);
      }
      harness.pipeline.setQuality("medium");
      harness.frame();
      expect(harness.renderer.render).toHaveBeenCalledTimes(1);
      expect(harness.sceneDraw).not.toHaveBeenCalled();
      expect(harness.output).not.toHaveBeenCalled();
      expect(harness.uniforms.uSceneCaptureEnabled.value).toBe(0);
      expect(harness.uniforms.uOpaqueColor.value).toBeNull();
      expect(harness.uniforms.uOpaqueDepth.value).toBeNull();
    } finally { harness.dispose(); }
  });
});

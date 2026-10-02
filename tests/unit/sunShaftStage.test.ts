import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aerialPerspectiveUniforms as sky } from "../../src/render/atmosphere/AerialPerspective";
import { SunShaftStage } from "../../src/render/pipeline/SunShaftStage";
import { createPipelineHarness } from "../helpers/fakeWebGLRenderer";
import { DEFAULT_GRAPHICS_EFFECTS, resolveGraphicsEffects } from "../../src/render/config/GraphicsEffectSettings";

afterEach(() => {
  sky.nevaAerialEnabled.value = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const stage = new SunShaftStage();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
  const sun = new THREE.Vector3(0, 0.2, -1).normalize();
  sky.nevaAerialEnabled.value = 1;
  sky.nevaAerialSun.value.set(sun.x, sun.y, sun.z, 5);
  sky.nevaAerialSunScatter.value.setRGB(0.55, 0.4, 0.2);
  camera.lookAt(sun);
  camera.updateMatrixWorld();
  const source = new THREE.WebGLRenderTarget(1920, 1080, { depthTexture: new THREE.DepthTexture(1920, 1080) });
  const renderer = { setRenderTarget: vi.fn(), render: vi.fn() };
  const draw = () => stage.render(renderer as unknown as THREE.WebGLRenderer, camera, source);
  return { stage, camera, sun, source, renderer, draw, dispose: () => { stage.dispose(); source.dispose(); } };
}

describe("bounded sun shafts", () => {
  it("borrows depth, makes one reduced draw, and projects direction independently of position", () => {
    const h = setup();
    try {
      h.stage.setSize(1920, 1080);
      expect([h.stage.target.width, h.stage.target.height]).toEqual([480, 270]);
      expect(h.stage.target.depthBuffer).toBe(false);
      expect(h.draw()).toBe(h.stage.target.texture);
      expect(h.renderer.render).toHaveBeenCalledTimes(1);
      expect(h.stage.material.uniforms.tDepth.value).toBe(h.source.depthTexture);
      const uv = h.stage.material.uniforms.uSun.value.clone();
      expect(uv.x).toBeCloseTo(0.5);
      expect(uv.y).toBeCloseTo(0.5);
      h.camera.position.set(900, 30, -450);
      h.camera.updateMatrixWorld();
      h.draw();
      expect(h.stage.material.uniforms.uSun.value.distanceTo(uv)).toBeLessThan(1e-8);
      h.stage.setSize(1365, 767);
      expect([h.stage.target.width, h.stage.target.height]).toEqual([342, 192]);
      h.stage.setSize(1, 1);
      expect([h.stage.target.width, h.stage.target.height]).toEqual([1, 1]);
    } finally { h.dispose(); }
  });

  it.each(["night", "cloud", "behind", "edge", "disabled"])("returns no texture and draws nothing for %s after an active frame", (condition) => {
    const h = setup();
    try {
      h.draw();
      h.renderer.render.mockClear();
      if (condition === "night") sky.nevaAerialSun.value.y = -0.1;
      if (condition === "cloud") sky.nevaAerialSunScatter.value.setRGB(0, 0, 0);
      if (condition === "disabled") sky.nevaAerialEnabled.value = 0;
      if (condition === "behind") h.camera.lookAt(0, 0, 1);
      if (condition === "edge") h.camera.lookAt(1, 0, -1);
      h.camera.updateMatrixWorld();
      expect(h.draw()).toBeNull();
      expect(h.stage.active).toBe(false);
      expect(h.renderer.render).not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it("fades smoothly toward the viewport boundary", () => {
    const h = setup();
    try {
      h.draw();
      const center = h.stage.material.uniforms.uRadiance.value.r;
      // Put the sun inside the outer 12 percent of the viewport.
      const clip = new THREE.Vector3(-0.9, 0, 0.5).unproject(h.camera).normalize();
      sky.nevaAerialSun.value.set(clip.x, clip.y, clip.z, 5);
      expect(h.draw()).not.toBeNull();
      expect(h.stage.material.uniforms.uRadiance.value.r).toBeGreaterThan(0);
      expect(h.stage.material.uniforms.uRadiance.value.r).toBeLessThan(center);
    } finally { h.dispose(); }
  });

  it("releases its target on disable, recovers on reenable, and bypasses no-post", async () => {
    const input = setup();
    const h = await createPipelineHarness();
    const disposed = vi.spyOn(SunShaftStage.prototype, "dispose");
    try {
      h.camera.quaternion.copy(input.camera.quaternion);
      h.camera.updateMatrixWorld();
      h.frame();
      expect(h.pipeline.activeEffects().sunShafts).toBe(true);
      h.pipeline.setCaptureRenderMode("no-post");
      h.frame();
      expect(h.pipeline.activeEffects().sunShafts).toBe(false);
      h.pipeline.setCaptureRenderMode("final");
      h.pipeline.setEffects(resolveGraphicsEffects({ ...DEFAULT_GRAPHICS_EFFECTS, postProcessing: "off" }, "high"));
      expect(h.pipeline.diagnostics().renderTargets.some(t => t.id === "atmosphere.sunShafts")).toBe(false);
      expect(disposed).toHaveBeenCalledTimes(1);
      h.pipeline.setEffects(resolveGraphicsEffects(DEFAULT_GRAPHICS_EFFECTS, "high"));
      h.frame(); await h.settle(); h.frame();
      expect(h.pipeline.activeEffects().sunShafts).toBe(true);
    } finally { h.dispose(); input.dispose(); }
  });

  it("keeps the scene working and disposes an optional stage that cannot compile", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const disposed = vi.spyOn(SunShaftStage.prototype, "dispose");
    const h = await createPipelineHarness({ failCompile: name => name === "neva_sun_shafts" });
    try {
      expect(h.pipeline.diagnostics().failedStages).toContain("sun-shafts");
      expect(h.frame().finalColor).toBe(1);
      expect(disposed).toHaveBeenCalledTimes(1);
    } finally { h.dispose(); }
  });
});

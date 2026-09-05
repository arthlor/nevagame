import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindGtaoSceneDepth } from "../../src/render/pipeline/RendererPipeline";

afterEach(() => vi.restoreAllMocks());

function sceneTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(320, 180, {
    depthTexture: new THREE.DepthTexture(320, 180, THREE.UnsignedIntType)
  });
}

describe("GTAO scene-depth reuse", () => {
  it("follows composer buffer swaps for gather, denoise and depth diagnostics", () => {
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 192, 108);
    const first = sceneTarget();
    const second = sceneTarget();
    try {
      const initialVersion = pass.gtaoMaterial.version;
      for (const target of [first, second, first]) {
        bindGtaoSceneDepth(pass, target);
        for (const material of [pass.gtaoMaterial, pass.pdMaterial]) {
          expect(material.defines.NORMAL_VECTOR_TYPE).toBe(0);
          expect(material.uniforms.tDepth.value).toBe(target.depthTexture);
          expect(material.uniforms.tNormal.value).toBeUndefined();
        }
        expect(pass.depthRenderMaterial.uniforms.tDepth.value).toBe(target.depthTexture);
      }
      expect(pass.gtaoMaterial.version).toBe(initialVersion + 1);
      second.setSize(640, 360);
      pass.setSize(384, 216);
      bindGtaoSceneDepth(pass, second);
      expect(pass.gtaoMaterial.uniforms.resolution.value.toArray()).toEqual([384, 216]);
      expect(pass.gtaoMaterial.uniforms.tDepth.value).toBe(second.depthTexture);
    } finally {
      pass.dispose();
      first.dispose();
      second.dispose();
    }
  });

  it("gathers and denoises without rendering an override-normal scene or changing visibility", () => {
    const scene = new THREE.Scene();
    const subject = new THREE.Object3D();
    subject.visible = false;
    scene.add(subject);
    const pass = new GTAOPass(scene, new THREE.PerspectiveCamera(), 192, 108);
    const target = sceneTarget();
    const output = sceneTarget();
    const override = vi.spyOn(pass, "renderOverride").mockImplementation(() => { throw new Error("Duplicate scene pass"); });
    const visibility = vi.spyOn(pass, "overrideVisibility");
    const renderPass = vi.spyOn(pass, "renderPass").mockImplementation(() => {});
    try {
      bindGtaoSceneDepth(pass, target);
      pass.render({} as THREE.WebGLRenderer, output, target, 1 / 60, false);
      expect(override).not.toHaveBeenCalled();
      expect(visibility).not.toHaveBeenCalled();
      expect(subject.visible).toBe(false);
      expect(renderPass.mock.calls.map((call) => call[1])).toEqual([
        pass.gtaoMaterial, pass.pdMaterial, pass.copyMaterial, pass.blendMaterial
      ]);
      expect(pass.copyMaterial.uniforms.tDiffuse.value).toBe(target.texture);
    } finally {
      pass.dispose();
      target.dispose();
      output.dispose();
    }
  });

  it("rejects a color-only target and never owns or disposes borrowed scene depth", () => {
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const target = sceneTarget();
    const invalid = new THREE.WebGLRenderTarget();
    const disposeDepth = vi.spyOn(target.depthTexture!, "dispose");
    try {
      expect(() => bindGtaoSceneDepth(pass, invalid)).toThrow("current scene depth");
      bindGtaoSceneDepth(pass, target);
      pass.dispose();
      expect(disposeDepth).not.toHaveBeenCalled();
    } finally {
      target.dispose();
      invalid.dispose();
    }
  });
});

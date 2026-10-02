import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeRenderer } from "../helpers/fakeWebGLRenderer";
import { bindGtaoSceneDepth, configureGtaoDistanceLimits, GtaoStage } from "../../src/render/pipeline/GtaoStage";

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
    const fake = createFakeRenderer();
    const materials: Array<THREE.Material | THREE.Material[]> = [];
    const points = new THREE.Points();
    scene.add(points);
    fake.renderer.render.mockImplementation((object) => {
      if (object === scene) throw new Error("Duplicate scene pass");
      materials.push((object as THREE.Mesh).material);
    });
    try {
      bindGtaoSceneDepth(pass, target);
      pass.render(fake.webgl, output, target, 1 / 60, false);
      expect(scene.overrideMaterial).toBeNull();
      expect(points.visible).toBe(true);
      expect(subject.visible).toBe(false);
      expect(materials).toEqual([
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

  it("configures distance limits, smooth fade, and sky-tap rejection to prevent horizon artifacts", () => {
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera(), 192, 108);
    try {
      configureGtaoDistanceLimits(pass, { maxDistance: 55, fadeDistance: 32 });

      expect(pass.gtaoMaterial.uniforms.uGtaoMaxDistance.value).toBe(55);
      expect(pass.gtaoMaterial.uniforms.uGtaoFadeDistance.value).toBe(32);
      expect(pass.gtaoMaterial.fragmentShader).toContain("uniform float uGtaoMaxDistance;");
      expect(pass.gtaoMaterial.fragmentShader).toContain("if (viewPos.z < -uGtaoMaxDistance)");
      expect(pass.gtaoMaterial.fragmentShader).toContain("sampleSceneUvDepth.z < 0.99999");
      expect(pass.gtaoMaterial.fragmentShader).toContain("smoothstep(uGtaoFadeDistance, uGtaoMaxDistance, -viewPos.z)");

      expect(pass.pdMaterial.uniforms.uGtaoMaxDistance.value).toBe(55);
      expect(pass.pdMaterial.fragmentShader).toContain("uniform float uGtaoMaxDistance;");
      expect(pass.pdMaterial.fragmentShader).toContain("if (sampleDepth >= 0.99999) return;");
      expect(pass.pdMaterial.fragmentShader).toContain("if (viewPos.z < -uGtaoMaxDistance)");
      const viewPosDeclaration = "vec3 viewPos = getViewPosition(vUv, depth);";
      expect(pass.pdMaterial.fragmentShader.split(viewPosDeclaration)).toHaveLength(2);
      expect(pass.pdMaterial.fragmentShader.indexOf(viewPosDeclaration))
        .toBeLessThan(pass.pdMaterial.fragmentShader.indexOf("if (viewPos.z < -uGtaoMaxDistance)"));

      // Re-configuring updates uniforms cleanly without corrupting the shader
      configureGtaoDistanceLimits(pass, { maxDistance: 60, fadeDistance: 40 });
      expect(pass.gtaoMaterial.uniforms.uGtaoMaxDistance.value).toBe(60);
      expect(pass.gtaoMaterial.uniforms.uGtaoFadeDistance.value).toBe(40);
      expect(pass.pdMaterial.uniforms.uGtaoMaxDistance.value).toBe(60);
    } finally {
      pass.dispose();
    }
  });
});

describe("GTAO addon compatibility guards", () => {
  const anchors = [
    ["gtaoMaterial", "vec3 viewPos = getViewPosition(vUv, depth);", "gather view position"],
    ["gtaoMaterial", "if (abs(viewDelta.z) < thickness) {", "gather sky taps"],
    ["gtaoMaterial", "ao = pow(ao, scale);", "gather fade"],
    ["pdMaterial", "vec3 sampleNormal = getViewNormal(sampleUv);", "denoise sky taps"],
    ["pdMaterial", "vec3 viewPos = getViewPosition(vUv, depth);", "denoise view position"],
    ["pdMaterial", "depth == 1. || dot(viewNormal, viewNormal) == 0.", "denoise depth guard"]
  ] as const;

  for (const [materialName, anchor, description] of anchors) {
    it.each(["missing", "duplicated"])(`rejects a %s ${description} anchor without partially changing the pass`, (change) => {
      const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      try {
        const material = pass[materialName];
        const duplicate = description === "denoise depth guard"
          ? `float depth = getDepth(vUv.xy);
vec3 viewNormal = getViewNormal(vUv);
if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
  discard;
  return;
}`
          : anchor;
        material.fragmentShader = change === "missing"
          ? material.fragmentShader.replace(anchor, "changed_upstream_anchor")
          : material.fragmentShader + "\n" + duplicate;
        const before = [pass.gtaoMaterial, pass.pdMaterial].map((item) => ({
          shader: item.fragmentShader,
          version: item.version,
          uniforms: Object.keys(item.uniforms)
        }));
        expect(() => configureGtaoDistanceLimits(pass, { maxDistance: 55, fadeDistance: 32 }))
          .toThrow(`GTAO ${description}: expected`);
        expect([pass.gtaoMaterial, pass.pdMaterial].map((item) => ({
          shader: item.fragmentShader,
          version: item.version,
          uniforms: Object.keys(item.uniforms)
        }))).toEqual(before);
      } finally {
        pass.dispose();
      }
    });
  }

  it("rejects a partially configured pass before updating any distance values", () => {
    const pass = new GTAOPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    try {
      configureGtaoDistanceLimits(pass, { maxDistance: 55, fadeDistance: 32 });
      delete pass.pdMaterial.uniforms.uGtaoMaxDistance;
      expect(() => configureGtaoDistanceLimits(pass, { maxDistance: 60, fadeDistance: 40 }))
        .toThrow("GTAO distance patch is incomplete");
      expect(pass.gtaoMaterial.uniforms.uGtaoMaxDistance.value).toBe(55);
      expect(pass.gtaoMaterial.uniforms.uGtaoFadeDistance.value).toBe(32);
    } finally {
      pass.dispose();
    }
  });

  it("releases the newly created pass and its remaining materials when an addon patch fails", async () => {
    const disposePass = vi.spyOn(GTAOPass.prototype, "dispose");
    const disposedMaterials = vi.fn();
    vi.spyOn(GTAOPass.prototype, "updatePdMaterial").mockImplementationOnce(function (this: GTAOPass) {
      this.pdMaterial.fragmentShader = "changed upstream shader";
      this.gtaoMaterial.addEventListener("dispose", () => disposedMaterials("gather"));
      this.blendMaterial.addEventListener("dispose", () => disposedMaterials("blend"));
    });
    await expect(GtaoStage.create(new THREE.Scene(), new THREE.PerspectiveCamera()))
      .rejects.toThrow("GTAO denoise sky taps");
    expect(disposePass).toHaveBeenCalledTimes(1);
    expect(disposedMaterials.mock.calls).toEqual([["gather"], ["blend"]]);
  });
});

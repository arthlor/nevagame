import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { FinalColorPass, type FinalColorInputs } from "../../src/render/pipeline/FinalColorPass";

function fakeRenderer() {
  return {
    toneMapping: THREE.ACESFilmicToneMapping as THREE.ToneMapping,
    outputColorSpace: THREE.SRGBColorSpace as string,
    toneMappingExposure: 1,
    setRenderTarget: vi.fn(),
    render: vi.fn()
  };
}

function inputs(patch: Partial<FinalColorInputs> = {}): FinalColorInputs {
  const scene = new THREE.WebGLRenderTarget(64, 36, { depthTexture: new THREE.DepthTexture(64, 36) });
  return {
    scene,
    camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400),
    ambientOcclusion: null,
    aoSize: { width: 38, height: 21 },
    aoIntensity: 0,
    aoEdgeTolerance: 0.05,
    bloom: null,
    bloomStrength: 0,
    finish: { saturation: 1, contrast: 1, warmth: 0 },
    ...patch
  };
}

describe("final colour pass", () => {
  it("converts exactly once, in order: AO and bloom in linear HDR, tone map, finish, sRGB", () => {
    const fragment = new FinalColorPass().material.fragmentShader;
    const ao = fragment.indexOf("reconstructAo(vUv)");
    const bloom = fragment.indexOf("texture2D(tBloom, vUv)");
    const toneMap = fragment.indexOf("ACESFilmicToneMapping(gl_FragColor.rgb)");
    const finish = fragment.indexOf("applyFinish(gl_FragColor.rgb)");
    const encode = fragment.indexOf("sRGBTransferOETF(gl_FragColor)");
    expect(Math.min(ao, bloom, toneMap, finish, encode)).toBeGreaterThan(0);
    expect(ao).toBeLessThan(toneMap);
    expect(bloom).toBeLessThan(toneMap);
    expect(toneMap).toBeLessThan(finish);
    expect(finish).toBeLessThan(encode);
    expect(fragment.split("sRGBTransferOETF(").length - 1).toBe(1);
  });

  it("follows the renderer's tone mapping and output space, and toggles effects through uniforms only", () => {
    const pass = new FinalColorPass();
    const renderer = fakeRenderer();
    const webgl = renderer as unknown as THREE.WebGLRenderer;
    pass.render(webgl, inputs(), null);
    expect(pass.material.defines).toEqual({ SRGB_TRANSFER: "", ACES_FILMIC_TONE_MAPPING: "" });
    const version = pass.material.version;
    const uniforms = pass.material.uniforms;
    expect((uniforms.uAo.value as THREE.Vector3).x).toBe(0);
    expect(uniforms.uBloomStrength.value).toBe(0);
    expect((uniforms.uFinish.value as THREE.Vector4).x).toBe(0);

    renderer.toneMappingExposure = 1.3;
    const ao = new THREE.Texture();
    const bloom = new THREE.Texture();
    pass.render(webgl, inputs({
      ambientOcclusion: ao,
      aoIntensity: 0.44,
      bloom,
      bloomStrength: 0.14,
      finish: { saturation: 1.1, contrast: 0.95, warmth: 0.02 }
    }), null);
    expect(pass.material.version).toBe(version);
    expect(uniforms.toneMappingExposure.value).toBe(1.3);
    expect(uniforms.tAo.value).toBe(ao);
    expect((uniforms.uAo.value as THREE.Vector3).toArray()).toEqual([1, 0.44, 0.05]);
    expect(uniforms.uBloomStrength.value).toBe(0.14);
    expect((uniforms.uFinish.value as THREE.Vector4).toArray()).toEqual([1, 1.1, 0.95, 0.02]);

    // An AO texture at zero intensity (the quality handoff) composites nothing.
    pass.render(webgl, inputs({ ambientOcclusion: ao, aoIntensity: 0 }), null);
    expect((uniforms.uAo.value as THREE.Vector3).x).toBe(0);

    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    pass.render(webgl, inputs(), null);
    expect(pass.material.defines).toEqual({ ACES_FILMIC_TONE_MAPPING: "" });
    expect(pass.material.version).toBe(version + 1);
    expect(renderer.render).toHaveBeenCalledTimes(4);
  });
});

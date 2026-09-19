import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { OpaqueWaterSnapshotPass } from "../../src/render/pipeline/OpaqueWaterSnapshotPass";

function target(width = 32, height = 24): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType)
  });
}

function rendererHarness(initial: THREE.WebGLRenderTarget) {
  let active: THREE.WebGLRenderTarget | null = initial;
  let face = 2, level = 1;
  const renderer = {
    autoClear: true,
    xr: { enabled: true },
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true },
    getRenderTarget: () => active,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => level,
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null, cubeFace = 0, mipLevel = 0) => {
      active = value; face = cubeFace; level = mipLevel;
    }),
    render: vi.fn((_scene: THREE.Scene, _camera: THREE.Camera) => {}),
    compileAsync: vi.fn(async (_scene: THREE.Scene, _camera: THREE.Camera) => {}),
    copyTextureToTexture: vi.fn()
  };
  return { renderer, webgl: renderer as unknown as THREE.WebGLRenderer };
}

describe("GPU opaque-water snapshot", () => {
  it("copies unfiltered linear color and source depth, including far-plane depth, without clearing or shadows", () => {
    const source = target(), destination = target(), pass = new OpaqueWaterSnapshotPass();
    const { renderer, webgl } = rendererHarness(source);
    renderer.render.mockImplementation((scene) => {
      expect(renderer.getRenderTarget()).toBe(destination);
      expect(renderer.autoClear).toBe(false);
      expect(renderer.xr.enabled).toBe(false);
      expect(renderer.shadowMap.enabled).toBe(false);
      expect(scene.children).toHaveLength(1);
      const quad = scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      expect(quad.frustumCulled).toBe(false);
      const material = quad.material;
      expect(material.uniforms.uSourceColor.value).toBe(source.texture);
      expect(material.uniforms.uSourceDepth.value).toBe(source.depthTexture);
      expect(material).toMatchObject({
        glslVersion: THREE.GLSL3, toneMapped: false, blending: THREE.NoBlending,
        depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth
      });
      // Integer pixel lookup avoids interpolation/UV flips; direct depth output
      // preserves the nonlinear hardware depth consumed by reconstruction/SSR.
      expect(material.fragmentShader).toContain("ivec2 pixel = ivec2(gl_FragCoord.xy)");
      expect(material.fragmentShader).toContain("snapshotColor = texelFetch(uSourceColor, pixel, 0)");
      expect(material.fragmentShader).toContain("gl_FragDepth = texelFetch(uSourceDepth, pixel, 0).r");
      expect(material.fragmentShader).not.toMatch(/tonemapping|colorspace|linearTo|packDepth|discard/);
    });
    try {
      pass.copy(webgl, source, destination);
      expect(renderer.render).toHaveBeenCalledOnce();
      expect(renderer.copyTextureToTexture).not.toHaveBeenCalled();
      expect(renderer.getRenderTarget()).toBe(source);
      expect(renderer.getActiveCubeFace()).toBe(2);
      expect(renderer.getActiveMipmapLevel()).toBe(1);
      expect(renderer.autoClear).toBe(true);
      expect(renderer.xr.enabled).toBe(true);
      expect(renderer.shadowMap).toEqual({ enabled: true, autoUpdate: true, needsUpdate: true });
    } finally { pass.dispose(); source.dispose(); destination.dispose(); }
  });

  it("restores the outer render state and drops sampler references on draw failure", () => {
    const source = target(), destination = target(), pass = new OpaqueWaterSnapshotPass();
    const { renderer, webgl } = rendererHarness(source);
    let capturedMaterial: THREE.ShaderMaterial | undefined;
    renderer.render.mockImplementation(scene => {
      capturedMaterial = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
      throw new Error("snapshot failed");
    });
    try {
      expect(() => pass.copy(webgl, source, destination)).toThrow("snapshot failed");
      expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(source, 2, 1);
      expect(renderer.autoClear && renderer.xr.enabled && renderer.shadowMap.enabled).toBe(true);
      expect(capturedMaterial?.uniforms.uSourceColor.value).toBeNull();
      expect(capturedMaterial?.uniforms.uSourceDepth.value).toBeNull();
    } finally { pass.dispose(); source.dispose(); destination.dispose(); }
  });

  it("warms the same linear target shader and releases its own quad/material", async () => {
    const source = target(), destination = target(), pass = new OpaqueWaterSnapshotPass();
    const { renderer, webgl } = rendererHarness(source);
    let geometryDispose: ReturnType<typeof vi.spyOn> | undefined;
    let materialDispose: ReturnType<typeof vi.spyOn> | undefined;
    renderer.compileAsync.mockImplementation(async scene => {
      expect(renderer.getRenderTarget()).toBe(destination);
      const quad = scene.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
      geometryDispose = vi.spyOn(quad.geometry, "dispose");
      materialDispose = vi.spyOn(quad.material, "dispose");
    });
    await pass.prepare(webgl, destination);
    expect(renderer.compileAsync).toHaveBeenCalledOnce();
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(source, 2, 1);
    pass.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    source.dispose(); destination.dispose();
  });

  it("rejects feedback, missing depth, or differently sized targets before drawing", () => {
    const source = target(), wrongSize = target(16, 12), colorOnly = new THREE.WebGLRenderTarget(32, 24);
    const pass = new OpaqueWaterSnapshotPass();
    const { renderer, webgl } = rendererHarness(source);
    try {
      for (const destination of [source, wrongSize, colorOnly]) {
        expect(() => pass.copy(webgl, source, destination)).toThrow("separate, same-sized color and depth");
      }
      expect(renderer.render).not.toHaveBeenCalled();
    } finally { pass.dispose(); source.dispose(); wrongSize.dispose(); colorOnly.dispose(); }
  });
});

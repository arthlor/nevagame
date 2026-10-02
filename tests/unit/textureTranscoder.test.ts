import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ instances: [] as Array<{
  manager: THREE.LoadingManager;
  init: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  pending: Array<{ resolve: (texture: THREE.Texture) => void; reject: (error: unknown) => void }>;
}> }));

vi.mock("three/addons/loaders/KTX2Loader.js", async () => {
  const { Loader } = await import("three");
  return { KTX2Loader: class extends Loader {
    init = vi.fn(async () => undefined);
    dispose = vi.fn();
    pending: Array<{ resolve: (texture: THREE.Texture) => void; reject: (error: unknown) => void }> = [];
    constructor(manager: THREE.LoadingManager) { super(manager); fake.instances.push(this); }
    setTranscoderPath() { return this; }
    setWorkerLimit() { return this; }
    detectSupport() { return this; }
    load(_url: string, resolve: (texture: THREE.Texture) => void, _progress: unknown, reject: (error: unknown) => void) {
      void this.init();
      this.pending.push({ resolve, reject });
    }
  } };
});

import { acquireTextureTranscoder, type TextureLease } from "../../src/render/loaders/TextureTranscoder";
import { configureSurfaceTexture } from "../../src/render/materials/ExternalSurfaceTextures";

const leases: TextureLease[] = [];
const acquire = (): TextureLease => {
  const lease = acquireTextureTranscoder({} as THREE.WebGLRenderer);
  leases.push(lease);
  return lease;
};
afterEach(() => { for (const lease of leases.splice(0)) lease.dispose(); });

describe("shared texture transcoder", () => {
  it("shares workers across world/previews and releases them after the last lease", async () => {
    const world = acquire(), preview = acquire();
    expect(world.ktx2Loader).toBe(preview.ktx2Loader);
    const native = fake.instances.at(-1)!;
    const request = world.loadAsync("/terrain.ktx2");
    const texture = new THREE.CompressedTexture([], 4, 4);
    native.pending.shift()!.resolve(texture);
    await expect(request).resolves.toBe(texture);
    world.dispose();
    expect(native.dispose).not.toHaveBeenCalled();
    preview.dispose();
    expect(native.dispose).toHaveBeenCalledOnce();
    expect(acquire().ktx2Loader).not.toBe(world.ktx2Loader);
  });

  it("waits for a pending transcode and disposes a late texture after cancellation", async () => {
    const lease = acquire();
    const native = fake.instances.at(-1)!;
    const request = lease.loadAsync("/terrain.ktx2");
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    lease.dispose();
    expect(native.dispose).not.toHaveBeenCalled();
    const texture = new THREE.CompressedTexture([], 4, 4);
    const dispose = vi.spyOn(texture, "dispose");
    native.pending.shift()!.resolve(texture);
    await rejection;
    expect(dispose).toHaveBeenCalledOnce();
    expect(native.dispose).toHaveBeenCalledOnce();
  });

  it("drains failures and leaves an unused native loader's active count intact", async () => {
    const unused = acquire();
    const nativeUnused = fake.instances.at(-1)!;
    unused.dispose(); unused.dispose();
    expect(nativeUnused.dispose).not.toHaveBeenCalled();
    const used = acquire();
    const native = fake.instances.at(-1)!;
    const request = used.loadAsync("/terrain.ktx2");
    const rejection = expect(request).rejects.toThrow("decode failure");
    used.dispose();
    native.pending.shift()!.reject(new Error("decode failure"));
    await rejection;
    expect(native.dispose).toHaveBeenCalledOnce();
  });

  it("uses bundled transcoder URLs rather than runtime CDN paths", () => {
    acquire();
    const manager = fake.instances.at(-1)!.manager;
    expect(manager.resolveURL("/neva-basis/basis_transcoder.wasm")).toContain("basis_transcoder.wasm");
    expect(manager.resolveURL("/neva-basis/basis_transcoder.js")).toContain("basis_transcoder.js");
    expect(manager.resolveURL("/assets/map.ktx2")).toBe("/assets/map.ktx2");
  });

  it("retains authored mips and transfer functions for compressed maps", () => {
    const color = new THREE.CompressedTexture([], 4, 4);
    configureSurfaceTexture(color, "color");
    expect(color.generateMipmaps).toBe(false);
    expect(color.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(color.wrapS).toBe(THREE.RepeatWrapping);
    expect(color.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    const roughness = new THREE.CompressedTexture([], 4, 4);
    configureSurfaceTexture(roughness, "roughness");
    expect(roughness.generateMipmaps).toBe(false);
    expect(roughness.colorSpace).toBe(THREE.NoColorSpace);
    color.dispose(); roughness.dispose();
  });
});

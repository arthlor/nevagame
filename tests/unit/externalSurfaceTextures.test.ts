import { existsSync, statSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createSurfaceFallbackTexture,
  loadSurfaceTexture,
  POLYHAVEN_SURFACE_TEXTURES
} from "../../src/render/materials/ExternalSurfaceTextures";

describe("ExternalSurfaceTextures", () => {
  const textures: THREE.Texture[] = [];

  afterEach(() => {
    for (const texture of textures.splice(0)) texture.dispose();
  });

  it("keeps the selected Poly Haven derivatives local, bounded, and provenance-linked", () => {
    for (const spec of Object.values(POLYHAVEN_SURFACE_TEXTURES)) {
      const filePath = `${process.cwd()}/public${spec.url}`;
      expect(spec.sourcePage).toMatch(/^https:\/\/polyhaven\.com\/a\//);
      expect(existsSync(filePath)).toBe(true);
      expect(statSync(filePath).size).toBeLessThan(500_000);
    }
  });

  it("creates neutral repeatable placeholders for shader startup", () => {
    const color = createSurfaceFallbackTexture("color");
    const roughness = createSurfaceFallbackTexture("roughness");
    textures.push(color, roughness);

    expect(color.image.width).toBe(1);
    expect(color.wrapS).toBe(THREE.RepeatWrapping);
    expect(color.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(roughness.colorSpace).toBe(THREE.NoColorSpace);
    expect(roughness.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  });

  it("configures loaded maps according to their color-space role", async () => {
    const loaded = await loadSurfaceTexture(POLYHAVEN_SURFACE_TEXTURES.roadColor, {
      loadAsync: async () => new THREE.Texture()
    });
    if (!loaded) throw new Error("Expected fake texture loader to resolve");
    textures.push(loaded);

    expect(loaded.wrapT).toBe(THREE.RepeatWrapping);
    expect(loaded.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(loaded.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(loaded.anisotropy).toBe(4);
  });
});

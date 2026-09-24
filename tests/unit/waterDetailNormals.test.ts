import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  WATER_DETAIL_SPECTRUM,
  waterDetailField,
  waterDetailNormalTexture
} from "../../src/render/water/WaterDetailNormals";

const SMALL = { ...WATER_DETAIL_SPECTRUM, size: 64, waves: 24, maxCycles: 12 };

describe("water detail normals", () => {
  it("tiles without a seam: the wrap step is no larger than an interior step", () => {
    const n = SMALL.size;
    const { height } = waterDetailField(SMALL);
    let interior = 0;
    let wrap = 0;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n - 1; x += 1) interior = Math.max(interior, Math.abs(height[y * n + x + 1]! - height[y * n + x]!));
      wrap = Math.max(wrap, Math.abs(height[y * n]! - height[y * n + n - 1]!));
    }
    for (let x = 0; x < n; x += 1) wrap = Math.max(wrap, Math.abs(height[x]! - height[(n - 1) * n + x]!));
    expect(interior).toBeGreaterThan(0);
    expect(wrap).toBeLessThanOrEqual(interior * 1.001);
  });

  it("is deterministic and leans its ripples along +X", () => {
    const first = waterDetailField(SMALL);
    const second = waterDetailField(SMALL);
    expect(Array.from(first.height)).toEqual(Array.from(second.height));
    let along = 0;
    let across = 0;
    for (let index = 0; index < first.slopeX.length; index += 1) {
      along += first.slopeX[index]! ** 2;
      across += first.slopeY[index]! ** 2;
    }
    expect(along).toBeGreaterThan(across);
  });

  it("encodes unit normals in a shared, wrapping, mipmapped texture", () => {
    const texture = waterDetailNormalTexture();
    expect(waterDetailNormalTexture()).toBe(texture);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    const data = texture.image.data as Uint8Array;
    let maxSlope = 0;
    for (let index = 0; index < data.length; index += 4 * 97) {
      const x = data[index]! / 127.5 - 1;
      const y = data[index + 1]! / 127.5 - 1;
      const z = data[index + 2]! / 127.5 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
      expect(z).toBeGreaterThan(0);
      maxSlope = Math.max(maxSlope, Math.hypot(x, y) / z);
    }
    expect(maxSlope).toBeLessThanOrEqual(WATER_DETAIL_SPECTRUM.peakSlope * 1.05);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  createTerrainDetailTexture,
  decodeTerrainDetailFactor,
  generateTerrainDetailTextureData,
  TERRAIN_DETAIL_FACTOR_MAX,
  TERRAIN_DETAIL_FACTOR_MIN,
  TerrainSurfaceMaterial
} from "../../src/render/materials/TerrainSurfaceMaterial";

describe("TerrainSurfaceMaterial", () => {
  const materials: TerrainSurfaceMaterial[] = [];

  afterEach(() => {
    for (const terrain of materials.splice(0)) terrain.dispose();
  });

  it("generates deterministic, bounded, seamless palette-addressable detail", () => {
    const first = generateTerrainDetailTextureData();
    const second = generateTerrainDetailTextureData();
    expect(first).toEqual(second);
    expect(first).toHaveLength(128 * 128 * 4);

    for (let y = 0; y < 128; y += 1) {
      const firstPixel = (y * 128) * 4;
      const lastPixel = (y * 128 + 127) * 4;
      expect(first.slice(firstPixel, firstPixel + 4)).toEqual(first.slice(lastPixel, lastPixel + 4));
    }
    for (let x = 0; x < 128; x += 1) {
      const firstPixel = x * 4;
      const lastPixel = ((127 * 128) + x) * 4;
      expect(first.slice(firstPixel, firstPixel + 4)).toEqual(first.slice(lastPixel, lastPixel + 4));
    }

    for (let index = 0; index < first.length; index += 4) {
      expect(first[index + 3]).toBe(255);
      const factor = decodeTerrainDetailFactor(first[index]);
      expect(factor).toBeGreaterThanOrEqual(TERRAIN_DETAIL_FACTOR_MIN);
      expect(factor).toBeLessThanOrEqual(TERRAIN_DETAIL_FACTOR_MAX);
      expect(first[index + 1]).toBeGreaterThanOrEqual(0);
      expect(first[index + 1]).toBeLessThanOrEqual(255);
      expect(first[index + 2]).toBeGreaterThanOrEqual(0);
      expect(first[index + 2]).toBeLessThanOrEqual(255);
    }

    expect(new Set(Array.from(first).filter((_, index) => index % 4 === 1)).size).toBeGreaterThan(8);
    expect(new Set(Array.from(first).filter((_, index) => index % 4 === 2)).size).toBeGreaterThan(8);
  });

  it("configures a mipmapped repeat texture without adding a normal or displacement map", () => {
    const texture = createTerrainDetailTexture();
    expect(texture.image.width).toBe(128);
    expect(texture.image.height).toBe(128);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    texture.dispose();
  });

  it("smooths wetness by absolute time and clamps precipitation", () => {
    const terrain = new TerrainSurfaceMaterial();
    materials.push(terrain);

    terrain.updateWeather(2, 0);
    expect(terrain.wetness).toBe(0);
    terrain.updateWeather(2, 1.5);
    expect(terrain.wetness).toBeCloseTo(0.5, 6);
    terrain.updateWeather(2, 3);
    expect(terrain.wetness).toBeCloseTo(1, 6);
    terrain.updateWeather(-1, 3);
    expect(terrain.wetness).toBeCloseTo(1, 6);
    terrain.updateWeather(-1, 11);
    expect(terrain.wetness).toBeCloseTo(0, 6);

    const replay = new TerrainSurfaceMaterial();
    materials.push(replay);
    replay.updateWeather(2, 0);
    replay.updateWeather(2, 1.5);
    replay.updateWeather(2, 3);
    replay.updateWeather(-1, 3);
    replay.updateWeather(-1, 11);
    expect(replay.wetness).toBe(terrain.wetness);
  });

  it("patches the installed Three.js standard shader and exposes a stable cache key", () => {
    const terrain = new TerrainSurfaceMaterial();
    materials.push(terrain);
    const shader = {
      uniforms: { ...THREE.ShaderLib.standard.uniforms },
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    const compile = terrain.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    compile(shader);

    expect(shader.vertexShader).toContain("attribute float terrainGreenMask;");
    expect(shader.vertexShader).toContain("attribute float terrainPathBlend;");
    expect(shader.vertexShader).toContain("vTerrainPathBlend");
    expect(shader.vertexShader).toContain("vTerrainWorldPosition");
    expect(shader.fragmentShader).toContain("texture2D(terrainDetailTexture, terrainLargeUv)");
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCell");
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCellSignal");
    expect(shader.fragmentShader).toContain("nevaGroundPolygonCellEdge");
    expect(shader.fragmentShader).toContain("nevaGroundCellJitter");
    expect(shader.fragmentShader).toContain("terrainPolygonJaggedStrength");
    expect(shader.fragmentShader).toContain("terrainPolygonFacetLightingStrength");
    expect(shader.fragmentShader).toContain("mosaicMask");
    expect(shader.fragmentShader).toContain("terrainPolygonJaggedStrength * terrainMask");
    expect(shader.fragmentShader).toContain("pathShoulderMix = smoothstep(");
    expect(shader.fragmentShader).toContain("terrainPathShoulderStart, terrainPathShoulderFull");
    expect(shader.fragmentShader).toContain("pathCoreMix = smoothstep(");
    expect(shader.fragmentShader).toContain("terrainPathCoreStart, terrainPathCoreFull");
    expect(shader.fragmentShader).toContain("pathUnderlayMix = pathShoulderMix * terrainPathUnderlayStrength");
    expect(shader.fragmentShader).toContain("mosaicMask *= 1.0 - pathUnderlayMix");
    expect(shader.fragmentShader).toContain("mix(diffuseColor.rgb, pathCellColor, pathUnderlayMix)");
    expect(shader.fragmentShader).not.toContain("pathShoulderMask = step");
    expect(shader.fragmentShader).toContain("terrainPathDustColor");
    expect(shader.fragmentShader).toContain("terrainPathShoulderColor");
    expect(shader.fragmentShader).toContain("terrainPaletteVariationStrength");
    expect(shader.fragmentShader).toContain("terrainPaletteBand = step(0.34, terrainPolygonSignal)");
    expect(shader.fragmentShader).toContain("mix(0.97, 1.03, fract(terrainPolygonSignal");
    expect(shader.fragmentShader).toContain("terrainPaletteOliveColor");
    expect(shader.fragmentShader).toContain("terrainPaletteHighlightColor");
    expect(shader.fragmentShader).toContain("terrainPaletteColor");
    expect(shader.fragmentShader).toContain("roughnessFactor = mix(");
    expect(shader.fragmentShader).not.toContain("displacement");
    expect(terrain.material.flatShading).toBe(false);
    expect(shader.uniforms.terrainPathShoulderStart.value).toBe(0.48);
    expect(shader.uniforms.terrainPathShoulderFull.value).toBe(0.62);
    expect(shader.uniforms.terrainPathCoreStart.value).toBe(0.74);
    expect(shader.uniforms.terrainPathCoreFull.value).toBe(0.88);
    expect(shader.uniforms.terrainPathUnderlayStrength.value).toBe(0.14);
    expect(terrain.material.customProgramCacheKey()).toBe("neva-terrain-surface-r174-v13");
  });

  it("fails loudly when a required standard-shader chunk drifts", () => {
    const terrain = new TerrainSurfaceMaterial();
    materials.push(terrain);
    const shader = {
      uniforms: {},
      vertexShader: "void main() { #include <common> #include <worldpos_vertex> }",
      fragmentShader: "void main() { #include <common> #include <color_fragment> }"
    };
    const compile = terrain.material.onBeforeCompile as unknown as (source: typeof shader) => void;
    expect(() => compile(shader)).toThrow(/shader chunk drift/);
  });
});

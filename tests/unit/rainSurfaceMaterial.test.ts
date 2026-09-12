import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";
import { vegetationInstanceTintMaterial } from "../../src/render/materials/VegetationTintMaterial";
import { applyWorldAtmosphere } from "../../src/render/atmosphere/AtmosphereMaterial";
import { rainSurfaceUniforms, setRainSurfaceWetness } from "../../src/render/materials/RainSurfaceMaterial";
import { TerrainSurfaceMaterial } from "../../src/render/materials/TerrainSurfaceMaterial";

function compile(material: THREE.Material) {
  const shader = {
    uniforms: { ...THREE.ShaderLib.standard.uniforms },
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

afterEach(() => { setRainSurfaceWetness(0, false); PaletteMaterials.clearCache(); });

describe("palette rain response", () => {
  it("shares the ground envelope across wood, stone and foliage without recoloring source materials", () => {
    const wood = PaletteMaterials.standard("wood_weathered_01");
    const stone = PaletteMaterials.standard("stone_warm_01");
    const leaf = PaletteMaterials.standard("foliage_sage_01");
    const originalColor = wood.color.getHex();
    const shaders = [wood, stone, leaf].map(compile);
    setRainSurfaceWetness(0.7, true);
    for (const shader of shaders) {
      expect(shader.uniforms.nevaRainSurfaceWetness).toBe(rainSurfaceUniforms.nevaRainSurfaceWetness);
      expect(shader.uniforms.nevaRainSurfaceWetness.value).toBe(0.7);
    }
    const responses = shaders.map(shader => shader.uniforms.nevaRainSurfaceResponse.value as THREE.Vector3);
    expect(responses[0].x).toBeGreaterThan(responses[1].x);
    expect(responses[1].x).toBeGreaterThan(responses[2].x);
    expect(responses[1].y).toBeGreaterThan(responses[0].y);
    expect(wood.color.getHex()).toBe(originalColor);
    setRainSurfaceWetness(1, false);
    expect(shaders[0].uniforms.nevaRainSurfaceWetness.value).toBe(0);
  });

  it("retains palette identity after vegetation renaming and composes wind, rain and atmosphere once", () => {
    const source = new THREE.MeshStandardMaterial();
    source.name = "foliage_sage_01";
    const adopted = PaletteMaterials.canonicalizeLoaded(source);
    const variant = vegetationInstanceTintMaterial(adopted, true);
    applyWorldAtmosphere(variant as THREE.MeshStandardMaterial);
    const shader = compile(variant);
    expect(variant.userData.neva_palette_token).toBe("foliage_sage_01");
    expect(shader.vertexShader).toContain("attribute float _neva_wind");
    expect(shader.fragmentShader.match(/uniform float nevaRainSurfaceWetness;/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain("nevaCloudSunlight");
    expect(shader.uniforms.nevaRainSurfaceWetness).toBe(rainSurfaceUniforms.nevaRainSurfaceWetness);
    variant.dispose();
  });

  it("leaves the existing soil, water and character surface owners alone", () => {
    for (const token of ["soil_warm_01", "water_shallow_01", "skin_warm_01"] as const) {
      expect(compile(PaletteMaterials.standard(token)).uniforms.nevaRainSurfaceWetness).toBeUndefined();
    }
  });

  it("keeps the mixed terrain's wetness owner despite its inherited foliage token", () => {
    const terrain = new TerrainSurfaceMaterial();
    try {
      expect(terrain.material.userData.neva_palette_token).toBe("foliage_sage_01");
      const shader = compile(terrain.material);
      expect(shader.uniforms.nevaRainSurfaceWetness).toBeUndefined();
      terrain.updateWeather(1, 0);
      terrain.updateWeather(1, 3);
      expect(shader.uniforms.terrainWetness.value).toBe(1);
      expect(shader.fragmentShader).toContain("nevaCloudSunlight");
    } finally { terrain.dispose(); }
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { cloudShadowUniforms } from "../../src/render/atmosphere/CloudShadows";
import { applyWorldAtmosphere } from "../../src/render/atmosphere/AtmosphereMaterial";
import { vegetationInstanceTintMaterial } from "../../src/render/materials/VegetationTintMaterial";
import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";

function compile(material: THREE.Material) {
  const shader = {
    uniforms: { ...THREE.ShaderLib.standard.uniforms },
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader
  };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe("cloud sunlight integration", () => {
  it("chains authored material patches once and only attenuates directional solar illumination", () => {
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = shader => { shader.fragmentShader += "\n// authored surface"; };
    material.customProgramCacheKey = () => "authored";
    applyWorldAtmosphere(material);
    applyWorldAtmosphere(material);
    const shader = compile(material);
    expect(shader.fragmentShader).toContain("// authored surface");
    expect(shader.fragmentShader.match(/float nevaCloudSunlight\(/g)).toHaveLength(1);
    expect(shader.fragmentShader).toContain("directLight.color *= mix(1.0, nevaCloudSunlight");
    expect(shader.fragmentShader).toContain("nevaCloudSunDirection");
    expect(shader.uniforms.nevaCloudShadowMap).toBe(cloudShadowUniforms.nevaCloudShadowMap);
    expect(material.customProgramCacheKey()).toBe("authored:world-atmosphere-v1");
    material.dispose();
  });

  it("retains stone detail and weighted foliage deformation in the shared receiver", () => {
    const stone = new THREE.MeshStandardMaterial();
    stone.name = "stone_coastal_warm_01";
    // The imported stone path installs its surface patch before the cloud receiver.
    stone.userData.neva_palette_token = "stone_coastal_warm_01";
    const adopted = PaletteMaterials.canonicalizeLoaded(stone);
    const stoneShader = compile(adopted);
    expect(stoneShader.fragmentShader).toContain("nevaCloudSunlight");
    expect(stoneShader.fragmentShader).toContain("coastalMineralValue");
    const foliage = PaletteMaterials.standard("foliage_sage_01");
    foliage.userData.neva_palette_token = "foliage_sage_01";
    const variant = vegetationInstanceTintMaterial(foliage, true);
    const shader = compile(variant);
    expect(shader.vertexShader).toContain("attribute float _neva_wind");
    expect(shader.vertexShader).toContain("vNevaCloudWorldPosition");
    expect(shader.fragmentShader).toContain("nevaCloudSunlight");
  });
});

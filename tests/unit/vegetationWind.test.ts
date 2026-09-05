import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import {
  VEGETATION_TINT_PROGRAM_CACHE_KEY,
  disposeVegetationTintMaterials,
  updateVegetationWind,
  vegetationInstanceTintMaterial
} from "../../src/render/materials/VegetationTintMaterial";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import type { WeatherMotionSignal } from "../../src/render/motion/WeatherMotionSignal";

interface PatchedShader {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

const signal = (overrides: Partial<WeatherMotionSignal> = {}): WeatherMotionSignal => ({
  directionX: 1,
  directionZ: 0,
  normalizedStrength: 0.6,
  gust: 0.2,
  effectiveWindSpeed: 5,
  ...overrides
} as WeatherMotionSignal);

/** Compiles the variant the way three does, so the patch runs and captures its shader. */
function compileVariant(
  name = "foliage_sage_01",
  sourceRegionToken?: "foliage_sage_01" | "wood_warm_01"
): { material: THREE.Material; shader: PatchedShader } {
  const source = new THREE.MeshStandardMaterial({ name });
  if (sourceRegionToken) {
    source.userData.neva_source_material = name;
    source.userData.neva_palette_token = sourceRegionToken;
  }
  const material = vegetationInstanceTintMaterial(source);
  const shader: PatchedShader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {}
  };
  (material.onBeforeCompile as (s: PatchedShader) => void)(shader);
  return { material, shader };
}

afterEach(() => {
  disposeVegetationTintMaterials();
});

describe("vegetation canopy wind", () => {
  it("varies only catalog foliage while structural bark keeps its authored color", () => {
    const foliage = compileVariant("NormalTree_Leaves", "foliage_sage_01").shader;
    const bark = compileVariant("NormalTree_Bark", "wood_warm_01").shader;
    expect(foliage.uniforms.nevaTintValueStrength!.value).toBeGreaterThan(0);
    expect(foliage.uniforms.nevaTintWarmthStrength!.value).toBeGreaterThan(0);
    expect(bark.uniforms.nevaTintValueStrength!.value).toBe(0);
    expect(bark.uniforms.nevaTintWarmthStrength!.value).toBe(0);

    const vendor = new THREE.MeshStandardMaterial({ name: "NormalTree_Bark" });
    expect(vegetationInstanceTintMaterial(vendor)).toBe(vendor);
  });

  it("injects a rooted canopy sway that declares every uniform it uses", () => {
    const { shader } = compileVariant();
    for (const uniform of [
      "nevaWindTime",
      "nevaWindDir",
      "nevaWindStrength",
      "nevaWindAmplitude",
      "nevaWindTrunkHold",
      "nevaWindCanopySpan"
    ]) {
      expect(shader.uniforms[uniform], `missing uniform ${uniform}`).toBeDefined();
      expect(
        shader.vertexShader.includes(`uniform float ${uniform};`)
          || shader.vertexShader.includes(`uniform vec2 ${uniform};`),
        `undeclared identifier ${uniform} in the vertex shader`
      ).toBe(true);
    }
    // The sway must displace the working position, and only above the trunk.
    expect(shader.vertexShader).toContain("transformed.xz += nevaWindHeading * nevaBend");
    expect(shader.vertexShader).toContain("nevaWindTrunkHold");
  });

  it("carries a distinct program cache key so the swaying variant never reuses the static program", () => {
    const { material } = compileVariant();
    expect(VEGETATION_TINT_PROGRAM_CACHE_KEY).toContain("wind");
    expect((material as THREE.Material).customProgramCacheKey?.())
      .toBe(VEGETATION_TINT_PROGRAM_CACHE_KEY);
  });

  it("drives time, heading and strength from the shared weather signal", () => {
    const { shader } = compileVariant();
    updateVegetationWind(signal({ directionX: 0, directionZ: -1 }), 12.5, 1);
    expect(shader.uniforms.nevaWindTime!.value).toBe(12.5);
    expect(shader.uniforms.nevaWindDir!.value).toMatchObject({ x: 0, y: -1 });
    expect(shader.uniforms.nevaWindStrength!.value as number).toBeGreaterThan(0);
  });

  it("scales sway with wind and stills it for reduced motion", () => {
    const { shader } = compileVariant();
    updateVegetationWind(signal({ normalizedStrength: 0.1, gust: 0 }), 1, 1);
    const calm = shader.uniforms.nevaWindStrength!.value as number;
    updateVegetationWind(signal({ normalizedStrength: 1, gust: 1 }), 1, 1);
    const gale = shader.uniforms.nevaWindStrength!.value as number;
    expect(gale).toBeGreaterThan(calm);

    updateVegetationWind(signal(), 1, 0);
    expect(shader.uniforms.nevaWindStrength!.value).toBe(0);
  });

  it("keeps the canopy amplitude small enough that static cast shadows still match", () => {
    // The shadow depth material does not receive the offset, so the sway has to
    // stay well under the softness of the shadow it is cast into.
    expect(CANONICAL_RENDER_CONFIG.vegetationWind.amplitudeMeters).toBeLessThan(0.25);
    expect(CANONICAL_RENDER_CONFIG.vegetationWind.trunkHoldMeters).toBeGreaterThan(0);
  });
});

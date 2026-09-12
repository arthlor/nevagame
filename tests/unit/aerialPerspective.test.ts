import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { meanHeightDensity, updateAerialPerspective, aerialPerspectiveUniforms } from "../../src/render/atmosphere/AerialPerspective";
import { applyWorldAtmosphere } from "../../src/render/atmosphere/AtmosphereMaterial";
import { deriveLightingFrame } from "../../src/render/lighting/LightingRig";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";

describe("coastal aerial perspective", () => {
  it("matches numerical integration for level, uphill and downhill sightlines", () => {
    for (const [eye, surface] of [[2, 2], [2, 38], [38, 2], [25, 25.00001]]) {
      let reference = 0;
      for (let i = 0; i < 10000; i++) reference += Math.exp(-(eye + (surface - eye) * (i + 0.5) / 10000) / 12) / 10000;
      expect(meanHeightDensity(eye, surface, 12)).toBeCloseTo(reference, 7);
    }
    expect(meanHeightDensity(25, 30, 12)).toBeLessThan(meanHeightDensity(2, 7, 12));
  });

  it("uses the sky's radiance and increases low-lying mist as visibility falls", () => {
    const state = createInitialGameState(42);
    const frame = deriveLightingFrame(state, 0);
    updateAerialPerspective(frame, 1, true);
    const clear = aerialPerspectiveUniforms.nevaAerialDensity.value.y;
    updateAerialPerspective(frame, 0.2, true);
    expect(aerialPerspectiveUniforms.nevaAerialDensity.value.y).toBeGreaterThan(clear);
    expect(aerialPerspectiveUniforms.nevaAerialZenith.value.equals(frame.skyTopColor)).toBe(true);
    expect(aerialPerspectiveUniforms.nevaAerialHorizon.value.equals(frame.skyHorizonColor)).toBe(true);
    expect(aerialPerspectiveUniforms.nevaAerialDensity.value.w).toBe(frame.fogFar);
    updateAerialPerspective(frame, 1, false);
    expect(aerialPerspectiveUniforms.nevaAerialEnabled.value).toBe(0);
  });

  it("composes haze before tone mapping without applying the old fog a second time", () => {
    const material = new THREE.MeshStandardMaterial();
    applyWorldAtmosphere(material);
    const shader = {
      uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };
    material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader.indexOf("outgoingLight = nevaAerialPerspective")).toBeLessThan(shader.fragmentShader.indexOf("#include <tonemapping_fragment>"));
    expect(shader.fragmentShader).not.toContain("#include <fog_fragment>");
    material.dispose();
  });
});

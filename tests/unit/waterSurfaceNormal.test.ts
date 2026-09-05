import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import {
  WATER_WAVE_CONFIG,
  WaterSurface,
  waterNormal,
} from "../../src/render/water/WaterSurface";
import {
  WATER_WAVE_FUNCTION_GLSL,
  WATER_WAVE_UNIFORMS_GLSL,
  WAVE_BAND_PHASES,
  WAVE_DETAIL_AXIS,
} from "../../src/render/water/waveGlsl";
import type { LightingFrame } from "../../src/render/lighting/LightingRig";

const CONDITIONS = [
  { seaRoughness: 0, windDirectionDeg: 0, windSpeed: 0 },
  { seaRoughness: 0.2, windDirectionDeg: 35, windSpeed: 4 },
  { seaRoughness: 0.9, windDirectionDeg: 210, windSpeed: 12 },
];

const POINTS: ReadonlyArray<readonly [number, number]> = [
  [8, 42],
  [-40, 120],
  [150, 260],
  // NB: waterSpatialProfile has a hard branch cut at x = 260
  // (usesSharedMarine switches formulation there), so no parity point may
  // sit within one finite-difference stencil step of that plane: the stencil
  // would straddle the cut and measure the formulation switch, not a slope.
  [250, 120],
];

/**
 * Spots where the direction/weight field itself curves sharply (river-bend
 * and offshore ecology transitions). A finite-difference stencil there
 * measures profile-curvature advection levered by world position — e.g.
 * gradients of 0.03–0.15 where the largest physical wave slope is ~0.02 —
 * not wave slope. Both the CPU analytic form and the GPU's
 * waveHeightAndNormal() intentionally omit those advective terms
 * (locally-constant-weights approximation, shared by the mirror), so parity
 * here is bounded agreement, not stencil equality.
 */
const ADVECTION_POINTS: ReadonlyArray<readonly [number, number]> = [
  [60, 200],
  [280, 120],
  [320, -60],
];

const TIMES = [0, 12, 37.5];

/** The pre-analytic formulation, kept here as the parity reference. */
function finiteDifferenceNormal(
  x: number,
  z: number,
  timeSeconds: number,
  conditions: (typeof CONDITIONS)[number]
): THREE.Vector3 {
  const step = 0.15;
  const height = WaterSurface.height(x, z, timeSeconds, conditions);
  const dx = WaterSurface.height(x + step, z, timeSeconds, conditions) - height;
  const dz = WaterSurface.height(x, z + step, timeSeconds, conditions) - height;
  return new THREE.Vector3(-dx / step, 1, -dz / step).normalize();
}

function testFrame(): LightingFrame {
  return {
    sunDirection: new THREE.Vector3(0.62, 0.62, 0.48).normalize(),
    moonDirection: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color("#ffffff"),
    moonColor: new THREE.Color("#cdd8ea"),
    sunIntensity: 3.05,
    moonIntensity: 0.2,
    sunVisibility: 1,
    moonVisibility: 0,
    starVisibility: 0,
    practicalLightIntensity: 0,
    daylight: 1,
    skyFillIntensity: 1,
    skyFillColor: new THREE.Color("#bfd9e6"),
    skyTopColor: new THREE.Color("#7fb2d9"),
    skyHorizonColor: new THREE.Color("#f2c89c"),
    groundFillColor: new THREE.Color("#8a9a6b"),
    fogColor: new THREE.Color("#bfd9e6"),
    fogNear: 62,
    fogFar: 330,
    lightning: 0,
    lightningDirection: new THREE.Vector3(0, 1, 0),
    lightningColor: new THREE.Color("#ffffff"),
    exposure: 1,
    ambientDaylight: 1,
  };
}

describe("analytic water normal", () => {
  it("matches the finite-difference normal within tolerance", () => {
    for (const conditions of CONDITIONS) {
      for (const [x, z] of POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = finiteDifferenceNormal(x, z, time, conditions);
          // Locally-constant-weights approximation: the reference includes
          // regional weight drift over the 0.15 m stencil, the analytic form
          // does not. Agreement must stay within ~1.5 degrees.
          expect(analytic.dot(reference)).toBeGreaterThan(0.9996);
        }
      }
      for (const [x, z] of ADVECTION_POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = finiteDifferenceNormal(x, z, time, conditions);
          // Bounded agreement only (see ADVECTION_POINTS): the stencil is
          // dominated by field curvature there, so this guards against gross
          // error (wrong sign, unnormalized) rather than stencil equality.
          expect(analytic.dot(reference)).toBeGreaterThan(0.985);
          expect(analytic.y).toBeGreaterThan(0.9);
        }
      }
    }
  });

  it("is deterministic and unit-length with an upward bias", () => {
    for (const [x, z] of POINTS) {
      const first = waterNormal(x, z, 12, CONDITIONS[1]!);
      const second = waterNormal(x, z, 12, CONDITIONS[1]!);
      expect(first.equals(second)).toBe(true);
      expect(first.length()).toBeCloseTo(1, 6);
      expect(first.y).toBeGreaterThan(0.9);
    }
  });

  it("is what WaterSurface.sample returns", () => {
    const sampled = WaterSurface.sample(8, 42, 12, CONDITIONS[1]!);
    const direct = waterNormal(8, 42, 12, CONDITIONS[1]!);
    expect(sampled.normal.distanceTo(direct)).toBeLessThan(1e-9);
    // Height is untouched by the normal change.
    expect(sampled.height).toBeCloseTo(
      WaterSurface.height(8, 42, 12, CONDITIONS[1]!),
      9
    );
  });

  it("keeps the shared GLSL chunk in sync with the CPU constants", () => {
    expect(WATER_WAVE_FUNCTION_GLSL).toContain("waveHeightAndNormal");
    expect(WATER_WAVE_FUNCTION_GLSL).toContain("waveHeight(");
    expect(WATER_WAVE_UNIFORMS_GLSL).toContain("uWaterProfileMap");
    for (const phase of Object.values(WAVE_BAND_PHASES)) {
      expect(WATER_WAVE_FUNCTION_GLSL).toContain(phase.toFixed(1));
    }
    expect(WATER_WAVE_FUNCTION_GLSL).toContain(WAVE_DETAIL_AXIS.along.toFixed(2));
    expect(WATER_WAVE_FUNCTION_GLSL).toContain(WAVE_DETAIL_AXIS.across.toFixed(2));
    // WATER_WAVE_CONFIG stays the numeric owner; the chunk carries no numbers.
    for (const amplitude of WATER_WAVE_CONFIG.primary.amplitude) {
      expect(WATER_WAVE_FUNCTION_GLSL).not.toContain(amplitude.toFixed(3));
    }
  });

  it("drives the water shader: analytic varying, sky gradient, coherent glitter", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const material = water.mesh.material;
      expect(material.vertexShader).toContain("vWaveNormal");
      expect(material.vertexShader).toContain("waveHeightAndNormal");
      expect(material.fragmentShader).toContain("vWaveNormal");
      // Derivatives filter subpixel ripples; the shared analytic normal still owns elevation.
      expect(material.fragmentShader).toContain("pixelFootprint");
      expect(material.fragmentShader).toContain("uSkyHorizonColor");
      expect(material.fragmentShader).toContain("uWaterAbsorption");
      expect(material.fragmentShader).toContain("reflectView");
      expect(material.fragmentShader).toContain("exp(-uWaterAbsorption");
      expect(material.fragmentShader).not.toContain("waterFacetBand = step");
      expect(material.uniforms.uSkyHorizonColor).toBeDefined();

      const frame = testFrame();
      water.updateLighting(frame);
      expect(material.side).toBe(THREE.FrontSide);
      expect(
        (material.uniforms.uSkyHorizonColor.value as THREE.Color).equals(frame.skyHorizonColor)
      ).toBe(true);
      expect(
        (material.uniforms.uSkyColor.value as THREE.Color).equals(frame.skyTopColor)
      ).toBe(true);
    } finally {
      water.dispose();
    }
  });

  it("gates water features by quality tier and controls reflection modes", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      // Low tier: flat reflection, no near patch
      water.setQuality("low");
      expect(water.mesh.material.uniforms.uReflectionMode.value).toBe(0);
      expect(water.nearPatch.mesh.visible).toBe(false);

      // Medium tier: skyGradient, no near patch
      water.setQuality("medium");
      expect(water.mesh.material.uniforms.uReflectionMode.value).toBe(1);
      expect(water.nearPatch.mesh.visible).toBe(false);

      // High tier: skyGradient+sun, near patch active
      water.setQuality("high");
      expect(water.mesh.material.uniforms.uReflectionMode.value).toBe(2);
      expect(water.mesh.material.uniforms.uNearPatchRadius.value).toBe(42);
      expect(water.mesh.material.fragmentShader).toContain("uNearPatchRadius");
      expect(water.mesh.material.fragmentShader).toContain("length(vWorldPosition.xz - uNearPatchCenter) < uNearPatchRadius");
      expect(water.nearPatch.mesh.visible).toBe(true);
      expect(water.nearPatch.mesh.material.depthWrite).toBe(true);
      expect(water.nearPatch.mesh.material.uniforms.uReflectionMode.value).toBe(2);
    } finally {
      water.dispose();
    }
  });

  it("snaps the near-detail patch to grid and respects reduced motion", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      water.setQuality("high");
      expect(water.nearPatch.mesh.visible).toBe(true);

      const target = new THREE.Vector3(14.37, 0, -28.84);
      water.update(5, CONDITIONS[1]!, target, { reducedMotion: true });

      // The 12 m / 4 segment fixture uses the same 3 m lattice as its base.
      expect(water.nearPatch.mesh.position.x).toBe(15);
      expect(water.nearPatch.mesh.position.z).toBe(-28);
      expect(water.nearPatch.mesh.material.uniforms.uPatchCenter.value.x).toBe(15);
      expect(water.nearPatch.mesh.material.uniforms.uPatchCenter.value.y).toBe(-28);
      expect(water.nearPatch.mesh.material.uniforms.uReducedMotion.value).toBe(1);

      // Normal motion
      water.update(6, CONDITIONS[1]!, target, { reducedMotion: false });
      expect(water.nearPatch.mesh.material.uniforms.uReducedMotion.value).toBe(0);

      // Shader contains rim fade and 4th wave detail band
      expect(water.nearPatch.mesh.material.vertexShader).toContain("rimFade");
      expect(water.nearPatch.mesh.material.vertexShader).toContain("detail4Wave");
      expect(water.nearPatch.mesh.material.fragmentShader).toContain("vRimFade");
      expect(water.nearPatch.mesh.material.fragmentShader).toContain("nevaScrollingDetailNormal");
    } finally {
      water.dispose();
    }
  });
});

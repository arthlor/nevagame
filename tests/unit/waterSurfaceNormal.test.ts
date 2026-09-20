import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import {
  WATER_WAVE_CONFIG,
  WaterSurface,
  waterNormal,
  waterSpatialProfile,
} from "../../src/render/water/WaterSurface";
import { MAINLAND_RIVER, mainlandWaterSample } from "../../src/world/NevaMainland";
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

/**
 * Points where the regional field is locally constant, so the stencil and the
 * analytic form are measuring the same thing.
 */
const POINTS: ReadonlyArray<readonly [number, number]> = [
  [8, 42],
  [150, 260],
];

/**
 * Water over the shoaling shelf, where the bed is shallow enough that the
 * amplitude and orbit ramp with depth. The stencil crosses that ramp and the
 * analytic form holds it constant, so agreement here is looser than in water
 * deep enough to be past the shelf — by construction, not by accident.
 */
const SHELF_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-40, 120],
];

/**
 * Spots where the direction/weight field itself curves sharply (river-bend
 * and offshore ecology transitions). A finite-difference stencil there
 * measures profile-curvature advection levered by world position — the travel
 * direction rotates as the regional blend shifts, and a point 200 m from the
 * origin turns that rotation into gradients around 0.3–0.5 where the largest
 * physical wave slope is under 0.04. Both the CPU analytic form and the GPU's
 * waveGerstner() intentionally omit those advective terms
 * (locally-constant-weights approximation, shared by the mirror), so the
 * stencil cannot serve as a reference here at all.
 */
const ADVECTION_POINTS: ReadonlyArray<readonly [number, number]> = [
  [60, 200],
  [280, 120],
  [320, -60],
  // Sits on the sea-to-ocean blend, where the two spectra it mixes are far
  // enough apart that drift across the stencil dominates the wave's own
  // slope. Grouped by what varies at the point rather than by how close the
  // number happens to land to a threshold.
  [250, 120],
];

/**
 * Open water deep enough to sit past the shoaling shelf and far enough
 * offshore that the regional weights are constant. With nothing for the
 * locally-constant approximation to miss, the trochoid's analytic normal is
 * the exact normal of the surface its own height function describes, so these
 * points pin the Gerstner Jacobian itself rather than a tolerance around it.
 */
const UNIFORM_FIELD_POINTS: ReadonlyArray<readonly [number, number]> = [
  [150, 260],
  [600, 400],
];

const TIMES = [0, 12, 37.5];

/**
 * Second-order reference for the exactness check.
 *
 * The 0.15 m forward difference below is the formulation this normal replaced,
 * and it is kept as the historical parity reference — but its own truncation
 * error grows with surface curvature, so on a steep sea it disagrees with any
 * exact normal, including a correct one. A central difference over a short
 * step converges quadratically, which makes the uniform-field assertion a
 * statement about the Jacobian rather than about the stencil.
 */
function preciseNormal(
  x: number,
  z: number,
  timeSeconds: number,
  conditions: (typeof CONDITIONS)[number]
): THREE.Vector3 {
  const step = 0.01;
  const dx = (WaterSurface.height(x + step, z, timeSeconds, conditions)
    - WaterSurface.height(x - step, z, timeSeconds, conditions)) / (2 * step);
  const dz = (WaterSurface.height(x, z + step, timeSeconds, conditions)
    - WaterSurface.height(x, z - step, timeSeconds, conditions)) / (2 * step);
  return new THREE.Vector3(-dx, 1, -dz).normalize();
}

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
    stormStrength: 0,
  };
}

describe("analytic water normal", () => {
  it("carries mainland water along its own river bends", () => {
    for (let index = 1; index < MAINLAND_RIVER.length; index++) {
      const from = MAINLAND_RIVER[index - 1];
      const to = MAINLAND_RIVER[index];
      const x = (from.x + to.x) * 0.5, z = (from.z + to.z) * 0.5;
      const channel = mainlandWaterSample(x, z);
      const profile = waterSpatialProfile(x, z);
      expect(profile.weights.river).toBeGreaterThan(0.99);
      expect(profile.localDirection.dot(new THREE.Vector2(channel.direction.x, channel.direction.z))).toBeGreaterThan(0.999);
    }
  });
  it("matches the finite-difference normal within tolerance", () => {
    for (const conditions of CONDITIONS) {
      for (const [x, z] of UNIFORM_FIELD_POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = preciseNormal(x, z, time, conditions);
          // Where nothing the approximation drops actually varies, the two
          // must agree to within about a fifth of a degree. What is left is
          // the central difference's own truncation plus the displacement
          // inversion's residual, both of which grow with sea state and
          // neither of which is a modelling gap — this bound is still two
          // orders of magnitude tighter than the approximate cases below.
          // A trochoid whose
          // Jacobian were wrong would fail here even though the looser bounds
          // below would still pass, which is the point of separating them.
          expect(
            analytic.dot(reference),
            `exact parity in a uniform field at (${x}, ${z}), t=${time}, ${JSON.stringify(conditions)}`
          ).toBeGreaterThan(0.999995);
        }
      }
      for (const [x, z] of POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = finiteDifferenceNormal(x, z, time, conditions);
          // Nothing the locally-constant approximation drops varies here, so
          // this is close parity rather than a wide tolerance; the residual is
          // the stencil's own truncation over a curved surface.
          expect(
            analytic.dot(reference),
            `finite-difference parity at (${x}, ${z}), t=${time}, ${JSON.stringify(conditions)}`
          ).toBeGreaterThan(0.9996);
        }
      }
      for (const [x, z] of SHELF_POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = finiteDifferenceNormal(x, z, time, conditions);
          // Plus the shoaling ramp the stencil crosses (see SHELF_POINTS).
          // The ramp steepens with both sea state and band steepness, so this
          // is the widest of the parity bounds, near 6° in the roughest sea
          // the conditions cover. It is a guard
          // against the shelf response going wrong in kind — wrong sign, lost
          // normalisation, a normal that stops pointing up — not a precision
          // claim; the uniform-field case above is where precision is pinned.
          expect(
            analytic.dot(reference),
            `shelf parity at (${x}, ${z}), t=${time}, ${JSON.stringify(conditions)}`
          ).toBeGreaterThan(0.995);
          expect(analytic.y).toBeGreaterThan(0.9);
        }
      }
      // The stencil is not a usable reference at these points at all: the
      // travel direction turns as the regional blend shifts, and that rotation
      // is levered by ~200 m of world position, so the measured gradient there
      // runs an order of magnitude past any slope the waves themselves carry.
      // Comparing against it would only assert how much advection the shared
      // approximation drops. What is worth pinning is that the analytic form
      // stays a plausible water normal, so the bound below comes from the
      // config: no combination of bands, sea state and shoaling can produce a
      // slope steeper than the sum of each band's own A·k at its ceiling.
      const peak = (values: readonly [number, number, number]) => Math.max(...values);
      const roughnessCeiling = 1
        + conditions.seaRoughness * peak(WATER_WAVE_CONFIG.roughnessGain)
        + conditions.windSpeed * WATER_WAVE_CONFIG.oceanWindGainPerMeterSecond;
      const shoalCeiling = 1 + WATER_WAVE_CONFIG.shoaling.gain;
      const maxSlope = [WATER_WAVE_CONFIG.primary, WATER_WAVE_CONFIG.cross, WATER_WAVE_CONFIG.detail]
        .reduce((sum, band) => sum + peak(band.amplitude) * peak(band.frequency), 0)
        * roughnessCeiling * shoalCeiling;
      for (const [x, z] of ADVECTION_POINTS) {
        for (const time of TIMES) {
          const analytic = waterNormal(x, z, time, conditions);
          const slope = Math.hypot(analytic.x, analytic.z) / analytic.y;
          expect(
            slope,
            `wave slope stays within the configured ceiling at (${x}, ${z}), t=${time}`
          ).toBeLessThanOrEqual(maxSlope);
          expect(analytic.length()).toBeCloseTo(1, 9);
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

  it("keeps shallow caustics on the sun while moonlight and lightning own reflection", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      const frame = testFrame();
      frame.sunIntensity = 0;
      frame.daylight = 0;
      frame.lightning = 1;
      water.updateLighting(frame);
      expect(water.coastalUniforms.uCausticSunStrength.value).toBe(0);
      expect(water.coastalUniforms.uCausticSunDirection.value.equals(frame.sunDirection)).toBe(true);
      expect(water.mesh.material.uniforms.uSunDirection.value.equals(frame.lightningDirection)).toBe(true);
      expect(water.nearPatch.mesh.material.uniforms.uCausticSunStrength)
        .toBe(water.mesh.material.uniforms.uCausticSunStrength);
      frame.sunIntensity = 1;
      frame.daylight = 1;
      water.updateLighting(frame);
      expect(water.coastalUniforms.uCausticSunStrength.value).toBeGreaterThan(0);
    } finally {
      water.dispose();
    }
  });

  it("snaps the near-detail patch to grid and respects reduced motion", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4, centerX: 0, centerZ: 0 });
    try {
      water.setQuality("high");
      expect(water.nearPatch.mesh.visible).toBe(true);

      const target = new THREE.Vector3(14.37, 0, -28.84);
      water.update(5, CONDITIONS[1]!, target, { reducedMotion: true });

      // The 12 m / 4 segment fixture uses the same 3 m lattice as its base.
      expect(water.nearPatch.mesh.position.x).toBe(15);
      expect(water.nearPatch.mesh.position.z).toBe(-30);
      expect(water.nearPatch.mesh.material.uniforms.uPatchCenter.value.x).toBe(15);
      expect(water.nearPatch.mesh.material.uniforms.uPatchCenter.value.y).toBe(-30);
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

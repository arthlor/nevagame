import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import { waterDetailNormalTexture } from "../../src/render/water/WaterDetailNormals";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  WATER_WAVE_CONFIG,
  WaterSurface,
  waterNormal,
  waterSpatialProfile,
} from "../../src/render/water/WaterSurface";
import { MAINLAND_RIVER, mainlandWaterSample } from "../../src/world/NevaMainland";
import {
  WATER_SWASH_GLSL,
  WATER_WAVE_FUNCTION_GLSL,
  WATER_WAVE_UNIFORMS_GLSL,
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
 * Spots where the regional weights change (river-bend and offshore ecology
 * transitions, the sea-to-ocean blend), 60–320 m from the origin. When a
 * band's wavenumber, speed or heading followed the region or the baked travel
 * direction, the stencil here measured gradients of 0.3–0.5 against a largest
 * physical slope under 0.04: the phase k(x)·x − ω(x)·t was sheared by the
 * lever of world position and by elapsed time. With plane-wave bands only
 * the height varies across these points, so the analytic form (which holds
 * it locally constant) must stay close to the stencil at any time.
 */
const ADVECTION_POINTS: ReadonlyArray<readonly [number, number]> = [
  [60, 200],
  [280, 120],
  [320, -60],
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
    twilight: 0,
    sunGlowColor: new THREE.Color(0, 0, 0),
    sunGlow: 0,
    antiTwilightColor: new THREE.Color("#f2c89c"),
    antiTwilight: 0,
    cloudSunColor: new THREE.Color("#ffffff"),
    sunScatterColor: new THREE.Color(0, 0, 0),
    sunAureoleColor: new THREE.Color("#ffffff"),
    valleyMist: 0,
    lightningSeed: 0,
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
          // The ramp steepens with both sea state and band steepness, and the
          // swash lift fades across the same shelf, so this is the widest of
          // the parity bounds, near 8° in the roughest sea the conditions
          // cover. It is a guard
          // against the shelf response going wrong in kind — wrong sign, lost
          // normalisation, a normal that stops pointing up — not a precision
          // claim; the uniform-field case above is where precision is pinned.
          expect(
            analytic.dot(reference),
            `shelf parity at (${x}, ${z}), t=${time}, ${JSON.stringify(conditions)}`
          ).toBeGreaterThan(0.99);
          expect(analytic.y).toBeGreaterThan(0.9);
        }
      }
      // Plane waves: across a regional blend only the height ramps, never the
      // phase, so parity holds there too — also after an hour of play, when
      // any spatially varying speed would have sheared the crests apart.
      for (const [x, z] of ADVECTION_POINTS) {
        for (const time of [...TIMES, 3600]) {
          const analytic = waterNormal(x, z, time, conditions);
          const reference = finiteDifferenceNormal(x, z, time, conditions);
          expect(
            analytic.dot(reference),
            `blend parity at (${x}, ${z}), t=${time}, ${JSON.stringify(conditions)}`
          ).toBeGreaterThan(0.995);
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
    expect(WATER_WAVE_FUNCTION_GLSL).toContain("void nevaWaveField(");
    expect(WATER_WAVE_UNIFORMS_GLSL).toContain("uWaterProfileMap");
    expect(WATER_WAVE_UNIFORMS_GLSL).toContain(`uBandAmplitude[${WATER_WAVE_CONFIG.bands.length}]`);
    // The same k·x − ωt travel convention as the CPU mirror, with a constant
    // wave vector and speed per band.
    expect(WATER_WAVE_FUNCTION_GLSL).toContain("dot(p, wave.xy) - uTime * wave.z");
    // WATER_WAVE_CONFIG stays the numeric owner; the band maths carries no
    // band numbers. (The swash chunk's own sines mirror swashLevel().)
    const bandMaths = WATER_WAVE_FUNCTION_GLSL.replace(WATER_SWASH_GLSL, "");
    for (const band of WATER_WAVE_CONFIG.bands) {
      for (const amplitude of band.amplitude) {
        if (amplitude === 0) continue;
        expect(bandMaths).not.toContain(amplitude.toFixed(3));
      }
    }
  });

  it("drives the water shader: smooth normals, detail ripples, sky probe, physical glint", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const material = water.mesh.material;
      expect(material.vertexShader).toContain("vWaveNormal");
      expect(material.fragmentShader).toContain("vWaveNormal");
      // Smooth water: no triangle-derived facet normal anywhere.
      expect(material.fragmentShader).not.toMatch(/cross\(\s*dFdx/);
      expect(material.fragmentShader).not.toContain("uFacetStrength");
      // Ripples below the lattice come from the tileable detail map, and its
      // mip shortfall (Toksvig) joins the unresolved wave slope variance.
      expect(material.uniforms.uWaterNormalMap.value).toBe(waterDetailNormalTexture());
      expect(material.fragmentShader).toContain("nevaMarineDetail(");
      expect(material.fragmentShader).toContain("vSlopeVariance");
      // Rough water reflects a blurred, higher band of the real sky.
      expect(material.fragmentShader).toContain("textureLod(uSkyProbe");
      expect(material.fragmentShader).toContain("float ggx");
      expect(material.fragmentShader).toContain("uSkyHorizonColor");
      expect(material.fragmentShader).toContain("exp(-uWaterAbsorption");
      expect(material.uniforms.uSkyHorizonColor).toBeDefined();

      // The probe is optional: without it the analytic gradient stands in.
      expect(material.uniforms.uSkyProbeEnabled.value).toBe(0);
      const probe = new THREE.Texture();
      water.setSkyProbe(probe, 256);
      expect(material.uniforms.uSkyProbe.value).toBe(probe);
      expect(water.headwaterSurface.material.uniforms.uSkyProbe.value).toBe(probe);
      expect(material.uniforms.uSkyProbeEnabled.value).toBe(1);
      expect(material.uniforms.uSkyProbeMaxLod.value).toBe(5);
      water.setSkyProbe(null);
      expect(material.uniforms.uSkyProbeEnabled.value).toBe(0);

      const frame = testFrame();
      water.updateLighting(frame);
      expect(material.side).toBe(THREE.FrontSide);
      expect((material.uniforms.uSkyHorizonColor.value as THREE.Color).equals(frame.skyHorizonColor)).toBe(true);
      expect((material.uniforms.uSkyColor.value as THREE.Color).equals(frame.skyTopColor)).toBe(true);
    } finally {
      water.dispose();
    }
  });

  it("gates water features by quality tier and controls reflection modes", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const modes = { flat: 0, skyGradient: 1, "skyGradient+sun": 2 } as const;
      for (const tier of ["low", "medium", "high"] as const) {
        water.setQuality(tier);
        const tierConfig = CANONICAL_RENDER_CONFIG.waterSurface.quality[tier];
        expect(water.mesh.material.uniforms.uReflectionMode.value).toBe(modes[tierConfig.reflection]);
        expect(water.headwaterSurface.material.uniforms.uReflectionMode)
          .toBe(water.mesh.material.uniforms.uReflectionMode);
        expect(water.coastalUniforms.uSsrEnabled.value).toBe(tier === "high" ? 1 : 0);
      }
    } finally {
      water.dispose();
    }
  });

  it("keeps shallow caustics on the sun while moonlight and lightning own reflection", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const frame = testFrame();
      frame.sunIntensity = 0;
      frame.daylight = 0;
      frame.lightning = 1;
      water.updateLighting(frame);
      expect(water.coastalUniforms.uCausticSunStrength.value).toBe(0);
      expect(water.coastalUniforms.uCausticSunDirection.value.equals(frame.sunDirection)).toBe(true);
      expect(water.mesh.material.uniforms.uSunDirection.value.equals(frame.lightningDirection)).toBe(true);
      expect(water.headwaterSurface.material.uniforms.uCausticSunStrength)
        .toBe(water.mesh.material.uniforms.uCausticSunStrength);
      frame.sunIntensity = 1;
      frame.daylight = 1;
      water.updateLighting(frame);
      expect(water.coastalUniforms.uCausticSunStrength.value).toBeGreaterThan(0);
    } finally {
      water.dispose();
    }
  });

  it("selects the LOD lattice from the camera and respects reduced motion", () => {
    const water = new FacetedWater();
    try {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 4000);
      camera.position.set(96, 14.5, 88);
      camera.lookAt(71, 1.4, 64);
      camera.updateMatrixWorld(true);
      water.update(5, CONDITIONS[1]!, undefined, { reducedMotion: true, camera });
      expect(water.lod.full.geometry.instanceCount).toBeGreaterThan(0);
      expect(water.mesh.material.uniforms.uReducedMotion.value).toBe(1);
      expect(water.mesh.material.uniforms.uLodMorph.value).toBe(water.lod.ranges.morph);
      water.update(6, CONDITIONS[1]!, undefined, { reducedMotion: false });
      expect(water.mesh.material.uniforms.uReducedMotion.value).toBe(0);
      expect(water.mesh.material.vertexShader).toContain("nevaLodLattice");
    } finally {
      water.dispose();
    }
  });
});

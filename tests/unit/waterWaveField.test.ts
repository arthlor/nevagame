import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import { ShoreFoam } from "../../src/render/water/ShoreFoam";
import {
  createWaveUniforms,
  maxWaveDisplacement,
  WATER_WAVE_CONFIG,
  waterHeight,
  waterSpatialProfile,
} from "../../src/render/water/WaterSurface";
import { WorldLayout } from "../../src/world/WorldLayout";

const CONDITIONS = [
  { seaRoughness: 0, windDirectionDeg: 0, windSpeed: 0 },
  { seaRoughness: 0.45, windDirectionDeg: 120, windSpeed: 7 },
  { seaRoughness: 1, windDirectionDeg: 210, windSpeed: 25 },
];

const TIMES = [0, 3.5, 11, 29.25, 60];

/** Wave displacement alone, with the static surface baseline removed. */
function displacement(x: number, z: number, time: number, conditions: (typeof CONDITIONS)[number]): number {
  return waterHeight(x, z, time, conditions) - WorldLayout.waterSurfaceElevation(x, z);
}

function peakToTrough(x: number, z: number, conditions: (typeof CONDITIONS)[number]): number {
  let low = Infinity;
  let high = -Infinity;
  for (let time = 0; time < 24; time += 0.2) {
    const height = displacement(x, z, time, conditions);
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return high - low;
}

describe("water wave field", () => {
  it("dies at the waterline so waves cannot break through the beach", () => {
    // A transect marching up a real shore, from the shelf into the swash zone.
    const transect: { z: number; depth: number }[] = [];
    for (let z = 56; z <= 72; z += 0.25) {
      transect.push({ z, depth: WorldLayout.waterColumnDepth(20, z) });
    }
    const damped = transect.filter(
      (sample) => sample.depth > 0 && sample.depth <= WATER_WAVE_CONFIG.shoaling.dampMeters
    );
    // Guard the guard: if the shoreline profile ever moves so that the
    // transect misses the swash zone, this assertion would pass on an empty
    // set and quietly stop testing anything.
    expect(damped.length, "transect crosses the damp band").toBeGreaterThanOrEqual(4);

    for (const conditions of CONDITIONS) {
      for (const { z, depth } of damped) {
        for (const time of TIMES) {
          // Inside the damp band the surface must approach the still
          // waterline, or a crest would stand above ground the shoreline
          // says is dry. The bound scales with how far into the band the
          // sample sits, so the ramp is checked and not just its end.
          const allowed = 0.06 + 0.5 * (depth / WATER_WAVE_CONFIG.shoaling.dampMeters);
          expect(
            Math.abs(displacement(20, z, time, conditions)),
            `damped displacement at z=${z}, depth ${depth.toFixed(2)} m, t=${time}`
          ).toBeLessThan(allowed);
        }
      }
    }
  });

  it("grows the same sea over a shelf and settles again in deep water", () => {
    // Two points on the same shore normal that the regional field classifies
    // identically — pure sea, no river, no ocean — so the only thing that
    // differs between them is how deep the water is. Comparing points whose
    // regional mix also differed would measure the blend, not shoaling.
    const shelf: readonly [number, number] = [-40, 105];
    const deep: readonly [number, number] = [-40, 185];
    for (const point of [shelf, deep]) {
      const weights = waterSpatialProfile(...point).weights;
      expect(weights.sea, `pure sea at (${point[0]}, ${point[1]})`).toBeGreaterThan(0.999);
    }
    const shelfDepth = WorldLayout.waterColumnDepth(...shelf);
    const deepDepth = WorldLayout.waterColumnDepth(...deep);
    expect(shelfDepth).toBeGreaterThan(WATER_WAVE_CONFIG.shoaling.dampMeters);
    expect(shelfDepth).toBeLessThan(WATER_WAVE_CONFIG.shoaling.deepMeters);
    expect(deepDepth).toBeGreaterThan(WATER_WAVE_CONFIG.shoaling.deepMeters);

    // The expected lift is the shoaling curve's own value at that depth, so
    // this pins the transformation rather than merely its direction.
    const { gain, peakMeters, deepMeters } = WATER_WAVE_CONFIG.shoaling;
    const t = THREE.MathUtils.clamp((shelfDepth - peakMeters) / (deepMeters - peakMeters), 0, 1);
    const expectedLift = 1 + gain * (1 - t * t * (3 - 2 * t));
    // The check below compares the field against this same curve, so it would
    // stay green if shoaling were turned off entirely — both sides would go to
    // one. This pins that the shipped configuration actually transforms the
    // wave train over its own shelf, which is the behaviour, not the formula.
    expect(expectedLift, "shoaling is a real lift, not a no-op").toBeGreaterThan(1.25);

    for (const conditions of CONDITIONS) {
      const ratio = peakToTrough(...shelf, conditions) / peakToTrough(...deep, conditions);
      expect(
        ratio,
        `shoaling lift at ${shelfDepth.toFixed(2)} m vs ${deepDepth.toFixed(2)} m`
      ).toBeCloseTo(expectedLift, 1);
    }
  });

  it("stays inside the envelope the frustum margin is built from", () => {
    const margin = maxWaveDisplacement();
    const points: ReadonlyArray<readonly [number, number]> = [
      [40, 120], [150, 260], [600, 400], [70, 90], [-92, 100], [-15.3, -6],
    ];
    for (const conditions of CONDITIONS) {
      for (const [x, z] of points) {
        for (const time of TIMES) {
          const height = displacement(x, z, time, conditions);
          expect(Number.isFinite(height)).toBe(true);
          expect(
            Math.abs(height),
            `displacement within the declared margin at (${x}, ${z}), t=${time}`
          ).toBeLessThanOrEqual(margin.vertical);
        }
      }
    }
    // A margin that has drifted far past what the field can reach would cull
    // nothing and hide the regression this guards, so it stays plausible too.
    expect(margin.vertical).toBeLessThan(8);
    expect(margin.horizontal).toBeLessThan(20);
  });

  it("orders marine band speeds by deep-water dispersion", () => {
    const { primary, cross, detail } = WATER_WAVE_CONFIG;
    // Sea and ocean columns only: a river channel is not a dispersive train.
    for (const region of [1, 2]) {
      const bands = [primary, cross, detail].map((band) => ({
        frequency: band.frequency[region]!,
        phaseSpeed: Math.abs(band.speed[region]!) / band.frequency[region]!,
      }));
      // Longer waves run faster, which is what stops the bands moving as one
      // scrolling sheet; and each phase speed matches sqrt(g/k) up to the
      // shared tempo, so the ratios are physical rather than hand-picked.
      for (let index = 1; index < bands.length; index += 1) {
        expect(bands[index]!.frequency).toBeGreaterThan(bands[index - 1]!.frequency);
        expect(bands[index]!.phaseSpeed).toBeLessThan(bands[index - 1]!.phaseSpeed);
      }
      const tempo = bands.map((band) => band.phaseSpeed / Math.sqrt(9.81 / band.frequency));
      for (const value of tempo) {
        expect(value).toBeCloseTo(WATER_WAVE_CONFIG.dispersionTempo, 1);
      }
    }
  });

  it("gives every displacing surface the identical wave field", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    const foam = new ShoreFoam({
      waterProfileMap: water.waterProfileMap,
      waterProfileBounds: water.waterProfileBounds,
      waterDepthMap: water.depthMap,
    });
    try {
      const expected = createWaveUniforms();
      const surfaces = {
        coarse: water.mesh.material.uniforms,
        near: water.nearPatch.mesh.material.uniforms,
        foam: foam.mesh.material.uniforms,
      };
      for (const [name, uniform] of Object.entries(expected)) {
        for (const [surface, uniforms] of Object.entries(surfaces)) {
          const actual = uniforms[name];
          expect(actual, `${surface} declares ${name}`).toBeDefined();
          const value = actual!.value;
          const reference = uniform.value;
          if (typeof reference === "number") {
            expect(value, `${surface}.${name}`).toBe(reference);
          } else if (reference instanceof THREE.Vector2 || reference instanceof THREE.Vector3) {
            expect(
              (value as THREE.Vector2 | THREE.Vector3).equals(reference as never),
              `${surface}.${name} = ${String(value)}`
            ).toBe(true);
          }
        }
      }
      // The bed lookup drives shoaling, so a surface without it would displace
      // a different sea than its neighbour and tear at the shared boundary.
      for (const [surface, uniforms] of Object.entries(surfaces)) {
        expect(uniforms.uWaterDepthMap?.value, `${surface} reads the canonical bed`).toBeTruthy();
        expect(uniforms.uCoastalFieldEnabled?.value, `${surface} enables the bed lookup`).toBe(1);
      }
    } finally {
      foam.dispose();
      water.dispose();
    }
  });

  it("drives trochoidal displacement and fold-driven foam through the shaders", () => {
    const water = new FacetedWater({ width: 12, depth: 12, segmentsX: 4, segmentsZ: 4 });
    try {
      for (const material of [water.mesh.material, water.nearPatch.mesh.material]) {
        // Horizontal displacement has to reach the position, not just exist.
        expect(material.vertexShader).toContain("waveGerstner");
        expect(material.vertexShader).toContain("displaced.xz += offset");
        expect(material.vertexShader).toContain("nevaBedWaterDepth");
        // The fold has to survive to the fragment stage, or whitecaps fall
        // back to being a roughness dial with no idea where the crests are.
        expect(material.vertexShader).toContain("vWaveFold");
        expect(material.fragmentShader).toContain("vWaveFold");
        expect(material.fragmentShader).toContain("uWhitecapFold");
        expect(material.fragmentShader).toContain("uCrestShading");
      }
    } finally {
      water.dispose();
    }
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FacetedWater } from "../../src/render/water/FacetedWater";
import {
  bandAngularSpeed,
  bandDirection,
  createWaveUniforms,
  maxWaveDisplacement,
  swashRunupMeters,
  WATER_WAVE_CONFIG,
  waterHeight,
  waterSpatialProfile,
} from "../../src/render/water/WaterSurface";
import { createWaterFieldSample, WaterFieldStore } from "../../src/render/water/waterField";
import { swashLevel } from "../../src/render/water/WaterSurface";
import { WATER_SWASH_GLSL } from "../../src/render/water/waveGlsl";
import { COASTAL_FIELD_GLSL } from "../../src/render/water/CoastalOptics";
import { BoatWakePool } from "../../src/render/water/BoatWakePool";
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
  for (let time = 0; time < 40; time += 0.2) {
    const height = displacement(x, z, time, conditions);
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  return high - low;
}

/** Depth the wave field actually shoals against: the baked, filtered bed. */
function fieldDepth(x: number, z: number): number {
  return WaterFieldStore.canonical().sample(x, z, createWaterFieldSample()).depth;
}

/**
 * How much later the surface at `origin + 2 m · direction` repeats what the
 * surface at `origin` did (seconds). Positive means the pattern travels along
 * `direction`. A temporal lag between two close points stays valid on a
 * winding river, where a long spatial transect would leave the channel.
 */
function arrivalLag(origin: readonly [number, number], direction: THREE.Vector2,
  conditions: (typeof CONDITIONS)[number]): number {
  const step = 0.05;
  const series = (x: number, z: number) => {
    const values: number[] = [];
    for (let time = 0; time < 24; time += step) values.push(displacement(x, z, time, conditions));
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.map((value) => value - mean);
  };
  const upstream = series(origin[0], origin[1]);
  const downstream = series(origin[0] + direction.x * 2, origin[1] + direction.y * 2);
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = -40; lag <= 40; lag += 1) {
    let correlation = 0;
    for (let index = 50; index < upstream.length - 50; index += 1) correlation += upstream[index]! * downstream[index + lag]!;
    if (correlation > best) { best = correlation; bestLag = lag; }
  }
  return bestLag * step;
}

describe("water wave field", () => {
  it("damps the waves at the waterline so crests cannot break through the beach", () => {
    const transect: { z: number; depth: number }[] = [];
    for (let z = 56; z <= 72; z += 0.25) transect.push({ z, depth: fieldDepth(20, z) });
    const damped = transect.filter(
      (sample) => sample.depth > 0 && sample.depth <= WATER_WAVE_CONFIG.shoaling.dampMeters
    );
    // Guard the guard: an empty transect would pass vacuously.
    expect(damped.length, "transect crosses the damp band").toBeGreaterThanOrEqual(4);
    for (const conditions of CONDITIONS) {
      // The waves die there; what remains is the swash sheet, which by design
      // rises at most the run-up above still water.
      const swash = swashRunupMeters(conditions.seaRoughness);
      for (const { z, depth } of damped) {
        for (const time of TIMES) {
          const allowed = 0.06 + 0.5 * (depth / WATER_WAVE_CONFIG.shoaling.dampMeters);
          const height = displacement(20, z, time, conditions);
          expect(height, `damped crest at z=${z}, depth ${depth.toFixed(2)} m, t=${time}`).toBeLessThan(allowed + swash);
          expect(height, `damped trough at z=${z}, t=${time}`).toBeGreaterThan(-allowed);
        }
      }
    }
  });

  it("runs the waterline up the beach and draws it back", () => {
    // A point at the still waterline on a surf beach: the surface there rises
    // by the run-up and falls back to still water over each set.
    const x = 132;
    let z = 70;
    while (fieldDepth(x, z) < 0.02 && z < 100) z += 0.25;
    const contact = WaterFieldStore.canonical().sample(x, z, createWaterFieldSample()).contact;
    expect(contact, "the transect reaches a surf beach").toBeGreaterThan(0.3);
    const calm = CONDITIONS[0]!;
    let low = Infinity;
    let high = -Infinity;
    for (let time = 0; time < WATER_WAVE_CONFIG.swash.periodSeconds * 3; time += 0.1) {
      const height = displacement(x, z, time, calm);
      low = Math.min(low, height);
      high = Math.max(high, height);
    }
    expect(high - low).toBeGreaterThan(swashRunupMeters(0) * contact * 0.6);
    expect(high).toBeLessThanOrEqual(swashRunupMeters(0) + 0.1);
    // Freshwater banks carry a current, not an arriving set.
    const riverZ = -40;
    const riverX = WorldLayout.riverCenterX(riverZ) + 3;
    expect(WorldLayout.coastalContactWeightAt(riverX, riverZ)).toBe(0);
  });

  it("grows the same sea over a shelf and settles again in deep water", () => {
    // Two points on one shore normal that the regional field classifies as
    // pure sea, one on the shelf (past the swash zone) and one past it, so the
    // only thing that differs between them is how deep the water is.
    let shelfZ = 95;
    while (!(fieldDepth(-40, shelfZ) > WATER_WAVE_CONFIG.swash.fadeDepthMeters[1] + 0.2
      && fieldDepth(-40, shelfZ) < WATER_WAVE_CONFIG.shoaling.deepMeters - 2) && shelfZ < 170) shelfZ += 1;
    const shelf: readonly [number, number] = [-40, shelfZ];
    const deep: readonly [number, number] = [-40, 185];
    for (const point of [shelf, deep]) {
      expect(waterSpatialProfile(...point).weights.sea, `pure sea at (${point[0]}, ${point[1]})`).toBeGreaterThan(0.99);
    }
    const shelfDepth = fieldDepth(...shelf);
    expect(fieldDepth(...deep)).toBeGreaterThan(WATER_WAVE_CONFIG.shoaling.deepMeters);
    const { gain, peakMeters, deepMeters } = WATER_WAVE_CONFIG.shoaling;
    const t = THREE.MathUtils.clamp((shelfDepth - peakMeters) / (deepMeters - peakMeters), 0, 1);
    const expectedLift = 1 + gain * (1 - t * t * (3 - 2 * t));
    expect(expectedLift, "shoaling is a real lift, not a no-op").toBeGreaterThan(1.1);
    // Breaking caps the crest in rough water over this shelf (tested below),
    // so the pure shoaling lift is measured where the cap does not bind.
    for (const conditions of CONDITIONS.slice(0, 2)) {
      const ratio = peakToTrough(...shelf, conditions) / peakToTrough(...deep, conditions);
      // Five bands only reach their combined peak when their phases align, so
      // a finite window measures the lift to within a few percent.
      expect(Math.abs(ratio - expectedLift), `shoaling lift at ${shelfDepth.toFixed(2)} m`).toBeLessThan(0.1);
    }
  });

  it("breaks a wave before it can stand taller than the water beneath it", () => {
    // Depth-limited breaking: the summed crest height is capped at a share of
    // the still-water depth (H ≲ 0.78 d), so the shelf gain cannot build walls
    // of water over the shallows.
    const ratio = WATER_WAVE_CONFIG.shoaling.breakingDepthRatio;
    expect(ratio * 2).toBeCloseTo(0.78, 2);
    const shallow: { z: number; depth: number }[] = [];
    for (let z = 86; z <= 120; z += 2) {
      const depth = fieldDepth(132, z);
      if (depth > WATER_WAVE_CONFIG.swash.fadeDepthMeters[1] && depth < 5) shallow.push({ z, depth });
    }
    expect(shallow.length, "the transect crosses shallow surf water").toBeGreaterThan(2);
    for (const { z, depth } of shallow) {
      const range = peakToTrough(132, z, CONDITIONS[2]!);
      expect(range, `crest-to-trough at ${depth.toFixed(2)} m`).toBeLessThanOrEqual(ratio * 2 * depth + 0.05);
    }
  });

  it("carries crests onto the main south coast and leaves the river to its current", () => {
    // Near the south coast the swell's fixed heading points at the land.
    const coast: readonly [number, number] = [132, 136];
    const shoreward = waterSpatialProfile(...coast).localDirection.clone();
    expect(WorldLayout.shoreProjectionAt(...coast).waterwardNormalXZ.z, "sea lies south of this beach").toBeGreaterThan(0);
    const [swellX, swellZ] = bandDirection(WATER_WAVE_CONFIG.bands[0]);
    expect(shoreward.dot(new THREE.Vector2(swellX, swellZ))).toBeGreaterThan(0.9);
    expect(arrivalLag(coast, shoreward, CONDITIONS[0]!)).toBeGreaterThan(0);
    // Offshore the same train keeps coming: one heading everywhere.
    const ocean: readonly [number, number] = [600, 400];
    expect(waterSpatialProfile(...ocean).weights.ocean).toBeGreaterThan(0.9);
    expect(arrivalLag(ocean, new THREE.Vector2(swellX, swellZ), CONDITIONS[1]!)).toBeGreaterThan(0);
    // Rivers carry no geometric waves; their motion is the current-borne
    // detail in the shading, so the channel surface stays level.
    const z = -40;
    const river: readonly [number, number] = [WorldLayout.riverCenterX(z), z];
    expect(waterSpatialProfile(...river).weights.river).toBeGreaterThan(0.99);
    for (const time of TIMES) expect(Math.abs(displacement(...river, time, CONDITIONS[2]!))).toBeLessThan(1e-9);
  });

  it("stays inside the envelope the LOD node bounds are built from", () => {
    const margin = maxWaveDisplacement();
    const points: ReadonlyArray<readonly [number, number]> = [
      [40, 120], [150, 260], [600, 400], [70, 90], [-92, 100], [-15.3, -6], [132, 84],
    ];
    for (const conditions of CONDITIONS) {
      for (const [x, z] of points) {
        for (const time of TIMES) {
          const height = displacement(x, z, time, conditions);
          expect(Number.isFinite(height)).toBe(true);
          expect(Math.abs(height), `displacement within the margin at (${x}, ${z}), t=${time}`)
            .toBeLessThanOrEqual(margin.vertical);
        }
      }
    }
    // A margin far past what the field can reach would cull nothing.
    expect(margin.vertical).toBeLessThan(8);
    expect(margin.horizontal).toBeLessThan(20);
  });

  it("orders band speeds by deep-water dispersion", () => {
    const uniforms = createWaveUniforms();
    const bands = WATER_WAVE_CONFIG.bands.map((band) => ({
      k: band.wavenumber,
      phaseSpeed: bandAngularSpeed(band) / band.wavenumber,
    }));
    // Longer waves run faster, and each phase speed is √(g/k) up to the
    // shared tempo, so the ratios are physical rather than hand-picked.
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index]!.k).toBeGreaterThan(bands[index - 1]!.k);
      expect(bands[index]!.phaseSpeed).toBeLessThan(bands[index - 1]!.phaseSpeed);
    }
    for (const band of bands) {
      expect(band.phaseSpeed / Math.sqrt(9.81 / band.k)).toBeCloseTo(WATER_WAVE_CONFIG.dispersionTempo, 6);
    }
    WATER_WAVE_CONFIG.bands.forEach((band, index) => {
      const wave = uniforms.uBandWave.value[index] as THREE.Vector4;
      const [x, z] = bandDirection(band);
      expect(wave.x).toBeCloseTo(x * band.wavenumber, 9);
      expect(wave.y).toBeCloseTo(z * band.wavenumber, 9);
      expect(wave.z).toBeCloseTo(bandAngularSpeed(band), 9);
      expect(wave.w).toBe(band.phase);
    });
  });

  it("keeps the sea still when the wind turns: headings are fixed", () => {
    // Wind direction is weather, not wave geometry. A heading that followed
    // it swung the whole sea (phase levered by hundreds of metres) whenever
    // the wind shifted.
    for (const [x, z] of [[150, 260], [600, 400], [95, 80]] as const) {
      const calm = waterHeight(x, z, 42, { seaRoughness: 0.4, windDirectionDeg: 0, windSpeed: 6 });
      const turned = waterHeight(x, z, 42, { seaRoughness: 0.4, windDirectionDeg: 170, windSpeed: 6 });
      expect(turned).toBe(calm);
    }
  });

  it("gives every displacing surface the identical wave field", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      const expected = createWaveUniforms();
      const surfaces = {
        lod: water.mesh.material.uniforms,
        headwater: water.headwaterSurface.material.uniforms,
      };
      const same = (a: unknown, b: unknown): boolean => {
        if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => same(value, b[i]));
        if (a instanceof THREE.Vector2 || a instanceof THREE.Vector3 || a instanceof THREE.Vector4) return a.equals(b as never);
        return a === b;
      };
      for (const [name, uniform] of Object.entries(expected)) {
        for (const [surface, uniforms] of Object.entries(surfaces)) {
          expect(uniforms[name], `${surface} declares ${name}`).toBeDefined();
          if (name === "uTime" || name === "uRoughness") continue;
          expect(same(uniforms[name]!.value, uniform.value), `${surface}.${name}`).toBe(true);
        }
      }
      // The bed drives shoaling and swash; every surface reads the one map.
      for (const [surface, uniforms] of Object.entries(surfaces)) {
        expect(uniforms.uWaterDepthMap, `${surface} shares the bed`).toBe(water.coastalUniforms.uWaterDepthMap);
        expect(uniforms.uSwashRunup, `${surface} shares the run-up`).toBe(water.coastalUniforms.uSwashRunup);
      }
    } finally {
      water.dispose();
    }
  });

  it("drives trochoidal displacement and fold-driven foam through the shaders", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    try {
      for (const material of [water.mesh.material, water.headwaterSurface.material]) {
        expect(material.vertexShader).toContain("nevaWaveField(");
        // Horizontal displacement has to reach the position, not just exist.
        expect(material.vertexShader).toMatch(/vec3\(\w+\.x \+ offset\.x/);
        expect(material.vertexShader).toContain("vWaveFold");
        expect(material.vertexShader).toContain("vSlopeVariance");
        expect(material.fragmentShader).toContain("vWaveFold");
        expect(material.fragmentShader).toContain("uWhitecapFold");
        expect(material.fragmentShader).toContain("uCrestShading");
      }
    } finally {
      water.dispose();
    }
  });

  it("uses one swash expression for the CPU mirror, the water sheet and the wet sand", () => {
    // The GLSL and the CPU mirror are written term for term; every literal of
    // one must appear in the other, or the drawn run-up and buoyancy drift.
    const literals = (source: string) => new Set(source.match(/\d+\.\d+/g) ?? []);
    const glsl = literals(WATER_SWASH_GLSL);
    const cpu = literals(swashLevel.toString() + WATER_WAVE_CONFIG.swash.periodSeconds.toFixed(1));
    for (const value of ["0.31", "0.019", "0.011", "0.21", "0.027", "0.013", "1.7", "0.09", "0.061", "0.047",
      "4.1", "1.37", "1.6", "0.43", "0.68", "0.32"]) {
      expect(glsl.has(value), `GLSL carries ${value}`).toBe(true);
      expect(cpu.has(value), `CPU carries ${value}`).toBe(true);
    }
    // The terrain's wash reads the same level it shares with the water.
    expect(COASTAL_FIELD_GLSL).toContain(WATER_SWASH_GLSL);
    // Zero contact (river banks, open water) never runs up.
    expect(swashLevel(10, 10, 5, 0.2, 0)).toBe(0);
    expect(swashLevel(10, 10, 5, 0.2, 1)).toBeGreaterThanOrEqual(0);
    expect(swashLevel(10, 10, 5, 0.2, 1)).toBeLessThanOrEqual(0.2);
  });

  it("lets boat wakes ride the same displaced surface", () => {
    const water = new FacetedWater({ width: 12, depth: 12 });
    const wakes = new BoatWakePool(2, water.uniforms);
    try {
      const mesh = wakes.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
      expect(mesh.material.vertexShader).toContain("nevaWaveField(");
      // The wake shares the water's live wave uniforms rather than copies.
      expect(mesh.material.uniforms.uTime).toBe(water.uniforms.uTime);
      expect(mesh.material.uniforms.uWaterDepthMap).toBe(water.coastalUniforms.uWaterDepthMap);
      wakes.spawn(3, 4, 0.3, 5, 1, CONDITIONS[1]!);
      wakes.update(1.2);
      // The vertex stage lifts the arms onto the surface; the node stays level.
      expect(mesh.position.y).toBe(0);
    } finally {
      wakes.dispose();
      water.dispose();
    }
  });
});

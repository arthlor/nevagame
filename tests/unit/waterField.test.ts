import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { runSync } from "../../src/utils/CooperativeTask";
import {
  createWaterFieldSample,
  WaterFieldStore,
  waterFieldDimensions,
  waterFieldGrid,
  waterFieldUvTransform,
  waterSurfaceFieldBounds
} from "../../src/render/water/waterField";
import { waterFieldMapsSteps } from "../../src/render/water/FacetedWater";
import { waterHeight, WaterSurface } from "../../src/render/water/WaterSurface";

const BOUNDS = new THREE.Vector4(60, 40, 120, 90);

/** What a GPU LinearFilter + clamp-to-edge fetch returns at a uv. */
function bilinearTexture(data: ArrayLike<number>, width: number, height: number, u: number, v: number, channel: number,
  decode: (value: number) => number = (value) => value): number {
  const x = THREE.MathUtils.clamp(u * width - 0.5, 0, width - 1);
  const y = THREE.MathUtils.clamp(v * height - 0.5, 0, height - 1);
  const x0 = Math.min(width - 2, Math.floor(x));
  const y0 = Math.min(height - 2, Math.floor(y));
  const tx = x - x0;
  const ty = y - y0;
  const at = (column: number, row: number) => decode(data[(row * width + column) * 4 + channel]!);
  return at(x0, y0) * (1 - tx) * (1 - ty) + at(x0 + 1, y0) * tx * (1 - ty)
    + at(x0, y0 + 1) * (1 - tx) * ty + at(x0 + 1, y0 + 1) * tx * ty;
}

describe("baked water field", () => {
  it("computes identical texels lazily and in the bake", () => {
    const { columns, rows } = waterFieldDimensions(BOUNDS.z, BOUNDS.w);
    const grid = waterFieldGrid(BOUNDS, columns, rows);
    const lazy = new WaterFieldStore(grid);
    const baked = new WaterFieldStore(grid);
    const sample = createWaterFieldSample();
    for (const [x, z] of [[70, 50], [131.3, 88.8], [175, 125], [100.25, 60.5]] as const) lazy.sample(x, z, sample);
    expect(lazy.complete).toBe(false);
    runSync(baked.bakeSteps());
    expect(baked.complete).toBe(true);
    // Finishing the lazy store through the bake must not recompute anything
    // differently from a store that was baked from scratch.
    runSync(lazy.bakeSteps());
    expect(lazy.profile).toEqual(baked.profile);
    expect(lazy.depth).toEqual(baked.depth);
  });

  it("uploads the same arrays the CPU samples, with texel-centred filtering", () => {
    const { columns, rows } = waterFieldDimensions(BOUNDS.z, BOUNDS.w);
    const maps = runSync(waterFieldMapsSteps(BOUNDS, columns, rows));
    const grid = waterFieldGrid(BOUNDS, columns, rows);
    const store = new WaterFieldStore(grid);
    runSync(store.bakeSteps());
    const uv = waterFieldUvTransform(grid);
    const sample = createWaterFieldSample();
    try {
      expect(maps.profile.image.data).toEqual(store.profile);
      for (const [x, z] of [[60, 40], [61.4, 41.7], [130.9, 97.2], [180, 130], [140, 70]] as const) {
        store.sample(x, z, sample);
        const u = x * uv.x + uv.z;
        const v = z * uv.y + uv.w;
        const profile = maps.profile.image.data as Uint8Array;
        const depth = maps.depth.image.data as Uint16Array;
        expect(sample.river).toBeCloseTo(bilinearTexture(profile, columns, rows, u, v, 0) / 255, 9);
        expect(sample.ocean).toBeCloseTo(bilinearTexture(profile, columns, rows, u, v, 1) / 255, 9);
        expect(sample.depth).toBeCloseTo(
          bilinearTexture(depth, columns, rows, u, v, 0, THREE.DataUtils.fromHalfFloat), 6);
        expect(sample.contact).toBeCloseTo(
          bilinearTexture(depth, columns, rows, u, v, 3, THREE.DataUtils.fromHalfFloat), 6);
      }
    } finally {
      maps.profile.dispose();
      maps.depth.dispose();
    }
  });

  it("lands every lattice node on a texel centre", () => {
    const grid = waterFieldGrid(waterSurfaceFieldBounds(), 968, 701);
    const uv = waterFieldUvTransform(grid);
    for (const [column, row] of [[0, 0], [1, 7], [483, 350], [967, 700]] as const) {
      const x = grid.minX + (column / (grid.columns - 1)) * grid.sizeX;
      const z = grid.minZ + (row / (grid.rows - 1)) * grid.sizeZ;
      expect((x * uv.x + uv.z) * grid.columns - 0.5).toBeCloseTo(column, 6);
      expect((z * uv.y + uv.w) * grid.rows - 0.5).toBeCloseTo(row, 6);
    }
  });

  it("filters travel direction as a vector, so it cannot flip across ±π", () => {
    const grid = waterFieldGrid(new THREE.Vector4(0, 0, 3, 3), 2, 2);
    const store = new WaterFieldStore(grid);
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        store.ensure(column, row);
        // Two headings either side of due -X: 176° and -176°.
        const angle = column === 0 ? Math.PI * 0.978 : -Math.PI * 0.978;
        const index = (row * 2 + column) * 4;
        store.profile[index + 2] = Math.round((Math.cos(angle) * 0.5 + 0.5) * 255);
        store.profile[index + 3] = Math.round((Math.sin(angle) * 0.5 + 0.5) * 255);
      }
    }
    const sample = store.sample(1.5, 1.5, createWaterFieldSample());
    const heading = Math.atan2(sample.directionZ, sample.directionX);
    expect(Math.abs(Math.abs(heading) - Math.PI)).toBeLessThan(0.05);
    expect(sample.directionX).toBeLessThan(-0.95);
  });

  it("keeps a buoyancy query cheap once its texels are warm", () => {
    const conditions = { seaRoughness: 0.4, windDirectionDeg: 120, windSpeed: 6 };
    for (let index = 0; index < 50; index += 1) waterHeight(40 + index, 70, 1, conditions);
    const start = performance.now();
    let sum = 0;
    for (let index = 0; index < 4000; index += 1) sum += WaterSurface.height(40 + (index % 50), 70, index * 0.01, conditions);
    const microseconds = (performance.now() - start) / 4000 * 1000;
    expect(Number.isFinite(sum)).toBe(true);
    // The former analytic profile cost ~26 µs per height and ~80 µs per sample.
    expect(microseconds).toBeLessThan(15);
  });
});

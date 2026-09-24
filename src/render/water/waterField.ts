import * as THREE from "three";
import { WATER_SURFACE, WorldLayout } from "../../world/WorldLayout";
import type { ShoreProjection } from "../../world/WorldGeographyTypes";
import { waterSpatialProfile, type WaterSpatialProfile, type WaterSpatialQueries } from "./waterProfile";

/**
 * The baked water field: one lattice, two encodings, one owner.
 *
 * Every consumer of the regional wave profile and the bed depth — the water
 * vertex shaders, the shading, the terrain's wet-sand treatment and the CPU
 * buoyancy mirror — reads the same quantised texels. The shaders read them as
 * linearly filtered textures; the CPU reads them through `WaterFieldStore`,
 * which bilinearly filters the *same typed arrays* the textures upload. A boat
 * therefore floats on the surface that is actually drawn, not on an analytic
 * cousin of it that differs wherever the 3 m lattice rounds a shoreline.
 *
 * Texels are computed lazily and memoised, so a CPU query made before the
 * startup bake (tests, early physics) costs the canonical query once and then
 * nothing. The bake walks the remaining texels cooperatively through the very
 * same function, so lazy and baked texels are byte-identical by construction.
 *
 * Profile texel (RGBA8): river weight, ocean weight, travel direction x and z
 * (each `0.5 + 0.5·component`). The direction is stored as a vector, not an
 * angle: an angle wraps at ±π, and linear filtering across the wrap swung the
 * interpolated heading through the opposite direction.
 *
 * Depth texel (RGBA16F): still-water column depth, bed elevation, signed shore
 * distance and coastal contact weight.
 */

export const WATER_FIELD_METERS_PER_TEXEL = 3;

/** Bank dilation of the river class in the baked field (see waterSpatialProfile). */
export const WATER_FIELD_BANK_DILATION_METERS = WATER_FIELD_METERS_PER_TEXEL * 1.5;

export interface WaterFieldGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly columns: number;
  readonly rows: number;
}

export function waterFieldGrid(bounds: THREE.Vector4, columns: number, rows: number): WaterFieldGrid {
  return Object.freeze({
    minX: bounds.x,
    minZ: bounds.y,
    sizeX: bounds.z,
    sizeZ: bounds.w,
    columns: Math.max(2, Math.round(columns)),
    rows: Math.max(2, Math.round(rows))
  });
}

/** Lattice dimensions for a surface of the given extent at the shared texel spacing. */
export function waterFieldDimensions(width: number, depth: number): { columns: number; rows: number } {
  return {
    columns: Math.max(2, Math.round(width / WATER_FIELD_METERS_PER_TEXEL) + 1),
    rows: Math.max(2, Math.round(depth / WATER_FIELD_METERS_PER_TEXEL) + 1)
  };
}

export function waterSurfaceFieldBounds(surface: {
  width: number; depth: number; centerX: number; centerZ: number;
} = WATER_SURFACE): THREE.Vector4 {
  return new THREE.Vector4(
    surface.centerX - surface.width * 0.5,
    surface.centerZ - surface.depth * 0.5,
    surface.width,
    surface.depth
  );
}

/**
 * World-to-uv transform that lands lattice node (c, r) exactly on texel
 * centre ((c + ½)/columns, (r + ½)/rows).
 *
 * The former `(p - min) / size` mapping put node 0 on the texture edge and
 * the last node on the far edge, so every sample was displaced by up to half
 * a texel — 1.5 m at the map edges — and the baked shoreline drifted off the
 * terrain it describes. Returned as (scale.xz, offset.xz): `uv = p·s + o`.
 */
export function waterFieldUvTransform(grid: WaterFieldGrid, out = new THREE.Vector4()): THREE.Vector4 {
  const scaleX = (grid.columns - 1) / (grid.columns * grid.sizeX);
  const scaleZ = (grid.rows - 1) / (grid.rows * grid.sizeZ);
  return out.set(
    scaleX,
    scaleZ,
    0.5 / grid.columns - grid.minX * scaleX,
    0.5 / grid.rows - grid.minZ * scaleZ
  );
}

export function writeWaterProfileTexel(data: Uint8Array, offset: number, profile: WaterSpatialProfile): void {
  data[offset] = Math.round(THREE.MathUtils.clamp(profile.weights.river, 0, 1) * 255);
  data[offset + 1] = Math.round(THREE.MathUtils.clamp(profile.weights.ocean, 0, 1) * 255);
  data[offset + 2] = Math.round(THREE.MathUtils.clamp(profile.localDirection.x * 0.5 + 0.5, 0, 1) * 255);
  data[offset + 3] = Math.round(THREE.MathUtils.clamp(profile.localDirection.y * 0.5 + 0.5, 0, 1) * 255);
}

/** Both standalone depth builds and the paired bake use this encoding. */
export function writeWaterDepthTexel(
  data: Uint16Array, offset: number, x: number, z: number,
  signedDistance: number, projection?: ShoreProjection
): void {
  const bed = WorldLayout.terrainBaseSurfaceHeight(x, z);
  data[offset] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(WorldLayout.waterColumnDepth(x, z), -128, 128));
  data[offset + 1] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(bed, -128, 128));
  data[offset + 2] = THREE.DataUtils.toHalfFloat(THREE.MathUtils.clamp(signedDistance, -128, 128));
  data[offset + 3] = THREE.DataUtils.toHalfFloat(WorldLayout.coastalContactWeightAt(x, z, projection));
}

export function createWaterProfileTexture(data: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "canonical_water_profile";
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createWaterDepthTexture(data: Uint16Array, width: number, height: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = "canonical_water_depth_shore";
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Bilinearly filtered field values at a world point, decoded. */
export interface WaterFieldSample {
  river: number;
  ocean: number;
  /** Filtered, not renormalised: callers normalise, exactly as the shaders do. */
  directionX: number;
  directionZ: number;
  /** Still-water column depth; negative on dry ground. */
  depth: number;
  /** Coastal contact weight: how strongly this shore receives surf and swash. */
  contact: number;
}

const fromHalf = THREE.DataUtils.fromHalfFloat;

export class WaterFieldStore {
  public readonly profile: Uint8Array;
  public readonly depth: Uint16Array;
  private readonly ready: Uint8Array;
  private readyCount = 0;
  private static canonicalStore: WaterFieldStore | null = null;

  /** The store behind the shipped water surface and every CPU wave query. */
  public static canonical(): WaterFieldStore {
    if (!this.canonicalStore) {
      const bounds = waterSurfaceFieldBounds();
      const { columns, rows } = waterFieldDimensions(bounds.z, bounds.w);
      this.canonicalStore = new WaterFieldStore(waterFieldGrid(bounds, columns, rows));
    }
    return this.canonicalStore;
  }

  public static isCanonicalGrid(grid: WaterFieldGrid): boolean {
    const canonical = this.canonical().grid;
    return grid.minX === canonical.minX && grid.minZ === canonical.minZ
      && grid.sizeX === canonical.sizeX && grid.sizeZ === canonical.sizeZ
      && grid.columns === canonical.columns && grid.rows === canonical.rows;
  }

  constructor(public readonly grid: WaterFieldGrid) {
    const texels = grid.columns * grid.rows;
    this.profile = new Uint8Array(texels * 4);
    this.depth = new Uint16Array(texels * 4);
    this.ready = new Uint8Array(texels);
  }

  public get complete(): boolean {
    return this.readyCount === this.grid.columns * this.grid.rows;
  }

  public texelX(column: number): number {
    return this.grid.minX + (column / (this.grid.columns - 1)) * this.grid.sizeX;
  }

  public texelZ(row: number): number {
    return this.grid.minZ + (row / (this.grid.rows - 1)) * this.grid.sizeZ;
  }

  /** Compute one texel through the canonical queries if it has not been yet. */
  public ensure(column: number, row: number): number {
    const index = row * this.grid.columns + column;
    if (this.ready[index] === 1) return index;
    const x = this.texelX(column);
    const z = this.texelZ(row);
    const queries: WaterSpatialQueries = { marine: WorldLayout.marineSampleAt(x, z) };
    const profile = waterSpatialProfile(x, z, queries, { bankDilationMeters: WATER_FIELD_BANK_DILATION_METERS });
    writeWaterProfileTexel(this.profile, index * 4, profile);
    writeWaterDepthTexel(this.depth, index * 4, x, z, queries.marine.signedShoreDistance, queries.shore);
    this.ready[index] = 1;
    this.readyCount += 1;
    return index;
  }

  /** Fill every texel; yields periodically so startup stays responsive. */
  public *bakeSteps(): Generator<void, void, void> {
    const { columns, rows } = this.grid;
    let sinceYield = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (this.ready[row * columns + column] === 1) continue;
        if (sinceYield >= 32) {
          sinceYield = 0;
          yield;
        }
        this.ensure(column, row);
        sinceYield += 1;
      }
    }
  }

  /**
   * Bilinear sample at a world point, matching `LinearFilter` + clamp-to-edge
   * on the uv transform above: node (c, r) sits on a texel centre, so the
   * filter weight is simply the fractional lattice coordinate.
   */
  public sample(x: number, z: number, out: WaterFieldSample): WaterFieldSample {
    const { columns, rows } = this.grid;
    const fx = THREE.MathUtils.clamp((x - this.grid.minX) / this.grid.sizeX, 0, 1) * (columns - 1);
    const fz = THREE.MathUtils.clamp((z - this.grid.minZ) / this.grid.sizeZ, 0, 1) * (rows - 1);
    const c0 = Math.min(columns - 2, Math.floor(fx));
    const r0 = Math.min(rows - 2, Math.floor(fz));
    const tx = fx - c0;
    const tz = fz - r0;
    const i00 = this.ensure(c0, r0) * 4;
    const i10 = this.ensure(c0 + 1, r0) * 4;
    const i01 = this.ensure(c0, r0 + 1) * 4;
    const i11 = this.ensure(c0 + 1, r0 + 1) * 4;
    const w00 = (1 - tx) * (1 - tz);
    const w10 = tx * (1 - tz);
    const w01 = (1 - tx) * tz;
    const w11 = tx * tz;
    const p = this.profile;
    const d = this.depth;
    const inv = 1 / 255;
    out.river = (p[i00] * w00 + p[i10] * w10 + p[i01] * w01 + p[i11] * w11) * inv;
    out.ocean = (p[i00 + 1] * w00 + p[i10 + 1] * w10 + p[i01 + 1] * w01 + p[i11 + 1] * w11) * inv;
    out.directionX = (p[i00 + 2] * w00 + p[i10 + 2] * w10 + p[i01 + 2] * w01 + p[i11 + 2] * w11) * inv * 2 - 1;
    out.directionZ = (p[i00 + 3] * w00 + p[i10 + 3] * w10 + p[i01 + 3] * w01 + p[i11 + 3] * w11) * inv * 2 - 1;
    out.depth = fromHalf(d[i00]) * w00 + fromHalf(d[i10]) * w10 + fromHalf(d[i01]) * w01 + fromHalf(d[i11]) * w11;
    out.contact = fromHalf(d[i00 + 3]) * w00 + fromHalf(d[i10 + 3]) * w10
      + fromHalf(d[i01 + 3]) * w01 + fromHalf(d[i11 + 3]) * w11;
    return out;
  }
}

export function createWaterFieldSample(): WaterFieldSample {
  return { river: 0, ocean: 0, directionX: 0, directionZ: -1, depth: 64, contact: 0 };
}

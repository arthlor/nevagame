import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { NEVA_HEADWATERS } from "../../world/NevaHeadwaters";
import { nevaRiverFeatures, type RiverStoneFeature, type RiverStoneRole } from "../../world/NevaRiverFeatures";
import { WorldLayout } from "../../world/WorldLayout";

/**
 * White-water coverage the Silverwater's channel features raise, baked once
 * into a small single-channel field over the river corridor. It is read from
 * the same `nevaRiverFeatures()` list the world dressing places, so every
 * rock that breaks the surface wears a collar and a trailing wake, every
 * cascade step throws an apron of foam below its foot and a tongue through
 * its chute, and riffles froth over their shallow margins while the thalweg
 * lane stays glassy. The water shader only reads coverage (0..1) and breaks
 * it up with its drifting foam pattern; nothing here is gameplay truth.
 */

export interface RiverFeatureFoamField {
  readonly texture: THREE.DataTexture;
  /** World min x, min z, then 1 / width and 1 / depth in metres. */
  readonly bounds: THREE.Vector4;
}

/** How hard water drives against a stone in each channel zone. */
const STONE_ENERGY: Readonly<Record<RiverStoneRole, number>> = {
  "cascade-sill": 1,
  "cascade-bank": 0.7,
  riffle: 0.8,
  "cut-bank": 0.55,
  "pool-margin": 0.4,
  "bar-edge": 0
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

class CoverageRaster {
  public readonly columns: number;
  public readonly rows: number;
  public readonly values: Float32Array;

  constructor(
    public readonly minX: number,
    public readonly minZ: number,
    maxX: number,
    maxZ: number,
    public readonly texel: number
  ) {
    this.columns = Math.max(1, Math.ceil((maxX - minX) / texel));
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / texel));
    this.values = new Float32Array(this.columns * this.rows);
  }

  /** Max-combines `coverage(x, z)` over texel centres inside a world rectangle. */
  public stamp(minX: number, minZ: number, maxX: number, maxZ: number, coverage: (x: number, z: number) => number): void {
    const i0 = Math.max(0, Math.floor((minX - this.minX) / this.texel));
    const i1 = Math.min(this.columns - 1, Math.ceil((maxX - this.minX) / this.texel));
    const j0 = Math.max(0, Math.floor((minZ - this.minZ) / this.texel));
    const j1 = Math.min(this.rows - 1, Math.ceil((maxZ - this.minZ) / this.texel));
    for (let j = j0; j <= j1; j += 1) {
      const z = this.minZ + (j + 0.5) * this.texel;
      for (let i = i0; i <= i1; i += 1) {
        const value = coverage(this.minX + (i + 0.5) * this.texel, z);
        if (value <= 0) continue;
        const index = j * this.columns + i;
        if (value > this.values[index]) this.values[index] = value;
      }
    }
  }
}

function downstreamAt(z: number): { x: number; z: number } {
  const tangent = WorldLayout.riverSectionAt(z).tangent;
  const length = Math.hypot(tangent.x, tangent.z) || 1;
  const sign = tangent.z < 0 ? -1 : 1;
  return { x: (tangent.x / length) * sign, z: (tangent.z / length) * sign };
}

/** Pressure collar round the stone, stronger on its upstream face, then a V wake. */
function stampStone(raster: CoverageRaster, stone: RiverStoneFeature): void {
  const energy = STONE_ENERGY[stone.role];
  if (!stone.inWater || energy <= 0 || stone.exposure < -0.14) return;
  const flow = downstreamAt(stone.z);
  const r = stone.radius;
  const wakeLength = Math.max(1.6, r * (2.4 + 3.2 * energy));
  const reach = wakeLength + r + 1;
  raster.stamp(stone.x - reach, stone.z - reach, stone.x + reach, stone.z + reach, (x, z) => {
    const dx = x - stone.x;
    const dz = z - stone.z;
    const along = dx * flow.x + dz * flow.z;
    const across = Math.abs(dx * flow.z - dz * flow.x);
    const distance = Math.hypot(dx, dz);
    const collar = (1 - smoothstep(r * 0.8, r + 0.5, distance)) * (along < 0 ? 1 : 0.72);
    let wake = 0;
    if (along > 0 && along < wakeLength) {
      // A turbulent eddy right behind the stone opens into the two arms of
      // a V further downstream.
      const t = along / wakeLength;
      const halfWidth = r * 0.55 + along * 0.32;
      const inside = 1 - smoothstep(halfWidth * 0.65, halfWidth, across);
      const arms = 0.45 + 0.55 * smoothstep(0, halfWidth * 0.8, across);
      wake = Math.pow(1 - t, 1.1) * inside * (1 + (arms - 1) * t);
    }
    // A barely submerged stone raises a boil, not a full collar.
    const breaking = smoothstep(-0.14, 0.06, stone.exposure);
    return energy * breaking * Math.max(0.9 * collar, 0.95 * wake);
  });
}

/** Lateral position across the water at `z`: 0 on the banks, 1 well inside. */
function insideWater(x: number, z: number, fadeMeters: number): number {
  const section = WorldLayout.riverSectionAt(z);
  const lateral = x - section.centerX;
  const edge = lateral < 0 ? section.leftWaterWidth + lateral : section.rightWaterWidth - lateral;
  return smoothstep(0, fadeMeters, edge);
}

function stampCascade(raster: CoverageRaster): void {
  const features = nevaRiverFeatures();
  for (const step of NEVA_HEADWATERS.cascade.steps) {
    const section = WorldLayout.riverSectionAt(step.footZ);
    const minX = section.centerX - section.leftWaterWidth - 1;
    const maxX = section.centerX + section.rightWaterWidth + 1;
    const apronLength = 2.8;
    raster.stamp(minX, step.lipZ - 0.5, maxX, step.footZ + apronLength, (x, z) => {
      const inside = insideWater(x, z, 0.35);
      if (inside <= 0) return 0;
      // Shoaling over the sill, the white face of the drop, then the apron
      // below the foot tearing apart downstream.
      const sill = z < step.lipZ ? 0.42 * smoothstep(step.lipZ - 0.5, step.lipZ, z) : 0;
      const face = z >= step.lipZ && z <= step.footZ ? 0.64 : 0;
      const apron = z > step.footZ ? 0.84 * Math.pow(1 - smoothstep(0, apronLength, z - step.footZ), 1.5) : 0;
      return inside * Math.max(sill, face, apron);
    });
  }
  // Each chute pours a solid tongue through the gap in its sill.
  for (const chute of features.chutes) {
    const step = NEVA_HEADWATERS.cascade.steps.find((candidate) => candidate.lipZ === chute.z);
    const length = (step ? step.footZ - step.lipZ : 1) + 3.2;
    const reach = chute.halfWidthMeters * (1 + length * 0.4) + 0.5;
    raster.stamp(chute.x - reach, chute.z - 0.3, chute.x + reach, chute.z + length, (x, z) => {
      const along = z - chute.z;
      if (along < -0.3) return 0;
      const halfWidth = chute.halfWidthMeters * (1 + Math.max(0, along) * 0.4);
      const inside = 1 - smoothstep(halfWidth * 0.6, halfWidth, Math.abs(x - chute.x));
      return inside * Math.pow(1 - smoothstep(0, length, along), 0.8) * insideWater(x, z, 0.3);
    });
  }
}

/** Broken froth over riffle crossings; strongest on the shallow margins. */
function stampRiffles(raster: CoverageRaster): void {
  const zStart = raster.minZ;
  const zEnd = raster.minZ + raster.rows * raster.texel;
  for (let z = Math.max(zStart, NEVA_HEADWATERS.endZ); z < zEnd; z += raster.texel) {
    const section = WorldLayout.riverSectionAt(z);
    if (section.riffle < 0.15) continue;
    const minX = section.centerX - section.leftWaterWidth;
    const maxX = section.centerX + section.rightWaterWidth;
    raster.stamp(minX, z - raster.texel * 0.5, maxX, z + raster.texel * 0.5, (x) => {
      const lateral = x - section.centerX;
      const fromLane = Math.abs(lateral - section.thalwegOffset);
      const margin = smoothstep(0.8, 2.8, fromLane);
      return section.riffle * (0.24 + 0.3 * margin) * insideWater(x, z, 0.5);
    });
  }
}

let cached: RiverFeatureFoamField | null = null;

export function createRiverFeatureFoamField(): RiverFeatureFoamField {
  if (cached) return cached;
  const texel = CANONICAL_RENDER_CONFIG.waterSurface.headwaters.featureFoamTexelMeters;
  const features = nevaRiverFeatures();
  const zStart = NEVA_HEADWATERS.fall.landingZ + 1;
  const zEnd = Math.max(...features.stones.map((stone) => stone.z)) + 6;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let z = zStart; z <= zEnd; z += 2) {
    const section = WorldLayout.riverSectionAt(z);
    minX = Math.min(minX, section.centerX - section.leftWaterWidth - 2);
    maxX = Math.max(maxX, section.centerX + section.rightWaterWidth + 2);
  }
  const raster = new CoverageRaster(minX, zStart, maxX, zEnd, texel);
  stampRiffles(raster);
  stampCascade(raster);
  for (const stone of features.stones) stampStone(raster, stone);

  const data = new Uint8Array(raster.values.length);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.round(Math.min(1, raster.values[index]) * 255);
  }
  const texture = new THREE.DataTexture(data, raster.columns, raster.rows, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = "neva_river_feature_foam";
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  const width = raster.columns * texel;
  const depth = raster.rows * texel;
  cached = { texture, bounds: new THREE.Vector4(minX, zStart, 1 / width, 1 / depth) };
  return cached;
}

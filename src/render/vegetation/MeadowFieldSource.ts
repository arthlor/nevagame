import * as THREE from "three";
import type { StaticCollisionProxy } from "../../physics/StaticCollision";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";
import { roadCoverageAt } from "../materials/RoadCoverage";
import { SURFACE_FIELD_ATTRIBUTE_NAMES } from "../materials/SurfaceFieldAttributes";

/**
 * Presentation-only control data for the meadow carpet, derived from the
 * indexed terrain geometry the terrain itself draws. It never feeds gameplay,
 * collision or saves, and holds no seed: it is a pure function of the terrain
 * build, the road ribbon and the static collision footprints.
 *
 * Channel contract (Art Pipeline §6.1 control-texture rules):
 * - `heights` R32F, one texel per terrain vertex, `vertices` per side, row
 *   `iz` / column `ix` = vertex `ix + iz * vertices`. Sampled with texelFetch
 *   and PlaneGeometry's (a,b,d)/(b,c,d) split, so roots sit on the drawn mesh.
 * - `cover` RGBA8 on the same grid, linearly filtered like vertex attributes:
 *     R density  vegetation × (1-shore) × (1-farm) × (1-route core) × slope × (1-riverbed)
 *     G meadow   meadow share of the vegetation weight, which lifts blade height
 *     B dry      Sunreach dry-climate weight
 *     A damp     damp soil plus shoreline wetness
 * - `exclusion` R8 at `exclusionTexelMeters` over the patch: visible road
 *   coverage sampled from the ribbon and its material edge field, architecture
 *   pads and ground-touching collision footprints.
 *
 * Memory is roughly `vertices² × 8 + (size / texel)²` bytes per patch. The
 * exclusion raster is rebuilt only when the layout editor moves placements.
 */
export interface MeadowTerrainPatch {
  readonly id: string;
  readonly islandId: string;
  readonly center: { readonly x: number; readonly z: number };
  readonly sizeMeters: number;
  readonly resolution: number;
}

export interface MeadowFieldPatchData {
  readonly id: string;
  readonly islandId: string;
  /** World XZ of vertex (0, 0). */
  readonly originX: number;
  readonly originZ: number;
  readonly sizeMeters: number;
  readonly step: number;
  /** Vertices per side (resolution + 1). */
  readonly vertices: number;
  readonly heights: Float32Array;
  readonly cover: Uint8Array;
  readonly exclusionTexelMeters: number;
  /** Exclusion texels per side. */
  readonly exclusionSize: number;
  readonly exclusion: Uint8Array;
}

export interface MeadowCoverInputs {
  grass: number;
  meadow: number;
  beach: number;
  wetShoreline: number;
  cliff: number;
  riverbed: number;
  farm: number;
  /** `WorldLayout.pathInfluence`: 1 on the route core, 0 clear of the shoulder. */
  path: number;
  shorelineWetness: number;
  normalY: number;
  height: number;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Carpet density from the same semantic weights the terrain blends. The
 * visible road edge is left to the fine exclusion raster, so the shoulder
 * keeps its grass intrusion instead of a coarse grid-aligned bare halo.
 */
export function meadowCoverDensity(input: MeadowCoverInputs): number {
  const vegetation = clamp01(input.grass + input.meadow);
  const shore = clamp01(input.beach + input.wetShoreline + input.cliff);
  return clamp01(
    vegetation
      * (1 - smoothstep(0.08, 0.42, shore))
      * (1 - smoothstep(0.02, 0.1, input.farm))
      * (1 - smoothstep(0.55, 0.9, input.path))
      * (1 - smoothstep(0.5, 0.62, input.shorelineWetness))
      * (1 - smoothstep(0.1, 0.4, input.riverbed))
      * smoothstep(0.62, 0.7, input.normalY)
      * smoothstep(-0.04, 0.1, input.height)
  );
}

function requiredAttribute(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const attribute = geometry.getAttribute(name);
  if (!attribute) throw new Error(`[MeadowFieldSource] Terrain geometry is missing ${name}`);
  return attribute;
}

/** Copies the carpet's control data out of a freshly built terrain patch geometry. */
export function createMeadowPatchData(
  patch: MeadowTerrainPatch,
  geometry: THREE.BufferGeometry,
  exclusionTexelMeters: number
): MeadowFieldPatchData {
  const vertices = patch.resolution + 1;
  const position = requiredAttribute(geometry, "position");
  if (position.count !== vertices * vertices) {
    throw new Error(`[MeadowFieldSource] ${patch.id} has ${position.count} vertices, expected ${vertices * vertices}`);
  }
  const normal = requiredAttribute(geometry, "normal");
  const weights0 = requiredAttribute(geometry, SURFACE_FIELD_ATTRIBUTE_NAMES.weights0);
  const weights1 = requiredAttribute(geometry, SURFACE_FIELD_ATTRIBUTE_NAMES.weights1);
  const causes = requiredAttribute(geometry, SURFACE_FIELD_ATTRIBUTE_NAMES.causes);
  const pathBlend = requiredAttribute(geometry, "terrainPathBlend");
  const dryClimate = requiredAttribute(geometry, "terrainDryClimate");

  const heights = new Float32Array(position.count);
  const cover = new Uint8Array(position.count * 4);
  const inputs: MeadowCoverInputs = {
    grass: 0, meadow: 0, beach: 0, wetShoreline: 0, cliff: 0, riverbed: 0,
    farm: 0, path: 0, shorelineWetness: 0, normalY: 1, height: 0
  };
  for (let index = 0; index < position.count; index += 1) {
    const height = position.getY(index);
    heights[index] = height;
    inputs.grass = weights0.getX(index);
    inputs.meadow = weights0.getY(index);
    inputs.beach = weights1.getZ(index);
    inputs.riverbed = weights1.getW(index);
    inputs.wetShoreline = causes.getX(index);
    inputs.cliff = causes.getY(index);
    inputs.farm = causes.getZ(index);
    inputs.shorelineWetness = causes.getW(index);
    inputs.path = pathBlend.getX(index);
    inputs.normalY = Math.abs(normal.getY(index));
    inputs.height = height;
    const vegetation = inputs.grass + inputs.meadow;
    const offset = index * 4;
    cover[offset] = Math.round(meadowCoverDensity(inputs) * 255);
    cover[offset + 1] = Math.round(clamp01(vegetation > 0.02 ? inputs.meadow / vegetation : 0) * 255);
    cover[offset + 2] = Math.round(clamp01(dryClimate.getX(index)) * 255);
    cover[offset + 3] = Math.round(clamp01(weights0.getW(index) + inputs.shorelineWetness * 0.45) * 255);
  }

  const exclusionSize = Math.ceil(patch.sizeMeters / exclusionTexelMeters);
  return {
    id: patch.id,
    islandId: patch.islandId,
    originX: patch.center.x - patch.sizeMeters * 0.5,
    originZ: patch.center.z - patch.sizeMeters * 0.5,
    sizeMeters: patch.sizeMeters,
    step: patch.sizeMeters / patch.resolution,
    vertices,
    heights,
    cover,
    exclusionTexelMeters,
    exclusionSize,
    exclusion: new Uint8Array(exclusionSize * exclusionSize)
  };
}

/**
 * A flat, uniformly vegetated patch for review surfaces such as the Art Yard,
 * where there is no world terrain to derive the carpet from.
 */
export function createUniformMeadowPatchData(
  patch: MeadowTerrainPatch,
  cover: { density: number; meadowShare: number; dry: number; damp: number },
  exclusionTexelMeters: number
): MeadowFieldPatchData {
  const vertices = patch.resolution + 1;
  const count = vertices * vertices;
  const coverData = new Uint8Array(count * 4);
  const texel = [cover.density, cover.meadowShare, cover.dry, cover.damp].map((value) => Math.round(clamp01(value) * 255));
  for (let index = 0; index < count; index += 1) coverData.set(texel, index * 4);
  const exclusionSize = Math.ceil(patch.sizeMeters / exclusionTexelMeters);
  return {
    id: patch.id,
    islandId: patch.islandId,
    originX: patch.center.x - patch.sizeMeters * 0.5,
    originZ: patch.center.z - patch.sizeMeters * 0.5,
    sizeMeters: patch.sizeMeters,
    step: patch.sizeMeters / patch.resolution,
    vertices,
    heights: new Float32Array(count),
    cover: coverData,
    exclusionTexelMeters,
    exclusionSize,
    exclusion: new Uint8Array(exclusionSize * exclusionSize)
  };
}

/** The drawn terrain surface at a world point, using the mesh's own triangle split. */
export function sampleMeadowHeight(data: MeadowFieldPatchData, x: number, z: number): number {
  const last = data.vertices - 2;
  const gx = (x - data.originX) / data.step;
  const gz = (z - data.originZ) / data.step;
  const ix = Math.min(last, Math.max(0, Math.floor(gx)));
  const iz = Math.min(last, Math.max(0, Math.floor(gz)));
  const fx = Math.min(1, Math.max(0, gx - ix));
  const fz = Math.min(1, Math.max(0, gz - iz));
  const row = iz * data.vertices;
  const h00 = data.heights[row + ix];
  const h10 = data.heights[row + ix + 1];
  const h01 = data.heights[row + data.vertices + ix];
  const h11 = data.heights[row + data.vertices + ix + 1];
  return fx + fz <= 1
    ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
    : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/** Bilinear carpet density (cover R), matching the shader's filtered lookup. */
export function sampleMeadowDensity(data: MeadowFieldPatchData, x: number, z: number): number {
  const gx = (x - data.originX) / data.step;
  const gz = (z - data.originZ) / data.step;
  if (gx < 0 || gz < 0 || gx > data.vertices - 1 || gz > data.vertices - 1) return 0;
  const ix = Math.min(data.vertices - 2, Math.floor(gx));
  const iz = Math.min(data.vertices - 2, Math.floor(gz));
  const fx = gx - ix;
  const fz = gz - iz;
  const at = (cx: number, cz: number) => data.cover[(cz * data.vertices + cx) * 4] / 255;
  const top = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * fx;
  const bottom = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * fx;
  return top + (bottom - top) * fz;
}

/** Nearest exclusion texel, 0..1. */
export function sampleMeadowExclusion(data: MeadowFieldPatchData, x: number, z: number): number {
  const ex = Math.floor((x - data.originX) / data.exclusionTexelMeters);
  const ez = Math.floor((z - data.originZ) / data.exclusionTexelMeters);
  if (ex < 0 || ez < 0 || ex >= data.exclusionSize || ez >= data.exclusionSize) return 1;
  return data.exclusion[ez * data.exclusionSize + ex] / 255;
}

function writeExclusion(data: MeadowFieldPatchData, ex: number, ez: number, value: number): void {
  const index = ez * data.exclusionSize + ex;
  const encoded = Math.round(clamp01(value) * 255);
  if (encoded > data.exclusion[index]) data.exclusion[index] = encoded;
}

/**
 * Rasterizes the road's colour alpha and shared material edge field into the
 * exclusion texture. Camera-pixel derivative antialiasing is intentionally
 * absent at this half-metre control resolution.
 */
export function* stampRoadCoverageSteps(
  data: MeadowFieldPatchData,
  pathGeometry: THREE.BufferGeometry
): Generator<void, void, void> {
  const position = requiredAttribute(pathGeometry, "position");
  const color = pathGeometry.getAttribute("color");
  const index = pathGeometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const texel = data.exclusionTexelMeters;
  const size = data.exclusionSize;
  const maxX = data.originX + data.sizeMeters;
  const maxZ = data.originZ + data.sizeMeters;
  const coverageAt = (vertex: number) => (color && color.itemSize >= 4 ? color.getW(vertex) : 1);
  let examinedTexels = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (triangle % 512 === 0) yield;
    const a = index ? index.getX(triangle * 3) : triangle * 3;
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    const ax = position.getX(a), az = position.getZ(a);
    const bx = position.getX(b), bz = position.getZ(b);
    const cx = position.getX(c), cz = position.getZ(c);
    const minTriangleX = Math.min(ax, bx, cx);
    const maxTriangleX = Math.max(ax, bx, cx);
    const minTriangleZ = Math.min(az, bz, cz);
    const maxTriangleZ = Math.max(az, bz, cz);
    if (maxTriangleX < data.originX || minTriangleX > maxX || maxTriangleZ < data.originZ || minTriangleZ > maxZ) continue;
    const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(area) < 1e-9) continue;
    const va = coverageAt(a), vb = coverageAt(b), vc = coverageAt(c);
    if (va <= 0 && vb <= 0 && vc <= 0) continue;
    const startX = Math.max(0, Math.floor((minTriangleX - data.originX) / texel));
    const endX = Math.min(size - 1, Math.floor((maxTriangleX - data.originX) / texel));
    const startZ = Math.max(0, Math.floor((minTriangleZ - data.originZ) / texel));
    const endZ = Math.min(size - 1, Math.floor((maxTriangleZ - data.originZ) / texel));
    for (let ez = startZ; ez <= endZ; ez += 1) {
      const pz = data.originZ + (ez + 0.5) * texel;
      for (let ex = startX; ex <= endX; ex += 1) {
        // A long, thin junction triangle can span many rejected texels too.
        // Yield on examined texels so the startup budget stays bounded.
        if ((++examinedTexels & 127) === 0) yield;
        const px = data.originX + (ex + 0.5) * texel;
        const w0 = ((bx - px) * (cz - pz) - (cx - px) * (bz - pz)) / area;
        const w1 = ((cx - px) * (az - pz) - (ax - px) * (cz - pz)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.001 || w1 < -0.001 || w2 < -0.001) continue;
        const opacity = w0 * va + w1 * vb + w2 * vc;
        writeExclusion(data, ex, ez, roadCoverageAt(px, pz, opacity, CANONICAL_RENDER_CONFIG.roadSurface));
      }
    }
  }
}

/** Fully excludes a yawed rectangle (half extents along its local X/Z axes). */
export function stampMeadowRectangle(
  data: MeadowFieldPatchData,
  centerX: number,
  centerZ: number,
  axisX: { x: number; z: number },
  axisZ: { x: number; z: number },
  halfX: number,
  halfZ: number
): void {
  if (halfX <= 0 || halfZ <= 0) return;
  const reachX = Math.abs(axisX.x) * halfX + Math.abs(axisZ.x) * halfZ;
  const reachZ = Math.abs(axisX.z) * halfX + Math.abs(axisZ.z) * halfZ;
  const texel = data.exclusionTexelMeters;
  const startX = Math.max(0, Math.floor((centerX - reachX - data.originX) / texel));
  const endX = Math.min(data.exclusionSize - 1, Math.floor((centerX + reachX - data.originX) / texel));
  const startZ = Math.max(0, Math.floor((centerZ - reachZ - data.originZ) / texel));
  const endZ = Math.min(data.exclusionSize - 1, Math.floor((centerZ + reachZ - data.originZ) / texel));
  for (let ez = startZ; ez <= endZ; ez += 1) {
    const dz = data.originZ + (ez + 0.5) * texel - centerZ;
    for (let ex = startX; ex <= endX; ex += 1) {
      const dx = data.originX + (ex + 0.5) * texel - centerX;
      if (Math.abs(dx * axisX.x + dz * axisX.z) <= halfX && Math.abs(dx * axisZ.x + dz * axisZ.z) <= halfZ) {
        writeExclusion(data, ex, ez, 1);
      }
    }
  }
}

/** A pad or prefab yawed by `rotationY` exactly as `Object3D.rotation.y` would place it. */
export function stampMeadowYawedRectangle(
  data: MeadowFieldPatchData,
  centerX: number,
  centerZ: number,
  rotationY: number,
  halfX: number,
  halfZ: number
): void {
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  stampMeadowRectangle(data, centerX, centerZ, { x: cosine, z: -sine }, { x: sine, z: cosine }, halfX, halfZ);
}

const proxyRotation = new THREE.Quaternion();
const proxyAxis = new THREE.Vector3();

/**
 * Stamps ground-touching collision boxes. A box whose base is above
 * `groundContactMeters` (a fence rail, an awning) or that barely rises from the
 * ground (a flat threshold) leaves the carpet under it alone.
 */
export function stampMeadowCollisionFootprints(
  data: MeadowFieldPatchData,
  proxies: readonly StaticCollisionProxy[],
  groundContactMeters = 0.4
): number {
  let stamped = 0;
  for (const proxy of proxies) {
    const { center, halfExtents, rotation } = proxy;
    if (center.x < data.originX - 20 || center.x > data.originX + data.sizeMeters + 20) continue;
    if (center.z < data.originZ - 20 || center.z > data.originZ + data.sizeMeters + 20) continue;
    if (halfExtents.x > 30 || halfExtents.z > 30) continue;
    const ground = sampleMeadowHeight(data, center.x, center.z);
    const bottom = center.y - halfExtents.y;
    const top = center.y + halfExtents.y;
    if (bottom > ground + groundContactMeters || top < ground + 0.05) continue;
    proxyRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
    proxyAxis.set(1, 0, 0).applyQuaternion(proxyRotation);
    const axisX = { x: proxyAxis.x, z: proxyAxis.z };
    proxyAxis.set(0, 0, 1).applyQuaternion(proxyRotation);
    const axisZ = { x: proxyAxis.x, z: proxyAxis.z };
    const lengthX = Math.hypot(axisX.x, axisX.z) || 1;
    const lengthZ = Math.hypot(axisZ.x, axisZ.z) || 1;
    // Blades may lean against a wall; only the footprint itself stays bare.
    stampMeadowRectangle(
      data,
      center.x,
      center.z,
      { x: axisX.x / lengthX, z: axisX.z / lengthX },
      { x: axisZ.x / lengthZ, z: axisZ.z / lengthZ },
      Math.max(0, halfExtents.x * lengthX - 0.04),
      Math.max(0, halfExtents.z * lengthZ - 0.04)
    );
    stamped += 1;
  }
  return stamped;
}

export function clearMeadowExclusion(data: MeadowFieldPatchData): void {
  data.exclusion.fill(0);
}

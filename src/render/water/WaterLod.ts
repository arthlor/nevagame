import * as THREE from "three";
import { CANONICAL_RENDER_CONFIG, type QualityTier } from "../config/VisualRenderConfig";
import { maxWaveDisplacement } from "./WaterSurface";

/**
 * Camera-centred water lattice (CDLOD: continuous distance-dependent level
 * of detail, Strugar 2010).
 *
 * A world-aligned quadtree covers the sea. Each frame the nodes the camera
 * needs are selected against distance rings and the view frustum and drawn
 * as instances of one small grid patch, so the whole visible sea is two draw
 * calls. Cell size doubles with every ring, which keeps the triangles — the
 * low-poly facets — at a roughly constant size on screen: one-metre cells
 * around the player, tens of metres at the horizon.
 *
 * No swimming: node origins and grid vertices sit on fixed world positions.
 * No cracks and no popping: inside the outer part of its ring every vertex
 * morphs toward the next-coarser grid (odd vertices slide onto their even
 * neighbours), so by the ring edge a node is geometrically identical to the
 * coarser node beside it. The morph factor is a pure function of the vertex's
 * undisplaced position and the camera, evaluated identically here (for
 * selection) and in the vertex shader.
 *
 * Crack-freedom requires every node to lie within its parent's ring and the
 * morph to start beyond any finer neighbour; with ranges of `rangeScale ×
 * nodeSize` that holds for rangeScale ≥ √2·(1 + ...) — the configured 3 with
 * a 0.78 morph start satisfies both (`waterLodRanges` asserts it).
 */

export interface WaterLodSettings {
  readonly finestCellMeters: number;
  readonly patchCells: number;
  readonly levels: number;
  readonly rangeScale: number;
  readonly morphStartRatio: number;
  readonly maxNodes: number;
}

export interface WaterLodRanges {
  /** Outer radius of each level's ring (3D distance to the still surface). */
  readonly ranges: readonly number[];
  /** Morph (start, end) per level; end equals the ring radius. */
  readonly morph: readonly THREE.Vector2[];
  readonly nodeSizes: readonly number[];
  readonly cellSizes: readonly number[];
}

export function waterLodSettings(): WaterLodSettings {
  return CANONICAL_RENDER_CONFIG.waterSurface.lod;
}

export function waterLodRanges(settings: WaterLodSettings = waterLodSettings()): WaterLodRanges {
  if (settings.patchCells % 2 !== 0) throw new Error("Water LOD patch needs an even cell count to morph");
  const ranges: number[] = [];
  const morph: THREE.Vector2[] = [];
  const nodeSizes: number[] = [];
  const cellSizes: number[] = [];
  for (let level = 0; level < settings.levels; level += 1) {
    const cell = settings.finestCellMeters * 2 ** level;
    const node = cell * settings.patchCells;
    const range = settings.rangeScale * node;
    cellSizes.push(cell);
    nodeSizes.push(node);
    ranges.push(range);
    morph.push(new THREE.Vector2(range * settings.morphStartRatio, range));
  }
  // A finer node reaches at most range[L-1] + its diagonal from the camera;
  // the coarser ring must not have started morphing there.
  for (let level = 1; level < settings.levels; level += 1) {
    const finerReach = ranges[level - 1]! + nodeSizes[level - 1]! * Math.SQRT2;
    if (morph[level]!.x < finerReach) {
      throw new Error(`Water LOD ring ${level} starts morphing inside its finer neighbour`);
    }
  }
  return { ranges, morph, nodeSizes, cellSizes };
}

/** Grid patch in lattice units: vertex (i, j) at (i, 0, j), uniform diagonal. */
export function createWaterPatchGeometry(cells: number, maxInstances: number): THREE.InstancedBufferGeometry {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = new Float32Array((cells + 1) * (cells + 1) * 3);
  let offset = 0;
  for (let j = 0; j <= cells; j += 1) {
    for (let i = 0; i <= cells; i += 1) {
      positions[offset++] = i;
      positions[offset++] = 0;
      positions[offset++] = j;
    }
  }
  const indices: number[] = [];
  const stride = cells + 1;
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // One diagonal direction everywhere: collapsing the odd vertices then
      // yields exactly the coarser grid with the same diagonal, so a fully
      // morphed ring is the next ring, triangle for triangle.
      indices.push(a, c, d, a, d, b);
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const node = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 4), 4);
  node.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aNode", node);
  geometry.instanceCount = 0;
  // Culling is done per node during selection; the mesh itself is never culled.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Number.POSITIVE_INFINITY);
  return geometry;
}

/** Instanced LOD surface: full patches and quarter patches share one material. */
export class WaterLodSurface {
  public readonly full: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  public readonly quarter: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  public readonly ranges: WaterLodRanges;
  public readonly settings: WaterLodSettings;
  private readonly roots: readonly { x: number; z: number }[];
  private readonly frustum = new THREE.Frustum();
  private readonly projectionView = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly verticalMargin: number;
  private readonly horizontalMargin: number;
  private readonly cameraPosition = new THREE.Vector3();
  private minimumLevel = 0;
  private fullCount = 0;
  private quarterCount = 0;

  constructor(material: THREE.ShaderMaterial, extent: { minX: number; minZ: number; maxX: number; maxZ: number },
    settings: WaterLodSettings = waterLodSettings()) {
    this.settings = settings;
    this.ranges = waterLodRanges(settings);
    this.full = new THREE.Mesh(createWaterPatchGeometry(settings.patchCells, settings.maxNodes), material);
    this.quarter = new THREE.Mesh(createWaterPatchGeometry(settings.patchCells / 2, settings.maxNodes), material);
    this.full.name = "water_lod_full";
    this.quarter.name = "water_lod_quarter";
    for (const mesh of [this.full, this.quarter]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
    }
    const margin = maxWaveDisplacement();
    this.verticalMargin = margin.vertical;
    this.horizontalMargin = margin.horizontal;
    // Roots sit on multiples of the root size, so every node and vertex is a
    // fixed world position regardless of where the extent begins.
    const rootSize = this.ranges.nodeSizes[settings.levels - 1]!;
    const roots: { x: number; z: number }[] = [];
    for (let x = Math.floor(extent.minX / rootSize) * rootSize; x < extent.maxX; x += rootSize) {
      for (let z = Math.floor(extent.minZ / rootSize) * rootSize; z < extent.maxZ; z += rootSize) {
        roots.push({ x, z });
      }
    }
    this.roots = roots;
  }

  public get nodeCount(): { full: number; quarter: number } {
    return { full: this.fullCount, quarter: this.quarterCount };
  }

  /** Coarsest-first cap on detail: Low starts one ring coarser. */
  public setQuality(tier: QualityTier): void {
    this.minimumLevel = CANONICAL_RENDER_CONFIG.waterSurface.lod.finestLevel[tier];
  }

  /** Select the nodes this camera needs. Call once per frame before rendering. */
  public update(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    this.fullCount = 0;
    this.quarterCount = 0;
    const top = this.settings.levels - 1;
    for (const root of this.roots) this.selectNode(root.x, root.z, top);
    this.commit(this.full, this.fullCount);
    this.commit(this.quarter, this.quarterCount);
  }

  private commit(mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>, count: number): void {
    const attribute = mesh.geometry.getAttribute("aNode") as THREE.InstancedBufferAttribute;
    attribute.clearUpdateRanges();
    if (count > 0) attribute.addUpdateRange(0, count * 4);
    attribute.needsUpdate = true;
    mesh.geometry.instanceCount = count;
    mesh.visible = count > 0;
  }

  /** Squared 3D distance from the camera to a node's square on the still surface. */
  private distanceSquared(x: number, z: number, size: number): number {
    const camera = this.cameraPosition;
    const dx = Math.max(x - camera.x, 0, camera.x - (x + size));
    const dz = Math.max(z - camera.z, 0, camera.z - (z + size));
    return dx * dx + dz * dz + camera.y * camera.y;
  }

  private visible(x: number, z: number, size: number): boolean {
    const h = this.horizontalMargin;
    this.box.min.set(x - h, -this.verticalMargin, z - h);
    this.box.max.set(x + size + h, this.verticalMargin, z + size + h);
    return this.frustum.intersectsBox(this.box);
  }

  /** Standard CDLOD selection; returns false if this node is beyond its ring. */
  private selectNode(x: number, z: number, level: number): boolean {
    const size = this.ranges.nodeSizes[level]!;
    const range = this.ranges.ranges[level]!;
    if (this.distanceSquared(x, z, size) > range * range) return false;
    if (!this.visible(x, z, size)) return true;
    if (level <= this.minimumLevel) {
      this.emit(this.full, x, z, level);
      return true;
    }
    const finerRange = this.ranges.ranges[level - 1]!;
    if (this.distanceSquared(x, z, size) > finerRange * finerRange) {
      this.emit(this.full, x, z, level);
      return true;
    }
    const half = size * 0.5;
    for (let child = 0; child < 4; child += 1) {
      const cx = x + (child & 1) * half;
      const cz = z + (child >> 1) * half;
      // A child beyond the finer ring is drawn at this level, a quarter patch.
      if (!this.selectNode(cx, cz, level - 1) && this.visible(cx, cz, half)) {
        this.emit(this.quarter, cx, cz, level);
      }
    }
    return true;
  }

  private emit(mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>, x: number, z: number, level: number): void {
    const isFull = mesh === this.full;
    const count = isFull ? this.fullCount : this.quarterCount;
    if (count >= this.settings.maxNodes) return;
    const attribute = mesh.geometry.getAttribute("aNode") as THREE.InstancedBufferAttribute;
    const array = attribute.array as Float32Array;
    const offset = count * 4;
    array[offset] = x;
    array[offset + 1] = z;
    array[offset + 2] = this.ranges.cellSizes[level]!;
    array[offset + 3] = level;
    if (isFull) this.fullCount += 1;
    else this.quarterCount += 1;
  }

  public dispose(): void {
    this.full.geometry.dispose();
    this.quarter.geometry.dispose();
  }
}

/**
 * Vertex stage for the LOD surface: place the lattice vertex, morph it toward
 * the coarser grid, and report the effective cell size (so the wave field
 * fades a band out of the geometry exactly as the coarser neighbour does).
 */
export const WATER_LOD_VERTEX_GLSL = /* glsl */ `
  in vec4 aNode;
  uniform vec2 uLodMorph[${CANONICAL_RENDER_CONFIG.waterSurface.lod.levels}];

  vec2 nevaLodLattice(out float cellMeters) {
    vec2 grid = position.xz;
    vec2 world = aNode.xy + grid * aNode.z;
    vec2 morphRange = uLodMorph[int(aNode.w + 0.5)];
    float distanceToCamera = distance(cameraPosition, vec3(world.x, 0.0, world.y));
    float morph = clamp((distanceToCamera - morphRange.x) / max(0.001, morphRange.y - morphRange.x), 0.0, 1.0);
    grid -= fract(grid * 0.5) * 2.0 * morph;
    cellMeters = aNode.z * (1.0 + morph);
    return aNode.xy + grid * aNode.z;
  }
`;

import * as THREE from "three";
import { runCooperatively } from "../../utils/CooperativeTask";
import type { StaticCollisionProxy } from "../../physics/StaticCollision";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import {
  CANONICAL_RENDER_CONFIG,
  qualityTierAtLevel,
  qualityTierLevel,
  qualityValueAtLevel,
  type QualityTier
} from "../config/VisualRenderConfig";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";
import type { PlayerPresence } from "../presentation/PlayerPresence";
import { ACKNOWLEDGE_COVER_RADIUS_METERS, presenceFalloff } from "../presentation/WorldAcknowledgment";
import { groundCoverWindStrength } from "../scene/groundCoverWind";
import { bindMeadowColorUniforms, setMeadowLiveField } from "./MeadowColorField";
import {
  MEADOW_FIELD_BLADE_VERTEX,
  MEADOW_FIELD_COLOR_FRAGMENT,
  MEADOW_FIELD_FRAGMENT_DECLARATIONS,
  MEADOW_FIELD_NORMAL_FRAGMENT,
  MEADOW_FIELD_ROUGHNESS_FRAGMENT,
  MEADOW_FIELD_TRANSLUCENCY,
  MEADOW_FIELD_VERTEX_DECLARATIONS
} from "./meadowFieldGlsl";
import {
  createMeadowPatchData,
  stampMeadowCollisionFootprints,
  stampMeadowYawedRectangle,
  stampRoadCoverageSteps,
  type MeadowFieldPatchData,
  type MeadowTerrainPatch
} from "./MeadowFieldSource";

export const MEADOW_FIELD_PROGRAM_CACHE_KEY = "neva-meadow-field-r174-v3-patch-response";

const FIELD = CANONICAL_RENDER_CONFIG.meadow.field;
const VISIBILITY_REFRESH_DISTANCE_METERS = 0.5;

export type MeadowBladeDetail = "near" | "far";

export function meadowBladeTriangles(segments: number): number {
  return segments * 2 - 1;
}

/**
 * One tapered blade per `bladeCount`, each a strip of `segments` spine
 * intervals closed by a tip vertex. `position` carries (t, side, blade index);
 * the vertex shader resolves every real position, so the strip is shape-free.
 */
export function buildMeadowBladeGeometry(bladeCount: number, segments: number): THREE.BufferGeometry {
  if (!Number.isInteger(bladeCount) || bladeCount < 1) throw new Error(`[MeadowField] Invalid blade count ${bladeCount}`);
  if (!Number.isInteger(segments) || segments < 1) throw new Error(`[MeadowField] Invalid segment count ${segments}`);
  const perBlade = segments * 2 + 1;
  const positions = new Float32Array(bladeCount * perBlade * 3);
  const indexCount = bladeCount * meadowBladeTriangles(segments) * 3;
  const indices = bladeCount * perBlade > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vertex = 0;
  let cursor = 0;
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const first = vertex;
    for (let level = 0; level < segments; level += 1) {
      const t = level / segments;
      positions.set([t, -1, blade, t, 1, blade], vertex * 3);
      vertex += 2;
    }
    positions.set([1, 0, blade], vertex * 3);
    const tip = vertex;
    vertex += 1;
    for (let level = 0; level < segments - 1; level += 1) {
      const left = first + level * 2;
      indices.set([left, left + 1, left + 2, left + 1, left + 3, left + 2], cursor);
      cursor += 6;
    }
    const lastLeft = first + (segments - 1) * 2;
    indices.set([lastLeft, lastLeft + 1, tip], cursor);
    cursor += 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Real extents come from per-tile bounds; keep three's own bounds harmless.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FIELD.tileSizeMeters * 2);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
  return geometry;
}

export interface MeadowFieldLevel {
  nearRadius: number;
  radius: number;
  nearBlades: number;
  farBlades: number;
  receiveShadows: boolean;
}

/** Continuous tier values; blade counts are stable prefixes of one sequence. */
export function meadowFieldLevel(level: number): MeadowFieldLevel {
  const area = FIELD.tileSizeMeters * FIELD.tileSizeMeters;
  const maxBlades = Math.floor(FIELD.maxBladesPerSquareMeter * area);
  const nearBlades = Math.min(maxBlades, Math.floor(
    qualityValueAtLevel(level, (quality) => quality.meadowField.nearBladesPerSquareMeter) * area
  ));
  return {
    nearRadius: qualityValueAtLevel(level, (quality) => quality.meadowField.nearRadiusMeters),
    radius: qualityValueAtLevel(level, (quality) => quality.meadowField.radiusMeters),
    nearBlades,
    farBlades: Math.min(nearBlades, Math.floor(
      qualityValueAtLevel(level, (quality) => quality.meadowField.farBladesPerSquareMeter) * area
    )),
    receiveShadows: CANONICAL_RENDER_CONFIG.quality[qualityTierAtLevel(level)].meadowField.receiveShadows
  };
}

/** Tile detail by player distance to the tile's nearest point; null when out of range. */
export function meadowTileDetail(
  distanceMeters: number,
  level: Pick<MeadowFieldLevel, "nearRadius" | "radius">
): MeadowBladeDetail | null {
  if (distanceMeters > level.radius) return null;
  return distanceMeters <= level.nearRadius + FIELD.nearFadeMeters ? "near" : "far";
}

interface MeadowFieldUniforms {
  meadowTiles: { value: THREE.Vector4 };
  meadowRadii: { value: THREE.Vector4 };
  meadowHeightRange: { value: THREE.Vector4 };
  meadowWidthRange: { value: THREE.Vector4 };
  meadowMotion: { value: THREE.Vector4 };
  meadowShading: { value: THREE.Vector4 };
  meadowSurface: { value: THREE.Vector4 };
  meadowTranslucency: { value: THREE.Vector2 };
  meadowTime: { value: number };
  meadowWindDir: { value: THREE.Vector2 };
  meadowWindStrength: { value: number };
  meadowMotionScale: { value: number };
  meadowPresence: { value: THREE.Vector4 };
}

function createSharedUniforms(): MeadowFieldUniforms {
  return {
    meadowTiles: { value: new THREE.Vector4(
      FIELD.tileSizeMeters, 0, 1 / Math.sqrt(FIELD.maxBladesPerSquareMeter), FIELD.rootSinkMeters
    ) },
    meadowRadii: { value: new THREE.Vector4(0, FIELD.nearFadeMeters, 0, FIELD.outerFadeMeters) },
    meadowHeightRange: { value: new THREE.Vector4(
      FIELD.shortHeightMeters[0], FIELD.shortHeightMeters[1], FIELD.meadowHeightMeters[0], FIELD.meadowHeightMeters[1]
    ) },
    meadowWidthRange: { value: new THREE.Vector4(
      FIELD.widthMeters[0], FIELD.widthMeters[1], FIELD.farWidthScale, FIELD.dryHeightScale
    ) },
    meadowMotion: { value: new THREE.Vector4(
      FIELD.leanRange[0], FIELD.leanRange[1], FIELD.windAmplitudeMeters, FIELD.presencePushMeters
    ) },
    meadowShading: { value: new THREE.Vector4(FIELD.normalUp, FIELD.normalRoundness, FIELD.valueJitter, 0) },
    meadowSurface: { value: new THREE.Vector4(FIELD.rootShade, FIELD.roughnessRoot, FIELD.roughnessTip, 0) },
    meadowTranslucency: { value: new THREE.Vector2(FIELD.translucency, FIELD.translucencyPower) },
    meadowTime: { value: 0 },
    meadowWindDir: { value: new THREE.Vector2(0, 1) },
    meadowWindStrength: { value: 0 },
    meadowMotionScale: { value: 1 },
    meadowPresence: { value: new THREE.Vector4(0, 0, 0, ACKNOWLEDGE_COVER_RADIUS_METERS) }
  };
}

function replaceChunk(source: string, marker: string, replacement: string, stage: "vertex" | "fragment"): string {
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) {
    throw new Error(`[MeadowField] Three.js r174 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`);
  }
  return source.replace(marker, replacement);
}

export interface MeadowShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, unknown>;
}

/** Turns a standard material's program into the blade program. */
export function patchMeadowFieldShader(shader: MeadowShaderSource, uniforms: Record<string, unknown>): void {
  shader.vertexShader = replaceChunk(shader.vertexShader, "#include <common>",
    `#include <common>\n${MEADOW_FIELD_VERTEX_DECLARATIONS}`, "vertex");
  shader.vertexShader = replaceChunk(shader.vertexShader, "#include <beginnormal_vertex>",
    MEADOW_FIELD_BLADE_VERTEX, "vertex");
  shader.vertexShader = replaceChunk(shader.vertexShader, "#include <begin_vertex>",
    "vec3 transformed = meadowLocalPosition;", "vertex");
  shader.fragmentShader = replaceChunk(shader.fragmentShader, "#include <common>",
    `#include <common>\n${MEADOW_FIELD_FRAGMENT_DECLARATIONS}`, "fragment");
  shader.fragmentShader = replaceChunk(shader.fragmentShader, "#include <color_fragment>",
    `#include <color_fragment>\n${MEADOW_FIELD_COLOR_FRAGMENT}`, "fragment");
  shader.fragmentShader = replaceChunk(shader.fragmentShader, "#include <normal_fragment_begin>",
    `#include <normal_fragment_begin>\n${MEADOW_FIELD_NORMAL_FRAGMENT}`, "fragment");
  shader.fragmentShader = replaceChunk(shader.fragmentShader, "#include <roughnessmap_fragment>",
    `#include <roughnessmap_fragment>\n${MEADOW_FIELD_ROUGHNESS_FRAGMENT}`, "fragment");
  shader.fragmentShader = replaceChunk(shader.fragmentShader, "#include <lights_physical_pars_fragment>",
    `#include <lights_physical_pars_fragment>\n${MEADOW_FIELD_TRANSLUCENCY}`, "fragment");
  Object.assign(shader.uniforms, uniforms);
}

/**
 * Global 4 m tiles over one terrain patch. Each tile knows whether any
 * carpet can grow in it and its height range, so empty sea, road and farm
 * tiles never reach the GPU and culling bounds stay tight.
 */
interface MeadowTileGrid {
  minTileX: number;
  minTileZ: number;
  countX: number;
  countZ: number;
  active: Uint8Array;
  minY: Float32Array;
  maxY: Float32Array;
}

function buildTileGrid(data: MeadowFieldPatchData): MeadowTileGrid {
  const size = FIELD.tileSizeMeters;
  const minTileX = Math.floor(data.originX / size);
  const minTileZ = Math.floor(data.originZ / size);
  const countX = Math.ceil((data.originX + data.sizeMeters) / size) - minTileX;
  const countZ = Math.ceil((data.originZ + data.sizeMeters) / size) - minTileZ;
  const active = new Uint8Array(countX * countZ);
  const minY = new Float32Array(countX * countZ);
  const maxY = new Float32Array(countX * countZ);
  const last = data.vertices - 1;
  for (let tz = 0; tz < countZ; tz += 1) {
    const z0 = (minTileZ + tz) * size;
    const iz0 = Math.max(0, Math.floor((z0 - data.originZ) / data.step) - 1);
    const iz1 = Math.min(last, Math.ceil((z0 + size - data.originZ) / data.step) + 1);
    for (let tx = 0; tx < countX; tx += 1) {
      const x0 = (minTileX + tx) * size;
      const ix0 = Math.max(0, Math.floor((x0 - data.originX) / data.step) - 1);
      const ix1 = Math.min(last, Math.ceil((x0 + size - data.originX) / data.step) + 1);
      let density = 0;
      let low = Number.POSITIVE_INFINITY;
      let high = Number.NEGATIVE_INFINITY;
      for (let iz = iz0; iz <= iz1; iz += 1) {
        for (let ix = ix0; ix <= ix1; ix += 1) {
          const vertex = iz * data.vertices + ix;
          density = Math.max(density, data.cover[vertex * 4]);
          low = Math.min(low, data.heights[vertex]);
          high = Math.max(high, data.heights[vertex]);
        }
      }
      const tile = tz * countX + tx;
      active[tile] = density > 0 ? 1 : 0;
      minY[tile] = Number.isFinite(low) ? low : 0;
      maxY[tile] = Number.isFinite(high) ? high : 0;
    }
  }
  return { minTileX, minTileZ, countX, countZ, active, minY, maxY };
}

interface MeadowIsland {
  data: MeadowFieldPatchData;
  /** Road and pad exclusion before collision footprints, for layout-editor restamps. */
  baseExclusion: Uint8Array | null;
  grid: MeadowTileGrid;
  material: THREE.MeshStandardMaterial | null;
  textures: THREE.DataTexture[];
  exclusionTexture: THREE.DataTexture | null;
  near: THREE.InstancedMesh | null;
  far: THREE.InstancedMesh | null;
  /** Tile indices within range, with their detail, refreshed as the anchor moves. */
  candidates: number[];
  candidateDetail: MeadowBladeDetail[];
  renderedNear: number[];
  renderedFar: number[];
}

const tileBox = new THREE.Box3();
const tileMatrix = new THREE.Matrix4();

export class MeadowField {
  public readonly group = new THREE.Group();
  private readonly islands: MeadowIsland[] = [];
  private readonly uniforms = createSharedUniforms();
  private readonly nearGeometry: THREE.BufferGeometry;
  private readonly farGeometry: THREE.BufferGeometry;
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly lastFocus = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  private qualityLevel: number;
  private level: MeadowFieldLevel;
  private windPadding = 0;
  private membershipDirty = true;
  private built = false;

  public constructor(tier: QualityTier) {
    this.group.name = "meadow_field";
    this.qualityLevel = qualityTierLevel(tier);
    this.level = meadowFieldLevel(this.qualityLevel);
    const area = FIELD.tileSizeMeters * FIELD.tileSizeMeters;
    const farMax = Math.max(...Object.values(CANONICAL_RENDER_CONFIG.quality)
      .map((quality) => quality.meadowField.farBladesPerSquareMeter));
    this.nearGeometry = buildMeadowBladeGeometry(Math.floor(FIELD.maxBladesPerSquareMeter * area), FIELD.nearSegments);
    this.farGeometry = buildMeadowBladeGeometry(Math.floor(farMax * area), FIELD.farSegments);
    this.applyLevel();
  }

  /** Copies carpet control data out of a terrain patch before its geometry is batched away. */
  public addTerrainPatch(patch: MeadowTerrainPatch, geometry: THREE.BufferGeometry): void {
    this.addPatchData(createMeadowPatchData(patch, geometry, FIELD.exclusionTexelMeters));
  }

  /** Adds prepared control data, e.g. a uniform review patch in the Art Yard. */
  public addPatchData(data: MeadowFieldPatchData): void {
    if (this.built) throw new Error("[MeadowField] Patches must be added before build()");
    this.islands.push({
      data,
      baseExclusion: null,
      grid: buildTileGrid(data),
      material: null,
      textures: [],
      exclusionTexture: null,
      near: null,
      far: null,
      candidates: [],
      candidateDetail: [],
      renderedNear: [],
      renderedFar: []
    });
  }

  /** Road coverage at meadow-mask resolution, including the road material's broad edge field. */
  public async stampRoadCoverage(pathGeometry: THREE.BufferGeometry, signal?: AbortSignal): Promise<void> {
    for (const island of this.islands) {
      await runCooperatively(stampRoadCoverageSteps(island.data, pathGeometry), signal);
    }
  }

  /** Authored footprints such as architecture pads (rotation as `Object3D.rotation.y`). */
  public stampFootprints(
    footprints: ReadonlyArray<{ x: number; z: number; rotationY: number; halfX: number; halfZ: number }>
  ): void {
    for (const island of this.islands) {
      for (const footprint of footprints) {
        stampMeadowYawedRectangle(island.data, footprint.x, footprint.z, footprint.rotationY, footprint.halfX, footprint.halfZ);
      }
    }
  }

  /** Creates the GPU resources once every exclusion source is known. */
  public build(collision: readonly StaticCollisionProxy[]): void {
    if (this.built) return;
    this.built = true;
    for (const island of this.islands) {
      island.baseExclusion = island.data.exclusion.slice();
      stampMeadowCollisionFootprints(island.data, collision);
      this.createIslandResources(island);
    }
    this.applyLevel();
  }

  /** Layout-editor edits move static colliders; re-derive their footprints. */
  public restampCollision(collision: readonly StaticCollisionProxy[]): void {
    for (const island of this.islands) {
      if (!island.baseExclusion || !island.exclusionTexture) continue;
      island.data.exclusion.set(island.baseExclusion);
      stampMeadowCollisionFootprints(island.data, collision);
      island.exclusionTexture.needsUpdate = true;
    }
  }

  private createIslandResources(island: MeadowIsland): void {
    const { data } = island;
    const heights = new THREE.DataTexture(data.heights, data.vertices, data.vertices, THREE.RedFormat, THREE.FloatType);
    heights.minFilter = THREE.NearestFilter;
    heights.magFilter = THREE.NearestFilter;
    const cover = new THREE.DataTexture(data.cover, data.vertices, data.vertices, THREE.RGBAFormat, THREE.UnsignedByteType);
    cover.minFilter = THREE.LinearFilter;
    cover.magFilter = THREE.LinearFilter;
    const exclusion = new THREE.DataTexture(
      data.exclusion, data.exclusionSize, data.exclusionSize, THREE.RedFormat, THREE.UnsignedByteType
    );
    exclusion.minFilter = THREE.LinearFilter;
    exclusion.magFilter = THREE.LinearFilter;
    for (const texture of [heights, cover, exclusion]) {
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
    }
    island.textures = [heights, cover, exclusion];
    island.exclusionTexture = exclusion;

    const islandUniforms: Record<string, unknown> = {
      ...this.uniforms,
      meadowHeights: { value: heights },
      meadowCover: { value: cover },
      meadowExclusion: { value: exclusion },
      meadowGrid: { value: new THREE.Vector4(data.originX, data.originZ, data.step, data.vertices) },
      meadowExclusionGrid: { value: new THREE.Vector4(
        data.originX, data.originZ, data.exclusionTexelMeters, data.exclusionSize
      ) }
    };
    bindMeadowColorUniforms(islandUniforms);
    const material = PaletteMaterials.standard("foliage_sage_01", {
      flatShading: false,
      roughness: FIELD.roughnessRoot,
      metalness: 0
    }).clone();
    material.name = `meadow_field_${data.islandId}`;
    material.color.setRGB(1, 1, 1);
    material.side = THREE.DoubleSide;
    material.onBeforeCompile = (shader) => patchMeadowFieldShader(shader, islandUniforms);
    material.customProgramCacheKey = () => MEADOW_FIELD_PROGRAM_CACHE_KEY;
    applyWorldAtmosphere(material);
    island.material = material;

    const tileSpan = FIELD.tileSizeMeters;
    const nearCapacity = Math.ceil((2 * (this.maxNearReach() + tileSpan)) / tileSpan + 1) ** 2;
    const farCapacity = Math.ceil((2 * (this.maxRadius() + tileSpan)) / tileSpan + 1) ** 2;
    island.near = this.createMesh(this.nearGeometry, material, nearCapacity, `${material.name}_near`);
    island.far = this.createMesh(this.farGeometry, material, farCapacity, `${material.name}_far`);
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    capacity: number,
    name: string
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = this.level.receiveShadows;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Blade positions only exist in the shader; never let a picking ray see the strip.
    mesh.raycast = () => {};
    mesh.userData.presentationOnly = true;
    this.group.add(mesh);
    return mesh;
  }

  private maxNearReach(): number {
    return Math.max(...Object.values(CANONICAL_RENDER_CONFIG.quality)
      .map((quality) => quality.meadowField.nearRadiusMeters)) + FIELD.nearFadeMeters;
  }

  private maxRadius(): number {
    return Math.max(...Object.values(CANONICAL_RENDER_CONFIG.quality)
      .map((quality) => quality.meadowField.radiusMeters));
  }

  public setQuality(tier: QualityTier): void {
    this.setQualityLevel(qualityTierLevel(tier));
  }

  public setQualityLevel(level: number): void {
    const clamped = THREE.MathUtils.clamp(level, 0, 2);
    if (clamped === this.qualityLevel && this.built) return;
    this.qualityLevel = clamped;
    this.level = meadowFieldLevel(clamped);
    this.applyLevel();
    this.membershipDirty = true;
  }

  private applyLevel(): void {
    const level = this.level;
    this.nearGeometry.setDrawRange(0, level.nearBlades * meadowBladeTriangles(FIELD.nearSegments) * 3);
    this.farGeometry.setDrawRange(0, level.farBlades * meadowBladeTriangles(FIELD.farSegments) * 3);
    this.uniforms.meadowTiles.value.y = level.farBlades;
    this.uniforms.meadowTiles.value.z = FIELD.tileSizeMeters / Math.sqrt(Math.max(1, level.farBlades));
    this.uniforms.meadowRadii.value.x = level.nearRadius;
    this.uniforms.meadowRadii.value.z = level.radius;
    for (const island of this.islands) {
      if (island.near) island.near.receiveShadow = level.receiveShadows;
      if (island.far) island.far.receiveShadow = level.receiveShadows;
    }
  }

  public currentLevel(): Readonly<MeadowFieldLevel> {
    return this.level;
  }

  public updateWind(
    signal: Readonly<WeatherMotionSignal>,
    timeSeconds: number,
    motionScale: number,
    presence?: Pick<PlayerPresence, "x" | "z" | "moving">
  ): void {
    const strength = groundCoverWindStrength(signal);
    this.uniforms.meadowTime.value = timeSeconds;
    this.uniforms.meadowWindDir.value.set(signal.directionX, signal.directionZ);
    this.uniforms.meadowWindStrength.value = strength;
    this.uniforms.meadowMotionScale.value = motionScale;
    if (presence) {
      // The same strength and radius the instanced cover uses to part for the player.
      const push = presenceFalloff(presence, presence.x, presence.z, ACKNOWLEDGE_COVER_RADIUS_METERS)
        * (presence.moving ? 1 : 0.55);
      this.uniforms.meadowPresence.value.set(presence.x, presence.z, push, ACKNOWLEDGE_COVER_RADIUS_METERS);
    }
    const tallest = FIELD.meadowHeightMeters[1];
    this.windPadding = FIELD.windAmplitudeMeters * strength * Math.abs(motionScale) * (tallest / 0.25) * 1.2;
  }

  /** Player-anchored membership: camera orbit, pitch and zoom never change which blades exist. */
  public update(anchorX: number, anchorZ: number): void {
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorZ)) return;
    setMeadowLiveField(anchorX, anchorZ, this.built ? this.level.radius : 0, FIELD.outerFadeMeters);
    const dx = anchorX - this.lastFocus.x;
    const dz = anchorZ - this.lastFocus.y;
    if (!this.membershipDirty && dx * dx + dz * dz < VISIBILITY_REFRESH_DISTANCE_METERS ** 2) return;
    this.membershipDirty = false;
    this.lastFocus.set(anchorX, anchorZ);
    const size = FIELD.tileSizeMeters;
    const radius = this.level.radius;
    for (const island of this.islands) {
      const { grid } = island;
      island.candidates.length = 0;
      island.candidateDetail.length = 0;
      const startX = Math.max(0, Math.floor((anchorX - radius) / size) - grid.minTileX);
      const endX = Math.min(grid.countX - 1, Math.floor((anchorX + radius) / size) - grid.minTileX);
      const startZ = Math.max(0, Math.floor((anchorZ - radius) / size) - grid.minTileZ);
      const endZ = Math.min(grid.countZ - 1, Math.floor((anchorZ + radius) / size) - grid.minTileZ);
      for (let tz = startZ; tz <= endZ; tz += 1) {
        const z0 = (grid.minTileZ + tz) * size;
        const nearestZ = Math.min(Math.max(anchorZ, z0), z0 + size);
        for (let tx = startX; tx <= endX; tx += 1) {
          const tile = tz * grid.countX + tx;
          if (!grid.active[tile]) continue;
          const x0 = (grid.minTileX + tx) * size;
          const nearestX = Math.min(Math.max(anchorX, x0), x0 + size);
          const detail = meadowTileDetail(Math.hypot(nearestX - anchorX, nearestZ - anchorZ), this.level);
          if (!detail) continue;
          island.candidates.push(tile);
          island.candidateDetail.push(detail);
        }
      }
    }
  }

  public updateRenderVisibility(camera: THREE.Camera): void {
    if (!this.built) return;
    camera.updateWorldMatrix(true, false);
    this.group.updateWorldMatrix(true, false);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.group.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.viewProjection, camera.coordinateSystem);
    const size = FIELD.tileSizeMeters;
    const reach = FIELD.leanRange[1] * FIELD.meadowHeightMeters[1] + this.windPadding + 0.3;
    const lift = FIELD.meadowHeightMeters[1] + this.windPadding + 0.2;
    for (const island of this.islands) {
      const { grid, near, far } = island;
      if (!near || !far) continue;
      const nearTiles: number[] = [];
      const farTiles: number[] = [];
      for (let index = 0; index < island.candidates.length; index += 1) {
        const tile = island.candidates[index];
        const tx = tile % grid.countX;
        const tz = (tile - tx) / grid.countX;
        const x0 = (grid.minTileX + tx) * size;
        const z0 = (grid.minTileZ + tz) * size;
        tileBox.min.set(x0 - reach, grid.minY[tile] - FIELD.rootSinkMeters - 0.1, z0 - reach);
        tileBox.max.set(x0 + size + reach, grid.maxY[tile] + lift, z0 + size + reach);
        if (!this.frustum.intersectsBox(tileBox)) continue;
        (island.candidateDetail[index] === "near" ? nearTiles : farTiles).push(tile);
      }
      this.submit(island, near, nearTiles, island.renderedNear);
      this.submit(island, far, farTiles, island.renderedFar);
      island.renderedNear = nearTiles;
      island.renderedFar = farTiles;
    }
  }

  private submit(island: MeadowIsland, mesh: THREE.InstancedMesh, tiles: number[], previous: number[]): void {
    const unchanged = tiles.length === previous.length && tiles.every((tile, index) => previous[index] === tile);
    if (unchanged) return;
    const { grid } = island;
    const size = FIELD.tileSizeMeters;
    for (let index = 0; index < tiles.length; index += 1) {
      const tile = tiles[index];
      const tx = tile % grid.countX;
      const tz = (tile - tx) / grid.countX;
      tileMatrix.makeTranslation((grid.minTileX + tx) * size, 0, (grid.minTileZ + tz) * size);
      mesh.setMatrixAt(index, tileMatrix);
    }
    mesh.count = tiles.length;
    mesh.visible = tiles.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Tiles submitted last frame, per detail, across all islands. */
  public renderedTileCounts(): { near: number; far: number } {
    let near = 0;
    let far = 0;
    for (const island of this.islands) {
      near += island.renderedNear.length;
      far += island.renderedFar.length;
    }
    return { near, far };
  }

  public patchData(): readonly MeadowFieldPatchData[] {
    return this.islands.map((island) => island.data);
  }

  public dispose(): void {
    for (const island of this.islands) {
      for (const mesh of [island.near, island.far]) {
        if (!mesh) continue;
        mesh.dispose();
        mesh.removeFromParent();
      }
      island.material?.dispose();
      for (const texture of island.textures) texture.dispose();
    }
    this.islands.length = 0;
    this.nearGeometry.dispose();
    this.farGeometry.dispose();
    setMeadowLiveField(0, 0, 0, FIELD.outerFadeMeters);
  }
}

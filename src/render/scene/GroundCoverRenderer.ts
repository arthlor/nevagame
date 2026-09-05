import * as THREE from "three";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import {
  groundCoverActiveCountAtLevel,
  qualityTierLevel,
  qualityValueAtLevel,
  type QualityTier
} from "../config/VisualRenderConfig";
import {
  type GroundCoverCategory,
  type GroundCoverPlacement
} from "../../world/WorldEnvironmentLayout";
import { WorldLayout } from "../../world/WorldLayout";
import type { WeatherMotionSignal } from "../motion/WeatherMotionSignal";
import {
  groundCoverSwaysInWind,
  groundCoverWindPhase,
  groundCoverWindStrength,
  GROUND_COVER_WIND_AMPLITUDE,
  GROUND_COVER_WIND_ROOT_LOCK,
  GROUND_COVER_WIND_ROOT_RELEASE
} from "./groundCoverWind";
import {
  buildGroundCoverSpatialIndex,
  groundCoverIndexListsEqual,
  queryGroundCoverSpatialIndex,
  type GroundCoverSpatialIndex,
  selectStableGroundCoverIndices
} from "./groundCoverVisibility";

interface GroundCoverInstance {
  x: number;
  z: number;
  phase: number;
  matrix: THREE.Matrix4;
  bounds: THREE.Sphere;
  windScale: number;
}

interface InstancedSourceMesh {
  mesh: THREE.InstancedMesh;
  relative: THREE.Matrix4;
  phaseAttribute: THREE.InstancedBufferAttribute | null;
}

interface InstancedAssetRecord {
  category: GroundCoverCategory;
  highCount: number;
  activeCount: number;
  instances: GroundCoverInstance[];
  spatialIndex: GroundCoverSpatialIndex;
  meshes: InstancedSourceMesh[];
  visibleIndices: number[];
  renderedIndices: number[];
  candidateIndices: number[];
  windPadding: number;
}

interface GroundCoverWindUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uSwayAmplitude: { value: number };
  uMotionScale: { value: number };
}

interface SourceMeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  relative: THREE.Matrix4;
}

const VISIBILITY_REFRESH_DISTANCE_METERS = 0.55;
const KEEP_DISTANCE_SCALE = 1.34;
const CROSS_WIND_AMPLITUDE_RATIO = 0.1;

const CATEGORY_DRAW_DISTANCE_SCALE: Readonly<Record<GroundCoverCategory, number>> = {
  grass: 0.84,
  // Wildflowers are ~910 triangles each — 7.7x a grass tuft and on par with a
  // bush — so they used to cost more than all 11,400 grass instances combined
  // while drawing FURTHER than grass. At the old 86 m they were a few pixels
  // tall and paid full price. Pulled inside the grass band; the gold
  // visual-regression baselines are the gate on whether this reads.
  flowers: 0.5,
  bushes: 0.78,
  meadowTall: 0.82,
  pebbles: 0.7,
  paving: 0.74,
  driftwood: 0.88
};

const CATEGORY_DENSITY_SCALE: Readonly<Record<GroundCoverCategory, number>> = {
  grass: 0.58,
  flowers: 0.82,
  bushes: 0.28,
  meadowTall: 0.56,
  pebbles: 0.82,
  paving: 1,
  driftwood: 1
};

function stablePlacementOrder(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function patchGroundCoverWind(
  material: THREE.MeshStandardMaterial,
  category: GroundCoverCategory
): THREE.MeshStandardMaterial {
  const amplitude = GROUND_COVER_WIND_AMPLITUDE[category];
  if (amplitude <= 0) return material;
  material.userData.nevaGroundCoverWind = true;
  material.customProgramCacheKey = () => `neva-ground-cover-wind-${category}`;
  material.onBeforeCompile = (shader) => {
    const uniforms: GroundCoverWindUniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0, 1) },
      uWindStrength: { value: 0 },
      uSwayAmplitude: { value: amplitude },
      uMotionScale: { value: 1 }
    };
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float instancePhase;
attribute float windHeight;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uSwayAmplitude;
uniform float uMotionScale;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  float rootedHeight = clamp(windHeight, 0.0, 1.0);
  float rootWeight = pow(smoothstep(${GROUND_COVER_WIND_ROOT_LOCK.toFixed(3)}, ${GROUND_COVER_WIND_ROOT_RELEASE.toFixed(3)}, rootedHeight), 1.35);
  float wave = sin(uTime * (1.12 + instancePhase * 0.38) + instancePhase * 6.283185);
  float gust = sin(uTime * 0.37 + instancePhase * 4.1);
  float sway = uSwayAmplitude * uWindStrength * uMotionScale;
  vec2 windDirection = normalize(uWindDir + vec2(0.0001, 0.0001));
  float bend = sway * rootWeight * (0.72 * wave + 0.28 * gust);
  transformed.xz += windDirection * bend;
  vec2 crossWind = vec2(-windDirection.y, windDirection.x);
  transformed.xz += crossWind * sway * ${CROSS_WIND_AMPLITUDE_RATIO.toFixed(3)} * rootWeight * rootWeight
    * sin(uTime * 1.72 + instancePhase * 9.0);
}`
      );
    material.userData.nevaWindShader = shader;
  };
  return material;
}

function groundCoverMaterial(
  source: THREE.Material,
  category: GroundCoverCategory
): THREE.Material {
  const cloned = source.clone();
  if (!(cloned instanceof THREE.MeshStandardMaterial)) return cloned;
  if (
    category === "grass"
    || category === "flowers"
    || category === "bushes"
    || category === "meadowTall"
  ) {
    const darkPalette = /shadow|olive|wood_dark/.test(cloned.name);
    const lift = darkPalette
      ? 1.16
      : category === "flowers"
        ? 1.05
        : category === "bushes"
          ? 1.08
          : 1.1;
    cloned.color.multiplyScalar(lift);
    cloned.roughness = Math.max(0.8, cloned.roughness);
  }
  return patchGroundCoverWind(cloned, category);
}

export class GroundCoverRenderer {
  public readonly group = new THREE.Group();
  private readonly records: InstancedAssetRecord[] = [];
  private readonly lastRebuildFocus = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  private readonly composedMatrix = new THREE.Matrix4();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly frustum = new THREE.Frustum();
  private readonly frustumSphere = new THREE.Sphere();
  private visibilityDirty = true;
  private qualityLevel: number;

  constructor(tier: QualityTier) {
    this.qualityLevel = qualityTierLevel(tier);
    this.group.name = "instanced_world_ground_cover";
  }

  public async build(placements: readonly GroundCoverPlacement[]): Promise<void> {
    const byAsset = new Map<string, GroundCoverPlacement[]>();
    for (const placement of placements) {
      const group = byAsset.get(placement.assetId) ?? [];
      group.push(placement);
      byAsset.set(placement.assetId, group);
    }

    for (const [assetId, assetPlacements] of byAsset) {
      const orderedPlacements = [...assetPlacements].sort((left, right) =>
        stablePlacementOrder(left.id) - stablePlacementOrder(right.id)
        || left.id.localeCompare(right.id)
      );
      const typedAssetId = assetId as AssetId;
      const spec = ASSET_BY_ID.get(typedAssetId);
      if (!spec || !spec.instancing || spec.collision !== "none") {
        throw new Error(`[GroundCoverRenderer] ${assetId} must be a non-colliding instanced catalog asset`);
      }
      const source = await AssetLoader.loadModel(typedAssetId);
      source.updateMatrixWorld(true);
      const rootInverse = source.matrixWorld.clone().invert();
      const sourceMeshes: SourceMeshData[] = [];
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible || object.name.startsWith("COL_")) return;
        if (Array.isArray(object.material)) {
          throw new Error(`[GroundCoverRenderer] ${assetId} uses an unsupported material array`);
        }
        sourceMeshes.push({
          geometry: object.geometry,
          material: object.material,
          relative: new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld)
        });
      });
      if (sourceMeshes.length === 0) throw new Error(`[GroundCoverRenderer] ${assetId} has no visible meshes`);

      const category = orderedPlacements[0].category;
      const sway = groundCoverSwaysInWind(category);
      const windBounds = sway ? sourceHeightBounds(sourceMeshes) : null;
      const sourceBounds = new THREE.Sphere().makeEmpty();
      for (const sourceMesh of sourceMeshes) {
        sourceMesh.geometry.computeBoundingSphere();
        sourceBounds.union(sourceMesh.geometry.boundingSphere!.clone().applyMatrix4(sourceMesh.relative));
      }
      const instances = orderedPlacements.map((placement) => {
        const position = new THREE.Vector3(
          placement.x,
          WorldLayout.terrainHeight(placement.x, placement.z) + 0.012,
          placement.z
        );
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY);
        const scale = new THREE.Vector3(...placement.scale);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);
        return {
          x: placement.x,
          z: placement.z,
          phase: groundCoverWindPhase(placement.id),
          matrix,
          bounds: sourceBounds.clone().applyMatrix4(matrix),
          windScale: sourceMeshes.reduce((maximum, sourceMesh) => Math.max(maximum,
            new THREE.Matrix4().multiplyMatrices(matrix, sourceMesh.relative).getMaxScaleOnAxis()), 0)
        };
      });

      const meshes = sourceMeshes.map((sourceMesh, meshIndex) => {
        const geometry = sourceMesh.geometry.clone();
        const phaseAttribute = sway
          ? new THREE.InstancedBufferAttribute(new Float32Array(orderedPlacements.length), 1)
          : null;
        if (phaseAttribute) geometry.setAttribute("instancePhase", phaseAttribute);
        if (windBounds) addWindHeightAttribute(geometry, sourceMesh.relative, windBounds);
        const mesh = new THREE.InstancedMesh(
          geometry,
          groundCoverMaterial(sourceMesh.material, category),
          orderedPlacements.length
        );
        mesh.name = `${assetId}_instances_${meshIndex}`;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        // Short cover uses the shared key/fill and GTAO contact, not a second
        // directional shadow over every blade/petal. This prevents thin clumps
        // from collapsing into black strokes while larger bushes still ground.
        mesh.receiveShadow = category === "bushes"
          || category === "paving"
          || category === "driftwood";
        this.group.add(mesh);
        return { mesh, relative: sourceMesh.relative, phaseAttribute };
      });
      this.records.push({
        category,
        highCount: orderedPlacements.length,
        activeCount: orderedPlacements.length,
        instances,
        spatialIndex: buildGroundCoverSpatialIndex(instances),
        meshes,
        visibleIndices: [],
        renderedIndices: [],
        candidateIndices: [],
        windPadding: 0
      });
    }
    this.setQualityLevel(this.qualityLevel);
  }

  public setQuality(tier: QualityTier): void {
    this.setQualityLevel(qualityTierLevel(tier));
  }

  public setQualityLevel(level: number): void {
    this.qualityLevel = THREE.MathUtils.clamp(level, 0, 2);
    let changed = false;
    for (const record of this.records) {
      const activeCount = Math.max(
        0,
        Math.floor(
          groundCoverActiveCountAtLevel(record.highCount, this.qualityLevel)
            * CATEGORY_DENSITY_SCALE[record.category]
        )
      );
      if (activeCount === record.activeCount) continue;
      record.activeCount = activeCount;
      changed = true;
    }
    if (changed) this.visibilityDirty = true;
  }

  public updateWind(signal: Readonly<WeatherMotionSignal>, timeSeconds: number, motionScale: number): void {
    const strength = groundCoverWindStrength(signal);
    for (const record of this.records) {
      record.windPadding = GROUND_COVER_WIND_AMPLITUDE[record.category] * strength * Math.abs(motionScale) * Math.hypot(1, CROSS_WIND_AMPLITUDE_RATIO);
      for (const source of record.meshes) {
        const material = source.mesh.material;
        if (!(material instanceof THREE.Material)) continue;
        const shader = material.userData.nevaWindShader as { uniforms: GroundCoverWindUniforms } | undefined;
        if (!shader) continue;
        shader.uniforms.uTime.value = timeSeconds;
        shader.uniforms.uWindDir.value.set(signal.directionX, signal.directionZ);
        shader.uniforms.uWindStrength.value = strength;
        shader.uniforms.uMotionScale.value = motionScale;
      }
    }
  }

  /**
   * Ground cover is authored across the complete world, but grass-scale assets
   * are only readable near the player. Compact nearby placements into each
   * InstancedMesh without letting camera orbit, pitch, or zoom reshuffle them.
   */
  public update(anchorX: number, anchorZ: number): void {
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorZ)) return;
    const anchorDeltaX = this.lastRebuildFocus.x - anchorX;
    const anchorDeltaZ = this.lastRebuildFocus.y - anchorZ;
    if (
      !this.visibilityDirty &&
      Number.isFinite(this.lastRebuildFocus.x) &&
      anchorDeltaX * anchorDeltaX + anchorDeltaZ * anchorDeltaZ
        < VISIBILITY_REFRESH_DISTANCE_METERS ** 2
    ) {
      return;
    }

    this.lastRebuildFocus.set(anchorX, anchorZ);
    this.visibilityDirty = false;
    const baseDrawDistance = qualityValueAtLevel(
      this.qualityLevel,
      (quality) => quality.groundCoverDrawDistanceMeters
    );

    for (const record of this.records) {
      const drawDistance = baseDrawDistance * CATEGORY_DRAW_DISTANCE_SCALE[record.category];
      const keepDistance = drawDistance * KEEP_DISTANCE_SCALE;
      const candidates = queryGroundCoverSpatialIndex(
        record.spatialIndex,
        anchorX,
        anchorZ,
        drawDistance
      );
      const visibleIndices = selectStableGroundCoverIndices(
        record.instances,
        anchorX,
        anchorZ,
        drawDistance,
        record.activeCount,
        record.visibleIndices,
        keepDistance,
        candidates
      );
      if (groundCoverIndexListsEqual(record.visibleIndices, visibleIndices)) continue;
      record.visibleIndices = visibleIndices;
    }
  }

  public updateRenderVisibility(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    this.group.updateWorldMatrix(true, false);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.group.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.viewProjection, camera.coordinateSystem);
    for (const record of this.records) {
      const candidates = record.candidateIndices;
      candidates.length = 0;
      for (const index of record.visibleIndices) {
        const instance = record.instances[index];
        this.frustumSphere.copy(instance.bounds);
        this.frustumSphere.radius += record.windPadding * instance.windScale;
        if (this.frustum.intersectsSphere(this.frustumSphere)) candidates.push(index);
      }
      if (groundCoverIndexListsEqual(record.renderedIndices, candidates)) continue;
      record.candidateIndices = record.renderedIndices;
      record.renderedIndices = candidates;
      for (let visibleCount = 0; visibleCount < candidates.length; visibleCount += 1) {
        const instance = record.instances[candidates[visibleCount]];
        for (const source of record.meshes) {
          this.composedMatrix.multiplyMatrices(instance.matrix, source.relative);
          source.mesh.setMatrixAt(visibleCount, this.composedMatrix);
          source.phaseAttribute?.setX(visibleCount, instance.phase);
        }
      }
      for (const source of record.meshes) {
        source.mesh.count = candidates.length;
        source.mesh.instanceMatrix.needsUpdate = true;
        if (source.phaseAttribute) source.phaseAttribute.needsUpdate = true;
      }
    }
  }

  public dispose(): void {
    for (const record of this.records) {
      for (const source of record.meshes) {
        source.mesh.geometry.dispose();
        source.mesh.dispose();
        const materials = Array.isArray(source.mesh.material)
          ? source.mesh.material
          : [source.mesh.material];
        for (const material of materials) material.dispose();
        source.mesh.removeFromParent();
      }
    }
    this.records.length = 0;
  }
}

function sourceHeightBounds(sourceMeshes: readonly SourceMeshData[]): { minY: number; maxY: number } {
  const point = new THREE.Vector3();
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const sourceMesh of sourceMeshes) {
    const position = sourceMesh.geometry.getAttribute("position");
    if (!position) continue;
    for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
      point.fromBufferAttribute(position, vertexIndex).applyMatrix4(sourceMesh.relative);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  return {
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 1
  };
}

function addWindHeightAttribute(
  geometry: THREE.BufferGeometry,
  relative: THREE.Matrix4,
  bounds: { minY: number; maxY: number }
): void {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const span = Math.max(0.001, bounds.maxY - bounds.minY);
  const values = new Float32Array(position.count);
  const point = new THREE.Vector3();
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    point.fromBufferAttribute(position, vertexIndex).applyMatrix4(relative);
    values[vertexIndex] = THREE.MathUtils.clamp((point.y - bounds.minY) / span, 0, 1);
  }
  geometry.setAttribute("windHeight", new THREE.BufferAttribute(values, 1));
}

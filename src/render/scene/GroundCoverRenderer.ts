import { patchSeasonalTint } from "../materials/SeasonalTint";
import { yieldToTask } from "../../utils/CooperativeTask";
import * as THREE from "three";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { LANDSCAPE_WIND_GLSL } from "../motion/LandscapeWind";
import {
  CANONICAL_RENDER_CONFIG,
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
import type { PlayerPresence } from "../presentation/PlayerPresence";
import {
  ACKNOWLEDGE_COVER_RADIUS_METERS,
  presenceFalloff
} from "../presentation/WorldAcknowledgment";
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
  exposure: number;
  matrix: THREE.Matrix4;
  bounds: THREE.Sphere;
  lodIndex: number;
}

interface InstancedSourceMesh {
  mesh: THREE.InstancedMesh;
  relative: THREE.Matrix4;
  phaseAttribute: THREE.InstancedBufferAttribute | null;
  exposureAttribute: THREE.InstancedBufferAttribute | null;
  lodIndex: number;
  renderedIndices: number[];
}

interface InstancedAssetRecord {
  category: GroundCoverCategory;
  highCount: number;
  activeCount: number;
  instances: GroundCoverInstance[];
  spatialIndex: GroundCoverSpatialIndex;
  /**
   * One conservative bounding sphere per spatial cell, with the instance's cell
   * id recorded per index. Frustum culling tests a cell once per frame and
   * skips every instance inside a rejected cell, instead of sphere-testing the
   * full nearby set on every camera rotation.
   */
  cellSpheres: THREE.Sphere[];
  instanceCellIds: Int32Array;
  cellVisibilityStamp: Int32Array;
  cellVisible: Uint8Array;
  meshes: InstancedSourceMesh[];
  visibleIndices: number[];
  renderedIndices: number[];
  candidateIndices: number[];
  windPadding: number;
  lodDistances: number[];
  lodDirty: boolean;
}

interface GroundCoverWindUniforms {
  uTime: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uWindStrength: { value: number };
  uSwayAmplitude: { value: number };
  uMotionScale: { value: number };
  uPresencePos: { value: THREE.Vector2 };
  uPresenceStrength: { value: number };
  uPresenceRadius: { value: number };
}

interface SourceMeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  relative: THREE.Matrix4;
  lodIndex: number;
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
  grass: 1,
  flowers: 0.6,
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
  material.customProgramCacheKey = () => `neva-ground-cover-wind-${category}-landscape-presence-v7-foliage-normal`;
  material.onBeforeCompile = (shader) => {
    const uniforms: GroundCoverWindUniforms = {
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(0, 1) },
      uWindStrength: { value: 0 },
      uSwayAmplitude: { value: amplitude },
      uMotionScale: { value: 1 },
      uPresencePos: { value: new THREE.Vector2(0, 0) },
      uPresenceStrength: { value: 0 },
      uPresenceRadius: { value: 1 }
    };
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float instancePhase;
attribute float instanceExposure;
attribute float windHeight;
varying float vCoverHeight;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uSwayAmplitude;
uniform float uMotionScale;
uniform vec2 uPresencePos;
uniform float uPresenceStrength;
uniform float uPresenceRadius;
${LANDSCAPE_WIND_GLSL}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
{
  float rootedHeight = clamp(windHeight, 0.0, 1.0);
  vCoverHeight = rootedHeight;
  float rootWeight = pow(smoothstep(${GROUND_COVER_WIND_ROOT_LOCK.toFixed(3)}, ${GROUND_COVER_WIND_ROOT_RELEASE.toFixed(3)}, rootedHeight), 1.35);
  mat4 coverWorld = modelMatrix * instanceMatrix;
  vec2 coverRoot = coverWorld[3].xz;
  float sway = uSwayAmplitude * uWindStrength * uMotionScale * instanceExposure;
  vec2 windDirection = normalize(uWindDir + vec2(0.0001, 0.0001));
  float gust = nevaLandscapeGust(coverRoot, windDirection, uTime);
  float flutter = sin(uTime * 1.72 + instancePhase * 9.0);
  float bend = sway * rootWeight * (0.88 * gust + 0.12 * flutter);
  vec2 crossWind = vec2(-windDirection.y, windDirection.x);
  vec2 worldBend = windDirection * bend
    + crossWind * sway * ${CROSS_WIND_AMPLITUDE_RATIO.toFixed(3)} * rootWeight * rootWeight * flutter;
  transformed += nevaWindWorldToLocal(vec3(worldBend.x, 0.0, worldBend.y), coverWorld);
  if (uPresenceStrength > 0.001) {
    vec2 coverXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
    vec2 away = coverXZ - uPresencePos;
    float awayLength = length(away);
    float part = uPresenceStrength * (1.0 - smoothstep(0.0, uPresenceRadius, awayLength));
    vec2 presenceBend = (away / max(awayLength, 0.0001))
      * part * uSwayAmplitude * 0.5 * rootWeight;
    transformed += nevaWindWorldToLocal(vec3(presenceBend.x, 0.0, presenceBend.y), coverWorld);
  }
}`
      );
    if (category === "grass" || category === "meadowTall" || category === "flowers") {
      // Rooted instances sit on the terrain tangent, so local up is the
      // terrain normal. Thin authored blades otherwise face sideways or down
      // and take only the ground bounce, reading as grey and black shards.
      const anchor = "#include <beginnormal_vertex>";
      if (shader.vertexShader.split(anchor).length !== 2) {
        throw new Error("[GroundCoverRenderer] Three.js r174 normal shader chunk drift");
      }
      shader.vertexShader = shader.vertexShader.replace(anchor, `${anchor}
objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), ${CANONICAL_RENDER_CONFIG.groundSurface.foliageNormalUp.toFixed(3)}));`);
    }
    if (category === "grass" || category === "meadowTall") {
      // A restrained base-to-tip value ramp seats the clump in the meadow.
      // Reuse the assembly-space wind height, never a per-blade dark decal.
      shader.uniforms.coverRootShade = { value: CANONICAL_RENDER_CONFIG.groundSurface.shortCoverRootShade };
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vCoverHeight;\nuniform float coverRootShade;")
        .replace("#include <color_fragment>", `#include <color_fragment>
diffuseColor.rgb *= mix(coverRootShade, 1.0, smoothstep(0.04, 0.64, vCoverHeight));`);
    }
    if (category === "grass" || category === "meadowTall" || category === "bushes") patchSeasonalTint(shader);
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
      ? 1.04
      : category === "flowers"
        ? 1.05
        : category === "bushes"
          ? 1.08
          : 1;
    cloned.color.multiplyScalar(lift);
    cloned.roughness = Math.max(0.8, cloned.roughness);
  }
  patchGroundCoverWind(cloned, category);
  applyWorldAtmosphere(cloned);
  return cloned;
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
  private cellVisibilityEpoch = 0;
  private qualityLevel: number;

  constructor(tier: QualityTier) {
    this.qualityLevel = qualityTierLevel(tier);
    this.group.name = "instanced_world_ground_cover";
  }

  public async build(placements: readonly GroundCoverPlacement[], signal?: AbortSignal): Promise<void> {
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
      await yieldToTask(signal);
      const source = await AssetLoader.loadModel(typedAssetId);
      signal?.throwIfAborted();
      source.updateMatrixWorld(true);
      const rootInverse = source.matrixWorld.clone().invert();
      const sourceMeshes: SourceMeshData[] = [];
      const lodLevels = ASSET_BY_ID.get(typedAssetId)!.lodLevels ?? [];
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !object.visible || object.name.startsWith("COL_")) return;
        if (Array.isArray(object.material)) {
          throw new Error(`[GroundCoverRenderer] ${assetId} uses an unsupported material array`);
        }
        let lodIndex = 0;
        for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
          const level = lodLevels.findIndex((entry) => entry.node === parent!.name);
          if (level >= 0) { lodIndex = level; break; }
        }
        sourceMeshes.push({
          geometry: object.geometry,
          material: object.material,
          relative: new THREE.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld),
          lodIndex
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
        if (category === "grass" || category === "meadowTall") {
          // Distributed blade roots share the local terrain tangent instead of
          // hovering on the uphill edge of a horizontal patch.
          rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0), WorldLayout.terrainNormal(placement.x, placement.z)
          ));
        }
        const scale = new THREE.Vector3(...placement.scale);
        const matrix = new THREE.Matrix4().compose(position, rotation, scale);
        return {
          x: placement.x,
          z: placement.z,
          phase: groundCoverWindPhase(placement.id),
          exposure: placement.compositionTag?.habitat === "woodland" ? 0.45
            : placement.compositionTag?.habitat === "orchard" || placement.compositionTag?.habitat === "olive-grove" ? 0.65
              : 1,
          matrix,
          bounds: sourceBounds.clone().applyMatrix4(matrix),
          lodIndex: 0
        };
      });

      const meshes = sourceMeshes.map((sourceMesh, meshIndex) => {
        const geometry = sourceMesh.geometry.clone();
        const phaseAttribute = sway
          ? new THREE.InstancedBufferAttribute(new Float32Array(orderedPlacements.length), 1)
          : null;
        if (phaseAttribute) geometry.setAttribute("instancePhase", phaseAttribute);
        const exposureAttribute = sway
          ? new THREE.InstancedBufferAttribute(new Float32Array(orderedPlacements.length), 1)
          : null;
        if (exposureAttribute) geometry.setAttribute("instanceExposure", exposureAttribute);
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
        return { mesh, relative: sourceMesh.relative, phaseAttribute, exposureAttribute,
          lodIndex: sourceMesh.lodIndex, renderedIndices: [] as number[] };
      });
      const spatialIndex = buildGroundCoverSpatialIndex(instances);
      const { cellSpheres, instanceCellIds } = buildGroundCoverCellSpheres(instances, spatialIndex.cellSize);
      this.records.push({
        category,
        lodDistances: sourceMeshes.some((mesh) => mesh.lodIndex > 0)
          ? lodLevels.map((level) => level.distanceMeters) : [0],
        lodDirty: true,
        highCount: orderedPlacements.length,
        activeCount: orderedPlacements.length,
        instances,
        spatialIndex,
        cellSpheres,
        instanceCellIds,
        cellVisibilityStamp: new Int32Array(cellSpheres.length).fill(-1),
        cellVisible: new Uint8Array(cellSpheres.length),
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
    const previousLevel = this.qualityLevel;
    this.qualityLevel = THREE.MathUtils.clamp(level, 0, 2);
    let changed = previousLevel !== this.qualityLevel;
    for (const record of this.records) {
      const activeCount = Math.max(
        0,
        Math.min(Math.floor(qualityValueAtLevel(this.qualityLevel, quality => quality.groundCoverInstanceCap)), Math.floor(
          groundCoverActiveCountAtLevel(record.highCount, this.qualityLevel)
            * CATEGORY_DENSITY_SCALE[record.category]
        ))
      );
      if (activeCount === record.activeCount) continue;
      record.activeCount = activeCount;
      changed = true;
    }
    if (changed) this.visibilityDirty = true;
  }

  public updateWind(
    signal: Readonly<WeatherMotionSignal>,
    timeSeconds: number,
    motionScale: number,
    presence?: Pick<PlayerPresence, "x" | "z" | "moving">
  ): void {
    const strength = groundCoverWindStrength(signal);
    // The player parts nearby cover; walking presses it aside more than idling.
    const presenceStrength = presence
      ? presenceFalloff(presence, presence.x, presence.z, ACKNOWLEDGE_COVER_RADIUS_METERS)
        * (presence.moving ? 1 : 0.55)
      : 0;
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
        if (presence) {
          shader.uniforms.uPresencePos.value.set(presence.x, presence.z);
          shader.uniforms.uPresenceStrength.value = presenceStrength;
          shader.uniforms.uPresenceRadius.value = ACKNOWLEDGE_COVER_RADIUS_METERS;
        }
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
      const drawDistance = record.category === "grass"
        ? qualityValueAtLevel(this.qualityLevel, (quality) => quality.shortGrassDrawDistanceMeters)
        : baseDrawDistance * CATEGORY_DRAW_DISTANCE_SCALE[record.category];
      const keepDistance = drawDistance * KEEP_DISTANCE_SCALE;
      const candidates = queryGroundCoverSpatialIndex(
        record.spatialIndex,
        anchorX,
        anchorZ,
        drawDistance
      );
      // Sparse, stable grass silhouettes bridge the near tier to the fog plane.
      // They share the existing instance budget and material batches.
      // Single pass with one distance evaluation per candidate: Math.hypot is
      // pure, so one call feeds both comparisons bit-identically. Predicate
      // order, numeric sort and slice cap are unchanged, so the submitted
      // indices are exactly the previous ones.
      const farIndices: number[] = [];
      if (record.category === "grass" || record.category === "meadowTall") {
        const farDistance = qualityValueAtLevel(this.qualityLevel, (quality) => quality.groundCoverFarDistanceMeters);
        const farStride = record.category === "grass" ? 32 : 8;
        const farCap = record.category === "grass"
          ? qualityValueAtLevel(this.qualityLevel, (quality) => quality.shortGrassFarInstanceCap)
          : record.activeCount * 0.15;
        const farCandidates = queryGroundCoverSpatialIndex(record.spatialIndex, anchorX, anchorZ, farDistance);
        for (const index of farCandidates) {
          if (index % farStride !== 0) continue;
          const distance = Math.hypot(record.instances[index].x - anchorX, record.instances[index].z - anchorZ);
          if (distance <= keepDistance || distance > farDistance) continue;
          farIndices.push(index);
        }
        farIndices.sort((left, right) => left - right);
        farIndices.length = Math.min(farIndices.length, Math.floor(Math.min(record.activeCount * 0.15, farCap)));
      }
      const visibleIndices = selectStableGroundCoverIndices(
        record.instances,
        anchorX,
        anchorZ,
        drawDistance,
        record.activeCount - farIndices.length,
        record.visibleIndices,
        keepDistance,
        candidates
      );
      visibleIndices.push(...farIndices);
      const lodScale = qualityValueAtLevel(this.qualityLevel, (quality) => quality.lodDistanceScale);
      for (const index of visibleIndices) {
        const instance = record.instances[index];
        const distance = Math.hypot(instance.x - anchorX, instance.z - anchorZ);
        let level = 0;
        while (level + 1 < record.lodDistances.length && distance >= record.lodDistances[level + 1] * lodScale) level++;
        if (instance.lodIndex !== level) record.lodDirty = true;
        instance.lodIndex = level;
      }
      if (groundCoverIndexListsEqual(record.visibleIndices, visibleIndices)) continue;
      record.visibleIndices = visibleIndices;
    }
  }

  public updateRenderVisibility(camera: THREE.Camera): void {
    camera.updateWorldMatrix(true, false);
    this.group.updateWorldMatrix(true, false);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(this.group.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.viewProjection, camera.coordinateSystem);
    const epoch = (this.cellVisibilityEpoch += 1);
    for (const record of this.records) {
      const candidates = record.candidateIndices;
      candidates.length = 0;
      for (const index of record.visibleIndices) {
        const instance = record.instances[index];
        const cellId = record.instanceCellIds[index];
        let cellVisible: boolean;
        if (record.cellVisibilityStamp[cellId] === epoch) {
          cellVisible = record.cellVisible[cellId] === 1;
        } else {
          record.cellVisibilityStamp[cellId] = epoch;
          this.frustumSphere.copy(record.cellSpheres[cellId]);
          this.frustumSphere.radius += record.windPadding;
          cellVisible = this.frustum.intersectsSphere(this.frustumSphere);
          record.cellVisible[cellId] = cellVisible ? 1 : 0;
        }
        if (!cellVisible) continue;
        this.frustumSphere.copy(instance.bounds);
        this.frustumSphere.radius += record.windPadding;
        if (this.frustum.intersectsSphere(this.frustumSphere)) candidates.push(index);
      }
      if (!record.lodDirty && groundCoverIndexListsEqual(record.renderedIndices, candidates)) continue;
      record.lodDirty = false;
      record.candidateIndices = record.renderedIndices;
      record.renderedIndices = candidates;
      for (const source of record.meshes) {
        // Manual loop instead of Array.filter: same order, same members, no
        // per-source closure/allocation on every frame.
        const indices: number[] = [];
        for (const index of candidates) {
          if (record.instances[index].lodIndex === source.lodIndex) indices.push(index);
        }
        if (groundCoverIndexListsEqual(source.renderedIndices, indices)) continue;
        source.renderedIndices = indices;
        for (let visibleCount = 0; visibleCount < indices.length; visibleCount += 1) {
          const instance = record.instances[indices[visibleCount]];
          this.composedMatrix.multiplyMatrices(instance.matrix, source.relative);
          source.mesh.setMatrixAt(visibleCount, this.composedMatrix);
          source.phaseAttribute?.setX(visibleCount, instance.phase);
          source.exposureAttribute?.setX(visibleCount, instance.exposure);
        }
        source.mesh.count = indices.length;
        source.mesh.instanceMatrix.needsUpdate = true;
        if (source.phaseAttribute) source.phaseAttribute.needsUpdate = true;
        if (source.exposureAttribute) source.exposureAttribute.needsUpdate = true;
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

function buildGroundCoverCellSpheres(
  instances: readonly GroundCoverInstance[],
  cellSize: number
): { cellSpheres: THREE.Sphere[]; instanceCellIds: Int32Array } {
  const cellIds = new Map<string, number>();
  const cellSpheres: THREE.Sphere[] = [];
  const instanceCellIds = new Int32Array(instances.length);
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const key = `${Math.floor(instance.x / cellSize)}:${Math.floor(instance.z / cellSize)}`;
    let cellId = cellIds.get(key);
    if (cellId === undefined) {
      cellId = cellSpheres.length;
      cellIds.set(key, cellId);
      cellSpheres.push(instance.bounds.clone());
    } else {
      cellSpheres[cellId].union(instance.bounds);
    }
    instanceCellIds[index] = cellId;
  }
  return { cellSpheres, instanceCellIds };
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

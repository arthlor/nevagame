import * as THREE from "three";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import {
  groundCoverActiveCount,
  type QualityTier
} from "../config/VisualRenderConfig";
import {
  type GroundCoverCategory,
  type GroundCoverPlacement
} from "../../world/WorldEnvironmentLayout";
import { WorldLayout } from "../../world/WorldLayout";
import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

interface GroundCoverInstance {
  x: number;
  z: number;
  matrix: THREE.Matrix4;
}

interface InstancedSourceMesh {
  mesh: THREE.InstancedMesh;
  relative: THREE.Matrix4;
}

interface InstancedAssetRecord {
  category: GroundCoverCategory;
  highCount: number;
  activeCount: number;
  instances: GroundCoverInstance[];
  meshes: InstancedSourceMesh[];
}

const CAMERA_FOCUS_LEAD_METERS = 28;
const VISIBILITY_REFRESH_DISTANCE_METERS = 0.75;

function stablePlacementOrder(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function groundCoverMaterial(
  source: THREE.Material,
  category: GroundCoverCategory
): THREE.Material {
  if (category !== "grass" || !(source instanceof THREE.MeshStandardMaterial)) return source;
  const material = source.clone();
  const lift = material.name.includes("shadow") ? 1.16 : 1.08;
  material.color.multiplyScalar(lift);
  material.roughness = Math.max(0.8, material.roughness);
  return material;
}

export class GroundCoverRenderer {
  public readonly group = new THREE.Group();
  private readonly records: InstancedAssetRecord[] = [];
  private readonly cameraPosition = new THREE.Vector3();
  private readonly cameraDirection = new THREE.Vector3();
  private readonly focus = new THREE.Vector2(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  private readonly nextFocus = new THREE.Vector2();
  private readonly composedMatrix = new THREE.Matrix4();
  private visibilityDirty = true;
  private tier: QualityTier;

  constructor(tier: QualityTier) {
    this.tier = tier;
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
      const sourceMeshes: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; relative: THREE.Matrix4 }> = [];
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

      const instances = orderedPlacements.map((placement) => {
        const position = new THREE.Vector3(
          placement.x,
          WorldLayout.terrainHeight(placement.x, placement.z) + 0.012,
          placement.z
        );
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY);
        const scale = new THREE.Vector3(...placement.scale);
        return {
          x: placement.x,
          z: placement.z,
          matrix: new THREE.Matrix4().compose(position, rotation, scale)
        };
      });

      const meshes = sourceMeshes.map((sourceMesh, meshIndex) => {
        const mesh = new THREE.InstancedMesh(
          sourceMesh.geometry,
          groundCoverMaterial(sourceMesh.material, orderedPlacements[0].category),
          orderedPlacements.length
        );
        mesh.name = `${assetId}_instances_${meshIndex}`;
        mesh.count = 0;
        // The rendered instance prefix is rebuilt around the camera focus, so
        // the static full-world bounds would be both stale and unnecessarily broad.
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        // Tiny grass clumps turning nearly black under the directional shadow
        // map reads as hair/noise at the gameplay camera. They still receive
        // the shared key/fill lighting; larger cover may still receive shadows.
        mesh.receiveShadow = orderedPlacements[0].category !== "grass";
        this.group.add(mesh);
        return { mesh, relative: sourceMesh.relative };
      });
      this.records.push({
        category: orderedPlacements[0].category,
        highCount: orderedPlacements.length,
        activeCount: orderedPlacements.length,
        instances,
        meshes
      });
    }
    this.setQuality(this.tier);
  }

  public setQuality(tier: QualityTier): void {
    this.tier = tier;
    for (const record of this.records) {
      record.activeCount = groundCoverActiveCount(record.highCount, tier);
    }
    this.visibilityDirty = true;
  }

  /**
   * Ground cover is authored across the complete world, but grass-scale assets
   * are only readable near the gameplay camera. Compact nearby placements into
   * each InstancedMesh instead of submitting the entire 600 m scatter every frame.
   */
  public update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.cameraDirection);
    const horizontalLength = Math.hypot(this.cameraDirection.x, this.cameraDirection.z);
    const leadX = horizontalLength > 1e-5
      ? (this.cameraDirection.x / horizontalLength) * CAMERA_FOCUS_LEAD_METERS
      : 0;
    const leadZ = horizontalLength > 1e-5
      ? (this.cameraDirection.z / horizontalLength) * CAMERA_FOCUS_LEAD_METERS
      : 0;
    this.nextFocus.set(this.cameraPosition.x + leadX, this.cameraPosition.z + leadZ);
    if (
      !this.visibilityDirty &&
      this.focus.distanceToSquared(this.nextFocus) < VISIBILITY_REFRESH_DISTANCE_METERS ** 2
    ) {
      return;
    }

    this.focus.copy(this.nextFocus);
    this.visibilityDirty = false;
    const drawDistance = CANONICAL_RENDER_CONFIG.quality[this.tier].groundCoverDrawDistanceMeters;
    const drawDistanceSquared = drawDistance * drawDistance;

    for (const record of this.records) {
      let visibleCount = 0;
      for (let index = 0; index < record.activeCount; index++) {
        const instance = record.instances[index];
        const dx = instance.x - this.focus.x;
        const dz = instance.z - this.focus.y;
        if (dx * dx + dz * dz > drawDistanceSquared) continue;
        for (const source of record.meshes) {
          this.composedMatrix.multiplyMatrices(instance.matrix, source.relative);
          source.mesh.setMatrixAt(visibleCount, this.composedMatrix);
        }
        visibleCount += 1;
      }
      for (const source of record.meshes) {
        source.mesh.count = visibleCount;
        source.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  public dispose(): void {
    for (const record of this.records) {
      for (const source of record.meshes) {
        const material = source.mesh.material;
        source.mesh.removeFromParent();
        if (record.category === "grass" && material instanceof THREE.MeshStandardMaterial) {
          material.dispose();
        }
      }
    }
    this.records.length = 0;
  }
}

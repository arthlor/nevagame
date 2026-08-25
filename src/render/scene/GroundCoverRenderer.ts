import * as THREE from "three";
import { ASSET_BY_ID, type AssetId } from "../assets/AssetCatalog";
import { AssetLoader } from "../loaders/AssetLoader";
import type { QualityTier } from "../config/VisualRenderConfig";
import {
  GROUND_COVER_DENSITY,
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
  variantIndex: number;
  highCount: number;
  activeCount: number;
  instances: GroundCoverInstance[];
  meshes: InstancedSourceMesh[];
}

const VARIANT_COUNT = 3;
const CAMERA_FOCUS_LEAD_METERS = 28;
const VISIBILITY_REFRESH_DISTANCE_METERS = 0.75;

function variantIndex(assetId: string): number {
  if (assetId.endsWith("_a")) return 0;
  if (assetId.endsWith("_b")) return 1;
  return 2;
}

function countForVariant(total: number, index: number): number {
  return Math.floor(total / VARIANT_COUNT) + (index < total % VARIANT_COUNT ? 1 : 0);
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

      const instances = assetPlacements.map((placement) => {
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
        const mesh = new THREE.InstancedMesh(sourceMesh.geometry, sourceMesh.material, assetPlacements.length);
        mesh.name = `${assetId}_instances_${meshIndex}`;
        mesh.count = 0;
        // The rendered instance prefix is rebuilt around the camera focus, so
        // the static full-world bounds would be both stale and unnecessarily broad.
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        return { mesh, relative: sourceMesh.relative };
      });
      this.records.push({
        category: assetPlacements[0].category,
        variantIndex: variantIndex(assetId),
        highCount: assetPlacements.length,
        activeCount: assetPlacements.length,
        instances,
        meshes
      });
    }
    this.setQuality(this.tier);
  }

  public setQuality(tier: QualityTier): void {
    this.tier = tier;
    for (const record of this.records) {
      record.activeCount = Math.min(
        record.highCount,
        countForVariant(GROUND_COVER_DENSITY[tier][record.category], record.variantIndex)
      );
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
      for (const source of record.meshes) source.mesh.removeFromParent();
    }
    this.records.length = 0;
  }
}

import * as THREE from "three";
import { MeshBVH, acceleratedRaycast, SAH } from "three-mesh-bvh";
import { WorldLayout } from "../world/WorldLayout";

// Patch accelerated raycast into Three.js Mesh prototype for fast BVH spatial queries
if (THREE.Mesh.prototype.raycast !== acceleratedRaycast) {
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

export interface SnappingHit {
  point: THREE.Vector3;
  worldNormal: THREE.Vector3;
  slopeDegrees: number;
  isSlopeAcceptable: boolean;
  source: "bvh" | "mesh-raycast" | "analytical-grid";
}

export interface SnappingOptions {
  /** Maximum acceptable slope in degrees. Defaults to 40°. */
  maxSlopeDegrees?: number;
  /** Analytical grid sampling spacing for normal calculation. Defaults to 0.45m. */
  sampleDistance?: number;
  /** Vertical offset added to the snapped contact point. */
  yOffset?: number;
  /** If true, rotates the object quaternion to align with the surface normal. */
  alignNormal?: boolean;
  /** If true, preserves the object's original yaw (rotation around vertical) when aligning. */
  preserveYaw?: boolean;
}

/**
 * Calculates the surface slope angle in degrees relative to horizontal ground (0° = flat, 90° = vertical cliff).
 */
export function calculateSlopeDegrees(normal: THREE.Vector3): number {
  const normalized = normal.clone().normalize();
  const clampedY = Math.max(-1, Math.min(1, normalized.y));
  return Math.acos(clampedY) * (180 / Math.PI);
}

/**
 * Evaluates whether a surface normal falls within the acceptable slope threshold.
 */
export function isSlopeAcceptable(normal: THREE.Vector3, maxSlopeDegrees: number = 40): boolean {
  return calculateSlopeDegrees(normal) <= maxSlopeDegrees;
}

/**
 * Aligns an Object3D's up-vector (0, 1, 0) with the surface normal while preserving its authored yaw orientation.
 */
export function alignNormalToSurface(
  object: THREE.Object3D,
  normal: THREE.Vector3,
  preserveYaw: boolean = true
): void {
  const targetNormal = normal.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);

  // If normal is almost straight up, keep identity/pure-yaw rotation
  if (Math.abs(targetNormal.y - 1.0) < 1e-6) {
    if (!preserveYaw) {
      object.quaternion.identity();
    }
    return;
  }

  const alignmentQuat = new THREE.Quaternion().setFromUnitVectors(up, targetNormal);

  if (preserveYaw) {
    const yaw = object.rotation.y;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    object.quaternion.copy(alignmentQuat).multiply(yawQuat);
  } else {
    object.quaternion.copy(alignmentQuat);
  }
}

/**
 * Accelerated terrain snapping system with three-mesh-bvh raycasting
 * and analytical barycentric heightfield grid fallback.
 */
export class TerrainSnappingSystem {
  private bvhMesh: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private maxElevation = 500;

  public constructor(maxElevation: number = 500) {
    this.maxElevation = maxElevation;
    this.raycaster.firstHitOnly = true;
  }

  /**
   * Register a terrain mesh for BVH-accelerated raycasting.
   * Constructs the boundsTree if not already present.
   */
  public registerTerrain(mesh: THREE.Mesh): void {
    if (!mesh.geometry.boundsTree) {
      mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, {
        targetLeafSize: 10,
        strategy: SAH
      });
    }
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      this.maxElevation = mesh.geometry.boundingBox.max.y + 20.0;
    }
    this.bvhMesh = mesh;
  }

  public getTerrainMesh(): THREE.Mesh | null {
    return this.bvhMesh;
  }

  public getMaxElevation(): number {
    return this.maxElevation;
  }

  /**
   * Snaps a world XZ coordinate to the surface contact point.
   * Uses accelerated BVH raycast first; falls back to analytical height sampling if raycast misses or mesh is unset.
   */
  public snapToSurface(
    worldX: number,
    worldZ: number,
    options?: SnappingOptions
  ): SnappingHit {
    const maxSlope = options?.maxSlopeDegrees ?? 40;
    const yOffset = options?.yOffset ?? 0;

    if (this.bvhMesh) {
      this.raycaster.ray.origin.set(worldX, this.maxElevation, worldZ);
      this.raycaster.ray.direction.set(0, -1, 0);

      const hits = this.raycaster.intersectObject(this.bvhMesh, false);
      if (hits.length > 0) {
        const hit = hits[0]!;
        const localNormal = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 1, 0);

        // Transform local triangle normal to world space via NormalMatrix
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        const worldNormal = localNormal.applyMatrix3(normalMatrix).normalize();
        const slopeDegrees = calculateSlopeDegrees(worldNormal);

        const point = hit.point.clone();
        if (yOffset !== 0) {
          point.y += yOffset;
        }

        return {
          point,
          worldNormal,
          slopeDegrees,
          isSlopeAcceptable: slopeDegrees <= maxSlope,
          source: this.bvhMesh.geometry.boundsTree ? "bvh" : "mesh-raycast"
        };
      }
    }

    // Analytical fallback using WorldLayout heightfield and road traversal surface
    const sample = WorldLayout.traversalSurfaceSample(
      worldX,
      worldZ,
      options?.sampleDistance ?? 0.45
    );
    const worldNormal = new THREE.Vector3(sample.normal.x, sample.normal.y, sample.normal.z).normalize();
    const slopeDegrees = calculateSlopeDegrees(worldNormal);
    const point = new THREE.Vector3(worldX, sample.height + yOffset, worldZ);

    return {
      point,
      worldNormal,
      slopeDegrees,
      isSlopeAcceptable: slopeDegrees <= maxSlope,
      source: "analytical-grid"
    };
  }

  /**
   * Snaps a THREE.Vector3 in place to the terrain surface.
   */
  public snapToTerrain(
    position: THREE.Vector3,
    alignNormal: boolean = false,
    options?: SnappingOptions
  ): SnappingHit {
    const opts = { ...options, alignNormal: options?.alignNormal ?? alignNormal };
    const hit = this.snapToSurface(position.x, position.z, opts);
    position.copy(hit.point);
    return hit;
  }
}

/** Global default terrain snapping instance. */
export const defaultTerrainSnapper = new TerrainSnappingSystem();

/**
 * Functional helper to snap a position vector to the terrain with optional normal alignment.
 */
export function snapToTerrain(
  position: THREE.Vector3,
  alignNormal: boolean = false,
  options?: SnappingOptions,
  system: TerrainSnappingSystem = defaultTerrainSnapper
): SnappingHit {
  return system.snapToTerrain(position, alignNormal, options);
}

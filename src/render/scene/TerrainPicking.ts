import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";

/** Index the immutable rendered surface without reordering its collision triangles. */
export function prepareTerrainPicking(mesh: THREE.Mesh): void {
  const geometry = mesh.geometry;
  geometry.boundsTree ??= new MeshBVH(geometry, { indirect: true });
  // Spatial surface batches keep every cell in the same local coordinate frame.
  // Query their combined surface once instead of raycasting each draw cell.
  mesh.raycast = raycastSurface;
  geometry.addEventListener("dispose", releaseSurfaceIndex);
}

function raycastSurface(this: THREE.Mesh, raycaster: THREE.Raycaster, hits: THREE.Intersection[]): void {
  this.geometry.boundsTree?.raycastObject3D(this, raycaster, hits);
}

function releaseSurfaceIndex(event: { target: THREE.BufferGeometry }): void {
  event.target.boundsTree = undefined;
}

/** Reuses query scratch space; each pointer or camera change still gets a fresh hit. */
export class TerrainPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly hits: THREE.Intersection[] = [];

  public constructor() {
    this.raycaster.firstHitOnly = true;
  }

  public pick(
    meshes: THREE.Mesh[],
    camera: THREE.Camera,
    pointerNdc: { x: number; y: number }
  ): { x: number; y: number; z: number } | null {
    this.pointer.set(pointerNdc.x, pointerNdc.y);
    this.raycaster.setFromCamera(this.pointer, camera);
    this.raycaster.intersectObjects(meshes, false, this.hits);
    const point = this.hits[0]?.point;
    const result = point ? { x: point.x, y: point.y, z: point.z } : null;
    this.hits.length = 0;
    return result;
  }
}

import * as THREE from "three";

/** DEV retains source identities for picking without traversing their dormant trees in play. */
export class EditableStaticSources {
  private readonly sourceLayers = new Map<THREE.Mesh, number>();
  private readonly detached = new Map<THREE.Object3D, THREE.Object3D>();

  public hide(mesh: THREE.Mesh): void {
    this.sourceLayers.set(mesh, mesh.layers.mask);
    mesh.layers.mask = 0;
  }

  public detachDormantRoots(roots: readonly THREE.Object3D[]): void {
    for (const root of roots) {
      if (!root.parent) continue;
      let live = false;
      root.traverse(object => {
        if (object instanceof THREE.Light || object instanceof THREE.Sprite
          || (object instanceof THREE.Mesh && object.layers.mask !== 0)) live = true;
      });
      if (live) continue;
      this.detached.set(root, root.parent);
      root.removeFromParent();
    }
  }

  public detachedRoots(): readonly THREE.Object3D[] { return [...this.detached.keys()]; }

  public restore(): void {
    for (const [root, parent] of this.detached) parent.add(root);
    for (const [mesh, layers] of this.sourceLayers) mesh.layers.mask = layers;
    this.detached.clear();
    this.sourceLayers.clear();
  }
}

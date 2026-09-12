// src/render/assets/AssetHotSwapper.ts

import * as THREE from "three";
import { PALETTE_SPECS } from "../materials/PaletteTokens";

export interface AssetReloadEvent {
  assetId: string;
  replacedCount: number;
  timestamp: number;
}

export type AssetReloadListener = (event: AssetReloadEvent) => void;

/** GPU resources something still draws, which a swap therefore must not release. */
interface RetainedResources {
  geometries: ReadonlySet<THREE.BufferGeometry>;
  materials: ReadonlySet<THREE.Material>;
}

function meshMaterials(mesh: THREE.Mesh): THREE.Material[] {
  if (!mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function isPreservedChild(child: THREE.Object3D): boolean {
  return Boolean(child.userData?.isDynamicAttachment || child.userData?.isPresentationRig);
}

export class AssetHotSwapper {
  private static listeners: Set<AssetReloadListener> = new Set();

  /**
   * Disposes BufferGeometry on meshes inside container while strictly preserving
   * shared PaletteMaterials singletons. Anything listed in `retained` is still
   * drawn elsewhere and is skipped; each resource is released at most once.
   */
  public static safelyDisposeInstanceGeometries(container: THREE.Object3D, retained?: RetainedResources): void {
    AssetHotSwapper.releaseResources([container], retained);
  }

  private static releaseResources(roots: readonly THREE.Object3D[], retained?: RetainedResources): void {
    const released = new Set<THREE.BufferGeometry | THREE.Material>();
    const release = (node: THREE.Object3D) => {
      if (!(node instanceof THREE.Mesh || (node as THREE.Mesh).isMesh)) return;
      const mesh = node as THREE.Mesh;
      const geometry = mesh.geometry;
      if (geometry && !retained?.geometries.has(geometry) && !released.has(geometry)) {
        released.add(geometry);
        geometry.dispose();
      }
      for (const mat of meshMaterials(mesh)) {
        // Only an ephemeral, explicitly unique, non-palette material is owned
        // by this instance; palette and unmarked materials are shared.
        if (
          mat.userData?.isUniqueInstanceMaterial &&
          !Object.prototype.hasOwnProperty.call(PALETTE_SPECS, mat.name) &&
          !retained?.materials.has(mat) &&
          !released.has(mat)
        ) {
          released.add(mat);
          mat.dispose();
        }
      }
    };
    for (const root of roots) root.traverse(release);
  }

  /**
   * Traverses activeScene and hot-swaps all instances of assetId with newModelScene.
   * Preserves parent transform, layer masks, and simulation tags.
   */
  public static hotSwapAssetInstances(
    assetId: string,
    newModelScene: THREE.Object3D,
    activeScene: THREE.Scene
  ): number {
    const isTargetAsset = (node: THREE.Object3D) =>
      node.userData?.nevaAssetId === assetId ||
      node.userData?.assetId === assetId ||
      node.name === assetId ||
      node.name === `missing_asset_${assetId}`;

    // Collect every target before mutating: the inserted hierarchy is a clone
    // whose nodes (a runtime LOD, for one) carry the same asset id, so swapping
    // mid-traversal would walk into it and swap it again. A target's own
    // visual subtree is replaced wholesale; only its kept attachments can hold
    // further instances.
    const targets: THREE.Object3D[] = [];
    const collect = (node: THREE.Object3D): void => {
      const target = isTargetAsset(node);
      if (target) targets.push(node);
      for (const child of node.children) {
        if (!target || isPreservedChild(child)) collect(child);
      }
    };
    collect(activeScene);

    const removed: THREE.Object3D[] = [];
    const boundedGeometries = new Set<THREE.BufferGeometry>();
    for (const node of targets) {
      // 1. Detach old visual children (preserving non-visual attachments)
      for (const child of node.children.filter((candidate) => !isPreservedChild(candidate))) {
        node.remove(child);
        removed.push(child);
      }

      // 2. Clone and attach new model hierarchy
      const clonedNew = newModelScene.clone(true);
      while (clonedNew.children.length > 0) {
        node.add(clonedNew.children[0]);
      }

      // 3. Recalculate bounds (once per shared geometry) and update matrix
      node.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry && !boundedGeometries.has(child.geometry)) {
          boundedGeometries.add(child.geometry);
          child.geometry.computeBoundingBox();
          child.geometry.computeBoundingSphere();
        }
      });

      node.updateMatrixWorld(true);
    }

    // 4. Release old resources. `Object3D.clone` shares geometry between every
    // instance, the model cache and the replacement model, so anything still
    // drawn in the scene or by the new model stays alive.
    if (removed.length > 0) {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const retain = (root: THREE.Object3D) => root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (mesh.geometry) geometries.add(mesh.geometry);
        for (const mat of meshMaterials(mesh)) materials.add(mat);
      });
      retain(activeScene);
      retain(newModelScene);
      AssetHotSwapper.releaseResources(removed, { geometries, materials });
    }

    AssetHotSwapper.notifyReload(assetId, targets.length);
    return targets.length;
  }

  /**
   * Convenience alias for reloading asset instances in a scene.
   */
  public static reloadAsset(
    assetId: string,
    newModel: THREE.Object3D,
    scene: THREE.Scene
  ): { replacedCount: number } {
    const replacedCount = AssetHotSwapper.hotSwapAssetInstances(assetId, newModel, scene);
    return { replacedCount };
  }

  /**
   * Register a listener for asset hot-reload events.
   */
  public static addListener(listener: AssetReloadListener): () => void {
    AssetHotSwapper.listeners.add(listener);
    return () => {
      AssetHotSwapper.listeners.delete(listener);
    };
  }

  public static removeListener(listener: AssetReloadListener): void {
    AssetHotSwapper.listeners.delete(listener);
  }

  public static on(_event: "reloaded", listener: AssetReloadListener): () => void {
    return AssetHotSwapper.addListener(listener);
  }

  private static notifyReload(assetId: string, replacedCount: number): void {
    const event: AssetReloadEvent = {
      assetId,
      replacedCount,
      timestamp: Date.now(),
    };
    for (const listener of AssetHotSwapper.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[AssetHotSwapper] Error in listener:`, err);
      }
    }
  }
}

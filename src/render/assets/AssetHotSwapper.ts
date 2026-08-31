// src/render/assets/AssetHotSwapper.ts

import * as THREE from "three";
import { PALETTE_SPECS } from "../materials/PaletteTokens";

export interface AssetReloadEvent {
  assetId: string;
  replacedCount: number;
  timestamp: number;
}

export type AssetReloadListener = (event: AssetReloadEvent) => void;

export class AssetHotSwapper {
  private static listeners: Set<AssetReloadListener> = new Set();

  /**
   * Disposes BufferGeometry on meshes inside container while strictly preserving
   * shared PaletteMaterials singletons.
   */
  public static safelyDisposeInstanceGeometries(container: THREE.Object3D): void {
    container.traverse((node) => {
      if (node instanceof THREE.Mesh || (node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        // Safely dispose non-palette unique materials if any
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of materials) {
            if (mat && !Object.prototype.hasOwnProperty.call(PALETTE_SPECS, mat.name)) {
              // Custom / non-palette instance material
              // (If it's an ephemeral instance material not from PaletteMaterials cache)
              if (mat.userData?.isUniqueInstanceMaterial) {
                mat.dispose();
              }
            }
          }
        }
      }
    });
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
    let replacedCount = 0;

    activeScene.traverse((node) => {
      const isTargetAsset =
        node.userData?.nevaAssetId === assetId ||
        node.userData?.assetId === assetId ||
        node.name === assetId ||
        node.name === `missing_asset_${assetId}`;

      if (isTargetAsset && (node instanceof THREE.Group || node instanceof THREE.Object3D)) {
        // 1. Dispose old geometry
        AssetHotSwapper.safelyDisposeInstanceGeometries(node);

        // 2. Remove old visual children (preserving non-visual attachments)
        const toRemove: THREE.Object3D[] = [];
        for (const child of node.children) {
          if (!child.userData?.isDynamicAttachment && !child.userData?.isPresentationRig) {
            toRemove.push(child);
          }
        }
        for (const child of toRemove) {
          node.remove(child);
        }

        // 3. Clone and attach new model hierarchy
        const clonedNew = newModelScene.clone(true);
        while (clonedNew.children.length > 0) {
          node.add(clonedNew.children[0]);
        }

        // 4. Recalculate bounds and update matrix
        node.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            child.geometry.computeBoundingBox();
            child.geometry.computeBoundingSphere();
          }
        });

        node.updateMatrixWorld(true);
        replacedCount++;
      }
    });

    AssetHotSwapper.notifyReload(assetId, replacedCount);
    return replacedCount;
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

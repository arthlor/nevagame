// src/render/loaders/AssetLoader.ts

import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ASSET_CATALOG, assetUrl, type AssetId } from "../assets/AssetCatalog";

const PRELOAD_ASSET_IDS: readonly AssetId[] = ASSET_CATALOG.map((asset) => asset.id);

export class AssetLoader {
  private static loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private static modelCache: Map<AssetId, THREE.Group> = new Map();
  private static loadingPromises: Map<AssetId, Promise<THREE.Group>> = new Map();

  private static cloneModel(source: THREE.Group): THREE.Group {
    const cloned = cloneSkeleton(source) as THREE.Group;
    cloned.userData.animationClips = source.userData.animationClips;
    cloned.userData.collisionNodes = source.userData.collisionNodes;
    return cloned;
  }

  public static async loadModel(assetId: AssetId): Promise<THREE.Group> {
    if (this.modelCache.has(assetId)) {
      return this.cloneModel(this.modelCache.get(assetId)!);
    }

    if (this.loadingPromises.has(assetId)) {
      const group = await this.loadingPromises.get(assetId)!;
      return this.cloneModel(group);
    }

    const modelPath = assetUrl(assetId);
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      this.loader.load(
        modelPath,
        (gltf) => {
          const root = gltf.scene;
          const collisionNodes: string[] = [];
          root.traverse((child) => {
            if (child.name.startsWith("COL_")) {
              collisionNodes.push(child.name);
              child.visible = false;
              return;
            }
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          });
          root.userData.animationClips = gltf.animations;
          root.userData.collisionNodes = collisionNodes;
          this.modelCache.set(assetId, root);
          this.loadingPromises.delete(assetId);
          resolve(this.cloneModel(root));
        },
        undefined,
        (err) => {
          this.loadingPromises.delete(assetId);
          const error = new Error(`[AssetLoader] Failed to load ${assetId} from ${modelPath}`, { cause: err });
          if (!import.meta.env.PROD) {
            reject(error);
            return;
          }
          console.error(`${error.message}; using diagnostic fallback`, err);
          const fallback = new THREE.Group();
          fallback.name = `missing_asset_${assetId}`;
          fallback.userData.assetLoadFailure = { assetId, modelPath };
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.8 })
          );
          fallback.add(mesh);
          // The fallback is deliberately not cached so a later retry can recover.
          resolve(this.cloneModel(fallback));
        }
      );
    });

    this.loadingPromises.set(assetId, promise);
    const result = await promise;
    return this.cloneModel(result);
  }

  public static async preloadAll(): Promise<void> {
    await Promise.all(PRELOAD_ASSET_IDS.map((assetId) => this.loadModel(assetId)));
  }

  /** Declared `COL_*` proxy names remain available to physics without rendering them. */
  public static collisionNodeNames(model: THREE.Object3D): readonly string[] {
    return (model.userData.collisionNodes as readonly string[] | undefined) ?? [];
  }
}

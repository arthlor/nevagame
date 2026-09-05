// src/render/loaders/AssetLoader.ts

import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ASSET_BY_ID,
  ASSET_CATALOG,
  assetUrl,
  type AssetId,
  type RuntimeAssetSpec
} from "../assets/AssetCatalog";
import { AssetHotSwapper } from "../assets/AssetHotSwapper";
import { PaletteMaterials } from "../materials/PaletteMaterials";
import { configureConservativeSkinnedBounds } from "./CharacterCullingBounds";

const PRELOAD_ASSET_IDS: readonly AssetId[] = ASSET_CATALOG.map((asset) => asset.id);
const DEFAULT_PRELOAD_CONCURRENCY = 6;

export interface AssetPreloadProgress {
  assetId: AssetId;
  completed: number;
  total: number;
}

export function configureRuntimeLod(root: THREE.Group, spec: RuntimeAssetSpec): THREE.LOD | null {
  if (!spec.lodLevels?.length) return null;

  const levels = spec.lodLevels.map((level) => {
    const object = root.getObjectByName(level.node);
    if (!object) throw new Error(`[AssetLoader] ${spec.id} is missing generated LOD node ${level.node}`);
    return { object, distanceMeters: level.distanceMeters };
  });
  const parent = levels[0].object.parent;
  if (!parent || levels.some((level) => level.object.parent !== parent)) {
    throw new Error(`[AssetLoader] ${spec.id} generated LOD nodes must share one parent`);
  }

  const lod = new THREE.LOD();
  lod.name = `${spec.id}_runtime_lod`;
  lod.autoUpdate = true;
  parent.add(lod);
  levels.forEach((level, index) => {
    parent.remove(level.object);
    level.object.visible = index === 0;
    lod.addLevel(level.object, level.distanceMeters);
  });
  lod.userData.assetId = spec.id;
  lod.userData.generatedLevels = spec.lodLevels.map((level) => ({
    node: level.node,
    distanceMeters: level.distanceMeters
  }));
  root.userData.runtimeLodLevels = lod.userData.generatedLevels;
  root.updateMatrixWorld(true);
  return lod;
}

export class AssetLoader {
  private static loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private static modelCache: Map<AssetId, THREE.Group> = new Map();
  private static loadingPromises: Map<AssetId, Promise<THREE.Group>> = new Map();

  private static cloneModel(source: THREE.Group): THREE.Group {
    const cloned = source.userData.hasSkinnedMeshes
      ? cloneSkeleton(source) as THREE.Group
      : source.clone(true);
    cloned.userData.animationClips = source.userData.animationClips;
    cloned.userData.collisionNodes = source.userData.collisionNodes;
    cloned.userData.assetId = source.userData.assetId;
    cloned.userData.runtimeLodLevels = source.userData.runtimeLodLevels;
    cloned.userData.runtimeLodFallback = source.userData.runtimeLodFallback;
    return cloned;
  }

  public static async loadCached(assetId: AssetId): Promise<THREE.Group> {
    if (this.modelCache.has(assetId)) {
      return this.modelCache.get(assetId)!;
    }

    if (this.loadingPromises.has(assetId)) {
      return this.loadingPromises.get(assetId)!;
    }

    const modelPath = assetUrl(assetId);
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      const fail = (err: unknown) => {
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
        fallback.userData.assetId = assetId;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.8 })
        );
        fallback.add(mesh);
        resolve(fallback);
      };
      this.loader.load(
        modelPath,
        (gltf) => {
          try {
            const root = gltf.scene;
            const spec = ASSET_BY_ID.get(assetId);
            if (!spec) throw new Error(`[AssetLoader] Missing runtime catalog entry for ${assetId}`);
            const collisionNodes: string[] = [];
            let hasSkinnedMeshes = false;
            root.traverse((child) => {
              if (child.name.startsWith("COL_")) {
                collisionNodes.push(child.name);
                child.visible = false;
                return;
              }
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                hasSkinnedMeshes ||= (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
                mesh.material = Array.isArray(mesh.material)
                  ? mesh.material.map((material) => PaletteMaterials.canonicalizeLoaded(material))
                  : PaletteMaterials.canonicalizeLoaded(mesh.material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
              }
            });
            root.userData.animationClips = gltf.animations;
            root.userData.collisionNodes = collisionNodes;
            root.userData.assetId = assetId;
            root.userData.hasSkinnedMeshes = hasSkinnedMeshes;
            if (spec.family === "character" && hasSkinnedMeshes) {
              configureConservativeSkinnedBounds(root);
            }
            const missingLodNodes = spec.lodLevels?.filter((level) => !root.getObjectByName(level.node)) ?? [];
            if (missingLodNodes.length > 0) {
              root.userData.runtimeLodLevels = null;
              root.userData.runtimeLodFallback = {
                expectedNodes: spec.lodLevels?.map((level) => level.node) ?? [],
                missingNodes: missingLodNodes.map((level) => level.node),
              };
            } else {
              configureRuntimeLod(root, spec);
            }
            this.modelCache.set(assetId, root);
            this.loadingPromises.delete(assetId);
            resolve(root);
          } catch (error) {
            fail(error);
          }
        },
        undefined,
        fail
      );
    });

    this.loadingPromises.set(assetId, promise);
    return promise;
  }

  public static async loadModel(assetId: AssetId): Promise<THREE.Group> {
    return this.cloneModel(await this.loadCached(assetId));
  }

  public static async preloadAll(
    onProgress?: (progress: AssetPreloadProgress) => void
  ): Promise<void> {
    return this.preload(PRELOAD_ASSET_IDS, onProgress);
  }

  /** Keeps GLB decode/upload pressure bounded while preserving cache semantics. */
  public static async preload(
    assetIds: readonly AssetId[],
    onProgress?: (progress: AssetPreloadProgress) => void,
    concurrency = DEFAULT_PRELOAD_CONCURRENCY
  ): Promise<void> {
    const uniqueAssetIds = [...new Set(assetIds)];
    const total = uniqueAssetIds.length;
    let completed = 0;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < total) {
        const assetId = uniqueAssetIds[cursor];
        cursor += 1;
        await this.loadCached(assetId);
        completed += 1;
        onProgress?.({ assetId, completed, total });
      }
    };
    const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), total);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  /** Declared `COL_*` proxy names remain available to physics without rendering them. */
  public static collisionNodeNames(model: THREE.Object3D): readonly string[] {
    return (model.userData.collisionNodes as readonly string[] | undefined) ?? [];
  }

  /** Purges in-memory cached model and in-flight loading promise for the specified asset. */
  public static invalidateCache(assetId: AssetId): void {
    this.modelCache.delete(assetId);
    this.loadingPromises.delete(assetId);
  }

  /** Alias for invalidateCache */
  public static invalidate(assetId: AssetId): void {
    this.invalidateCache(assetId);
  }

  /**
   * Reloads the model from disk/network, bypassing the local cache, and hot-swaps
   * active scene instances if activeScene is provided.
   */
  public static async reload(
    assetId: AssetId,
    activeScene?: THREE.Scene
  ): Promise<{ model: THREE.Group; replacedCount: number }> {
    this.invalidateCache(assetId);
    const model = await this.loadCached(assetId);
    let replacedCount = 0;
    if (activeScene) {
      replacedCount = AssetHotSwapper.hotSwapAssetInstances(assetId, model, activeScene);
    }
    return { model, replacedCount };
  }
}

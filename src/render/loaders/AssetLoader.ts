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
/**
 * Ceiling for retained, currently-unused model templates. Published Neva
 * models are palette materials over geometry, so geometry bytes are the
 * meaningful eviction signal; session-shared canonical materials and
 * supporting-map textures are owned elsewhere and are never disposed here.
 * Templates with live clones are never evicted, so this is a memory ceiling,
 * not a streaming budget.
 */
const TEMPLATE_CACHE_BUDGET_BYTES = 128 * 1024 * 1024;

export interface AssetCacheStats {
  templates: number;
  bytes: number;
  liveConsumers: number;
  budgetBytes: number;
}

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
  /** Approximate retained geometry bytes per cached template. */
  private static templateBytes: Map<AssetId, number> = new Map();
  private static templateConsumers: Map<AssetId, number> = new Map();
  private static templateLastUse: Map<AssetId, number> = new Map();
  /** Makes `releaseModel` idempotent per clone; a double release must never
   *  let a still-referenced template be evicted. */
  private static readonly releasedModels = new WeakSet<THREE.Object3D>();

  private static estimateGeometryBytes(root: THREE.Object3D): number {
    let bytes = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
    });
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes)) {
        const buffer = attribute as THREE.BufferAttribute;
        if (buffer.array) bytes += buffer.array.byteLength;
      }
      if (geometry.index?.array) bytes += geometry.index.array.byteLength;
    }
    return bytes;
  }

  private static disposeTemplateGeometry(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
    });
    for (const geometry of geometries) geometry.dispose();
  }

  /** Evicts only unused templates, least-recently-used first. */
  private static enforceTemplateBudget(): void {
    let total = 0;
    for (const bytes of this.templateBytes.values()) total += bytes;
    if (total <= TEMPLATE_CACHE_BUDGET_BYTES) return;
    const evictable = [...this.modelCache.keys()]
      .filter((assetId) => (this.templateConsumers.get(assetId) ?? 0) === 0)
      .sort((a, b) => (this.templateLastUse.get(a) ?? 0) - (this.templateLastUse.get(b) ?? 0));
    for (const assetId of evictable) {
      if (total <= TEMPLATE_CACHE_BUDGET_BYTES) break;
      const model = this.modelCache.get(assetId);
      if (!model) continue;
      this.disposeTemplateGeometry(model);
      this.modelCache.delete(assetId);
      total -= this.templateBytes.get(assetId) ?? 0;
      this.templateBytes.delete(assetId);
      this.templateLastUse.delete(assetId);
    }
  }

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

  public static async loadCached(assetId: AssetId, onTransfer?: () => void, signal?: AbortSignal): Promise<THREE.Group> {
    if (this.modelCache.has(assetId)) {
      return this.modelCache.get(assetId)!;
    }

    if (this.loadingPromises.has(assetId)) {
      return this.loadingPromises.get(assetId)!;
    }

    signal?.throwIfAborted();
    const modelPath = assetUrl(assetId);
    const promise = new Promise<THREE.Group>((resolve, reject) => {
      const fail = (err: unknown) => {
        this.loadingPromises.delete(assetId);
        const error = new Error(`[AssetLoader] Failed to load ${assetId} from ${modelPath}`, { cause: err });
        reject(error);
      };
      const decode = (bytes: ArrayBuffer) => this.loader.parse(
        bytes, new URL(".", new URL(modelPath, window.location.href)).href,
        (gltf) => {
          try {
            const root = gltf.scene;
            if (signal?.aborted) {
              root.traverse(child => { if (child instanceof THREE.Mesh) { child.geometry.dispose(); for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose(); } });
              throw signal.reason;
            }
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
            // Any skinned asset culls against its bind pose unless given an
            // articulated envelope; fauna and fish deform as much as people do.
            if (hasSkinnedMeshes) {
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
            this.templateBytes.set(assetId, this.estimateGeometryBytes(root));
            this.templateLastUse.set(assetId, performance.now());
            if (!this.templateConsumers.has(assetId)) this.templateConsumers.set(assetId, 0);
            this.enforceTemplateBudget();
            this.loadingPromises.delete(assetId);
            resolve(root);
          } catch (error) {
            fail(error);
          }
        },
        fail
      );
      void (async () => {
        const response = await fetch(modelPath, { signal });
        if (!response.ok) throw new Error(`Scenery request failed (${response.status})`);
        if (!response.body) { decode(await response.arrayBuffer()); return; }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            signal?.throwIfAborted();
            if (done) break;
            chunks.push(value); size += value.byteLength; onTransfer?.();
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        signal?.throwIfAborted();
        decode(bytes.buffer);
      })().catch(fail);
    });

    this.loadingPromises.set(assetId, promise);
    return promise;
  }

  public static async loadModel(assetId: AssetId): Promise<THREE.Group> {
    const clone = this.cloneModel(await this.loadCached(assetId));
    this.templateConsumers.set(assetId, (this.templateConsumers.get(assetId) ?? 0) + 1);
    this.templateLastUse.set(assetId, performance.now());
    return clone;
  }

  /**
   * Drops one live clone's ownership of its cached template. Call this when a
   * presentation object is despawned; idempotent per object, and it never
   * disposes anything directly. Shared geometry survives until both the clone
   * and the budget allow eviction.
   */
  public static releaseModel(model: THREE.Object3D): void {
    const assetId = model.userData.assetId as AssetId | undefined;
    if (!assetId || this.releasedModels.has(model)) return;
    this.releasedModels.add(model);
    this.templateConsumers.set(assetId, Math.max(0, (this.templateConsumers.get(assetId) ?? 1) - 1));
  }

  public static cacheStats(): AssetCacheStats {
    let bytes = 0;
    let liveConsumers = 0;
    for (const value of this.templateBytes.values()) bytes += value;
    for (const value of this.templateConsumers.values()) liveConsumers += value;
    return {
      templates: this.modelCache.size,
      bytes,
      liveConsumers,
      budgetBytes: TEMPLATE_CACHE_BUDGET_BYTES
    };
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
    concurrency = DEFAULT_PRELOAD_CONCURRENCY,
    signal?: AbortSignal,
    onTransfer?: () => void
  ): Promise<void> {
    const uniqueAssetIds = [...new Set(assetIds)];
    const total = uniqueAssetIds.length;
    let completed = 0;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < total) {
        signal?.throwIfAborted();
        const assetId = uniqueAssetIds[cursor];
        cursor += 1;
        await this.loadCached(assetId, onTransfer, signal);
        signal?.throwIfAborted();
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
    // Bookkeeping only: live clones and hot-swap callers may still reference the
    // template's shared geometry, so disposal is left to budget eviction.
    this.templateBytes.delete(assetId);
    this.templateLastUse.delete(assetId);
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

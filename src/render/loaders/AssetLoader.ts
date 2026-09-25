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

/** Standalone models owned by the calling presentation system. */
export interface DirectAssetSpec {
  id: string;
  modelPath: string;
  scale?: number;
}

export interface DirectAssetPreloadProgress {
  assetId: string;
  completed: number;
  total: number;
}

export function configureRuntimeLod(
  root: THREE.Group,
  spec: Pick<RuntimeAssetSpec, "id" | "lodLevels">
): THREE.LOD | null {
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

/**
 * Adopts a decoded (or freshly built) asset scene as a runtime template: hides `COL_` proxies,
 * adopts palette materials into the shared cache, records clips and collision nodes, and configures
 * skinned culling bounds and generated LOD levels. The GLB loader and the Art Yard's live preview of
 * authored generators both go through here, so a live build renders exactly as the published GLB.
 */
export function prepareAssetTemplate(
  root: THREE.Group,
  animations: THREE.AnimationClip[],
  spec: Pick<RuntimeAssetSpec, "id" | "lodLevels">
): THREE.Group {
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
  root.userData.animationClips = animations;
  root.userData.collisionNodes = collisionNodes;
  root.userData.assetId = spec.id;
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
  return root;
}

/**
 * Clones a skinned model so each source skeleton stays one skeleton in the clone.
 *
 * GLTFLoader splits a skin that spans several palette materials into sibling
 * SkinnedMeshes sharing one Skeleton, but `SkeletonUtils.clone` gives every
 * cloned mesh a Skeleton of its own. A four-token animal then recomputes and
 * uploads four identical bone palettes every frame, which measured roughly a
 * third of its frame cost. Rebinding the siblings onto one skeleton restores
 * the sharing the source already had.
 */
export function cloneSkinnedModel(source: THREE.Object3D): THREE.Object3D {
  const cloned = cloneSkeleton(source);
  const sourceMeshes: THREE.SkinnedMesh[] = [];
  const clonedMeshes: THREE.SkinnedMesh[] = [];
  source.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) sourceMeshes.push(object as THREE.SkinnedMesh);
  });
  cloned.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) clonedMeshes.push(object as THREE.SkinnedMesh);
  });
  const shared = new Map<THREE.Skeleton, THREE.Skeleton>();
  sourceMeshes.forEach((sourceMesh, index) => {
    const clonedMesh = clonedMeshes[index];
    const existing = shared.get(sourceMesh.skeleton);
    if (existing) {
      clonedMesh.bind(existing, clonedMesh.bindMatrix);
    } else {
      shared.set(sourceMesh.skeleton, clonedMesh.skeleton);
    }
  });
  return cloned;
}

export class AssetLoader {
  private static loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private static modelCache: Map<AssetId, THREE.Group> = new Map();
  private static loadingPromises: Map<AssetId, Promise<THREE.Group>> = new Map();
  private static directLoadingPromises: Map<AssetId, Promise<THREE.Group>> = new Map();
  private static directLoadControllers: Map<AssetId, AbortController> = new Map();
  private static directModelSources: Map<AssetId, string> = new Map();
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
      ? cloneSkinnedModel(source) as THREE.Group
      : source.clone(true);
    cloned.userData.animationClips = source.userData.animationClips;
    cloned.userData.collisionNodes = source.userData.collisionNodes;
    cloned.userData.assetId = source.userData.assetId;
    cloned.userData.runtimeLodLevels = source.userData.runtimeLodLevels;
    cloned.userData.runtimeLodFallback = source.userData.runtimeLodFallback;
    return cloned;
  }

  private static async readResponseBytes(
    response: Response,
    signal?: AbortSignal,
    onTransfer?: () => void
  ): Promise<ArrayBuffer> {
    if (!response.body) {
      const bytes = await response.arrayBuffer();
      signal?.throwIfAborted();
      onTransfer?.();
      return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        signal?.throwIfAborted();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        onTransfer?.();
      }
    } finally {
      reader.releaseLock();
    }

    signal?.throwIfAborted();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  }

  private static async waitForAbortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    signal.throwIfAborted();
    return new Promise<T>((resolve, reject) => {
      const cleanup = (): void => signal.removeEventListener("abort", onAbort);
      const onAbort = (): void => {
        cleanup();
        reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        value => { cleanup(); resolve(value); },
        error => { cleanup(); reject(error); }
      );
    });
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
            prepareAssetTemplate(root, gltf.animations, spec);
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

  private static async loadDirectTemplate(
    spec: DirectAssetSpec,
    signal?: AbortSignal,
    onTransfer?: () => void
  ): Promise<THREE.Group> {
    const key = spec.id as AssetId;
    signal?.throwIfAborted();
    if (ASSET_BY_ID.has(key)) {
      throw new Error(`[AssetLoader] ${spec.id} is catalog-owned and must use loadModel`);
    }
    const knownPath = this.directModelSources.get(key);
    if (knownPath && knownPath !== spec.modelPath) {
      throw new Error(`[AssetLoader] Direct model id ${spec.id} was requested from two different paths`);
    }
    this.directModelSources.set(key, spec.modelPath);

    const cached = this.modelCache.get(key);
    if (cached) {
      this.templateLastUse.set(key, performance.now());
      return cached;
    }

    let pending = this.directLoadingPromises.get(key);
    if (!pending) {
      const controller = new AbortController();
      const abortFromCaller = (): void => controller.abort(signal?.reason);
      if (signal) {
        if (signal.aborted) throw signal.reason;
        signal.addEventListener("abort", abortFromCaller, { once: true });
      }
      const loadPromise = new Promise<THREE.Group>((resolve, reject) => {
        const fail = (error: unknown): void => {
          if (this.directLoadingPromises.get(key) === loadPromise) this.directLoadingPromises.delete(key);
          if (this.directLoadControllers.get(key) === controller) this.directLoadControllers.delete(key);
          reject(new Error(`[AssetLoader] Failed to load direct model ${spec.id} from ${spec.modelPath}`, { cause: error }));
        };
        const decode = (bytes: ArrayBuffer): void => this.loader.parse(
          bytes,
          new URL(".", new URL(spec.modelPath, typeof window !== "undefined" ? window.location.href : "http://localhost/")).href,
          (gltf) => {
            try {
              if (this.directLoadingPromises.get(key) !== loadPromise) {
                throw new DOMException("The direct model load was invalidated", "AbortError");
              }
              signal?.throwIfAborted();
              const root = gltf.scene;
              prepareAssetTemplate(root, gltf.animations, { id: key, lodLevels: [] });
              this.modelCache.set(key, root);
              this.templateBytes.set(key, this.estimateGeometryBytes(root));
              this.templateLastUse.set(key, performance.now());
              this.templateConsumers.set(key, 0);
              this.enforceTemplateBudget();
              if (this.directLoadingPromises.get(key) === loadPromise) this.directLoadingPromises.delete(key);
              if (this.directLoadControllers.get(key) === controller) this.directLoadControllers.delete(key);
              resolve(root);
            } catch (error) {
              fail(error);
            }
          },
          fail
        );

        void (async () => {
          try {
            const response = await fetch(spec.modelPath, { signal: controller.signal });
            if (!response.ok) {
              throw new Error(`Scenery request failed (${response.status})`);
            }
            decode(await this.readResponseBytes(response, controller.signal, onTransfer));
          } catch (error) {
            fail(error);
          }
        })();
      });
      pending = loadPromise;
      this.directLoadingPromises.set(key, loadPromise);
      this.directLoadControllers.set(key, controller);
      void loadPromise.then(
        () => signal?.removeEventListener("abort", abortFromCaller),
        () => signal?.removeEventListener("abort", abortFromCaller)
      );
    }

    const template = await this.waitForAbortable(pending, signal);
    signal?.throwIfAborted();
    return template;
  }

  /** Loads and caches repository-owned standalone GLBs without creating a live clone. */
  public static async preloadDirect(
    specs: readonly DirectAssetSpec[],
    onProgress?: (progress: DirectAssetPreloadProgress) => void,
    concurrency = 3,
    signal?: AbortSignal,
    onTransfer?: () => void
  ): Promise<void> {
    const uniqueSpecs = [...new Map(specs.map((spec) => [spec.id, spec])).values()];
    const total = uniqueSpecs.length;
    let completed = 0;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < total) {
        signal?.throwIfAborted();
        const spec = uniqueSpecs[cursor++];
        await this.loadDirectTemplate(spec, signal, onTransfer);
        signal?.throwIfAborted();
        onProgress?.({ assetId: spec.id, completed: ++completed, total });
      }
    };
    const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), total);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  /** Loads a standalone GLB and returns an independently owned clone. */
  public static async loadDirectModel(
    spec: DirectAssetSpec,
    signal?: AbortSignal,
    onTransfer?: () => void
  ): Promise<THREE.Group> {
    const scale = spec.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new Error(`[AssetLoader] Direct model ${spec.id} must have a positive finite scale`);
    }
    const template = await this.loadDirectTemplate(spec, signal, onTransfer);
    const clone = this.cloneModel(template);
    if (scale !== 1) clone.scale.setScalar(scale);
    this.templateConsumers.set(spec.id as AssetId, (this.templateConsumers.get(spec.id as AssetId) ?? 0) + 1);
    this.templateLastUse.set(spec.id as AssetId, performance.now());
    this.enforceTemplateBudget();
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
    const consumers = Math.max(0, (this.templateConsumers.get(assetId) ?? 1) - 1);
    this.templateConsumers.set(assetId, consumers);
    if (consumers === 0) this.enforceTemplateBudget();
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
    this.directLoadControllers.get(assetId)?.abort(new DOMException("Asset cache invalidated", "AbortError"));
    this.directLoadControllers.delete(assetId);
    this.directLoadingPromises.delete(assetId);
    this.directModelSources.delete(assetId);
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

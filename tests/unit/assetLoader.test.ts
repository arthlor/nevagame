import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { ASSET_BY_ID, ASSET_CATALOG, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { AssetLoader, cloneSkinnedModel, configureRuntimeLod } from "../../src/render/loaders/AssetLoader";

type ParsedGltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
type LoaderInternals = {
  templateConsumers: Map<string, number>;
  modelCache: Map<string, THREE.Group>;
  loadingPromises: Map<string, Promise<THREE.Group>>;
  loader: {
    parse: (
      bytes: ArrayBuffer,
      path: string,
      onLoad: (gltf: ParsedGltf) => void,
      onError: (error: unknown) => void
    ) => void;
  };
};

describe("skinned model clones", () => {
  /** A glTF skin split across two palette materials loads as two meshes on one skeleton. */
  function twoMaterialSkin(): { root: THREE.Group; skeleton: THREE.Skeleton } {
    const root = new THREE.Group();
    const hip = new THREE.Bone();
    hip.name = "hip";
    const tail = new THREE.Bone();
    tail.name = "tail";
    tail.position.set(0, 0, -0.3);
    hip.add(tail);
    root.add(hip);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([hip, tail]);
    for (const name of ["coat", "saddle"]) {
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const count = geometry.getAttribute("position").count;
      geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
      geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(
        Array.from({ length: count * 4 }, (_, index) => (index % 4 === 0 ? 1 : 0)), 4
      ));
      const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ name }));
      mesh.name = name;
      root.add(mesh);
      mesh.bind(skeleton);
    }
    return { root, skeleton };
  }

  it("keeps one skeleton per source skeleton instead of one per material mesh", () => {
    const { root, skeleton } = twoMaterialSkin();
    const clone = cloneSkinnedModel(root);
    const meshes: THREE.SkinnedMesh[] = [];
    clone.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(object as THREE.SkinnedMesh);
    });

    expect(meshes).toHaveLength(2);
    expect(meshes[0].skeleton).toBe(meshes[1].skeleton);
    expect(meshes[0].skeleton).not.toBe(skeleton);
    // The shared skeleton drives the clone's own bones, never the template's.
    const cloneHip = clone.getObjectByName("hip");
    expect(meshes[0].skeleton.bones[0]).toBe(cloneHip);
    expect(skeleton.bones[0]).not.toBe(cloneHip);
  });

  it("still gives separate clones independent skeletons", () => {
    const { root } = twoMaterialSkin();
    const skeletonOf = (object: THREE.Object3D): THREE.Skeleton | undefined => {
      let found: THREE.Skeleton | undefined;
      object.traverse((child) => {
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) found ??= (child as THREE.SkinnedMesh).skeleton;
      });
      return found;
    };
    expect(skeletonOf(cloneSkinnedModel(root))).not.toBe(skeletonOf(cloneSkinnedModel(root)));
  });
});

describe("generated asset LOD runtime", () => {
  it("reparents catalog-named levels into a Three.js distance switch", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.TREE_OAK_A);
    if (!spec?.lodLevels) throw new Error("tree_oak_a requires generated LOD levels");

    const root = new THREE.Group();
    const assetRoot = new THREE.Group();
    root.add(assetRoot);
    const levelObjects = spec.lodLevels.map((level) => {
      const object = new THREE.Group();
      object.name = level.node;
      object.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      assetRoot.add(object);
      return object;
    });

    const lod = configureRuntimeLod(root, spec);
    expect(lod).toBeInstanceOf(THREE.LOD);
    expect(lod?.levels.map((level) => level.distance)).toEqual(
      spec.lodLevels.map((level) => level.distanceMeters)
    );
    expect(lod?.levels.map((level) => level.object.name)).toEqual(spec.lodLevels.map((level) => level.node));
    expect(levelObjects[0].visible).toBe(true);
    expect(levelObjects[1].visible).toBe(false);

    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, spec.lodLevels[1].distanceMeters + 2);
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    lod?.update(camera);
    expect(levelObjects[0].visible).toBe(false);
    expect(levelObjects[1].visible).toBe(true);
  });

  it("rejects incomplete generated hierarchies instead of silently showing both levels", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.ROCK_COASTAL_A);
    if (!spec?.lodLevels) throw new Error("rock_coastal_a requires generated LOD levels");
    const root = new THREE.Group();
    const assetRoot = new THREE.Group();
    root.add(assetRoot);
    const lod0 = new THREE.Group();
    lod0.name = spec.lodLevels[0].node;
    assetRoot.add(lod0);
    expect(() => configureRuntimeLod(root, spec)).toThrow("missing generated LOD node");
  });

  it("preloads every catalog asset and reports catalog-derived progress", async () => {
    const loadedIds: string[] = [];
    const progress: Array<{ assetId: string; completed: number; total: number }> = [];
    const loadCached = vi.spyOn(AssetLoader, "loadCached").mockImplementation(async (assetId) => {
      loadedIds.push(assetId);
      return new THREE.Group();
    });

    try {
      await AssetLoader.preloadAll((entry) => progress.push(entry));
    } finally {
      loadCached.mockRestore();
    }

    expect(loadedIds).toHaveLength(ASSET_CATALOG.length);
    expect(new Set(loadedIds)).toEqual(new Set(ASSET_CATALOG.map((asset) => asset.id)));
    expect(progress).toHaveLength(ASSET_CATALOG.length);
    expect(progress.map((entry) => entry.completed)).toEqual(
      Array.from({ length: ASSET_CATALOG.length }, (_, index) => index + 1)
    );
    expect(progress.every((entry) => entry.total === ASSET_CATALOG.length)).toBe(true);
    expect(progress.at(-1)?.completed).toBe(ASSET_CATALOG.length);
  });
});

describe("catalog NPC asset loading", () => {
  // Tripo NPCs are catalog assets; startup begins their transfers during the layout stage and the
  // later scenery preload joins the same in-flight request.
  const assetId = ASSET_IDS.CHAR_NPC_TOMAS_B;

  it("deduplicates overlapping startup preloads, reports progress, and returns owned cached clones", async () => {
    const root = new THREE.Group();
    const collision = new THREE.Group();
    collision.name = "COL_body";
    root.add(collision);
    collision.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));

    const internals = AssetLoader as unknown as LoaderInternals;
    const parse = vi.spyOn(internals.loader, "parse").mockImplementation((_bytes, _path, onLoad) => {
      onLoad({ scene: root, animations: [] });
    });
    const fetch = vi.fn(async () => ({
      ok: true,
      body: null,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer
    } as Response));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("window", { location: { href: "http://localhost/" } });
    const progress: Array<{ assetId: string; completed: number; total: number }> = [];

    try {
      const early = AssetLoader.preload([assetId]);
      await AssetLoader.preload([assetId, assetId], entry => progress.push(entry));
      await early;
      const clone = await AssetLoader.loadModel(assetId);

      expect(fetch).toHaveBeenCalledOnce();
      expect(parse).toHaveBeenCalledOnce();
      expect(progress).toEqual([{ assetId, completed: 1, total: 1 }]);
      expect(clone.userData.assetId).toBe(assetId);
      expect(AssetLoader.collisionNodeNames(clone)).toEqual(["COL_body"]);
      expect(clone.getObjectByName("COL_body")?.visible).toBe(false);
      expect(internals.templateConsumers.get(assetId)).toBe(1);

      AssetLoader.releaseModel(clone);
      AssetLoader.releaseModel(clone);
      expect(internals.templateConsumers.get(assetId)).toBe(0);
    } finally {
      AssetLoader.invalidateCache(assetId);
      internals.templateConsumers.delete(assetId);
      parse.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("cancels an in-flight transfer without caching its model", async () => {
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));
    const internals = AssetLoader as unknown as Pick<LoaderInternals, "modelCache" | "loadingPromises">;
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const loading = AssetLoader.preload([assetId], undefined, 1, controller.signal);

    try {
      controller.abort();
      await expect(loading).rejects.toThrow();
      expect(fetch).toHaveBeenCalledOnce();
      expect(internals.modelCache.has(assetId)).toBe(false);
      expect(internals.loadingPromises.has(assetId)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

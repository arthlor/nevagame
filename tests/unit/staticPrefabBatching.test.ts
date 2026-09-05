import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorldScene } from "../../src/render/scene/WorldScene";
import { WorldLayout } from "../../src/world/WorldLayout";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";

interface BatchInstance {
  batch: THREE.BatchedMesh;
  instanceId: number;
  visible: boolean;
  lodVisible: boolean;
  levelIndex: number;
  position: THREE.Vector3;
}

function harness() {
  const root = new THREE.Group();
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 1, 20);
  scene.add(root);
  const world = Object.assign(Object.create(WorldScene.prototype), {
    staticPrefabGroup: root,
    staticLodBatchInstances: [],
    staticBatchChunks: [],
    visibilityAnchor: new THREE.Vector3(),
    qualityLevel: 2,
    scene
  }) as {
    batchCompatibleMeshes: (root: THREE.Group, skip: (mesh: THREE.Mesh) => boolean) => void;
    updateStaticLodBatches: () => void;
    updateStaticBatchChunkVisibility: () => void;
    staticLodBatchInstances: BatchInstance[];
    visibilityAnchor: THREE.Vector3;
  };
  vi.spyOn(WorldLayout, "islandAt").mockImplementation((worldX) => worldX >= 400 ? "island.sunreach" : "island.neva");
  return {
    world, root,
    batch: (skip = (_mesh: THREE.Mesh) => false) => {
      world.batchCompatibleMeshes(root, skip);
      return root.children.filter((object): object is THREE.BatchedMesh => object instanceof THREE.BatchedMesh);
    }
  };
}

afterEach(() => vi.restoreAllMocks());

describe("static prefab batching", () => {
  it("keeps flyer casting under its canonical policy when the final world pass repeats", () => {
    const world = Object.create(WorldScene.prototype) as {
      applyStaticShadowPolicy: (root: THREE.Object3D) => void;
    };
    for (const assetId of [ASSET_IDS.FAUNA_GULL_A, ASSET_IDS.FAUNA_BUTTERFLY_A, ASSET_IDS.FAUNA_DONKEY_A]) {
      const root = new THREE.Group();
      root.userData.assetId = assetId;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
      root.add(mesh);
      for (const initial of [true, false]) {
        mesh.castShadow = initial;
        world.applyStaticShadowPolicy(root);
        expect(mesh.castShadow).toBe(assetId === ASSET_IDS.FAUNA_DONKEY_A
          ? CANONICAL_RENDER_CONFIG.shadows.castCharacters
          : CANONICAL_RENDER_CONFIG.shadows.castAmbientFlyers);
        expect(mesh.receiveShadow).toBe(true);
      }
    }
  });

  it("shares one material draw across cells and strips repeated UV geometry only once", () => {
    const { root, batch } = harness();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const positions = [0, 80, 160, 240];
    for (const worldX of positions) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = worldX;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    const batches = batch();
    expect(batches).toHaveLength(1);
    expect(batches[0].instanceCount).toBe(4);
    expect(batches[0].geometry.getAttribute("position").count).toBe(geometry.getAttribute("position").count);
    expect(batches[0].geometry.getAttribute("uv")).toBeUndefined();
    expect(geometry.getAttribute("uv")).toBeDefined();
    expect(batches[0].material).toBe(material);
    expect(batches[0].perObjectFrustumCulled).toBe(true);
    positions.forEach((worldX, index) => {
      const transform = batches[0].getMatrixAt(index, new THREE.Matrix4());
      expect(transform.elements[12]).toBe(worldX);
    });
  });

  it("never promotes a non-caster or changes receiving policy when materials match", () => {
    const { root, batch } = harness();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    for (const castShadow of [false, true]) {
      for (const receiveShadow of [false, true]) {
        for (let instance = 0; instance < 2; instance += 1) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = castShadow;
          mesh.receiveShadow = receiveShadow;
          root.add(mesh);
        }
      }
    }
    const batches = batch();
    expect(batches).toHaveLength(4);
    expect(batches.map((mesh) => [mesh.castShadow, mesh.receiveShadow, mesh.instanceCount])).toEqual([
      [false, false, 2], [false, true, 2], [true, false, 2], [true, true, 2]
    ]);
  });

  it("preserves separate imported material identities even when their properties match", () => {
    const { root, batch } = harness();
    const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    for (const [index, material] of materials.entries()) {
      material.userData.neva_source_material = `provider-region-${index}`;
      for (let instance = 0; instance < 2; instance += 1) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    }
    expect(batch().map((mesh) => mesh.material)).toEqual(materials);
  });

  it("keeps different islands in separate batches", () => {
    const { root, batch } = harness();
    const material = new THREE.MeshStandardMaterial();
    for (const worldX of [0, 80, 500, 580]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
      mesh.position.x = worldX;
      root.add(mesh);
    }
    expect(batch().map((mesh) => mesh.instanceCount)).toEqual([2, 2]);
  });

  it("combines fog-cell and LOD visibility without either update reviving hidden instances", () => {
    const { root, world, batch } = harness();
    const material = new THREE.MeshStandardMaterial();
    for (const worldX of [0, 160]) {
      const lod = new THREE.LOD();
      lod.position.x = worldX;
      for (const distance of [0, 10]) {
        const level = new THREE.Group();
        level.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        lod.addLevel(level, distance);
        level.visible = distance === 0;
      }
      root.add(lod);
    }
    const batches = batch();
    expect(batches).toHaveLength(1);
    expect(world.staticLodBatchInstances).toHaveLength(4);
    function expectVisible(worldX: number): void {
      for (const instance of world.staticLodBatchInstances) {
        const expected = instance.position.x === worldX && instance.levelIndex === 0;
        expect(instance.batch.getVisibleAt(instance.instanceId)).toBe(expected);
        expect(instance.visible).toBe(expected);
      }
    }
    world.updateStaticLodBatches();
    world.updateStaticBatchChunkVisibility();
    expectVisible(0);
    world.updateStaticLodBatches();
    expectVisible(0);
    world.visibilityAnchor.x = 160;
    world.updateStaticBatchChunkVisibility();
    world.updateStaticLodBatches();
    expectVisible(160);
    world.updateStaticBatchChunkVisibility();
    expectVisible(160);
    world.visibilityAnchor.x = 0;
    world.updateStaticLodBatches();
    world.updateStaticBatchChunkVisibility();
    expectVisible(0);
  });

  it("retains textured UVs and excludes dynamic and skinned meshes", () => {
    const { root, batch } = harness();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const dynamic = new THREE.Mesh(geometry, material);
    const skinned = new THREE.SkinnedMesh(geometry, material);
    root.add(dynamic, skinned);
    const batches = batch((mesh) => mesh === dynamic);
    expect(batches).toHaveLength(1);
    expect(batches[0].geometry.getAttribute("uv")).toBeDefined();
    expect(batches[0].instanceCount).toBe(2);
    expect(dynamic.parent).toBe(root);
    expect(skinned.parent).toBe(root);
  });
});

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { AssetHotSwapper, type AssetReloadEvent } from "../../src/render/assets/AssetHotSwapper";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";
import type { PaletteToken } from "../../src/render/materials/PaletteTokens";

describe("AssetHotSwapper & Live In-Place Asset Replacement", () => {
  it("disposes instance geometries while strictly preserving PaletteMaterials singletons", () => {
    const paletteMat = PaletteMaterials.standard("wood_dark_01" as PaletteToken);
    const matDisposeSpy = vi.spyOn(paletteMat, "dispose");

    const geom = new THREE.BoxGeometry(1, 1, 1);
    const geomDisposeSpy = vi.spyOn(geom, "dispose");

    const container = new THREE.Group();
    const mesh = new THREE.Mesh(geom, paletteMat);
    container.add(mesh);

    AssetHotSwapper.safelyDisposeInstanceGeometries(container);

    expect(geomDisposeSpy).toHaveBeenCalledTimes(1);
    expect(matDisposeSpy).not.toHaveBeenCalled();
  });

  it("hot-swaps scene instances while preserving parent transforms and dynamic attachments", () => {
    const assetId = "prop_fence_wood_a";
    const scene = new THREE.Scene();

    // Instance 1
    const instance1 = new THREE.Group();
    instance1.name = "fence_inst_1";
    instance1.userData.assetId = assetId;
    instance1.position.set(10, 2, 5);
    instance1.rotation.set(0, Math.PI / 4, 0);
    instance1.scale.set(1.5, 1.5, 1.5);
    instance1.layers.set(2);

    const oldMesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    oldMesh1.name = "old_fence_geom_1";
    instance1.add(oldMesh1);

    const dynamicAttach = new THREE.Group();
    dynamicAttach.name = "lantern_attachment";
    dynamicAttach.userData.isDynamicAttachment = true;
    instance1.add(dynamicAttach);

    // Instance 2
    const instance2 = new THREE.Group();
    instance2.name = "fence_inst_2";
    instance2.userData.nevaAssetId = assetId;
    instance2.position.set(-5, 0, 8);
    const oldMesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    instance2.add(oldMesh2);

    // Unrelated instance
    const otherInstance = new THREE.Group();
    otherInstance.name = "tree_inst";
    otherInstance.userData.assetId = "tree_oak_a";
    otherInstance.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial()));

    scene.add(instance1);
    scene.add(instance2);
    scene.add(otherInstance);

    // New model to hot-swap
    const newModelScene = new THREE.Group();
    const newMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 2, 8),
      new THREE.MeshStandardMaterial()
    );
    newMesh.name = "upgraded_fence_mesh";
    newModelScene.add(newMesh);

    // Listen for reload event
    const events: AssetReloadEvent[] = [];
    const unsubscribe = AssetHotSwapper.on("reloaded", (e) => events.push(e));

    const replacedCount = AssetHotSwapper.hotSwapAssetInstances(assetId, newModelScene, scene);

    expect(replacedCount).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0].assetId).toBe(assetId);
    expect(events[0].replacedCount).toBe(2);

    // Check instance 1 preservation
    expect(instance1.position.x).toBe(10);
    expect(instance1.position.y).toBe(2);
    expect(instance1.position.z).toBe(5);
    expect(instance1.scale.x).toBe(1.5);
    expect(instance1.layers.mask).toBe(1 << 2);

    // Check dynamic attachment preserved
    expect(instance1.getObjectByName("lantern_attachment")).toBe(dynamicAttach);

    // Check old visual removed and new mesh added
    expect(instance1.getObjectByName("old_fence_geom_1")).toBeUndefined();
    const foundNewMesh = instance1.getObjectByName("upgraded_fence_mesh") as THREE.Mesh;
    expect(foundNewMesh).toBeDefined();
    expect(foundNewMesh.geometry.boundingBox).toBeDefined();
    expect(foundNewMesh.geometry.boundingSphere).toBeDefined();

    // Check other instance untouched
    expect(otherInstance.children).toHaveLength(1);

    unsubscribe();
  });

  it("integrates with AssetLoader.invalidateCache and AssetLoader.reload", async () => {
    const assetId = "prop_crate_wood_a";
    const scene = new THREE.Scene();

    const instance = new THREE.Group();
    instance.userData.assetId = assetId;
    instance.position.set(1, 2, 3);
    const oldMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    instance.add(oldMesh);
    scene.add(instance);

    const mockGroup = new THREE.Group();
    mockGroup.name = "reloaded_crate";
    const mockMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mockMesh.name = "reloaded_mesh";
    mockGroup.add(mockMesh);

    const loadCachedSpy = vi.spyOn(AssetLoader, "loadCached").mockResolvedValue(mockGroup);

    try {
      const result = await AssetLoader.reload(assetId, scene);
      expect(result.replacedCount).toBe(1);
      expect(loadCachedSpy).toHaveBeenCalledWith(assetId);
      expect(instance.getObjectByName("reloaded_mesh")).toBeDefined();
    } finally {
      loadCachedSpy.mockRestore();
    }
  });
});

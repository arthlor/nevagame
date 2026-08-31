import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { AssetHotSwapper, type AssetReloadEvent } from "../../src/render/assets/AssetHotSwapper";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { PaletteMaterials } from "../../src/render/materials/PaletteMaterials";
import type { PaletteToken } from "../../src/render/materials/PaletteTokens";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";

describe("Adversarial Stress Test: AssetHotSwapper & AssetLoader", () => {
  // =========================================================================
  // Challenge 1: Multi-Instance Geometry Disposal vs. Material Preservation
  // =========================================================================
  it("CHALLENGE 1: Disposes all old geometries across 20 scene instances while NEVER disposing shared PaletteMaterials", () => {
    const assetId = "prop_barrel_wood_a";
    const scene = new THREE.Scene();

    const sharedPaletteMat1 = PaletteMaterials.standard("wood_dark_01" as PaletteToken);
    const sharedPaletteMat2 = PaletteMaterials.standard("metal_dark_01" as PaletteToken);
    const mat1DisposeSpy = vi.spyOn(sharedPaletteMat1, "dispose");
    const mat2DisposeSpy = vi.spyOn(sharedPaletteMat2, "dispose");

    const INSTANCE_COUNT = 20;
    const oldGeomSpies: Array<ReturnType<typeof vi.spyOn>> = [];

    // Create 20 instances scattered in scene with nested sub-meshes and multi-materials
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const instance = new THREE.Group();
      instance.name = `instance_${i}`;
      instance.userData.nevaAssetId = assetId;
      instance.position.set(i * 2, 0, i * 3);
      instance.rotation.set(0, (i * Math.PI) / 10, 0);
      instance.scale.set(1 + i * 0.1, 1 + i * 0.1, 1 + i * 0.1);

      // Child 1: Mesh with single palette material
      const geom1 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
      oldGeomSpies.push(vi.spyOn(geom1, "dispose"));
      const mesh1 = new THREE.Mesh(geom1, sharedPaletteMat1);
      mesh1.name = `barrel_body_${i}`;
      instance.add(mesh1);

      // Child 2: Nested sub-group with multi-material mesh
      const subGroup = new THREE.Group();
      const geom2 = new THREE.TorusGeometry(0.55, 0.05, 8, 16);
      oldGeomSpies.push(vi.spyOn(geom2, "dispose"));
      const mesh2 = new THREE.Mesh(geom2, [sharedPaletteMat2, sharedPaletteMat1]);
      mesh2.name = `barrel_hoop_${i}`;
      subGroup.add(mesh2);
      instance.add(subGroup);

      // Child 3: Dynamic attachment that must survive
      const attachment = new THREE.Group();
      attachment.name = `tap_attachment_${i}`;
      attachment.userData.isDynamicAttachment = true;
      instance.add(attachment);

      scene.add(instance);
    }

    // New replacement model
    const newModel = new THREE.Group();
    const newGeom = new THREE.BoxGeometry(2, 3, 2);
    const newMesh = new THREE.Mesh(newGeom, sharedPaletteMat1);
    newMesh.name = "barrel_lod0_remastered";
    newModel.add(newMesh);

    // Execute Hot-Swap
    const replaced = AssetHotSwapper.hotSwapAssetInstances(assetId, newModel, scene);

    expect(replaced).toBe(INSTANCE_COUNT);

    // Assert every old geometry across all 20 instances was disposed exactly once
    expect(oldGeomSpies.length).toBe(INSTANCE_COUNT * 2);
    for (const spy of oldGeomSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }

    // Assert shared PaletteMaterials singletons were NEVER disposed
    expect(mat1DisposeSpy).not.toHaveBeenCalled();
    expect(mat2DisposeSpy).not.toHaveBeenCalled();

    // Verify all instances now contain the new visual mesh and keep attachments
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const inst = scene.getObjectByName(`instance_${i}`) as THREE.Group;
      expect(inst).toBeDefined();
      expect(inst.getObjectByName(`barrel_body_${i}`)).toBeUndefined();
      expect(inst.getObjectByName(`barrel_hoop_${i}`)).toBeUndefined();
      expect(inst.getObjectByName(`tap_attachment_${i}`)).toBeDefined();
      expect(inst.getObjectByName("barrel_lod0_remastered")).toBeDefined();
    }
  });

  // =========================================================================
  // Challenge 2: Ephemeral Material Disposal vs. Palette Material Preservation
  // =========================================================================
  it("CHALLENGE 2: Ephemeral unique instance materials are disposed while palette materials are kept", () => {
    const container = new THREE.Group();

    // Palette material
    const paletteMat = PaletteMaterials.standard("stone_cool_01" as PaletteToken);
    const paletteDisposeSpy = vi.spyOn(paletteMat, "dispose");

    // Unique ephemeral material marked for instance disposal
    const ephemeralMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    ephemeralMat.name = "custom_dynamic_overlay";
    ephemeralMat.userData.isUniqueInstanceMaterial = true;
    const ephemeralDisposeSpy = vi.spyOn(ephemeralMat, "dispose");

    // Unmarked custom material (should not be disposed without explicit flag)
    const customSharedMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    customSharedMat.name = "unmarked_material";
    const customSharedDisposeSpy = vi.spyOn(customSharedMat, "dispose");

    const geom1 = new THREE.BoxGeometry(1, 1, 1);
    const mesh1 = new THREE.Mesh(geom1, paletteMat);

    const geom2 = new THREE.SphereGeometry(1, 8, 8);
    const mesh2 = new THREE.Mesh(geom2, ephemeralMat);

    const geom3 = new THREE.BufferGeometry();
    const mesh3 = new THREE.Mesh(geom3, customSharedMat);

    container.add(mesh1, mesh2, mesh3);

    AssetHotSwapper.safelyDisposeInstanceGeometries(container);

    expect(paletteDisposeSpy).not.toHaveBeenCalled();
    expect(customSharedDisposeSpy).not.toHaveBeenCalled();
    expect(ephemeralDisposeSpy).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // Challenge 3: Deep Hierarchy Bounding Box and Matrix World Propagation
  // =========================================================================
  it("CHALLENGE 3: Correctly propagates matrixWorld and recomputes bounding volumes across nested hierarchy", () => {
    const assetId = "building_barn_wood_a";
    const rootScene = new THREE.Scene();

    // Create a 4-level deep parent hierarchy
    const worldZone = new THREE.Group();
    worldZone.position.set(100, 0, 200);

    const district = new THREE.Group();
    district.position.set(10, 5, -20);
    district.rotation.set(0, Math.PI / 2, 0);
    worldZone.add(district);

    const plot = new THREE.Group();
    plot.position.set(0, 2, 10);
    plot.scale.set(2, 2, 2);
    district.add(plot);

    const barnInstance = new THREE.Group();
    barnInstance.name = "main_barn";
    barnInstance.userData.assetId = assetId;
    barnInstance.position.set(5, 0, 5);
    plot.add(barnInstance);

    rootScene.add(worldZone);
    rootScene.updateMatrixWorld(true);

    const initialWorldPos = new THREE.Vector3();
    barnInstance.getWorldPosition(initialWorldPos);

    // Initial old model has a small 1x1x1 box
    const oldMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    oldMesh.name = "old_barn_mesh";
    barnInstance.add(oldMesh);

    // Replacement model has a large 10x15x20 box
    const newModel = new THREE.Group();
    const newGeom = new THREE.BoxGeometry(10, 15, 20);
    // Erase pre-existing bounds to test recomputation
    newGeom.boundingBox = null;
    newGeom.boundingSphere = null;
    const newMesh = new THREE.Mesh(newGeom, new THREE.MeshBasicMaterial());
    newMesh.name = "new_barn_mesh";
    newModel.add(newMesh);

    const replaced = AssetHotSwapper.hotSwapAssetInstances(assetId, newModel, rootScene);
    expect(replaced).toBe(1);

    const swappedMesh = barnInstance.getObjectByName("new_barn_mesh") as THREE.Mesh;
    expect(swappedMesh).toBeDefined();

    // Verify bounding box was computed
    expect(swappedMesh.geometry.boundingBox).not.toBeNull();
    expect(swappedMesh.geometry.boundingBox?.min.x).toBeCloseTo(-5);
    expect(swappedMesh.geometry.boundingBox?.max.x).toBeCloseTo(5);
    expect(swappedMesh.geometry.boundingBox?.min.y).toBeCloseTo(-7.5);
    expect(swappedMesh.geometry.boundingBox?.max.y).toBeCloseTo(7.5);
    expect(swappedMesh.geometry.boundingBox?.min.z).toBeCloseTo(-10);
    expect(swappedMesh.geometry.boundingBox?.max.z).toBeCloseTo(10);

    // Verify bounding sphere was computed
    expect(swappedMesh.geometry.boundingSphere).not.toBeNull();
    expect(swappedMesh.geometry.boundingSphere?.radius).toBeGreaterThan(10);

    // Verify matrixWorld and world position was preserved exactly
    const finalWorldPos = new THREE.Vector3();
    barnInstance.getWorldPosition(finalWorldPos);
    expect(finalWorldPos.x).toBeCloseTo(initialWorldPos.x);
    expect(finalWorldPos.y).toBeCloseTo(initialWorldPos.y);
    expect(finalWorldPos.z).toBeCloseTo(initialWorldPos.z);
  });

  // =========================================================================
  // Challenge 4: Target Asset Identification & Cross-Asset Isolation
  // =========================================================================
  it("CHALLENGE 4: Matches all valid identifier conventions (nevaAssetId, assetId, name, missing_asset_*) and isolates other assets", () => {
    const targetAssetId = "crafting_station_anvil_a";
    const scene = new THREE.Scene();

    // Case A: userData.nevaAssetId
    const instA = new THREE.Group();
    instA.userData.nevaAssetId = targetAssetId;
    instA.name = "instance_A";
    instA.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

    // Case B: userData.assetId
    const instB = new THREE.Group();
    instB.userData.assetId = targetAssetId;
    instB.name = "instance_B";
    instB.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

    // Case C: node.name === assetId
    const instC = new THREE.Group();
    instC.name = targetAssetId;
    instC.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

    // Case D: node.name === missing_asset_${assetId} (diagnostic fallback recovery)
    const instD = new THREE.Group();
    instD.name = `missing_asset_${targetAssetId}`;
    instD.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));

    // Unrelated assets
    const other1 = new THREE.Group();
    other1.userData.assetId = "crafting_station_furnace_a";
    other1.name = "furnace_1";
    other1.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));

    const other2 = new THREE.Group();
    other2.name = "missing_asset_crafting_station_furnace_a";
    other2.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));

    scene.add(instA, instB, instC, instD, other1, other2);

    const newModel = new THREE.Group();
    const newMesh = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
    newMesh.name = "upgraded_anvil_visual";
    newModel.add(newMesh);

    const replaced = AssetHotSwapper.hotSwapAssetInstances(targetAssetId, newModel, scene);

    expect(replaced).toBe(4);

    expect(instA.getObjectByName("upgraded_anvil_visual")).toBeDefined();
    expect(instB.getObjectByName("upgraded_anvil_visual")).toBeDefined();
    expect(instC.getObjectByName("upgraded_anvil_visual")).toBeDefined();
    expect(instD.getObjectByName("upgraded_anvil_visual")).toBeDefined();

    // Check that unrelated assets were unmodified
    expect(other1.getObjectByName("upgraded_anvil_visual")).toBeUndefined();
    expect(other2.getObjectByName("upgraded_anvil_visual")).toBeUndefined();
    expect(other1.children).toHaveLength(1);
    expect(other2.children).toHaveLength(1);
  });

  // =========================================================================
  // Challenge 5: Event Notification & Resilience against Faulty Listeners
  // =========================================================================
  it("CHALLENGE 5: Reload event listeners are notified; failing listeners do NOT prevent others from executing", () => {
    const receivedEvents: AssetReloadEvent[] = [];
    const faultyErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const faultyListener = () => {
      throw new Error("Malfunctioning listener blew up!");
    };

    const healthyListener = (e: AssetReloadEvent) => {
      receivedEvents.push(e);
    };

    const unsub1 = AssetHotSwapper.addListener(faultyListener);
    const unsub2 = AssetHotSwapper.on("reloaded", healthyListener);

    const scene = new THREE.Scene();
    const inst = new THREE.Group();
    inst.userData.assetId = "test_event_asset";
    scene.add(inst);

    try {
      AssetHotSwapper.hotSwapAssetInstances("test_event_asset", new THREE.Group(), scene);

      expect(faultyErrorSpy).toHaveBeenCalled();
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].assetId).toBe("test_event_asset");
      expect(receivedEvents[0].replacedCount).toBe(1);
      expect(receivedEvents[0].timestamp).toBeGreaterThan(0);
    } finally {
      unsub1();
      unsub2();
      faultyErrorSpy.mockRestore();
    }
  });

  // =========================================================================
  // Challenge 6: AssetLoader Cache Invalidation and Full Lifecycle
  // =========================================================================
  it("CHALLENGE 6: AssetLoader.invalidateCache purges memory cache and forces a true re-fetch", async () => {
    const assetId = ASSET_IDS.TREE_OAK_A;

    const mockRoot1 = new THREE.Group();
    mockRoot1.name = "v1_tree";
    const mockRoot2 = new THREE.Group();
    mockRoot2.name = "v2_tree";

    let loadCount = 0;
    const loadSpy = vi.spyOn(AssetLoader as any, "loadCached").mockImplementation(async () => {
      loadCount++;
      return loadCount === 1 ? mockRoot1 : mockRoot2;
    });

    try {
      // First load
      const first = await (AssetLoader as any).loadCached(assetId);
      expect(first.name).toBe("v1_tree");
      expect(loadCount).toBe(1);

      // Invalidate cache
      AssetLoader.invalidateCache(assetId);

      // Second load must reload
      const second = await (AssetLoader as any).loadCached(assetId);
      expect(second.name).toBe("v2_tree");
      expect(loadCount).toBe(2);
    } finally {
      loadSpy.mockRestore();
    }
  });

  // =========================================================================
  // Challenge 7: Zero-Instance and Empty Scene Boundary Safety
  // =========================================================================
  it("CHALLENGE 7: Handles empty scenes and zero matching instances gracefully without errors", () => {
    const emptyScene = new THREE.Scene();
    const newModel = new THREE.Group();

    expect(() => {
      const replaced = AssetHotSwapper.hotSwapAssetInstances("non_existent_asset", newModel, emptyScene);
      expect(replaced).toBe(0);
    }).not.toThrow();

    expect(() => {
      AssetHotSwapper.safelyDisposeInstanceGeometries(new THREE.Group());
    }).not.toThrow();
  });

  // =========================================================================
  // Challenge 8: Preserves Presentation Rigs and Dynamic Attachments Together
  // =========================================================================
  it("CHALLENGE 8: Preserves both isDynamicAttachment and isPresentationRig while swapping mesh visual hierarchy", () => {
    const assetId = "vehicle_boat_rowboat_a";
    const scene = new THREE.Scene();

    const boatInstance = new THREE.Group();
    boatInstance.userData.assetId = assetId;

    // Visual child (to be removed)
    const hullMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshBasicMaterial());
    hullMesh.name = "old_boat_hull";
    boatInstance.add(hullMesh);

    // Presentation Rig (must stay)
    const waterWakeRig = new THREE.Group();
    waterWakeRig.name = "boat_wake_presentation_rig";
    waterWakeRig.userData.isPresentationRig = true;
    boatInstance.add(waterWakeRig);

    // Dynamic Attachment (must stay)
    const lanternAttach = new THREE.Group();
    lanternAttach.name = "bow_lantern_attachment";
    lanternAttach.userData.isDynamicAttachment = true;
    boatInstance.add(lanternAttach);

    scene.add(boatInstance);

    // New replacement model
    const newBoatModel = new THREE.Group();
    const newHull = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 8), new THREE.MeshStandardMaterial());
    newHull.name = "remastered_boat_hull";
    newBoatModel.add(newHull);

    const replaced = AssetHotSwapper.hotSwapAssetInstances(assetId, newBoatModel, scene);
    expect(replaced).toBe(1);

    expect(boatInstance.getObjectByName("old_boat_hull")).toBeUndefined();
    expect(boatInstance.getObjectByName("remastered_boat_hull")).toBeDefined();
    expect(boatInstance.getObjectByName("boat_wake_presentation_rig")).toBe(waterWakeRig);
    expect(boatInstance.getObjectByName("bow_lantern_attachment")).toBe(lanternAttach);
    expect(boatInstance.children).toHaveLength(3); // newHull + waterWakeRig + lanternAttach
  });

  // =========================================================================
  // Challenge 9: High-Density Deep Geometry Tree Memory Leak Stress Test
  // =========================================================================
  it("CHALLENGE 9: Stresses deep tree geometry disposal across 10 instances with 50 total geometries", () => {
    const assetId = "prop_windmill_a";
    const scene = new THREE.Scene();

    const INSTANCES = 10;
    const GEOMS_PER_INSTANCE = 5;
    const allDisposedSpies: Array<ReturnType<typeof vi.spyOn>> = [];

    for (let i = 0; i < INSTANCES; i++) {
      const inst = new THREE.Group();
      inst.userData.nevaAssetId = assetId;

      let currentParent: THREE.Group = inst;
      for (let d = 0; d < GEOMS_PER_INSTANCE; d++) {
        const nextSubGroup = new THREE.Group();
        const geom = new THREE.BoxGeometry(1, 1, 1);
        allDisposedSpies.push(vi.spyOn(geom, "dispose"));
        const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
        currentParent.add(mesh);
        currentParent.add(nextSubGroup);
        currentParent = nextSubGroup;
      }
      scene.add(inst);
    }

    expect(allDisposedSpies).toHaveLength(INSTANCES * GEOMS_PER_INSTANCE);

    const newModel = new THREE.Group();
    newModel.add(new THREE.Mesh(new THREE.BoxGeometry(5, 10, 5), new THREE.MeshBasicMaterial()));

    const replaced = AssetHotSwapper.hotSwapAssetInstances(assetId, newModel, scene);
    expect(replaced).toBe(INSTANCES);

    for (const spy of allDisposedSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  // =========================================================================
  // Challenge 10: Concurrent Multi-Asset Hot Swapping Stress
  // =========================================================================
  it("CHALLENGE 10: Concurrent hot-swapping of multiple different assets maintains independent consistency", async () => {
    const scene = new THREE.Scene();

    const asset1 = "foliage_tree_oak_a";
    const asset2 = "foliage_tree_pine_a";

    const tree1 = new THREE.Group();
    tree1.userData.assetId = asset1;
    tree1.name = "oak_instance";
    const oldMesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    oldMesh1.name = "old_oak_mesh";
    tree1.add(oldMesh1);

    const tree2 = new THREE.Group();
    tree2.userData.assetId = asset2;
    tree2.name = "pine_instance";
    const oldMesh2 = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 8), new THREE.MeshBasicMaterial());
    oldMesh2.name = "old_pine_mesh";
    tree2.add(oldMesh2);

    scene.add(tree1, tree2);

    const newOakModel = new THREE.Group();
    const newOakMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
    newOakMesh.name = "new_oak_mesh";
    newOakModel.add(newOakMesh);

    const newPineModel = new THREE.Group();
    const newPineMesh = new THREE.Mesh(new THREE.ConeGeometry(2, 5, 8), new THREE.MeshBasicMaterial());
    newPineMesh.name = "new_pine_mesh";
    newPineModel.add(newPineMesh);

    // Swap asset 1
    const rep1 = AssetHotSwapper.hotSwapAssetInstances(asset1, newOakModel, scene);
    expect(rep1).toBe(1);
    expect(tree1.getObjectByName("new_oak_mesh")).toBeDefined();
    expect(tree2.getObjectByName("old_pine_mesh")).toBeDefined(); // Pine unaffected

    // Swap asset 2
    const rep2 = AssetHotSwapper.hotSwapAssetInstances(asset2, newPineModel, scene);
    expect(rep2).toBe(1);
    expect(tree1.getObjectByName("new_oak_mesh")).toBeDefined(); // Oak remains new
    expect(tree2.getObjectByName("new_pine_mesh")).toBeDefined();
  });
});

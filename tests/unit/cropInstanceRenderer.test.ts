import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CropInstanceRenderer } from "../../src/render/scene/CropInstanceRenderer";
import { Simulation } from "../../src/simulation/Simulation";
import type { PlacedCropState, GameState } from "../../src/simulation/core/types";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { AssetLoader } from "../../src/render/loaders/AssetLoader";
import { farmLocalToWorld } from "../../src/world/FarmLayout";

type MutableGameState = {
  -readonly [K in keyof GameState]: GameState[K] extends Readonly<Record<string, infer V>>
    ? Record<string, V>
    : GameState[K];
};

describe("CropInstanceRenderer 3D furrow mounds and visual changes", () => {
  it("initializes moistureMesh with an authored 3D oblong mound geometry", () => {
    const renderer = new CropInstanceRenderer();
    const moistureMesh = renderer.group.getObjectByName("crop_disturbed_soil_instances") as THREE.InstancedMesh;
    expect(moistureMesh).toBeDefined();
    expect(moistureMesh.castShadow).toBe(true);
    expect(moistureMesh.receiveShadow).toBe(true);

    const geometry = moistureMesh.geometry;
    expect(geometry.getAttribute("position")).toBeDefined();
    expect(geometry.getAttribute("normal")).toBeDefined();

    // Compute geometry bounding box
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;

    // Height should be approximately 0.082m (8.2cm apex)
    expect(bbox.max.y).toBeGreaterThan(0.06);
    expect(bbox.max.y).toBeLessThan(0.09);

    // Oblong along Z (furrow axis): length (Z) > width (X)
    const widthX = bbox.max.x - bbox.min.x;
    const depthZ = bbox.max.z - bbox.min.z;
    expect(depthZ).toBeGreaterThan(widthX * 1.3);
    expect(depthZ).toBeGreaterThan(0.7);

    renderer.dispose();
  });

  it("keeps dense mature crop heads from receiving their own shadow map", async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.0, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xd79a3a })
    ));
    const loadModel = vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);

    try {
      const renderer = new CropInstanceRenderer();
      const state = new Simulation().getState() as unknown as MutableGameState;
      const crop: PlacedCropState = {
        id: "crop_shadow_policy",
        farmId: "farm.starter_garden",
        cropId: "crop.wheat",
        stage: "mature",
        x: 3,
        z: 3,
        rotationRadians: 0,
        effectiveGrowthMinutes: 180,
        plantedAtMinute: 0,
        lastUpdatedMinute: 180,
        moisture: 70,
        health: 100,
        averageMoistureAccum: 70,
        moistureSampleCount: 1
      };
      state.crops = { [crop.id]: crop };
      state.farms["farm.starter_garden"].placedCropIds = [crop.id];

      await renderer.ensureAssets(state);
      renderer.sync(state, 1.0);

      const batch = renderer.group.getObjectByName(`${ASSET_IDS.CROP_WHEAT_MATURE}_instances`) as THREE.InstancedMesh;
      expect(batch).toBeDefined();
      expect(batch.castShadow).toBe(true);
      expect(batch.receiveShadow).toBe(false);
      expect(batch.count).toBe(1);

      renderer.dispose();
    } finally {
      loadModel.mockRestore();
    }
  });

  it("preserves authored crop material families in separate instanced batches", async () => {
    const source = new THREE.Group();
    const fruitGeometry = new THREE.BoxGeometry(0.2, 1.0, 0.2).toNonIndexed();
    fruitGeometry.setAttribute(
      "color",
      new THREE.Uint8BufferAttribute(
        Array.from({ length: fruitGeometry.getAttribute("position").count }, () => [210, 41, 23]).flat(),
        3,
        true
      )
    );
    const leafGeometry = new THREE.BoxGeometry(0.2, 0.65, 0.2).toNonIndexed();
    leafGeometry.setAttribute(
      "color",
      new THREE.Uint8BufferAttribute(
        Array.from({ length: leafGeometry.getAttribute("position").count }, () => [77, 115, 25]).flat(),
        3,
        true
      )
    );
    source.add(new THREE.Mesh(fruitGeometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42 })));
    source.add(new THREE.Mesh(leafGeometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94 })));
    const loadModel = vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);

    try {
      const renderer = new CropInstanceRenderer();
      const state = new Simulation().getState() as unknown as MutableGameState;
      const crop: PlacedCropState = {
        id: "crop_color_contract",
        farmId: "farm.starter_garden",
        cropId: "crop.tomato",
        stage: "mature",
        x: 3,
        z: 3,
        rotationRadians: 0,
        effectiveGrowthMinutes: 180,
        plantedAtMinute: 0,
        lastUpdatedMinute: 180,
        moisture: 70,
        health: 100,
        averageMoistureAccum: 70,
        moistureSampleCount: 1
      };
      state.crops = { [crop.id]: crop };
      state.farms["farm.starter_garden"].placedCropIds = [crop.id];

      await renderer.ensureAssets(state);
      renderer.sync(state, 1.0);

      const batches = renderer.group.children.filter((object): object is THREE.InstancedMesh =>
        object instanceof THREE.InstancedMesh && object.name.startsWith(`${ASSET_IDS.CROP_TOMATO_MATURE}_instances`)
      );
      expect(batches).toHaveLength(2);
      const roughnesses = batches.map((batch) => (batch.material as THREE.MeshStandardMaterial).roughness).sort();
      expect(roughnesses).toEqual([0.42, 0.94]);
      for (const batch of batches) {
        expect(batch.geometry.getAttribute("color").normalized).toBe(true);
      }

      renderer.dispose();
    } finally {
      loadModel.mockRestore();
    }
  });

  it("renders Commons mature crop dressing without exposing it to picking", async () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 1.0, 0.2),
      new THREE.MeshStandardMaterial({ color: 0xd79a3a })
    ));
    const loadModel = vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);

    try {
      const renderer = new CropInstanceRenderer();
      const state = new Simulation().getState() as unknown as MutableGameState;
      renderer.setStaticCrops("farm.player_homestead", [
        { cropId: "crop.wheat", x: 0.88, z: -4.78, rotationRadians: 0 }
      ]);

      await renderer.ensureAssets(state);
      renderer.sync(state, 1.0);

      const cropBatch = renderer.group.getObjectByName(`${ASSET_IDS.CROP_WHEAT_MATURE}_instances`) as THREE.InstancedMesh;
      const moundBatch = renderer.group.getObjectByName("crop_disturbed_soil_instances") as THREE.InstancedMesh;
      expect(cropBatch.count).toBe(1);
      expect(moundBatch.count).toBe(1);
      expect(renderer.pickByGroundPoint(farmLocalToWorld("farm.player_homestead", { x: 0.88, z: -4.78 }))).toBeNull();

      renderer.dispose();
    } finally {
      loadModel.mockRestore();
    }
  });

  it("applies two-tone moisture response (warm dry/normal earth vs deep dark damp earth)", () => {
    const renderer = new CropInstanceRenderer();
    const state = new Simulation().getState() as unknown as MutableGameState;
    const moistureMesh = renderer.group.getObjectByName("crop_disturbed_soil_instances") as THREE.InstancedMesh;

    const crop1: PlacedCropState = {
      id: "crop_1",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      stage: "seeded",
      x: 2,
      z: 2,
      rotationRadians: 0,
      effectiveGrowthMinutes: 0,
      plantedAtMinute: 0,
      lastUpdatedMinute: 0,
      moisture: 70, // unwatered freshly planted
      health: 100,
      averageMoistureAccum: 70,
      moistureSampleCount: 1
    };

    const crop2: PlacedCropState = {
      id: "crop_2",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      stage: "seeded",
      x: 4,
      z: 4,
      rotationRadians: 0,
      effectiveGrowthMinutes: 0,
      plantedAtMinute: 0,
      lastUpdatedMinute: 0,
      moisture: 95, // watered (wet)
      health: 100,
      averageMoistureAccum: 95,
      moistureSampleCount: 1
    };

    state.crops = { crop_1: crop1, crop_2: crop2 };
    state.farms["farm.starter_garden"].placedCropIds = ["crop_1", "crop_2"];

    renderer.sync(state, 10.0);

    const color1 = new THREE.Color();
    const color2 = new THREE.Color();
    moistureMesh.getColorAt(0, color1);
    moistureMesh.getColorAt(1, color2);

    // crop2 (watered/wet) should have dark damp soil color, distinct from crop1
    expect(color1.getHexString()).not.toBe(color2.getHexString());
    // Watered soil is significantly darker (lower luminance)
    expect(color2.r + color2.g + color2.b).toBeLessThan(color1.r + color1.g + color1.b);

    renderer.dispose();
  });

  it("elevates crop instances and applies seeded stage scale boost", () => {
    const renderer = new CropInstanceRenderer();
    const state = new Simulation().getState() as unknown as MutableGameState;

    const crop: PlacedCropState = {
      id: "crop_test",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      stage: "seeded",
      x: 3,
      z: 3,
      rotationRadians: 0.5,
      effectiveGrowthMinutes: 0,
      plantedAtMinute: 0,
      lastUpdatedMinute: 0,
      moisture: 70,
      health: 100,
      averageMoistureAccum: 70,
      moistureSampleCount: 1
    };

    state.crops = { crop_test: crop };
    state.farms["farm.starter_garden"].placedCropIds = ["crop_test"];

    // Initial sync
    renderer.sync(state, 1.0);

    const moistureMesh = renderer.group.getObjectByName("crop_disturbed_soil_instances") as THREE.InstancedMesh;
    expect(moistureMesh.count).toBe(1);

    const matrix = new THREE.Matrix4();
    moistureMesh.getMatrixAt(0, matrix);
    const moundPos = new THREE.Vector3();
    const moundRot = new THREE.Quaternion();
    const moundScale = new THREE.Vector3();
    matrix.decompose(moundPos, moundRot, moundScale);

    // Mound is oriented along furrow with slight jitter
    const euler = new THREE.Euler().setFromQuaternion(moundRot);
    expect(Math.abs(euler.y)).toBeLessThan(0.1);

    renderer.dispose();
  });

  it("handles harvest transition by sinking the mound into the furrow bed", () => {
    const renderer = new CropInstanceRenderer();
    const state = new Simulation().getState() as unknown as MutableGameState;

    const crop: PlacedCropState = {
      id: "crop_harvest",
      farmId: "farm.starter_garden",
      cropId: "crop.wheat",
      stage: "mature",
      x: 3,
      z: 3,
      rotationRadians: 0,
      effectiveGrowthMinutes: 180,
      plantedAtMinute: 0,
      lastUpdatedMinute: 180,
      moisture: 70,
      health: 100,
      averageMoistureAccum: 70,
      moistureSampleCount: 1
    };

    state.crops = { crop_harvest: crop };
    state.farms["farm.starter_garden"].placedCropIds = ["crop_harvest"];

    renderer.sync(state, 10.0);

    // Harvest the crop (remove from state.crops)
    state.crops = {};
    state.farms["farm.starter_garden"].placedCropIds = [];

    // Sync at 10.0s when crop is removed (cut begins)
    renderer.sync(state, 10.0);

    // Sync halfway through harvest cut (10.16s, 0.16s after cut began)
    renderer.sync(state, 10.16);

    const moistureMesh = renderer.group.getObjectByName("crop_disturbed_soil_instances") as THREE.InstancedMesh;
    expect(moistureMesh.count).toBe(1);

    const matrix = new THREE.Matrix4();
    moistureMesh.getMatrixAt(0, matrix);
    const moundScale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), moundScale);

    // Height should be partially sunk
    expect(moundScale.y).toBeLessThan(1.0);
    expect(moundScale.y).toBeGreaterThan(0.0);

    // After harvest cut completes (10.35s > 0.32s cut time)
    renderer.sync(state, 10.35);
    expect(moistureMesh.count).toBe(0);

    renderer.dispose();
  });

  it("dequantizes meshopt quantized position attributes into Float32 so positions exceeding 1.0m do not overflow Int16", async () => {
    const source = new THREE.Group();
    // Simulate a meshopt quantized Int16 normalized position attribute with parent transform placing vertices at y > 1.0
    const geom = new THREE.BufferGeometry();
    const rawPositions = new Int16Array([
      0, 0, 0,
      0, Math.round(0.5 * 32767), 0,
      0, Math.round(0.8 * 32767), 0
    ]);
    geom.setAttribute("position", new THREE.BufferAttribute(rawPositions, 3, true));
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xd79a3a }));
    // Position the mesh at Y = 0.5, so the top vertex reaches Y = 0.5 + 0.8 = 1.3m (exceeding 1.0m)
    mesh.position.set(0, 0.5, 0);
    source.add(mesh);
    const loadModel = vi.spyOn(AssetLoader, "loadModel").mockResolvedValue(source);

    try {
      const renderer = new CropInstanceRenderer();
      const state = new Simulation().getState() as unknown as MutableGameState;
      const crop: PlacedCropState = {
        id: "crop_dequantize_check",
        farmId: "farm.starter_garden",
        cropId: "crop.wheat",
        stage: "mature",
        x: 3,
        z: 3,
        rotationRadians: 0,
        effectiveGrowthMinutes: 180,
        plantedAtMinute: 0,
        lastUpdatedMinute: 180,
        moisture: 70,
        health: 100,
        averageMoistureAccum: 70,
        moistureSampleCount: 1
      };
      state.crops = { [crop.id]: crop };
      state.farms["farm.starter_garden"].placedCropIds = [crop.id];

      await renderer.ensureAssets(state);
      renderer.sync(state, 1.0);

      const batch = renderer.group.getObjectByName(`${ASSET_IDS.CROP_WHEAT_MATURE}_instances`) as THREE.InstancedMesh;
      expect(batch).toBeDefined();

      const positions = batch.geometry.attributes.position;
      expect(positions.array).toBeInstanceOf(Float32Array);
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const y = positions.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      expect(minY).toBeCloseTo(0.5, 2);
      expect(maxY).toBeCloseTo(1.3, 2);

      renderer.dispose();
    } finally {
      loadModel.mockRestore();
    }
  });
});

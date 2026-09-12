import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CropInstanceRenderer } from "../../src/render/scene/CropInstanceRenderer";
import { Simulation } from "../../src/simulation/Simulation";
import type { PlacedCropState, GameState } from "../../src/simulation/core/types";

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
});

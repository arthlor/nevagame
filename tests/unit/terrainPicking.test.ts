import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { prepareTerrainPicking, TerrainPicker } from "../../src/render/scene/TerrainPicking";
import { createSpatialSurfaceBatch } from "../../src/render/scene/spatialSurfaceBatch";

function surface(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(12, 12, 20, 20).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    position.setY(i, position.getX(i) * 0.07 + Math.sin(position.getZ(i)) * 0.2);
  }
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
}

function cameraAt(x = 0, z = 0): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(x, 20, z + 4);
  camera.lookAt(x, 0, z);
  camera.updateMatrixWorld(true);
  return camera;
}

function nativePoint(meshes: THREE.Mesh[], camera: THREE.Camera, ndc = { x: 0, y: 0 }): THREE.Vector3 | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return raycaster.intersectObjects(meshes, false)[0]?.point ?? null;
}

function expectPoint(actual: { x: number; y: number; z: number } | null, expected: THREE.Vector3 | null): void {
  if (!expected) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  for (const axis of ["x", "y", "z"] as const) expect(actual![axis]).toBeCloseTo(expected[axis], 7);
}

describe("terrain picking", () => {
  it("retains exact sloped-surface hits and collision indices under world transforms", () => {
    const mesh = surface();
    mesh.position.set(15, 2, -8);
    mesh.rotation.y = 0.3;
    mesh.scale.set(1.2, 0.8, 1.1);
    mesh.updateMatrixWorld(true);
    const camera = cameraAt(15, -8);
    const pointer = { x: 0.12, y: -0.08 };
    const expected = nativePoint([mesh], camera, pointer);
    const indices = Array.from(mesh.geometry.index!.array);
    const nativeRaycast = THREE.Mesh.prototype.raycast;
    prepareTerrainPicking(mesh);
    expectPoint(new TerrainPicker().pick([mesh], camera, pointer), expected);
    expect(Array.from(mesh.geometry.index!.array)).toEqual(indices);
    expect(THREE.Mesh.prototype.raycast).toBe(nativeRaycast);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });

  it("picks the same point in production surface batches, including cell boundaries", () => {
    const source = surface();
    const batch = createSpatialSurfaceBatch(source.geometry, source.material as THREE.Material, 3);
    batch.position.set(10, 1, -5);
    batch.updateMatrixWorld(true);
    const samples = [10, 12.9, 13].map(x => {
      const camera = cameraAt(x, -5);
      return { camera, expected: nativePoint([batch], camera) };
    });
    const indices = Array.from(batch.geometry.index!.array);
    prepareTerrainPicking(batch);
    const picker = new TerrainPicker();
    for (const { camera, expected } of samples) expectPoint(picker.pick([batch], camera, { x: 0, y: 0 }), expected);
    expect(Array.from(batch.geometry.index!.array)).toEqual(indices);
    batch.dispose();
    source.geometry.dispose();
    (source.material as THREE.Material).dispose();
  });

  it("takes the nearest overlapping surface and refreshes after pointer or camera changes", () => {
    const lower = surface();
    const upper = surface();
    upper.position.y = 3;
    lower.updateMatrixWorld(true);
    upper.updateMatrixWorld(true);
    const camera = cameraAt();
    const pointers = [{ x: 0, y: 0 }, { x: 0.15, y: 0.1 }, { x: 1, y: 1 }];
    const expected = pointers.map(pointer => nativePoint([lower, upper], camera, pointer));
    prepareTerrainPicking(lower);
    prepareTerrainPicking(upper);
    const picker = new TerrainPicker();
    for (const [i, pointer] of pointers.entries()) expectPoint(picker.pick([lower, upper], camera, pointer), expected[i]);
    expect(picker.pick([lower, upper], cameraAt(50), { x: 0, y: 0 })).toBeNull();
    expectPoint(picker.pick([lower, upper], camera, pointers[0]), expected[0]);
    expect(picker.pick([], camera, pointers[0])).toBeNull();
    for (const mesh of [lower, upper]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });

  it("releases the spatial index with its scene-owned geometry", () => {
    const mesh = surface();
    prepareTerrainPicking(mesh);
    expect(mesh.geometry.boundsTree).toBeDefined();
    mesh.geometry.dispose();
    expect(mesh.geometry.boundsTree).toBeUndefined();
    (mesh.material as THREE.Material).dispose();
  });
});

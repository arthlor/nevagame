import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { createSpatialSurfaceBatch } from "../../src/render/scene/spatialSurfaceBatch";
import { WorldLayout } from "../../src/world/WorldLayout";

function triangles(geometry: THREE.BufferGeometry): string[] {
  const attributes = Object.entries(geometry.attributes);
  const result: string[] = [];
  const count = Math.min(geometry.index?.count ?? geometry.getAttribute("position").count,
    geometry.drawRange.start + geometry.drawRange.count);
  for (let offset = geometry.drawRange.start; offset < count; offset += 3) {
    const values: number[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = geometry.index?.getX(offset + corner) ?? offset + corner;
      for (const [, attribute] of attributes) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          values.push(attribute.array[vertex * attribute.itemSize + component]);
        }
      }
    }
    result.push(values.join(","));
  }
  return result.sort();
}

describe("spatial surface batching", () => {
  it.each([true, false])("preserves every triangle and raw shader attribute (indexed=%s)", (indexed) => {
    const plane = new THREE.PlaneGeometry(90, 90, 9, 9).rotateX(-Math.PI / 2);
    const source = indexed ? plane : plane.toNonIndexed();
    const colors = new Uint8Array(source.getAttribute("position").count * 4);
    colors.forEach((_, index) => { colors[index] = index % 256; });
    source.setAttribute("color", new THREE.BufferAttribute(colors, 4, true));
    source.setAttribute("terrainGreenMask", source.getAttribute("position").clone());
    const before = triangles(source);
    const material = new THREE.MeshStandardMaterial();
    const batch = createSpatialSurfaceBatch(source, material, 20);
    expect(batch.instanceCount).toBeGreaterThan(1);
    expect(batch.material).toBe(material);
    expect(triangles(batch.geometry)).toEqual(before);
    expect(triangles(source)).toEqual(before);
    expect(batch.geometry.getAttribute("color").normalized).toBe(true);
    expect(batch.geometry.getAttribute("color").array).toBeInstanceOf(Uint8Array);
    const matrix = new THREE.Matrix4();
    for (let instance = 0; instance < batch.instanceCount; instance += 1) {
      expect(batch.getMatrixAt(instance, matrix)).toEqual(new THREE.Matrix4());
    }
    batch.dispose();
    source.dispose();
    plane.dispose();
    material.dispose();
  });

  it("keeps complete triangles across cell boundaries and respects draw ranges", () => {
    const source = new THREE.BufferGeometry();
    source.setAttribute("position", new THREE.Float32BufferAttribute([
      -100, 0, -100, 0, 0, 100, 100, 0, -100,
      190, 0, -10, 200, 0, 10, 210, 0, -10
    ], 3));
    source.setDrawRange(0, 3);
    const material = new THREE.MeshBasicMaterial();
    const batch = createSpatialSurfaceBatch(source, material, 20);
    expect(triangles(batch.geometry)).toEqual(triangles(source));
    const bounds = batch.getBoundingBoxAt(0, new THREE.Box3())!;
    expect(bounds.min.toArray()).toEqual([-100, 0, -100]);
    expect(bounds.max.toArray()).toEqual([100, 0, 100]);
    batch.dispose();
    source.dispose();
    material.dispose();
  });

  it("culls cells using the current pass camera without changing membership", () => {
    const source = new THREE.PlaneGeometry(600, 600, 60, 60).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial();
    const batch = createSpatialSurfaceBatch(source, material, 40);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem } as THREE.WebGLRenderer;
    batch.onBeforeRender(renderer, new THREE.Scene(), camera, batch.geometry, material, null as never);
    const runtime = batch as unknown as { _multiDrawCount: number; _multiDrawCounts: Int32Array };
    const visibleIndices = Array.from(runtime._multiDrawCounts).slice(0, runtime._multiDrawCount)
      .reduce((sum, count) => sum + count, 0);
    expect(visibleIndices).toBeGreaterThan(0);
    expect(visibleIndices).toBeLessThan(source.index!.count / 2);
    const shadowCamera = new THREE.OrthographicCamera(-400, 400, 400, -400, 0.1, 1000);
    shadowCamera.position.set(0, 500, 0);
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateMatrixWorld(true);
    batch.onBeforeShadow(renderer, new THREE.Scene(), camera, shadowCamera, batch.geometry, material, null as never);
    expect(runtime._multiDrawCount).toBe(batch.instanceCount);
    for (let instance = 0; instance < batch.instanceCount; instance += 1) {
      expect(batch.getVisibleAt(instance)).toBe(true);
    }
    batch.dispose();
    source.dispose();
    material.dispose();
  });

  it.each(WorldLayout.terrainPatches().map((patch) => [patch.id, patch] as const))(
    "preserves live terrain raycasts and index counts for %s",
    (_, patch) => {
      const source = WorldLayout.buildTerrainGeometry(patch.id);
      const material = new THREE.MeshBasicMaterial();
      const original = new THREE.Mesh(source, material);
      const batch = createSpatialSurfaceBatch(source, material, 80);
      original.position.set(patch.center.x, 0, patch.center.z);
      batch.position.copy(original.position);
      original.updateMatrixWorld(true);
      batch.updateMatrixWorld(true);
      expect(batch.geometry.index!.count).toBe(source.index?.count ?? source.getAttribute("position").count);
      for (const offsetX of [-100, -20, 0, 45, 120]) {
        for (const offsetZ of [-100, -10, 0, 36, 120]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(patch.center.x + offsetX + 0.31, 300, patch.center.z + offsetZ + 0.27),
            new THREE.Vector3(0, -1, 0)
          );
          const expected = ray.intersectObject(original)[0];
          const actual = ray.intersectObject(batch)[0];
          expect(expected).toBeDefined();
          expect(actual?.point.distanceTo(expected.point)).toBeLessThan(1e-6);
          expect(actual?.face?.normal.distanceTo(expected.face!.normal)).toBeLessThan(1e-6);
        }
      }
      batch.dispose();
      source.dispose();
      material.dispose();
    }
  );

  it("releases batching resources without disposing the shared material or source", () => {
    const source = new THREE.PlaneGeometry(20, 20).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial();
    const sourceDispose = vi.spyOn(source, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const batch = createSpatialSurfaceBatch(source, material, 10);
    const geometryDispose = vi.spyOn(batch.geometry, "dispose");
    batch.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    source.dispose();
    material.dispose();
  });

  it("retains the complete live road ribbon and its shader attributes", () => {
    const source = WorldLayout.buildPathGeometry();
    const material = new THREE.MeshStandardMaterial();
    const batch = createSpatialSurfaceBatch(source, material, 80);
    expect(batch.instanceCount).toBeGreaterThan(1);
    expect(batch.geometry.index!.count).toBe(source.index?.count ?? source.getAttribute("position").count);
    expect(Object.keys(batch.geometry.attributes)).toEqual(Object.keys(source.attributes));
    for (const [name, attribute] of Object.entries(source.attributes)) {
      expect(batch.geometry.getAttribute(name).itemSize).toBe(attribute.itemSize);
      expect(batch.geometry.getAttribute(name).normalized).toBe(attribute.normalized);
    }
    batch.dispose();
    source.dispose();
    material.dispose();
  }, 120_000);
});

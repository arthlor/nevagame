import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWaterGeometry } from "../../src/render/water/FacetedWater";
import { tileWaterGeometry } from "../../src/render/water/waterSurfaceTiles";

function triangles(geometry: THREE.BufferGeometry): string[] {
  const result: string[] = [];
  const index = geometry.index!;
  for (let offset = 0; offset < index.count; offset += 3) {
    const values: number[] = [];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = index.getX(offset + corner);
      for (const attribute of Object.values(geometry.attributes)) {
        for (let component = 0; component < attribute.itemSize; component += 1) {
          values.push(attribute.array[vertex * attribute.itemSize + component]);
        }
      }
    }
    result.push(values.join(","));
  }
  return result.sort();
}

describe("water surface spatial culling", () => {
  it.each([[500, 200], [-30, -133]])("preserves every triangle and wave-lattice attribute at %s,%s", (x, z) => {
    const source = createWaterGeometry(420, 320, 84, 64, x, z);
    const tiles = tileWaterGeometry(source, 96);
    try {
      expect(tiles.length).toBeGreaterThan(8);
      expect(tiles.flatMap(triangles).sort()).toEqual(triangles(source));
      const size = new THREE.Vector3();
      for (const tile of tiles) {
        tile.boundingBox!.getSize(size);
        expect(size.x).toBeLessThanOrEqual(96.001);
        expect(size.z).toBeLessThanOrEqual(96.001);
        expect(tile.boundingBox!.min.y).toBe(source.boundingBox!.min.y);
        expect(tile.boundingBox!.max.y).toBe(source.boundingBox!.max.y);
      }
    } finally {
      source.dispose();
      tiles.forEach((tile) => tile.dispose());
    }
  });

  it("rejects most expanded ocean triangles outside a gameplay camera while retaining visible water", () => {
    const source = createWaterGeometry(2900, 2100, 557, 403, 350, 0);
    const tiles = tileWaterGeometry(source, 192);
    try {
      const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 900);
      camera.position.set(-395, 25, 100);
      camera.lookAt(-395, 0, 55);
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      let visibleTriangles = 0;
      for (const tile of tiles) {
        const sphere = tile.boundingSphere!.clone();
        sphere.center.x += 350;
        if (frustum.intersectsSphere(sphere)) visibleTriangles += tile.index!.count / 3;
      }
      expect(visibleTriangles).toBeGreaterThan(0);
      expect(visibleTriangles).toBeLessThan(source.index!.count / 3 * 0.25);
    } finally {
      source.dispose();
      tiles.forEach((tile) => tile.dispose());
    }
  });
});

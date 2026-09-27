import { describe, expect, it } from "vitest";
import * as THREE from "three";
import catalog from "../../assets/specs/asset-catalog.json";
import { buildAuthoredModel } from "../../tools/authored/pipeline/build";
import type { CatalogAssetSpec } from "../../tools/authored/kit";

describe("authored working dock contact geometry", () => {
  it("puts the generated plank and stair surfaces on the canonical collision tops", () => {
    for (const id of ["dock_straight_a", "dock_harbor_coastal_a", "dock_harbor_main_a"]) {
      const spec = catalog.assets.find(asset => asset.id === id) as CatalogAssetSpec;
      const { root } = buildAuthoredModel(spec); root.updateMatrixWorld(true);
      const half = Number(spec.parameters.length) / 2;
      for (const [x, top] of [[-.8 * half + .1, 2.68], [.1, 2.68], [.8 * half + .1, 2.68],
        ...Array.from({ length: 5 }, (_, i) => [half + .16 + i * .34, 2.61 - i * .18])]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, top + .05, 0), new THREE.Vector3(0, -1, 0), 0, .12);
        expect(ray.intersectObject(root, true)[0]?.point.y, `${id}/${x}`).toBeCloseTo(top, 3);
      }
    }
  });

});

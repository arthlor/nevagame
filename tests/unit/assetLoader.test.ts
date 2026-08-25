import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { configureRuntimeLod } from "../../src/render/loaders/AssetLoader";

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
});

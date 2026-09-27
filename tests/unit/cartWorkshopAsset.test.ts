import * as THREE from "three";
import { describe, expect, it } from "vitest";
import catalog from "../../assets/specs/asset-catalog.json";
import { buildAuthoredModel } from "../../tools/authored/pipeline/build";
import type { CatalogAssetSpec } from "../../tools/authored/kit";

const spec = catalog.assets.find(asset => asset.id === "building_cart_workshop_a") as CatalogAssetSpec;

describe("authored cart workshop", () => {
  const { root } = buildAuthoredModel(spec);
  const levels = spec.lodLevels!.map(level => root.getObjectByName(level.node)!);

  it("keeps a passable shop doorway and front repair-bay approach in every LOD", () => {
    for (const level of levels) {
      for (const x of [-2.9, -2.3, -1.7, 1.4, 2.2, 3.0]) for (const y of [0.5, 1.2, 1.8]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1), 0, 3.1);
        expect(ray.intersectObject(level, true), `${level.name}: approach at ${x}, ${y}`).toHaveLength(0);
      }
    }
  });

  it("keeps the cupola open, roof solid and workbench supported across distance changes", () => {
    for (const level of levels) {
      const cupola = new THREE.Raycaster(new THREE.Vector3(-2.31, 8.12, 5), new THREE.Vector3(0, 0, -1), 0, 4);
      expect(cupola.intersectObject(level, true), level.name).toHaveLength(0);
      for (const x of [-4, -1, 2, 4.5]) {
        const roof = new THREE.Raycaster(new THREE.Vector3(x, 8, -2.8), new THREE.Vector3(0, -1, 0), 0, 5);
        expect(roof.intersectObject(level, true).length, `${level.name}: roof at ${x}`).toBeGreaterThan(0);
      }
      const top = new THREE.Raycaster(new THREE.Vector3(4.15, 1.5, 2.9), new THREE.Vector3(0, -1, 0), 0, 0.4);
      expect(top.intersectObject(level, true)[0]?.point.y, level.name).toBeCloseTo(1.195, 2);
    }
  });

  it("leaves the same shop and repair approach open in the collision contract", () => {
    for (const x of [-2.9, -2.3, -1.7, 1.4, 2.2, 3.0]) for (const z of [3.0, 3.7, 4.5, 5.2]) {
      const overlaps = spec.collisionPrimitives!.filter(box =>
        Math.abs(x - box.center[0]) < box.halfExtents[0] + 0.4 && Math.abs(z - box.center[2]) < box.halfExtents[2] + 0.4);
      expect(overlaps, `capsule approach at ${x}, ${z}`).toHaveLength(0);
    }
  });

  it("packages one surface per LOD with at most eight material draws and no textures", () => {
    const triangles: number[] = [];
    for (const level of levels) {
      const meshes: THREE.Mesh[] = [];
      level.traverse(node => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
      expect(meshes).toHaveLength(1);
      const mesh = meshes[0];
      expect(mesh.geometry.groups.length).toBeLessThanOrEqual(8);
      triangles.push(mesh.geometry.index!.count / 3);
      for (const material of mesh.material as THREE.MeshStandardMaterial[]) {
        expect(material.map).toBeNull();
        expect(material.side).toBe(THREE.FrontSide);
      }
      const bounds = new THREE.Box3().setFromObject(level);
      expect(bounds.min.y).toBeGreaterThan(-0.025);
      expect(bounds.max.y).toBeGreaterThan(10.6);
    }
    expect(triangles[0]).toBeLessThan(20000);
    expect(triangles[1]).toBeLessThan(triangles[0] * 0.55);
    expect(triangles[2]).toBeLessThan(triangles[0] * 0.3);
    for (const name of spec.requiredNodes) expect(root.getObjectByName(name), name).toBeDefined();
    root.traverse(node => {
      expect((node as THREE.Light).isLight).toBeFalsy();
      if ((node as THREE.Mesh).isMesh) (node as THREE.Mesh).geometry.dispose();
    });
  });
});

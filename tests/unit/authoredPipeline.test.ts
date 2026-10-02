import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTHORED_GENERATORS } from "../../tools/authored/generators/registry";
import { buildAuthoredAsset } from "../../tools/authored/pipeline/node-entry";
import type { CatalogAssetSpec } from "../../tools/authored/kit";
import { prepareAssetTemplate } from "../../src/render/loaders/AssetLoader";
import type { AssetId } from "../../src/render/assets/AssetCatalog";

const ROOT = path.resolve(import.meta.dirname, "../..");
const contracts = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/authored/generators/contracts.json"), "utf8")
) as Record<string, Record<string, unknown>>;
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")) as {
  assets: CatalogAssetSpec[];
};
const authoredAssets = catalog.assets.filter((asset) => Object.hasOwn(contracts, asset.generator));

afterEach(() => vi.restoreAllMocks());

function admissionFixture(change?: (mesh: THREE.Mesh) => void, lod = false): CatalogAssetSpec {
  const spec: CatalogAssetSpec = {
    id: "admission_fixture", file: "admission_fixture.glb", family: "prop", generator: "fauna_dog", seed: 1,
    dimensions: { width: 1, depth: 1, height: 1 }, palette: ["wood_warm_01"],
    budget: { trianglesMin: 10, trianglesTarget: 20, trianglesMax: 30, materialsMax: 1 },
    pivot: "ground_center", collision: "none", lod: "none", rootNode: "admission_fixture_root",
    requiredNodes: ["admission_fixture_root"], parameters: {}
  };
  if (lod) spec.lodLevels = [
    { node: "fixture_LOD0", distanceMeters: 0, triangleRatioMin: 1, triangleRatioMax: 1 },
    { node: "fixture_LOD1", distanceMeters: 20, triangleRatioMin: 0.8, triangleRatioMax: 1 }
  ];
  vi.spyOn(AUTHORED_GENERATORS, "fauna_dog").mockImplementation(() => {
    const root = new THREE.Group();
    root.name = spec.rootNode;
    const meshFor = (level: number): THREE.Mesh => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 0,1,1, 1,1,1], 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0,-.6,.8, 0,-.8,.6, .1,-.7,Math.sqrt(.5), .2,-.6,Math.sqrt(.6)], 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute([0,1,0, 1,0,1, .1,.2,.9, .8,.4,.2], 3));
      geometry.setIndex(level === 1 ? [0,1,2] : [0,1,2, 2,1,3]);
      const material = new THREE.MeshStandardMaterial({ name: "wood_warm_01", color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `fixture_mesh_${level}`;
      change?.(mesh);
      return mesh;
    };
    if (spec.lodLevels) spec.lodLevels.forEach((level, index) => {
      const group = new THREE.Group();
      group.name = level.node;
      group.add(meshFor(index));
      root.add(group);
    });
    else root.add(meshFor(0));
    return { root, clips: [] };
  });
  return spec;
}

describe("authored producer admission", () => {
  it("admits sparse double-sided RGB gradients and preserves them through runtime adoption", async () => {
    const spec = admissionFixture();
    const { glb, report } = await buildAuthoredAsset(spec);
    expect(report.triangles).toBe(2);
    expect(report.qualityStatus).toBe("below_target");
    const decoded = await new GLTFLoader().parseAsync(glb.slice().buffer, "");
    const root = prepareAssetTemplate(decoded.scene, decoded.animations, { id: spec.id as AssetId, lodLevels: null });
    const mesh = root.getObjectByName("fixture_mesh_0") as THREE.Mesh;
    expect(mesh.geometry.getAttribute("color").array).toEqual(new Float32Array([0,1,0, 1,0,1, .1,.2,.9, .8,.4,.2]));
    expect(mesh.geometry.getAttribute("normal").getY(0)).toBeCloseTo(-.6);
    expect(mesh.geometry.getAttribute("normal").getY(1)).toBeCloseTo(-.8);
    expect((mesh.material as THREE.MeshStandardMaterial).side).toBe(THREE.DoubleSide);
    expect((mesh.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
  });

  it("admits RGBA attributes and advisory lower LOD ratios", async () => {
    const spec = admissionFixture(mesh => {
      mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute([0,1,0,1, 1,0,1,.5, .1,.2,.9,0, .8,.4,.2,1], 4));
    }, true);
    const { report } = await buildAuthoredAsset(spec);
    expect(report.lodLevels[1].ratio).toBe(.5);
  });

  it.each([
    ["nonfinite RGB", (mesh: THREE.Mesh) => mesh.geometry.getAttribute("color").setX(0, NaN), /finite values/],
    ["out-of-range RGB", (mesh: THREE.Mesh) => mesh.geometry.getAttribute("color").setY(0, 1.2), /finite values/],
    ["invalid alpha", (mesh: THREE.Mesh) => mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(16).fill(-.1), 4)), /finite values/],
    ["mismatched count", (mesh: THREE.Mesh) => mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute([1,0,0], 3)), /RGB or RGBA/],
    ["invalid color layout", (mesh: THREE.Mesh) => mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Array(8).fill(.5), 2)), /RGB or RGBA/],
    ["empty geometry", (mesh: THREE.Mesh) => mesh.geometry.setIndex([]), /triangle group/],
    ["nonfinite positions", (mesh: THREE.Mesh) => mesh.geometry.getAttribute("position").setX(0, NaN), /nonfinite POSITION/],
    ["invalid normals", (mesh: THREE.Mesh) => mesh.geometry.getAttribute("normal").setXYZ(0, 0, 0, 0), /invalid NORMAL/]
  ])("rejects %s", async (_name, change, message) => {
    await expect(buildAuthoredAsset(admissionFixture(change))).rejects.toThrow(message);
  });

  it("retains the hard triangle and LOD upper limits", async () => {
    const spec = admissionFixture(undefined, true);
    await expect(buildAuthoredAsset({ ...spec, budget: { ...spec.budget, trianglesMax: 1 } })).rejects.toThrow("triangles exceeds");
    spec.lodLevels![1].triangleRatioMax = .4;
    await expect(buildAuthoredAsset(spec)).rejects.toThrow("triangle ratio 0.500 exceeds");
  });

  it("retains the hard material limit", async () => {
    const spec = admissionFixture(mesh => {
      mesh.material = [mesh.material as THREE.MeshStandardMaterial, new THREE.MeshStandardMaterial({ name: "soil_dry_01", vertexColors: true })];
      mesh.geometry.addGroup(0, 3, 0);
      mesh.geometry.addGroup(3, 3, 1);
    });
    spec.palette.push("soil_dry_01");
    await expect(buildAuthoredAsset(spec)).rejects.toThrow("2 materials exceeds 1");
  });
});

describe("authored generator registry", () => {
  it("declares a parameter contract for exactly the registered generators", () => {
    expect(Object.keys(contracts).sort()).toEqual(Object.keys(AUTHORED_GENERATORS).sort());
  });

  it("never registers a generator name as a frozen legacy family or authored GLB as well", () => {
    // Each catalog generator has exactly one producer; the CLI refuses a dual registration at load.
    // Porting a legacy family moves its name out of legacy-generators.json into the registry.
    const legacy = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/art/legacy-generators.json"), "utf8")
    ) as Record<string, unknown>;
    expect(Object.keys(legacy).length).toBeGreaterThan(50);
    for (const name of Object.keys(AUTHORED_GENERATORS)) {
      expect(Object.hasOwn(legacy, name), name).toBe(false);
      expect(name).not.toBe("authored_glb");
    }
  });

  it("has catalog assets for every authored generator", () => {
    // `cottage` lost its catalog assets when house_cottage_a/b became authored GLBs (2026-09-27).
    // The family generator is kept for now; delete it here and in the registry, `contracts.json` and
    // the tooling README together, or give it an asset again.
    const retiredFromCatalog = new Set(["cottage"]);
    const used = new Set(authoredAssets.map((asset) => asset.generator));
    for (const name of Object.keys(AUTHORED_GENERATORS)) {
      if (retiredFromCatalog.has(name)) {
        expect(used.has(name), `${name} regained a catalog asset; drop it from retiredFromCatalog`).toBe(false);
      } else {
        expect(used.has(name), name).toBe(true);
      }
    }
  });
});

describe("authored producer", () => {
  it("builds every authored catalog asset through its art contract", async () => {
    expect(authoredAssets.length).toBeGreaterThan(0);
    for (const spec of authoredAssets) {
      const { glb, report } = await buildAuthoredAsset(spec);
      expect(report.artContractStatus, spec.id).toBe("passed");
      expect(glb.byteLength, spec.id).toBeGreaterThan(1000);
      for (const token of report.paletteTokensUsed) expect(spec.palette, spec.id).toContain(token);
    }
  });

  it("is byte-for-byte deterministic", async () => {
    for (const spec of authoredAssets) {
      const first = await buildAuthoredAsset(spec);
      const second = await buildAuthoredAsset(spec);
      expect(Buffer.from(first.glb).equals(Buffer.from(second.glb)), spec.id).toBe(true);
    }
  });

  it("rejects an asset that breaks its contract", async () => {
    const dog = authoredAssets.find((asset) => asset.id === "fauna_dog_a")!;
    await expect(buildAuthoredAsset({ ...dog, palette: ["soil_dry_01"] })).rejects.toThrow("undeclared palette token");
    await expect(buildAuthoredAsset({ ...dog, requiredNodes: [...dog.requiredNodes, "fauna_dog_a_missing"] }))
      .rejects.toThrow("missing required nodes");
    await expect(buildAuthoredAsset({ ...dog, budget: { ...dog.budget, trianglesMax: 100, trianglesMin: 10 } }))
      .rejects.toThrow("triangles exceeds");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

import {
  optimizeAsset,
  optimizeAndGenerateLods,
  mayJoinStaticNode,
  DEFAULT_OPTIMIZE_CONFIG,
  createNodeIO,
  ensureMeshoptReady,
} from "../../tools/blender/optimize.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("glTF Optimization Pipeline & Derived LOD Generation", () => {
  it("initializes Meshopt encoder/decoder and creates configured NodeIO", async () => {
    await ensureMeshoptReady();
    const io = createNodeIO();
    expect(io).toBeInstanceOf(NodeIO);
    expect(DEFAULT_OPTIMIZE_CONFIG.weldTolerance).toBe(0.0005);
    expect(DEFAULT_OPTIMIZE_CONFIG.quantizePosition).toBe(14);
  });

  it("identifies protected static nodes according to generator rules", () => {
    const mockNode = (name: string) => ({ getName: () => name });

    // LOD assets should not join nodes
    expect(mayJoinStaticNode(mockNode("mesh_part"), { lodLevels: [{ node: "LOD0" }] })).toBe(false);

    // Collision nodes and required nodes are protected
    expect(mayJoinStaticNode(mockNode("COL_box_01"), { requiredNodes: [] })).toBe(false);
    expect(mayJoinStaticNode(mockNode("SOCKET_hand_r"), { requiredNodes: ["SOCKET_hand_r"] })).toBe(false);

    // Character hierarchies protected
    expect(mayJoinStaticNode(mockNode("arm_l"), { family: "character", generator: "imported_blend" })).toBe(false);
    expect(mayJoinStaticNode(mockNode("head"), { family: "character", generator: "npc_character" })).toBe(false);

    // Rowboat oars and windmill dynamic meshes protected
    expect(mayJoinStaticNode(mockNode("rowboat_oar_left"), { generator: "rowboat" })).toBe(false);
    expect(mayJoinStaticNode(mockNode("windmill_hub"), { generator: "windmill" })).toBe(false);
    expect(mayJoinStaticNode(mockNode("windmill_sail_1"), { generator: "windmill" })).toBe(false);

    // General static props can be joined
    expect(mayJoinStaticNode(mockNode("fence_plank_01"), { generator: "props", requiredNodes: [] })).toBe(true);
  });

  it("optimizes real production GLB using quantization and meshopt compression", async () => {
    const fixturePath = path.join(ROOT, "public/assets/models/prop_fence_wood_a.glb");
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture ${fixturePath} is required for optimization test`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-opt-test-"));
    const outputPath = path.join(tempDir, "optimized_fence.glb");

    const spec = {
      id: "prop_fence_wood_a",
      file: "prop_fence_wood_a.glb",
      generator: "props",
      requiredNodes: [],
    };

    await optimizeAsset(fixturePath, outputPath, spec);

    expect(fs.existsSync(outputPath)).toBe(true);
    const optimizedBytes = fs.readFileSync(outputPath);
    expect(optimizedBytes.length).toBeGreaterThan(0);

    // Read back optimized GLB and verify extensions
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
    const doc = await io.read(outputPath);
    const root = doc.getRoot();

    const usedExtensions = root.listExtensionsUsed().map((ext) => ext.extensionName);
    expect(usedExtensions).toContain("KHR_mesh_quantization");
    expect(usedExtensions).toContain("EXT_meshopt_compression");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates simplified derived LODs with reduced geometry", async () => {
    const fixturePath = path.join(ROOT, "public/assets/models/building_barn_a.glb");
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture ${fixturePath} is required for LOD test`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-lod-test-"));

    const assetSpec = {
      id: "building_barn_a",
      file: "building_barn_a.glb",
      generator: "architecture",
      requiredNodes: [],
      lodLevels: [
        { node: "LOD0", distanceMeters: 0, triangleRatioTarget: 1.0 },
        { node: "LOD1", distanceMeters: 25, triangleRatioTarget: 0.5 },
        { node: "LOD2", distanceMeters: 50, triangleRatioTarget: 0.25 },
      ],
    };

    const result = await optimizeAndGenerateLods(fixturePath, tempDir, assetSpec);

    expect(result.generatedFiles).toHaveLength(3);
    expect(fs.existsSync(result.lod0Path)).toBe(true);

    const lod1Path = path.join(tempDir, "building_barn_a.lod1.glb");
    const lod2Path = path.join(tempDir, "building_barn_a.lod2.glb");
    expect(fs.existsSync(lod1Path)).toBe(true);
    expect(fs.existsSync(lod2Path)).toBe(true);

    // Inspect LOD documents and count primitives/indices
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

    const doc0 = await io.read(result.lod0Path);
    const doc1 = await io.read(lod1Path);
    const doc2 = await io.read(lod2Path);

    const countIndices = (doc: typeof doc0) => {
      let count = 0;
      for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
          const indices = prim.getIndices();
          if (indices) count += indices.getCount();
        }
      }
      return count;
    };

    const count0 = countIndices(doc0);
    const count1 = countIndices(doc1);
    const count2 = countIndices(doc2);

    expect(count0).toBeGreaterThan(0);
    expect(count1).toBeLessThanOrEqual(count0);
    expect(count2).toBeLessThanOrEqual(count1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

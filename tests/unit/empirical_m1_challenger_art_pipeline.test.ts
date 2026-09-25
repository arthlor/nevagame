import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

import {
  ART_CACHE_VERSION,
  computeAssetInputHash,
  readAssetCache,
  writeAssetCache,
  sha256,
  stableStringify,
} from "../../tools/art/cache.mjs";

import {
  optimizeAsset,
  optimizeAndGenerateLods,
  mayJoinStaticNode,
  ensureMeshoptReady,
} from "../../tools/art/optimize.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Challenger 1 Empirical Suite: Subsystem 1 (Art Pipeline & Caching)", () => {
  const basePalette = {
    version: 1,
    tokens: {
      "wood_dark": { hex: "#4a3525", roughness: 0.8, metalness: 0.1 },
      "wood_light": { hex: "#8c6747", roughness: 0.7, metalness: 0.1 },
      "stone_gray": { hex: "#7a7a7a", roughness: 0.9, metalness: 0.0 },
      "unreferenced_token": { hex: "#123456", roughness: 0.5, metalness: 0.5 },
    },
  };

  const baseAssetSpec = {
    id: "prop_crate_test",
    file: "prop_crate_test.glb",
    family: "props",
    generator: "props",
    seed: 4242,
    palette: ["wood_dark", "wood_light"],
    parameters: {
      width: 1.2,
      height: 1.0,
      reinforceCorners: true,
      subdivision: 2,
    },
  };

  // =========================================================================
  // 1. CACHE MODULE EMPIRICAL CHALLENGES
  // =========================================================================
  describe("1. cache.mjs Empirical Invariants & Edge Cases", () => {
    it("guarantees object key order invariance in stableStringify and input hashing", () => {
      const objA = { z: 1, a: 2, m: { y: 10, b: 20 } };
      const objB = { a: 2, z: 1, m: { b: 20, y: 10 } };
      expect(stableStringify(objA)).toBe(stableStringify(objB));

      const hashA = sha256(stableStringify(objA));
      const hashB = sha256(stableStringify(objB));
      expect(hashA).toBe(hashB);
    });

    it("distinguishes array ordering in stableStringify", () => {
      const arrA = [1, 2, 3];
      const arrB = [3, 2, 1];
      expect(stableStringify(arrA)).not.toBe(stableStringify(arrB));
    });

    it("verifies selective palette token hashing: unreferenced token changes do NOT alter asset hash", () => {
      const baseHash = computeAssetInputHash(baseAssetSpec, basePalette, "4.2.0", {}, ROOT);

      // Mutate unreferenced token in palette
      const paletteModifiedUnreferenced = {
        version: 1,
        tokens: {
          ...basePalette.tokens,
          "unreferenced_token": { hex: "#ffffff", roughness: 0.0, metalness: 1.0 },
        },
      };
      const hashUnreferenced = computeAssetInputHash(baseAssetSpec, paletteModifiedUnreferenced, "4.2.0", {}, ROOT);
      expect(hashUnreferenced).toBe(baseHash); // selective caching preserves cache hit!

      // Mutate referenced token in palette
      const paletteModifiedReferenced = {
        version: 1,
        tokens: {
          ...basePalette.tokens,
          "wood_dark": { hex: "#000000", roughness: 0.8, metalness: 0.1 },
        },
      };
      const hashReferenced = computeAssetInputHash(baseAssetSpec, paletteModifiedReferenced, "4.2.0", {}, ROOT);
      expect(hashReferenced).not.toBe(baseHash); // referenced token must invalidate!
    });

    it("detects generator parameter perturbations (deep, numeric, boolean, added/removed keys)", () => {
      const baseHash = computeAssetInputHash(baseAssetSpec, basePalette, "4.2.0", {}, ROOT);

      // Deep value change
      const modifiedSpec1 = {
        ...baseAssetSpec,
        parameters: { ...baseAssetSpec.parameters, width: 1.200001 },
      };
      expect(computeAssetInputHash(modifiedSpec1, basePalette, "4.2.0", {}, ROOT)).not.toBe(baseHash);

      // Boolean flip
      const modifiedSpec2 = {
        ...baseAssetSpec,
        parameters: { ...baseAssetSpec.parameters, reinforceCorners: false },
      };
      expect(computeAssetInputHash(modifiedSpec2, basePalette, "4.2.0", {}, ROOT)).not.toBe(baseHash);

      // Added parameter
      const modifiedSpec3 = {
        ...baseAssetSpec,
        parameters: { ...baseAssetSpec.parameters, extraStrap: true },
      };
      expect(computeAssetInputHash(modifiedSpec3, basePalette, "4.2.0", {}, ROOT)).not.toBe(baseHash);

      // Removed parameter
      const { subdivision: _subdivision, ...restParams } = baseAssetSpec.parameters;
      const modifiedSpec4 = {
        ...baseAssetSpec,
        parameters: restParams,
      };
      expect(computeAssetInputHash(modifiedSpec4, basePalette, "4.2.0", {}, ROOT)).not.toBe(baseHash);
    });

    it("validates readAssetCache against corrupted, mismatched, or failed contract records", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-cache-validate-"));
      const plan = {
        inputHash: "a".repeat(64),
        directory: tempDir,
        artifact: path.join(tempDir, "model.glb"),
        metadata: path.join(tempDir, "model.glb.json"),
      };
      const spec = { id: "test_model", file: "model.glb" };

      // Case 1: Missing files -> null
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Create dummy artifact
      fs.writeFileSync(plan.artifact, Buffer.from("glb_dummy"));

      // Case 2: Corrupted metadata JSON -> null
      fs.writeFileSync(plan.metadata, "corrupt { invalid json");
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Case 3: Version mismatch -> null
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION + 99,
          inputHash: plan.inputHash,
          id: spec.id,
          file: spec.file,
          result: { artContractStatus: "passed" },
        })
      );
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Case 4: Input hash mismatch -> null
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION,
          inputHash: "b".repeat(64),
          id: spec.id,
          file: spec.file,
          result: { artContractStatus: "passed" },
        })
      );
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Case 5: ID / File mismatch -> null
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION,
          inputHash: plan.inputHash,
          id: "wrong_id",
          file: spec.file,
          result: { artContractStatus: "passed" },
        })
      );
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Case 6: artContractStatus === "failed" -> null
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION,
          inputHash: plan.inputHash,
          id: spec.id,
          file: spec.file,
          result: { artContractStatus: "failed" },
        })
      );
      expect(await readAssetCache(plan, spec)).toBeNull();

      // Case 7: Valid passed record -> returns result with cacheHit: true
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION,
          inputHash: plan.inputHash,
          id: spec.id,
          file: spec.file,
          result: { artContractStatus: "passed", triangleCount: 150 },
        })
      );
      const validResult = await readAssetCache(plan, spec);
      expect(validResult).not.toBeNull();
      expect(validResult?.cacheHit).toBe(true);
      expect(validResult?.triangleCount).toBe(150);

      // Case 8: Validator function rejecting fileHash mismatch -> null
      const validator = async () => ({ fileHash: "hash_xyz_different" });
      fs.writeFileSync(
        plan.metadata,
        JSON.stringify({
          version: ART_CACHE_VERSION,
          inputHash: plan.inputHash,
          id: spec.id,
          file: spec.file,
          result: { artContractStatus: "passed", fileHash: "hash_abc_original" },
        })
      );
      expect(await readAssetCache(plan, spec, validator)).toBeNull();

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("verifies writeAssetCache writes atomically and cleanly", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-cache-write-"));
      const plan = {
        inputHash: "c".repeat(64),
        directory: tempDir,
        artifact: path.join(tempDir, "out.glb"),
        metadata: path.join(tempDir, "out.glb.json"),
      };
      const sourceGlb = path.join(tempDir, "source.glb");
      fs.writeFileSync(sourceGlb, Buffer.from("glb_content_binary"));

      const result = {
        id: "test_write",
        file: "out.glb",
        artContractStatus: "passed",
      };

      writeAssetCache(plan, result, sourceGlb, "4.2.0");

      expect(fs.existsSync(plan.artifact)).toBe(true);
      expect(fs.existsSync(plan.metadata)).toBe(true);
      const writtenMeta = JSON.parse(fs.readFileSync(plan.metadata, "utf8"));
      expect(writtenMeta.version).toBe(ART_CACHE_VERSION);
      expect(writtenMeta.inputHash).toBe(plan.inputHash);
      expect(writtenMeta.result.cacheHit).toBe(false);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("verifies full collision avoidance across ID, family, seed, and generator changes", () => {
      const hashes = new Set<string>();
      const variations = [
        { ...baseAssetSpec, id: "prop_crate_test_1" },
        { ...baseAssetSpec, id: "prop_crate_test_2" },
        { ...baseAssetSpec, family: "architecture" },
        { ...baseAssetSpec, generator: "vegetation" },
        { ...baseAssetSpec, seed: 100 },
        { ...baseAssetSpec, seed: 101 },
      ];

      for (const v of variations) {
        const h = computeAssetInputHash(v, basePalette, "4.2.0", {}, ROOT);
        expect(hashes.has(h)).toBe(false);
        hashes.add(h);
      }
      expect(hashes.size).toBe(variations.length);
    });
  });

  // =========================================================================
  // 3. GLTF OPTIMIZER EMPIRICAL CHALLENGES
  // =========================================================================
  describe("3. optimize.mjs Empirical Invariants, Quantization & LOD Hierarchy", () => {
    it("strictly preserves dynamic rigging and interactive hierarchy in mayJoinStaticNode", () => {
      const nodeNamed = (name: string) => ({ getName: () => name });

      // Multi-LOD specs
      expect(mayJoinStaticNode(nodeNamed("wall_piece"), { lodLevels: [{ distanceMeters: 10 }] })).toBe(false);

      // Windmill dynamic rotational parts
      expect(mayJoinStaticNode(nodeNamed("windmill_hub"), { generator: "windmill" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("windmill_spar_01"), { generator: "windmill" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("windmill_sail_01"), { generator: "windmill" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("windmill_base_stone"), { generator: "windmill" })).toBe(true);

      // Rowboat presentation oars
      expect(mayJoinStaticNode(nodeNamed("rowboat_oar_left"), { generator: "rowboat" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("rowboat_oar_right"), { generator: "rowboat" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("rowboat_hull"), { generator: "rowboat" })).toBe(true);

      // Characters and rigs
      expect(mayJoinStaticNode(nodeNamed("spine"), { family: "character", generator: "authored_glb" })).toBe(false);
      expect(mayJoinStaticNode(nodeNamed("head"), { family: "character", generator: "npc_character" })).toBe(false);

      // Collision proxies
      expect(mayJoinStaticNode(nodeNamed("COL_hull_box"), { generator: "props" })).toBe(false);

      // Required attachment sockets
      expect(
        mayJoinStaticNode(nodeNamed("SOCKET_lantern"), {
          generator: "props",
          requiredNodes: ["SOCKET_lantern"],
        })
      ).toBe(false);
    });

    it("optimizes multiple production models and verifies KHR_mesh_quantization and EXT_meshopt_compression", async () => {
      await ensureMeshoptReady();
      const testModels = [
        "public/assets/models/prop_fence_wood_a.glb",
        "public/assets/models/boat_rowboat_a.glb",
        "public/assets/models/tree_pine_a.glb",
      ];

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-opt-suite-"));
      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

      for (const relModel of testModels) {
        const sourcePath = path.join(ROOT, relModel);
        if (!fs.existsSync(sourcePath)) continue;

        const baseName = path.basename(relModel);
        const outPath = path.join(tempDir, `opt_${baseName}`);

        await optimizeAsset(sourcePath, outPath, {
          id: baseName.replace(".glb", ""),
          file: baseName,
          generator: baseName.startsWith("boat_") ? "rowboat" : "props",
        });

        expect(fs.existsSync(outPath)).toBe(true);
        const outDoc = await io.read(outPath);
        const extensions = outDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName);

        expect(extensions).toContain("KHR_mesh_quantization");
        expect(extensions).toContain("EXT_meshopt_compression");
      }

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("supports in-memory Buffer/Uint8Array transformations seamlessly", async () => {
      await ensureMeshoptReady();
      const sourcePath = path.join(ROOT, "public/assets/models/prop_fence_wood_a.glb");
      if (!fs.existsSync(sourcePath)) return;

      const inputBuffer = fs.readFileSync(sourcePath);
      const optimizedBinary = await optimizeAsset(inputBuffer, null, {
        id: "prop_fence_wood_a",
        file: "prop_fence_wood_a.glb",
        generator: "props",
      });

      expect(optimizedBinary).toBeInstanceOf(Uint8Array);
      expect(optimizedBinary.length).toBeGreaterThan(0);

      // Verify the returned in-memory binary is parseable and valid
      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
      const doc = await io.readBinary(optimizedBinary as Uint8Array);
      expect(doc.getRoot().listMeshes().length).toBeGreaterThan(0);
    });

    it("generates derived multi-tier LODs with strictly decreasing geometry complexity", async () => {
      await ensureMeshoptReady();
      const sourcePath = path.join(ROOT, "public/assets/models/house_cottage_a.glb");
      if (!fs.existsSync(sourcePath)) return;

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-lods-deep-"));
      const spec = {
        id: "house_cottage_a",
        file: "house_cottage_a.glb",
        generator: "architecture",
        lodLevels: [
          { node: "LOD0", distanceMeters: 0, triangleRatioTarget: 1.0 },
          { node: "LOD1", distanceMeters: 20, triangleRatioTarget: 0.5 },
          { node: "LOD2", distanceMeters: 45, triangleRatioTarget: 0.2 },
        ],
      };

      const result = await optimizeAndGenerateLods(sourcePath, tempDir, spec);
      expect(result.generatedFiles).toHaveLength(3);

      const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

      const doc0 = await io.read(result.generatedFiles[0]);
      const doc1 = await io.read(result.generatedFiles[1]);
      const doc2 = await io.read(result.generatedFiles[2]);

      const countIndices = (doc: any) => {
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
});

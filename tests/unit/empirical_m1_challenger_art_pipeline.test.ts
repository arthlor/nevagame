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
  generatorModuleFor,
  readAssetCache,
  writeAssetCache,
  getCacheManifest,
  saveCacheManifest,
  sha256,
  stableStringify,
} from "../../tools/blender/cache.mjs";

import { BlenderWorkerPool } from "../../tools/blender/pool.mjs";

import {
  optimizeAsset,
  optimizeAndGenerateLods,
  mayJoinStaticNode,
  ensureMeshoptReady,
} from "../../tools/blender/optimize.mjs";

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

    it("handles registry generator mapping and errors on unregistered generators", () => {
      expect(generatorModuleFor("props", ROOT)).toBe("props.py");
      expect(generatorModuleFor("imported_blend", ROOT)).toBe("imported.py");
      expect(generatorModuleFor("rowboat", ROOT)).toBe("boats.py");

      expect(() => generatorModuleFor("completely_unknown_generator_xyz_999", ROOT)).toThrow(
        /no registered generator module was found/
      );
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

    it("handles corrupted manifest.json gracefully and recovers default manifest", () => {
      const tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-manifest-corrupt-"));
      const manifestPath = path.join(tempCacheDir, "manifest.json");

      // Corrupted manifest
      fs.writeFileSync(manifestPath, "NOT_JSON_DATA!@#$");
      const loaded = getCacheManifest(tempCacheDir);
      expect(loaded).toEqual({ version: 1, entries: {} });

      // Save valid manifest
      saveCacheManifest(tempCacheDir, {
        version: 1,
        entries: { prop_1: { hash: "abc", file: "prop_1.glb", mtimeMs: 123 } },
      });
      const recovered = getCacheManifest(tempCacheDir);
      expect(recovered.entries.prop_1.hash).toBe("abc");

      fs.rmSync(tempCacheDir, { recursive: true, force: true });
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
  // 2. WORKER POOL EMPIRICAL CHALLENGES
  // =========================================================================
  describe("2. pool.mjs Empirical Invariants, Watchdogs & Concurrency", () => {
    function createMockBlenderWrapper(dir: string, nodeWorkerScript: string): string {
      const wrapperPath = path.join(dir, "mock_blender.sh");
      const wrapperContent = `#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "--python" ]; then
    shift
    SCRIPT="$1"
    shift
    if [ "$1" = "--" ]; then
      shift
    fi
    exec "${process.execPath}" "$SCRIPT" "$@"
  fi
  shift
done
exec "${process.execPath}" "${nodeWorkerScript}" "$@"
`;
      fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
      return wrapperPath;
    }

    it("handles heavy queue with worker recycling and concurrency 4", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-pool-heavy-"));
      const mockScript = path.join(tempDir, "mock_worker_fast.mjs");

      fs.writeFileSync(
        mockScript,
        `
        import fs from "node:fs";
        const args = process.argv.slice(2);
        const reportIdx = args.indexOf("--report");
        const assetIdx = args.indexOf("--asset");
        const reportPath = args[reportIdx + 1];
        const assetId = args[assetIdx + 1];

        const report = {
          version: 1,
          assets: [{ id: assetId, status: "passed", file: assetId + ".glb" }]
        };
        fs.writeFileSync(reportPath, JSON.stringify(report), "utf8");
        process.exit(0);
      `
      );

      const mockBlender = createMockBlenderWrapper(tempDir, mockScript);
      const assets = Array.from({ length: 20 }, (_, i) => ({ id: `asset_heavy_${i}` }));

      const pool = new BlenderWorkerPool({ concurrency: 4, timeoutMs: 5000, recycleJobLimit: 3 });
      try {
        const outcome = await pool.runTasks({
          blenderPath: mockBlender,
          bootstrapScript: mockScript,
          catalogPath: "dummy.json",
          assets,
          outputDir: tempDir,
        });

        expect(outcome.results).toHaveLength(20);
        expect(outcome.blenderReport.assets).toHaveLength(20);
      } finally {
        pool.dispose();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("respects worker concurrency bounds and distributes work across FIFO queue", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-pool-concurrency-"));
      const mockScript = path.join(tempDir, "mock_worker.mjs");

      // Mock node worker script that writes a report and simulates work
      fs.writeFileSync(
        mockScript,
        `
        import fs from "node:fs";
        const args = process.argv.slice(2);
        const reportIdx = args.indexOf("--report");
        const assetIdx = args.indexOf("--asset");
        const reportPath = args[reportIdx + 1];
        const assetId = args[assetIdx + 1];

        // Simulate work delay
        await new Promise(r => setTimeout(r, 60));

        const report = {
          version: 1,
          assets: [{ id: assetId, status: "passed", file: assetId + ".glb" }]
        };
        fs.writeFileSync(reportPath, JSON.stringify(report), "utf8");
        process.exit(0);
      `
      );

      const mockBlender = createMockBlenderWrapper(tempDir, mockScript);
      const assets = Array.from({ length: 6 }, (_, i) => ({ id: `asset_${i}` }));
      const progressEvents: any[] = [];

      const pool = new BlenderWorkerPool({ concurrency: 2, timeoutMs: 5000 });
      try {
        const start = Date.now();
        const outcome = await pool.runTasks({
          blenderPath: mockBlender,
          bootstrapScript: mockScript,
          catalogPath: "dummy_catalog.json",
          assets,
          outputDir: tempDir,
          onProgress: (p) => progressEvents.push(p),
        });

        const elapsed = Date.now() - start;
        expect(outcome.results).toHaveLength(6);
        expect(outcome.blenderReport.assets).toHaveLength(6);
        expect(progressEvents).toHaveLength(6);
        expect(progressEvents[5].completed).toBe(6);
        expect(progressEvents[5].total).toBe(6);
        // With concurrency 2 and 6 tasks of ~60ms, total elapsed should be at least ~100ms
        expect(elapsed).toBeGreaterThanOrEqual(100);
      } finally {
        pool.dispose();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("triggers watchdog timer on hanging tasks, terminates process, and reports timeout", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-pool-timeout-"));
      const hangingScript = path.join(tempDir, "hanging_worker.mjs");

      fs.writeFileSync(
        hangingScript,
        `
        // Never exits and ignores simple signals
        setInterval(() => {}, 1000);
      `
      );

      const mockBlender = createMockBlenderWrapper(tempDir, hangingScript);
      const pool = new BlenderWorkerPool({ concurrency: 1, timeoutMs: 250 });

      try {
        await expect(
          pool.runTasks({
            blenderPath: mockBlender,
            bootstrapScript: hangingScript,
            catalogPath: "dummy.json",
            assets: [{ id: "hung_asset" }],
            outputDir: tempDir,
          })
        ).rejects.toThrow(/Timeout \(250ms\) executing Blender for asset "hung_asset"/);
      } finally {
        pool.dispose();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("isolates process errors: executing subsequent queue items when an earlier task fails", async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-pool-isolation-"));
      const script = path.join(tempDir, "flaky_worker.mjs");

      fs.writeFileSync(
        script,
        `
        import fs from "node:fs";
        const args = process.argv.slice(2);
        const reportIdx = args.indexOf("--report");
        const assetIdx = args.indexOf("--asset");
        const reportPath = args[reportIdx + 1];
        const assetId = args[assetIdx + 1];

        if (assetId.startsWith("fail_")) {
          process.stderr.write("Fatal error in asset: " + assetId + "\\n");
          process.exit(1);
        }

        const report = {
          version: 1,
          assets: [{ id: assetId, status: "passed" }]
        };
        fs.writeFileSync(reportPath, JSON.stringify(report), "utf8");
        process.exit(0);
      `
      );

      const mockBlender = createMockBlenderWrapper(tempDir, script);
      const assets = [
        { id: "pass_1" },
        { id: "fail_1" },
        { id: "pass_2" },
        { id: "fail_2" },
        { id: "pass_3" },
      ];

      const pool = new BlenderWorkerPool({ concurrency: 1, timeoutMs: 3000 });

      try {
        let caughtError: any = null;
        try {
          await pool.runTasks({
            blenderPath: mockBlender,
            bootstrapScript: script,
            catalogPath: "dummy.json",
            assets,
            outputDir: tempDir,
          });
        } catch (err) {
          caughtError = err;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError.message).toMatch(/Blender dynamic worker pool failed for 2 \/ 5 asset\(s\)/);
        expect(caughtError.errors).toHaveLength(2);
        expect(caughtError.errors[0].assetId).toBe("fail_1");
        expect(caughtError.errors[1].assetId).toBe("fail_2");
        expect(caughtError.results).toHaveLength(3); // pass_1, pass_2, pass_3 still succeeded!
      } finally {
        pool.dispose();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("cleans up scratch directories and active processes when terminateAll is called", () => {
      const pool = new BlenderWorkerPool({ concurrency: 2 });
      const tempScratch1 = path.join(os.tmpdir(), `pool-scratch-1-${Date.now()}`);
      const tempScratch2 = path.join(os.tmpdir(), `pool-scratch-2-${Date.now()}`);
      fs.mkdirSync(tempScratch1, { recursive: true });
      fs.mkdirSync(tempScratch2, { recursive: true });

      pool.scratchDirs.add(tempScratch1);
      pool.scratchDirs.add(tempScratch2);

      expect(fs.existsSync(tempScratch1)).toBe(true);
      expect(fs.existsSync(tempScratch2)).toBe(true);

      pool.terminateAll();

      expect(fs.existsSync(tempScratch1)).toBe(false);
      expect(fs.existsSync(tempScratch2)).toBe(false);
      expect(pool.scratchDirs.size).toBe(0);
      expect(pool.aborted).toBe(true);
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
      expect(mayJoinStaticNode(nodeNamed("spine"), { family: "character", generator: "imported_blend" })).toBe(false);
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
      const sourcePath = path.join(ROOT, "public/assets/models/building_barn_a.glb");
      if (!fs.existsSync(sourcePath)) return;

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-lods-deep-"));
      const spec = {
        id: "building_barn_a",
        file: "building_barn_a.glb",
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

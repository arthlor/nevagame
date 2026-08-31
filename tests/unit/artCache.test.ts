import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeAssetHash,
  computeAssetInputHash,
  computeAssetSourceHash,
  computeAssetToolchainHash,
  computeCommonToolchainHash,
  computeToolchainHash,
  generatorModuleFor,
  isAssetCurrent,
  isCached,
  recordCache,
  cleanCache,
  getCacheManifest,
  saveCacheManifest,
  sha256,
} from "../../tools/blender/cache.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Blender Art Cache & Deterministic Hashing", () => {
  const samplePalette = {
    version: 1,
    tokens: {
      "wood_dark": { hex: "#4a3525", roughness: 0.8, metalness: 0.1 },
      "wood_light": { hex: "#8c6747", roughness: 0.7, metalness: 0.1 },
      "stone_gray": { hex: "#7a7a7a", roughness: 0.9, metalness: 0.0 },
    },
  };

  const sampleAsset = {
    id: "test_fence_a",
    file: "test_fence_a.glb",
    family: "props",
    generator: "props",
    seed: 12345,
    palette: ["wood_dark", "wood_light"],
    parameters: {
      postCount: 4,
      railCount: 2,
      length: 3.5,
    },
  };

  it("produces deterministic SHA-256 hashes for identical inputs", () => {
    const hash1 = computeAssetInputHash(sampleAsset, samplePalette, "4.2.0", {}, ROOT);
    const hash2 = computeAssetInputHash(sampleAsset, samplePalette, "4.2.0", {}, ROOT);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    expect(hash1).toBe(hash2);
  });

  it("detects changes to generator parameters and seed", () => {
    const baseHash = computeAssetInputHash(sampleAsset, samplePalette, "4.2.0", {}, ROOT);

    const changedParams = {
      ...sampleAsset,
      parameters: { ...sampleAsset.parameters, postCount: 5 },
    };
    const paramHash = computeAssetInputHash(changedParams, samplePalette, "4.2.0", {}, ROOT);
    expect(paramHash).not.toBe(baseHash);

    const changedSeed = { ...sampleAsset, seed: 99999 };
    const seedHash = computeAssetInputHash(changedSeed, samplePalette, "4.2.0", {}, ROOT);
    expect(seedHash).not.toBe(baseHash);
  });

  it("detects changes to referenced palette tokens", () => {
    const baseHash = computeAssetInputHash(sampleAsset, samplePalette, "4.2.0", {}, ROOT);

    const modifiedPalette = {
      version: 1,
      tokens: {
        ...samplePalette.tokens,
        "wood_dark": { hex: "#ff0000", roughness: 0.8, metalness: 0.1 },
      },
    };
    const paletteHash = computeAssetInputHash(sampleAsset, modifiedPalette, "4.2.0", {}, ROOT);
    expect(paletteHash).not.toBe(baseHash);
  });

  it("detects changes to Blender version and optimization configuration", () => {
    const baseHash = computeAssetInputHash(sampleAsset, samplePalette, "4.2.0", {}, ROOT);

    const newBlenderHash = computeAssetInputHash(sampleAsset, samplePalette, "4.3.0", {}, ROOT);
    expect(newBlenderHash).not.toBe(baseHash);

    const optConfigHash = computeAssetInputHash(
      sampleAsset,
      samplePalette,
      "4.2.0",
      { weldTolerance: 0.001 },
      ROOT
    );
    expect(optConfigHash).not.toBe(baseHash);
  });

  it("computes common toolchain hash across all common python files", () => {
    const commonDir = path.join(ROOT, "tools/blender/common");
    const commonHash = computeCommonToolchainHash(commonDir);
    expect(commonHash).toMatch(/^[a-f0-9]{64}$/);

    const toolchainHash = computeToolchainHash(path.join(ROOT, "tools/blender"));
    expect(toolchainHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("correctly resolves generator module files from registry", () => {
    expect(generatorModuleFor("oak_tree", ROOT)).toBe("vegetation.py");
    expect(generatorModuleFor("farmhouse", ROOT)).toBe("architecture.py");
    expect(generatorModuleFor("stylized_fish", ROOT)).toBe("fish.py");
  });

  it("computes asset toolchain and complete asset hash using computeAssetHash", () => {
    const toolchainHash = computeAssetToolchainHash(sampleAsset, ROOT);
    expect(toolchainHash).toMatch(/^[a-f0-9]{64}$/);

    const assetHash = computeAssetHash(sampleAsset, ROOT);
    expect(assetHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("computes asset source hash using computeAssetSourceHash", () => {
    const hash = computeAssetSourceHash(
      { id: "rock_a", size: 2.0 },
      "def generate(): pass",
      "toolchain_hash_abc",
      JSON.stringify(samplePalette),
      "4.2.0",
      { quantize: true }
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("manages cache records, checks freshness, and prunes stale items", () => {
    const tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "neva-cache-test-"));
    const dummyGlb = path.join(tempCacheDir, "dummy_source.glb");
    fs.writeFileSync(dummyGlb, Buffer.from("glTF_dummy_content_bytes"));

    const assetId = "test_prop_1";
    const targetHash = sha256("dummy_input_spec_123");

    // Initially not cached
    expect(isCached(assetId, targetHash, tempCacheDir, tempCacheDir)).toBe(false);
    expect(isAssetCurrent(tempCacheDir, assetId, targetHash)).toBe(false);

    // Record cache
    const record = recordCache(
      assetId,
      targetHash,
      { file: `${assetId}.glb`, artContractStatus: "passed" },
      dummyGlb,
      tempCacheDir
    );

    expect(record.inputHash).toBe(targetHash);
    expect(record.id).toBe(assetId);
    expect(isCached(assetId, targetHash, tempCacheDir, tempCacheDir)).toBe(true);

    // Manifest persistence
    const manifest = {
      version: 1,
      entries: {
        [assetId]: { hash: targetHash, file: `${assetId}.glb`, mtimeMs: Date.now() },
      },
    };
    saveCacheManifest(tempCacheDir, manifest);
    const loadedManifest = getCacheManifest(tempCacheDir);
    expect(loadedManifest.entries[assetId]?.hash).toBe(targetHash);

    // Clean cache with 0 max entries to verify removal
    const cleanResult = cleanCache(tempCacheDir, 0, 0);
    expect(cleanResult.removed).toBeGreaterThanOrEqual(1);

    // Cleanup
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
  });
});

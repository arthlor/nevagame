import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ART_CACHE_VERSION,
  PIPELINE_TOOLCHAIN_FILES,
  assetCachePlan,
  cleanCache,
  computeAssetInputHash,
  computeAssetToolchainHash,
  computeToolchainHash,
  readAssetCache,
  sha256,
  writeAssetCache,
} from "../../tools/art/cache.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("art cache and deterministic hashing", () => {
  const samplePalette = {
    version: 1,
    tokens: {
      wood_dark: { hex: "#4a3525", roughness: 0.8, metalness: 0.1 },
      wood_light: { hex: "#8c6747", roughness: 0.7, metalness: 0.1 },
      stone_gray: { hex: "#7a7a7a", roughness: 0.9, metalness: 0.0 },
    },
  };

  const sampleAsset = {
    id: "test_fence_a",
    file: "test_fence_a.glb",
    family: "prop",
    generator: "wood_fence",
    seed: 12345,
    palette: ["wood_dark", "wood_light"],
    parameters: { postCount: 4, railCount: 2, length: 3.5 },
  };

  it("produces deterministic SHA-256 hashes for identical inputs", () => {
    const first = computeAssetInputHash(sampleAsset, samplePalette, "authored-three@0.174.0", {}, ROOT);
    const second = computeAssetInputHash(sampleAsset, samplePalette, "authored-three@0.174.0", {}, ROOT);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("detects changes to generator parameters, seed, palette, producer version and optimisation", () => {
    const base = computeAssetInputHash(sampleAsset, samplePalette, "v1", {}, ROOT);
    const variants = [
      computeAssetInputHash({ ...sampleAsset, parameters: { ...sampleAsset.parameters, postCount: 5 } }, samplePalette, "v1", {}, ROOT),
      computeAssetInputHash({ ...sampleAsset, seed: 99999 }, samplePalette, "v1", {}, ROOT),
      computeAssetInputHash(sampleAsset, {
        version: 1,
        tokens: { ...samplePalette.tokens, wood_dark: { hex: "#ff0000", roughness: 0.8, metalness: 0.1 } },
      }, "v1", {}, ROOT),
      computeAssetInputHash(sampleAsset, samplePalette, "v2", {}, ROOT),
      computeAssetInputHash(sampleAsset, samplePalette, "v1", { weldTolerance: 0.001 }, ROOT),
    ];
    for (const variant of variants) expect(variant).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it("keys an authored GLB on its committed source bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-cache-source-"));
    try {
      for (const relative of PIPELINE_TOOLCHAIN_FILES) {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, relative), path.join(root, relative));
      }
      fs.mkdirSync(path.join(root, "tools/authored/generators"), { recursive: true });
      fs.writeFileSync(path.join(root, "tools/authored/generators/contracts.json"), "{}\n");
      fs.mkdirSync(path.join(root, "art/sources"), { recursive: true });
      const source = path.join(root, "art/sources/model.glb");
      const asset = { ...sampleAsset, generator: "authored_glb", parameters: { sourceGlb: "art/sources/model.glb", textureMaxSize: 1024 } };
      fs.writeFileSync(source, "first");
      const first = computeAssetInputHash(asset, samplePalette, "v1", {}, root);
      fs.writeFileSync(source, "second");
      expect(computeAssetInputHash(asset, samplePalette, "v1", {}, root)).not.toBe(first);
      expect(() => computeAssetInputHash(
        { ...asset, parameters: { ...asset.parameters, sourceGlb: "../outside.glb" } }, samplePalette, "v1", {}, root,
      )).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("hashes exactly the declared Node pipeline files, never a Blender tree", () => {
    expect(PIPELINE_TOOLCHAIN_FILES.every((file) => fs.existsSync(path.join(ROOT, file)))).toBe(true);
    expect(PIPELINE_TOOLCHAIN_FILES.some((file) => file.includes("blender") || file.endsWith(".py"))).toBe(false);
    expect(computeToolchainHash(ROOT)).toMatch(/^[a-f0-9]{64}$/);
    // Authored generators also hash their kit and generators, so their toolchain differs from a
    // committed-source asset's.
    expect(computeAssetToolchainHash({ generator: "fauna_dog" }, ROOT))
      .not.toBe(computeAssetToolchainHash({ generator: "authored_glb" }, ROOT));
  });

  it("round-trips a validated cache record and rejects a mismatched plan", async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "neva-cache-test-"));
    try {
      const artifact = path.join(cacheRoot, "candidate.glb");
      fs.writeFileSync(artifact, Buffer.from("glTF candidate bytes"));
      const plan = assetCachePlan(sampleAsset, { palette: samplePalette, repoRoot: ROOT }, { version: "v1" }, cacheRoot);
      expect(await readAssetCache(plan, sampleAsset)).toBeNull();
      writeAssetCache(plan, {
        id: sampleAsset.id,
        file: sampleAsset.file,
        artContractStatus: "passed",
        fileHash: sha256(fs.readFileSync(artifact)),
      }, artifact, "v1");
      const record = JSON.parse(fs.readFileSync(plan.metadata, "utf8"));
      expect(record.version).toBe(ART_CACHE_VERSION);
      expect(record.producerVersion).toBe("v1");
      const hit = await readAssetCache(plan, sampleAsset);
      expect(hit).toMatchObject({ id: sampleAsset.id, cacheHit: true, inputHash: plan.inputHash });
      expect(await readAssetCache({ ...plan, inputHash: sha256("another input") }, sampleAsset)).toBeNull();
      expect(await readAssetCache(plan, { ...sampleAsset, id: "another_asset" })).toBeNull();

      expect(cleanCache(cacheRoot, 0, 0).removed).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    }
  });
});

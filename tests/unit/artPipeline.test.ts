import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import {
  parseArgs,
  promoteFilesAtomically,
  resolvePreviewSource,
  safeFilename,
  selectAssets,
  validateCatalog,
  validateGeneratorParameters,
  validatePublishedManifest
} from "../../tools/blender/cli.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const hash = (filename: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

describe("Neva art catalog", () => {
  it("validates the schema, palette references, and complete 35-asset manifest", () => {
    const { catalog, palette, specHash } = validateCatalog();
    expect(catalog.assets).toHaveLength(35);
    expect(new Set(catalog.assets.map((asset) => asset.id)).size).toBe(35);
    expect(new Set(catalog.assets.map((asset) => asset.file)).size).toBe(35);
    expect(specHash).toMatch(/^[a-f0-9]{64}$/);
    for (const asset of catalog.assets) {
      expect(safeFilename(asset.file)).toBe(true);
      for (const token of asset.palette) expect(palette.tokens[token]).toBeDefined();
    }
    expect(new Set(catalog.assets.map((asset) => asset.id))).toEqual(
      new Set(Object.values(ASSET_IDS))
    );
  });

  it("selects exact assets and whole families without accepting unsafe or unknown input", () => {
    const { catalog } = validateCatalog();
    const parsed = parseArgs(["generate", "--asset", "tree_oak_a", "--family", "fish", "--no-publish"]);
    expect(parsed.publish).toBe(false);
    expect(selectAssets(catalog, parsed).map((asset) => asset.id)).toEqual([
      "tree_oak_a",
      "fish_trout_a",
      "fish_tuna_a"
    ]);
    expect(safeFilename("../tree_oak_a.glb")).toBe(false);
    expect(() => selectAssets(catalog, parseArgs(["generate", "--asset", "missing_asset"]))).toThrow(
      "Unknown asset ID"
    );
    expect(parseArgs(["preview", "--stage", "latest", "--all"]).stage).toBe("latest");
    expect(() => resolvePreviewSource("../run-escape", catalog.assets)).toThrow("Unsafe preview stage");
  });

  it("rejects incomplete, unknown, and out-of-range generator parameters", () => {
    const { catalog } = validateCatalog();
    const oak = structuredClone(catalog.assets.find((asset) => asset.id === "tree_oak_a"));
    if (!oak) throw new Error("tree_oak_a is required by the catalog fixture");
    expect(validateGeneratorParameters(oak)).toBe(true);
    delete oak.parameters.rootCount;
    expect(() => validateGeneratorParameters(oak)).toThrow("missing generator parameters");
    oak.parameters.rootCount = 6;
    oak.parameters.noise = 1;
    expect(() => validateGeneratorParameters(oak)).toThrow("unknown generator parameters");
    delete oak.parameters.noise;
    oak.parameters.canopyClusters = 999;
    expect(() => validateGeneratorParameters(oak)).toThrow("invalid generator parameter canopyClusters");
  });

  it("rolls every destination back if an atomic promotion fails", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neva-art-rollback-"));
    const source = path.join(directory, "source.glb");
    const destination = path.join(directory, "published.glb");
    const newDestination = path.join(directory, "new.glb");
    fs.writeFileSync(source, "new-content");
    fs.writeFileSync(destination, "old-content");
    expect(() =>
      promoteFilesAtomically(
        [
          { source, destination },
          { source: path.join(directory, "missing.glb"), destination: newDestination }
        ],
        [],
        path.join(directory, "backup")
      )
    ).toThrow();
    expect(fs.readFileSync(destination, "utf8")).toBe("old-content");
    expect(fs.existsSync(newDestination)).toBe(false);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("keeps generated and public copies byte-identical", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "generated/reports/asset-manifest.json"), "utf8")
    ) as { assets: Array<{ file: string; fileHash: string }> };
    expect(manifest.assets).toHaveLength(35);
    for (const asset of manifest.assets) {
      const generated = path.join(ROOT, "generated/glb", asset.file);
      const published = path.join(ROOT, "public/assets/models", asset.file);
      expect(hash(generated)).toBe(asset.fileHash);
      expect(hash(published)).toBe(asset.fileHash);
    }
  });

  it("rejects manifests from a different catalog revision", () => {
    const { catalog, palette, specHash } = validateCatalog();
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "generated/reports/asset-manifest.json"), "utf8"));
    expect(() => validatePublishedManifest(manifest, catalog, specHash, crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "art/palettes/neva.palette.json"))).digest("hex"))).toThrow("does not match");
    expect(palette.tokens).toBeDefined();
  });
});

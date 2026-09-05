import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { describe, expect, it } from "vitest";

import {
  ASSET_BY_ID,
  ASSET_CATALOG,
  ASSET_IDS,
  assetUrl
} from "../../src/render/assets/AssetCatalog";
import { resolveArtYardAssetId, syncArtYardAssetUrl } from "../../src/art-yard/urlState";
import {
  artYardUrl,
  parseArgs,
  computeToolchainHash,
  pruneStagingRuns,
  promoteFilesAtomically,
  referenceAuthoringSummary,
  referenceBriefHash,
  referenceBriefMarkdown,
  safeFilename,
  selectAssets,
  validateCatalog,
  validateAnimationContract,
  validateGeneratorParameters,
  validateLodContract,
  validateReferenceAuthoring,
  validatePublishedManifest
} from "../../tools/blender/cli.mjs";
import type { CatalogAsset } from "../../tools/blender/cli.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const hash = (filename: string) =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

describe("Neva art catalog", () => {
  it("validates the schema, palette references, and complete runtime manifest", () => {
    const { catalog, palette, specHash } = validateCatalog();
    const runtimeAssetCount = Object.values(ASSET_IDS).length;
    expect(catalog.assets).toHaveLength(runtimeAssetCount);
    expect(new Set(catalog.assets.map((asset) => asset.id)).size).toBe(runtimeAssetCount);
    expect(new Set(catalog.assets.map((asset) => asset.file)).size).toBe(runtimeAssetCount);
    expect(specHash).toMatch(/^[a-f0-9]{64}$/);
    expect(computeToolchainHash()).toMatch(/^[a-f0-9]{64}$/);
    for (const asset of catalog.assets) {
      expect(safeFilename(asset.file)).toBe(true);
      for (const token of asset.palette) expect(palette.tokens[token]).toBeDefined();
    }
    expect(new Set(catalog.assets.map((asset) => asset.id))).toEqual(
      new Set(Object.values(ASSET_IDS))
    );
    const runtimeFields = [
      "additionalAnimationClips", "animationClips", "collision", "collisionPrimitives", "contentHash", "family", "file", "humanoidRig", "id", "instancing", "lod", "lodLevels", "readDistanceMeters", "requiredNodes", "rigNode", "rootNode", "socketNodes"
    ];
    for (const asset of ASSET_CATALOG) {
      expect(Object.keys(asset).sort()).toEqual(runtimeFields);
      expect("referenceAuthoring" in asset).toBe(false);
      expect("parameters" in asset).toBe(false);
      expect(asset.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(assetUrl(asset.id)).toBe(
        `/assets/models/${asset.file}?v=${asset.contentHash.slice(0, 16)}`
      );
      if (asset.collision === "none") {
        expect(asset.collisionPrimitives).toBeNull();
      } else {
        if (asset.collision === "box") expect(asset.collisionPrimitives).toHaveLength(1);
        else expect(asset.collisionPrimitives?.length).toBeGreaterThanOrEqual(2);
        expect(new Set(asset.collisionPrimitives?.map((primitive) => primitive.id)).size)
          .toBe(asset.collisionPrimitives?.length);
        for (const primitive of asset.collisionPrimitives ?? []) {
          expect(primitive.halfExtents.every((extent) => extent > 0)).toBe(true);
        }
      }
    }
  });

  it("requires the character rig, sockets, clip durations, and commit markers", () => {
    const catalog = JSON.parse(
      fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")
    ) as { assets: CatalogAsset[] };
    const character = structuredClone(
      catalog.assets.find((asset) => asset.id === "char_player_a")
    ) as CatalogAsset | undefined;
    if (!character?.animationClips) throw new Error("char_player_a requires an animation contract");
    expect(validateAnimationContract(character)).toBe(true);

    const generatedManifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "generated/reports/asset-manifest.json"), "utf8")
    ) as { assets: Array<{ id: string; animationClips?: CatalogAsset["animationClips"] }> };
    const publicManifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public/assets/models/asset-manifest.json"), "utf8")
    ) as typeof generatedManifest;
    const generatedCharacter = generatedManifest.assets.find((asset) => asset.id === "char_player_a");
    const publicCharacter = publicManifest.assets.find((asset) => asset.id === "char_player_a");
    const expectedClips = [
      ...character.animationClips,
      ...(character.additionalAnimationClips ?? [])
    ];
    expect(generatedCharacter?.animationClips).toHaveLength(expectedClips.length);
    expect(publicCharacter?.animationClips).toEqual(generatedCharacter?.animationClips);
    for (const clip of expectedClips) {
      const packaged = generatedCharacter?.animationClips?.find((candidate) => candidate.name === clip.name);
      expect(packaged?.loop).toBe(clip.loop);
      expect(packaged?.referenceSpeedMetersPerSecond ?? null)
        .toBe(clip.referenceSpeedMetersPerSecond ?? null);
      expect(packaged?.events ?? []).toEqual(clip.events ?? []);
      expect(Number(packaged?.durationSeconds)).toBeCloseTo(clip.durationSeconds, 4);
      if (clip.commitMarkerSeconds !== undefined) {
        expect(Number(packaged?.commitMarkerSeconds)).toBeCloseTo(clip.commitMarkerSeconds, 4);
      }
    }

    character.animationClips = character.animationClips.filter((clip) => clip.name !== "harvest");
    expect(() => validateAnimationContract(character)).toThrow("missing required animation clips");
  });

  it("permits catalog-authored node animation on fish and fauna with explicit optional fallbacks", () => {
    const catalog = JSON.parse(
      fs.readFileSync(path.join(ROOT, "assets/specs/asset-catalog.json"), "utf8")
    ) as { assets: CatalogAsset[] };
    const fish = structuredClone(
      catalog.assets.find((asset) => asset.id === "fish_trout_a")
    ) as CatalogAsset | undefined;
    const fauna = structuredClone(
      catalog.assets.find((asset) => asset.id === "fauna_cow_a")
    ) as CatalogAsset | undefined;
    if (!fish?.animationClips || !fauna?.animationClips) {
      throw new Error("representative fish and fauna require animation contracts");
    }

    expect(fish.rigNode).toBeUndefined();
    expect(validateAnimationContract(fish)).toBe(true);
    expect(validateAnimationContract(fauna)).toBe(true);

    fish.animationClips.push({
      name: "ambient_glide",
      durationSeconds: 1.2,
      loop: true,
      optional: true,
      fallbackClip: "swim"
    });
    expect(validateAnimationContract(fish)).toBe(true);

    fish.animationClips.at(-1)!.fallbackClip = "missing";
    expect(() => validateAnimationContract(fish)).toThrow(
      "requires a distinct required fallback clip"
    );
  });

  it("requires generated LODs to use named, ordered, progressively lighter levels", () => {
    const { catalog } = validateCatalog();
    const oak = structuredClone(
      catalog.assets.find((asset) => asset.id === "tree_oak_a")
    ) as CatalogAsset | undefined;
    if (!oak?.lodLevels) throw new Error("tree_oak_a requires generated LOD levels");
    expect(validateLodContract(oak)).toBe(true);

    oak.lodLevels[1].distanceMeters = 0;
    expect(() => validateLodContract(oak)).toThrow("LOD distances must increase strictly");
    oak.lodLevels[1].distanceMeters = 24;
    oak.lodLevels[1].triangleRatioMax = 1.01;
    expect(() => validateLodContract(oak)).toThrow("LOD triangle ratios must not increase");
  });

  it("selects exact assets and whole families without accepting unsafe or unknown input", () => {
    const { catalog } = validateCatalog();
    const parsed = parseArgs(["generate", "--asset", "tree_oak_a", "--family", "fish", "--no-publish"]);
    expect(parsed.publish).toBe(false);
    const fishFamily = catalog.assets
      .filter((asset) => asset.family === "fish")
      .map((asset) => asset.id);
    expect(selectAssets(catalog, parsed).map((asset) => asset.id)).toEqual([
      "tree_oak_a",
      ...fishFamily,
    ]);
    expect(safeFilename("../tree_oak_a.glb")).toBe(false);
    expect(() => selectAssets(catalog, parseArgs(["generate", "--asset", "missing_asset"]))).toThrow(
      "Unknown asset ID"
    );
    expect(() => selectAssets(catalog, parseArgs(["generate"]))).toThrow(
      "Select assets explicitly"
    );
  });

  it("retains only the three newest safe staging runs without touching cache or published assets", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "neva-art-retention-"));
    const staging = path.join(workspace, "generated/.staging");
    const cache = path.join(workspace, "generated/.cache/art");
    const published = path.join(workspace, "public/assets/models");
    fs.mkdirSync(staging, { recursive: true });
    fs.mkdirSync(cache, { recursive: true });
    fs.mkdirSync(published, { recursive: true });
    fs.writeFileSync(path.join(cache, "cache.glb"), "cache");
    fs.writeFileSync(path.join(published, "published.glb"), "published");
    fs.mkdirSync(path.join(staging, "notes"));

    const runs = ["run-a", "run-b", "run-c", "run-d", "run-e"];
    runs.forEach((run, index) => {
      const directory = path.join(staging, run);
      fs.mkdirSync(directory);
      fs.writeFileSync(path.join(directory, "asset-report.json"), "{}");
      const timestamp = new Date(1_700_000_000_000 + index * 1_000);
      fs.utimesSync(directory, timestamp, timestamp);
    });

    const result = pruneStagingRuns(staging, 3, [path.join(staging, "run-e")]);
    expect(result.kept).toEqual(["run-e", "run-d", "run-c"]);
    expect(result.removed).toEqual(["run-b", "run-a"]);
    expect(fs.existsSync(path.join(staging, "notes"))).toBe(true);
    expect(fs.readFileSync(path.join(cache, "cache.glb"), "utf8")).toBe("cache");
    expect(fs.readFileSync(path.join(published, "published.glb"), "utf8")).toBe("published");
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it("deep-links published Art Yard assets and falls back safely for unknown IDs", () => {
    expect(artYardUrl("tree_oak_a")).toBe(
      "http://localhost:3000/__neva_art_yard?asset=tree_oak_a"
    );
    const available = new Set(["tree_oak_a", "boat_skiff_a"]);
    expect(resolveArtYardAssetId("boat_skiff_a", available, "__showcase_village"))
      .toBe("boat_skiff_a");
    expect(resolveArtYardAssetId("missing", available, "__showcase_village"))
      .toBe("__showcase_village");
    expect(
      syncArtYardAssetUrl(
        new URL("http://localhost:3000/__neva_art_yard?artStage=run-a"),
        "tree_oak_a"
      ).toString()
    ).toBe("http://localhost:3000/__neva_art_yard?artStage=run-a&asset=tree_oak_a");
  });

  it("loads a selected runtime GLB from the published manifest", async () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.TREE_OAK_A);
    if (!spec) throw new Error("tree_oak_a is required by the runtime catalog");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "public/assets/models/asset-manifest.json"), "utf8")
    ) as { assets: Array<{ id: string; file: string; fileHash: string }> };
    const published = manifest.assets.find((asset) => asset.id === spec.id);
    if (!published) throw new Error("tree_oak_a is required by the published manifest");

    expect(published.file).toBe(spec.file);
    const publishedPath = path.join(ROOT, "public/assets/models", published.file);
    expect(hash(publishedPath)).toBe(published.fileHash);

    await MeshoptDecoder.ready;
    const document = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder
      })
      .read(publishedPath);
    expect(document.getRoot().listScenes()).toHaveLength(1);
    expect(document.getRoot().listNodes().some((node) => node.getName() === spec.rootNode))
      .toBe(true);
  });

  it("has no static Blender preview command or implementation", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const cliSource = fs.readFileSync(path.join(ROOT, "tools/blender/cli.mjs"), "utf8");
    const removedCommand = ["art", "preview"].join(":");
    const removedResolver = ["resolve", "Preview", "Source"].join("");
    const removedScript = ["pre", "view.py"].join("");

    expect(packageJson.scripts[removedCommand]).toBeUndefined();
    expect(cliSource).not.toContain('args.command === "preview"');
    expect(cliSource).not.toContain(removedResolver);
    expect(fs.existsSync(path.join(ROOT, "tools/blender", removedScript))).toBe(false);
  });

  it("rejects incomplete, unknown, and out-of-range generator parameters", () => {
    const { catalog } = validateCatalog();
    const oak = structuredClone(catalog.assets.find((asset) => asset.generator === "oak_tree"));
    if (!oak) throw new Error("A procedural oak_tree asset is required by the generator fixture");
    expect(validateGeneratorParameters(oak)).toBe(true);
    const rootCount = oak.parameters.rootCount;
    delete oak.parameters.rootCount;
    expect(() => validateGeneratorParameters(oak)).toThrow("missing generator parameters");
    oak.parameters.rootCount = rootCount;
    oak.parameters.noise = 1;
    expect(() => validateGeneratorParameters(oak)).toThrow("unknown generator parameters");
    delete oak.parameters.noise;
    oak.parameters.canopyClusters = 999;
    expect(() => validateGeneratorParameters(oak)).toThrow("invalid generator parameter canopyClusters");
  });

  it("validates and renders a deterministic reference-authoring brief tied to generator parameters", () => {
    const { catalog } = validateCatalog();
    const oak = structuredClone(catalog.assets.find((asset) => asset.id === "tree_oak_a"));
    if (!oak?.referenceAuthoring) throw new Error("tree_oak_a requires the reference-authoring pilot");
    const unguided = structuredClone(catalog.assets.find((asset) => !asset.referenceAuthoring) ?? oak);
    delete unguided.referenceAuthoring;

    expect(validateReferenceAuthoring(oak)).toBe(true);
    expect(validateReferenceAuthoring(unguided)).toBeNull();
    expect(referenceBriefHash(oak)).toMatch(/^[a-f0-9]{64}$/);
    expect(referenceAuthoringSummary(oak)).toMatchObject({
      status: "ready",
      sources: oak.referenceAuthoring.sources.length,
      components: oak.referenceAuthoring.components.length,
      criticalFeatures: oak.referenceAuthoring.criticalFeatures.length,
      reviewViews: oak.referenceAuthoring.reviewViews.length
    });
    const markdown = referenceBriefMarkdown(oak);
    expect(markdown).toContain("# Reference authoring brief: tree_oak_a");
    expect(markdown).toContain(`catalog -> ${oak.generator} -> validated Blender GLB -> atomic runtime publication`);
    expect(markdown).toContain("Direct TypeScript factories");
    expect(referenceBriefMarkdown(oak)).toBe(markdown);

    const invalidBinding = structuredClone(oak);
    const invalidReference = invalidBinding.referenceAuthoring;
    if (!invalidReference) throw new Error("cloned oak reference-authoring fixture is missing");
    invalidReference.parameterBindings[0].parameter = "unregisteredControl";
    expect(() => validateReferenceAuthoring(invalidBinding)).toThrow(
      "reference binding targets unknown generator parameter"
    );

    const missingView = structuredClone(oak);
    const missingReference = missingView.referenceAuthoring;
    if (!missingReference) throw new Error("cloned oak reference-authoring fixture is missing");
    missingReference.reviewViews = missingReference.reviewViews.filter(
      (view) => view !== "rear"
    );
    expect(() => validateReferenceAuthoring(missingView)).toThrow("missing required review views: rear");
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
    expect(manifest.assets).toHaveLength(Object.values(ASSET_IDS).length);
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
    const staleManifest = {
      ...manifest,
      specHash: crypto.createHash("sha256").update("stale-catalog-revision").digest("hex")
    };
    expect(() =>
      validatePublishedManifest(
        staleManifest,
        catalog,
        specHash,
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(ROOT, "art/palettes/neva.palette.json")))
          .digest("hex")
      )
    ).toThrow("does not match");
    expect(palette.tokens).toBeDefined();
  });

  it("keeps selected publication validation focused while preserving full-manifest identity", () => {
    const { catalog, specHash } = validateCatalog();
    const paletteHash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(ROOT, "art/palettes/neva.palette.json")))
      .digest("hex");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, "generated/reports/asset-manifest.json"), "utf8")
    );
    const fish = catalog.assets.find((asset) => asset.id === "fish_trout_a");
    if (!fish) throw new Error("fish_trout_a is required by the catalog fixture");
    const legacy = {
      ...structuredClone(manifest),
      specHash,
      paletteHash,
      toolchainHash: computeToolchainHash()
    };
    const legacyOak = legacy.assets.find((asset: { id: string }) => asset.id === "tree_oak_a");
    delete legacyOak.vertexColorSpace;

    expect(validatePublishedManifest(
      legacy,
      catalog,
      specHash,
      paletteHash,
      "selected",
      [fish]
    )).toBe(legacy);
    expect(() => validatePublishedManifest(
      legacy,
      catalog,
      specHash,
      paletteHash,
      "full"
    )).toThrow("tree_oak_a");
  });
});

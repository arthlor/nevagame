import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Document, NodeIO } from "@gltf-transform/core";
import Ajv2020 from "ajv/dist/2020.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  admitAsset,
  parseArgs,
  resolveAdmissionSource,
  selectAssets,
  validateAdmissionGlb,
  validateGeneratorParameters,
  validateStaticAuthoring,
  validateSourceProvenance,
} from "../../tools/blender/cli.mjs";
import type { CatalogAsset } from "../../tools/blender/cli.mjs";
import { computeAssetInputHash, generatorModuleFor, sha256 } from "../../tools/blender/cache.mjs";
import { compressImportedAsset } from "../../tools/blender/optimize.mjs";
import { runtimeAssetCatalogPlugin } from "../../tools/vite/runtimeAssetCatalogPlugin";

const temporaryRoots: string[] = [];
const palette = { version: 1, tokens: { canvas_cream_01: { hex: "#ded6ba", roughness: 1, metalness: 0 } } };

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neva-admission-test-"));
  temporaryRoots.push(root);
  return root;
}

function put(root: string, relative: string, data: string | Uint8Array) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, data);
  return filename;
}

function fixture() {
  const root = temporaryRoot();
  const sourceBlend = "art/imported/poly-pizza/char_test_a.blend";
  const blendBytes = "BLENDER fixture - adapted geometry and actions";
  put(root, sourceBlend, blendBytes);
  put(root, "tools/blender/generators/registry.py", "from .imported import imported_blend\n");
  put(root, "tools/blender/generators/imported.py", "def imported_blend(): pass\n");
  const asset: CatalogAsset = {
    id: "char_test_a", file: "char_test_a.glb", family: "character", generator: "imported_blend", seed: 1,
    dimensions: { width: 1, depth: 1, height: 1 }, palette: ["canvas_cream_01"],
    budget: { trianglesMin: 4, trianglesTarget: 4, trianglesMax: 8, materialsMax: 1 },
    pivot: "ground_center", collision: "none", instancing: false, lod: "hero",
    rootNode: "test_root", rigNode: "test_rig", socketNodes: ["test_socket", "test_socket_left"],
    requiredNodes: ["test_root", "test_rig", "test_socket", "test_socket_left", "LOD0", "LOD1"], readDistanceMeters: 10,
    parameters: { sourceBlend, sourceCollection: "char_test_a" },
    lodLevels: [
      { node: "LOD0", distanceMeters: 0, triangleRatioMin: 1, triangleRatioMax: 1 },
      { node: "LOD1", distanceMeters: 10, triangleRatioMin: 0.1, triangleRatioMax: 1 },
    ],
    animationClips: [{ name: "idle", durationSeconds: 1, loop: true }],
    sourceProvenance: {
      provider: "poly-pizza", modelId: "model-1", sourceUrl: "https://poly.pizza/m/model-1", author: "Test Author",
      license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceBlend, sourceSha256: sha256(blendBytes), attribution: "Test model by Test Author, adapted for Neva.",
    },
  };
  const other = { ...structuredClone(asset), id: "char_keep_a", file: "char_keep_a.glb" };
  const catalog = { assets: [asset, other], downloadBudgetBytes: 20 * 1024 * 1024 };
  put(root, "assets/specs/asset-catalog.json", JSON.stringify(catalog));
  put(root, "art/palettes/neva.palette.json", JSON.stringify(palette));
  const entries = catalog.assets.map((spec) => ({
    id: spec.id, file: spec.file, family: spec.family, generator: spec.generator, budget: spec.budget,
    bytes: 3, triangles: 4, packagedTriangles: 8, materials: 1, qualityStatus: "on_target", artContractStatus: "passed",
    fileHash: sha256("old"), cacheHit: false, customEvidence: `${spec.id}-keep-me`,
  }));
  const manifest = JSON.stringify({ version: 2, assets: entries });
  put(root, "generated/reports/asset-manifest.json", manifest);
  put(root, "public/assets/models/asset-manifest.json", manifest);
  for (const spec of catalog.assets) {
    put(root, `generated/glb/${spec.file}`, "old");
    put(root, `public/assets/models/${spec.file}`, "old");
  }
  return { root, asset, catalog, entries, manifest };
}

async function exportedGlb(root: string, options: { color?: boolean; material?: string; height?: number } = {}) {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: "SCALAR" | "VEC3" | "VEC4" | "MAT4", array: Float32Array | Uint16Array) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const position = accessor("VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, options.height ?? 1, 0, 0, 0, 1]));
  const normal = accessor("VEC3", new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]));
  const color = accessor("VEC4", new Float32Array(16).fill(1));
  const joints = accessor("VEC4", new Uint16Array(16));
  const weights = accessor("VEC4", new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const indices = accessor("SCALAR", new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
  const primitive = document.createPrimitive().setAttribute("POSITION", position).setAttribute("NORMAL", normal)
    .setAttribute("JOINTS_0", joints).setAttribute("WEIGHTS_0", weights).setIndices(indices)
    .setMaterial(document.createMaterial(options.material ?? "canvas_cream_01").setRoughnessFactor(1).setMetallicFactor(0));
  if (options.color !== false) primitive.setAttribute("COLOR_0", color);
  else color.dispose();
  const mesh = document.createMesh().addPrimitive(primitive);
  const sceneRoot = document.createNode("test_root");
  const rig = document.createNode("test_rig");
  const bone = document.createNode("test_bone").addChild(document.createNode("test_socket"))
    .addChild(document.createNode("test_socket_left"));
  rig.addChild(bone);
  sceneRoot.addChild(rig);
  const skin = document.createSkin("test_skin").addJoint(bone).setSkeleton(bone).setInverseBindMatrices(
    accessor("MAT4", new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])),
  );
  for (const name of ["LOD0", "LOD1"]) {
    sceneRoot.addChild(document.createNode(name).addChild(document.createNode(`${name}_mesh`).setMesh(mesh).setSkin(skin)));
  }
  document.createScene().addChild(sceneRoot);
  const sampler = document.createAnimationSampler().setInput(accessor("SCALAR", new Float32Array([0, 1])))
    .setOutput(accessor("VEC3", new Float32Array([0, 0, 0, 0, 0.1, 0])));
  document.createAnimation("idle").addSampler(sampler).addChannel(
    document.createAnimationChannel().setSampler(sampler).setTargetNode(bone).setTargetPath("translation"),
  );
  return put(root, "output/adapted.glb", await new NodeIO().writeBinary(document));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("selected imported Blender admission", () => {
  it("compiles the closed catalog schema in strict mode and requires imported provenance", () => {
    const schema = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../assets/specs/asset-catalog.schema.json"), "utf8"));
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    const { catalog } = fixture();
    const valid = validate({ version: 1, ...catalog });
    expect(validate.errors).toBeNull();
    expect(valid).toBe(true);
    delete catalog.assets[0]!.sourceProvenance;
    expect(validate({ version: 1, ...catalog })).toBe(false);
    expect(validate.errors?.some((error) => error.keyword === "required" && error.params.missingProperty === "sourceProvenance")).toBe(true);
  });

  it("requires one exact selector and a source, without all/family or generation flags", () => {
    const args = parseArgs(["admit", "--asset", "char_test_a", "--source", "output/adapted.glb", "--no-publish"]);
    expect(args.publish).toBe(false);
    const { catalog } = fixture();
    expect(selectAssets(catalog, args).map((asset) => asset.id)).toEqual(["char_test_a"]);
    for (const tail of [[], ["--all"], ["--family", "character"], ["--asset", "second"], ["--strict"], ["--source", "other.glb"]]) {
      const base = tail.length ? ["admit", "--asset", "char_test_a", "--source", "output/adapted.glb"] : ["admit"];
      expect(() => parseArgs([...base, ...tail])).toThrow();
    }
    expect(() => parseArgs(["generate", "--asset", "char_test_a", "--source", "output/adapted.glb"])).toThrow();
    expect(() => parseArgs(["admit", "--asset", "--source", "output/adapted.glb"])).toThrow();
  });

  it("rejects traversal, escaping symlinks, runtime paths, wrong extensions, and unknown parameters", () => {
    const { root, asset } = fixture();
    expect(validateGeneratorParameters(asset, root)).toBe(true);
    const external = put(temporaryRoot(), "outside.glb", "external");
    fs.symlinkSync(external, path.join(root, "alias.glb"));
    expect(() => resolveAdmissionSource("alias.glb", ".glb", root)).toThrow("inside the repository");
    expect(() => resolveAdmissionSource(path.relative(root, external), ".glb", root)).toThrow("inside the repository");
    for (const source of ["generated/glb/char_test_a.glb", "public/assets/models/char_test_a.glb"]) {
      expect(() => resolveAdmissionSource(source, ".glb", root)).toThrow("runtime destination");
    }
    expect(() => resolveAdmissionSource(asset.sourceProvenance!.sourceBlend, ".glb", root)).toThrow(".glb file");
    expect(() => validateGeneratorParameters({ ...asset, parameters: { ...asset.parameters, sourceCollection: " " } }, root)).toThrow();
    expect(() => validateGeneratorParameters({ ...asset, parameters: { ...asset.parameters, scale: 2 } }, root)).toThrow("unknown generator");
    expect(() => validateGeneratorParameters({ ...asset, parameters: { ...asset.parameters, sourceBlend: external } }, root)).toThrow();
  });

  it("requires closed provenance, verified licensing fields and the adapted source digest", () => {
    const { root, asset } = fixture();
    expect(validateSourceProvenance(asset, root)).toEqual(asset.sourceProvenance);
    for (const patch of [
      { unexpected: true }, { license: "unknown" }, { sourceUrl: "https://poly.pizza/m/another" },
      { licenseUrl: "https://creativecommons.org/licenses/by/4.0/" }, { sourceBlend: "output/other.blend" },
    ]) {
      const modified = { ...asset, sourceProvenance: { ...asset.sourceProvenance, ...patch } } as CatalogAsset;
      expect(() => validateSourceProvenance(modified, root)).toThrow();
    }
    expect(() => validateSourceProvenance({ ...asset, sourceProvenance: undefined }, root)).toThrow("requires verified");
    put(root, asset.sourceProvenance!.sourceBlend, "same path, changed adapted source");
    expect(() => validateSourceProvenance(asset, root)).toThrow("SHA-256 mismatch");
  });

  it("pins static originals and accepts only explicit mapped palette subsets", () => {
    const { root, asset } = fixture();
    const sourceFile = "art/imported/poly-pizza/sources/static.glb";
    const sourceBytes = "immutable static provider bytes";
    put(root, sourceFile, sourceBytes);
    const staticAsset = {
      ...asset,
      staticAuthoring: {
        sourceFile,
        sourceSha256: sha256(sourceBytes),
        sourceNode: "Source_Node",
        scaleReference: { axis: "height" as const, meters: 1 },
        yawDegrees: 0,
        materialMap: {
          Source_Material: { token: "canvas_cream_01", value: 0.9, texturePolicy: "none" as const }
        }
      }
    };
    expect(validateStaticAuthoring(staticAsset, root)).toMatchObject({ sourceNode: "Source_Node" });
    expect(() => validateStaticAuthoring({
      ...staticAsset,
      staticAuthoring: { ...staticAsset.staticAuthoring, sourceSha256: "0".repeat(64) }
    }, root)).toThrow("sourceSha256");
    expect(() => validateStaticAuthoring({
      ...staticAsset,
      staticAuthoring: {
        ...staticAsset.staticAuthoring,
        materialMap: {
          Source_Material: { token: "not_declared", value: 0.9, texturePolicy: "none" as const }
        }
      }
    }, root)).toThrow("undeclared token");
    expect(() => validateStaticAuthoring({
      ...staticAsset,
      staticAuthoring: {
        ...staticAsset.staticAuthoring,
        materialMap: {
          Source_Material: { token: "canvas_cream_01", value: 0.9, texturePolicy: "none" as const },
          Textured_Material: { token: "canvas_cream_01", value: 1, texturePolicy: "preserve" as const }
        }
      }
    }, root)).toThrow("mixes texture policies");
  });

  it("dispatches imported.py and invalidates cached assets when source bytes change in place", () => {
    const { root, asset } = fixture();
    expect(generatorModuleFor("imported_blend", root)).toBe("imported.py");
    const original = computeAssetInputHash(asset, palette, "5.2", {}, root);
    put(root, asset.sourceProvenance!.sourceBlend, "changed source bytes");
    expect(computeAssetInputHash(asset, palette, "5.2", {}, root)).not.toBe(original);
    const second = computeAssetInputHash(asset, palette, "5.2", {}, root);
    put(root, "tools/blender/generators/imported.py", "def imported_blend(): return 2\n");
    expect(computeAssetInputHash(asset, palette, "5.2", {}, root)).not.toBe(second);
  });

  it("stages only, preserving skin/animation bytes and both published destinations", async () => {
    const { root, asset, catalog, manifest } = fixture();
    const source = await exportedGlb(root);
    const original = fs.readFileSync(source);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await admitAsset(asset, source, catalog, palette, { repoRoot: root, publish: false });
    expect(result.published).toBe(false);
    expect(fs.readFileSync(path.join(result.stage, "optimized", asset.file))).toEqual(original);
    expect(fs.readFileSync(source)).toEqual(original);
    for (const directory of ["generated/glb", "public/assets/models"]) {
      expect(fs.readFileSync(path.join(root, directory, asset.file), "utf8")).toBe("old");
    }
    expect(fs.readFileSync(path.join(root, "generated/reports/asset-manifest.json"), "utf8")).toBe(manifest);
    expect(fs.readFileSync(path.join(root, "public/assets/models/asset-manifest.json"), "utf8")).toBe(manifest);
    expect(result.report.assets[0]!.admission).toMatchObject({ packaging: "preserve-bytes", compression: [], blenderSceneValidation: "not-run" });
  });

  it("admits losslessly compressed exports with decoded parity and reports their actual extension", async () => {
    const { root, asset, catalog } = fixture();
    const raw = await exportedGlb(root);
    const compressed = path.join(root, "output/compressed.glb");
    await compressImportedAsset(raw, compressed);
    const original = await validateAdmissionGlb(raw, asset, palette);
    const packaged = await validateAdmissionGlb(compressed, asset, palette);
    expect(packaged.semanticHash).toBe(original.semanticHash);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await admitAsset(asset, compressed, catalog, palette, { repoRoot: root, publish: false });
    expect(result.report.assets[0]!.admission).toMatchObject({ compression: ["EXT_meshopt_compression"] });
    expect(fs.readFileSync(path.join(result.stage, "optimized", asset.file))).toEqual(fs.readFileSync(compressed));
  });

  it("atomically publishes the selected bytes and preserves unrelated manifest entries and files", async () => {
    const { root, asset, catalog, entries } = fixture();
    const source = await exportedGlb(root);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await admitAsset(asset, source, catalog, palette, { repoRoot: root });
    for (const directory of ["generated/glb", "public/assets/models"]) {
      expect(fs.readFileSync(path.join(root, directory, asset.file))).toEqual(fs.readFileSync(source));
      expect(fs.readFileSync(path.join(root, directory, "char_keep_a.glb"), "utf8")).toBe("old");
    }
    const generated = fs.readFileSync(path.join(root, "generated/reports/asset-manifest.json"), "utf8");
    expect(fs.readFileSync(path.join(root, "public/assets/models/asset-manifest.json"), "utf8")).toBe(generated);
    const published = JSON.parse(generated);
    expect(published.assets.find((entry: { id: string }) => entry.id === "char_keep_a")).toEqual(entries[1]);
    expect(generated).not.toContain("sourceProvenance");
    expect(generated).not.toContain(asset.sourceProvenance!.sourceBlend);
  });

  it("rejects nonconforming geometry, dimensions, palette and budgets without publishing", async () => {
    const { root, asset, catalog, manifest } = fixture();
    for (const options of [{ color: false }, { material: "vendor_material" }, { height: 4 }]) {
      const source = await exportedGlb(root, options);
      await expect(admitAsset(asset, source, catalog, palette, { repoRoot: root })).rejects.toThrow();
    }
    const source = await exportedGlb(root);
    await expect(validateAdmissionGlb(source, { ...asset, budget: { ...asset.budget, trianglesMin: 5 } }, palette)).rejects.toThrow("budget");
    await expect(admitAsset({ ...asset, generator: "coastal_worker" }, source, catalog, palette, { repoRoot: root })).rejects.toThrow("imported_blend");
    await expect(admitAsset(asset, source, { ...catalog, downloadBudgetBytes: 1 }, palette, { repoRoot: root, publish: false })).resolves.toMatchObject({ published: false });
    expect(fs.readFileSync(path.join(root, "generated/reports/asset-manifest.json"), "utf8")).toBe(manifest);
  });

  it("fails closed on manifest disagreement and never exposes provenance in runtime projection", async () => {
    const { root, asset, catalog } = fixture();
    const source = await exportedGlb(root);
    put(root, "public/assets/models/asset-manifest.json", "different");
    await expect(admitAsset(asset, source, catalog, palette, { repoRoot: root })).rejects.toThrow("manifests differ");
    const plugin = runtimeAssetCatalogPlugin(root);
    const load = plugin.load as (this: { addWatchFile: (filename: string) => void }, id: string) => string;
    const projected = load.call({ addWatchFile: () => {} }, "\0virtual:neva-runtime-asset-catalog");
    expect(projected).toContain("char_test_a.glb");
    for (const privateField of ["sourceProvenance", "staticAuthoring", "sourceBlend", "sourceFile", "sourceSha256", "author", "attribution", "parameters"]) {
      expect(projected).not.toContain(`"${privateField}"`);
    }
  });
});

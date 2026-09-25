import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
// @ts-expect-error gltf-validator has no bundled type declarations
import { validateBytes } from "gltf-validator";
import { describe, expect, it } from "vitest";

import { createNodeIO, ensureMeshoptReady } from "../../tools/art/optimize.mjs";
import {
  encodeGlb,
  normalizeAuthoredGlb,
  parseGlb,
  repackEmbeddedBuffer
} from "../../tools/art/glb.mjs";
import {
  packageAuthoredGlb,
  produceAuthoredGlb,
  producerKind,
  resolveRepositorySource,
  validateCatalog,
  validateGlb
} from "../../tools/art/cli.mjs";
import type { CatalogAsset } from "../../tools/art/cli.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function khronosIssues(bytes: Uint8Array): Promise<string[]> {
  const report = await validateBytes(new Uint8Array(bytes), {
    uri: "fixture.glb",
    externalResourceFunction: async () => new Uint8Array()
  });
  return report.issues.messages
    .filter((issue: { severity: number }) => issue.severity === 0)
    .map((issue: { code: string }) => issue.code);
}

/** A textured quad whose material carries Tripo-style provider extensions. */
async function texturedFixture({ size = 2048, meshopt = false } = {}): Promise<Uint8Array> {
  await ensureMeshoptReady();
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: "VEC2" | "VEC3" | "SCALAR", array: Float32Array | Uint16Array) =>
    document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  const image = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 180, g: 120, b: 60 } }
  }).jpeg().toBuffer();
  const texture = document.createTexture("albedo").setImage(new Uint8Array(image)).setMimeType("image/jpeg");
  const material = document.createMaterial("tripo_mat").setBaseColorTexture(texture);
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0])))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])))
    .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array([0.0013, 0.0026, 1, 0.0026, 0.0013, 1, 1, 1])))
    .setIndices(accessor("SCALAR", new Uint16Array([0, 1, 2, 2, 1, 3])))
    .setMaterial(material);
  const root = document.createNode("fixture_root").setMesh(document.createMesh("quad").addPrimitive(primitive));
  document.createScene().addChild(root);
  if (meshopt) {
    document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
      method: EXTMeshoptCompression.EncoderMethod.QUANTIZE
    });
  }
  const bytes = await createNodeIO().writeBinary(document);
  const { json, bin } = parseGlb(bytes);
  // Tripo writes rounded UV bounds and tags materials with specular/volume extensions.
  const uv = json.accessors[json.meshes[0].primitives[0].attributes.TEXCOORD_0];
  if (!meshopt) {
    uv.min = [2.2250738585072014e-308, 2.2250738585072014e-308];
    uv.max = [1, 1];
  }
  json.materials[0].extensions = {
    KHR_materials_specular: { specularFactor: 1 },
    KHR_materials_volume: { thicknessFactor: 0 }
  };
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "KHR_materials_specular", "KHR_materials_volume"])];
  return encodeGlb(json, bin);
}

describe("authored GLB normalization", () => {
  it("repairs provider bounds and extensions and caps textures as WebP", async () => {
    const source = await texturedFixture();
    expect(await khronosIssues(source)).toContain("ACCESSOR_MIN_MISMATCH");
    const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 512, sharp });
    expect(report.preservedSourceBytes).toBe(false);
    expect(report.repairedBounds.map((entry: { pointer: string }) => entry.pointer)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\/min\/0$/), expect.stringMatching(/\/min\/1$/)])
    );
    expect(report.removedMaterialExtensions.map((entry: { extension: string }) => entry.extension).sort())
      .toEqual(["KHR_materials_specular", "KHR_materials_volume"]);
    expect(report.textures[0]).toMatchObject({
      resampled: true,
      source: { width: 2048, height: 2048 },
      output: { mimeType: "image/webp", width: 512, height: 512 }
    });
    expect(await khronosIssues(bytes)).toEqual([]);
    const { json } = parseGlb(bytes);
    expect(json.extensionsRequired).toContain("EXT_texture_webp");
    expect(json.extensionsUsed).not.toContain("KHR_materials_specular");
    expect(json.textures[0].source).toBeUndefined();
    expect(json.textures[0].extensions.EXT_texture_webp.source).toBe(0);
  });

  it("returns the source bytes untouched when nothing needs repair", async () => {
    const source = fs.readFileSync(path.join(ROOT, "public/assets/models/tree_oak_a.glb"));
    const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 1024, sharp });
    expect(report.preservedSourceBytes).toBe(true);
    expect(Buffer.compare(Buffer.from(bytes), source)).toBe(0);
  });

  it("moves Meshopt payloads unchanged while replacing an image", async () => {
    const source = await texturedFixture({ meshopt: true });
    const before = await createNodeIO().readBinary(new Uint8Array(source));
    const { bytes } = await normalizeAuthoredGlb(source, { textureMaxSize: 256, sharp });
    expect(await khronosIssues(bytes)).toEqual([]);
    const after = await createNodeIO().readBinary(new Uint8Array(bytes));
    const positions = (document: typeof before) =>
      Array.from(document.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")!.getArray()!);
    expect(positions(after)).toEqual(positions(before));
    expect(parseGlb(bytes).json.extensionsUsed).toContain("EXT_meshopt_compression");
  });

  it("fails closed on overlapping buffer ranges", () => {
    const json = {
      buffers: [{ byteLength: 16 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }, { buffer: 0, byteOffset: 8, byteLength: 8 }]
    };
    expect(() => repackEmbeddedBuffer(json, Buffer.alloc(16), new Map([[0, Buffer.alloc(4)]])))
      .toThrow("Overlapping buffer ranges");
  });
});

describe("authored GLB producer", () => {
  const { catalog } = validateCatalog();
  const spec = (id: string) => structuredClone(catalog.assets.find((asset) => asset.id === id)) as CatalogAsset;

  it("assigns every catalog asset exactly one producer", () => {
    const kinds = new Map<string, number>();
    for (const asset of catalog.assets) kinds.set(producerKind(asset), (kinds.get(producerKind(asset)) ?? 0) + 1);
    expect([...kinds.keys()].sort()).toEqual(["authored", "authored_glb", "frozen"]);
    expect(producerKind(spec("char_npc_tomas_b"))).toBe("authored_glb");
    expect(producerKind(spec("tree_oak_a"))).toBe("frozen");
    expect(producerKind(spec("fauna_dog_a"))).toBe("authored");
  });

  it("refuses sources outside the repository or inside published and generated trees", () => {
    for (const source of ["public/assets/models/tree_oak_a.glb", "generated/glb/tree_oak_a.glb", "../outside.glb"]) {
      expect(() => resolveRepositorySource(source, ".glb", ROOT)).toThrow();
    }
    expect(resolveRepositorySource("art/imported/poly-pizza/adapted/house_cottage_a.glb", ".glb", ROOT))
      .toMatch(/house_cottage_a\.glb$/);
  });

  it("produces and packages a committed source through the published contract", async () => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-authored-glb-"));
    try {
      const cottage = spec("house_cottage_a");
      const report = await produceAuthoredGlb(cottage, stage, ROOT);
      expect(report).toMatchObject({ id: "house_cottage_a", producer: "authored_glb", artContractStatus: "passed" });
      const raw = path.join(stage, cottage.file);
      const optimized = path.join(stage, `packaged_${cottage.file}`);
      // Already Meshopt-compressed sources keep their geometry bytes.
      expect(await packageAuthoredGlb(raw, optimized, cottage)).toBe("source-compression");
      expect(Buffer.compare(fs.readFileSync(raw), fs.readFileSync(optimized))).toBe(0);
      await expect(validateGlb(optimized, cottage, "test", ROOT)).resolves.toMatchObject({ artContractStatus: "passed" });

      // Catalog dimensions guard against a mis-scaled or mis-pivoted source.
      await expect(produceAuthoredGlb({ ...cottage, dimensions: { ...cottage.dimensions, height: 40 } }, stage, ROOT))
        .rejects.toThrow("incompatible with the catalog dimensions");
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("holds textured Tripo characters to the texture cap and palette rules for untextured parts", async () => {
    const tomas = spec("char_npc_tomas_b");
    const published = path.join(ROOT, "public/assets/models", tomas.file);
    await expect(validateGlb(published, tomas, "test", ROOT)).resolves.toMatchObject({ texturedPrimitives: 1 });
    await expect(validateGlb(published, { ...tomas, parameters: { ...tomas.parameters, textureMaxSize: 256 } }, "test", ROOT))
      .rejects.toThrow("above its 256px cap");
    const house = spec("house_cottage_a");
    const housePath = path.join(ROOT, "public/assets/models", house.file);
    await expect(validateGlb(housePath, { ...house, palette: house.palette.slice(1) }, "test", ROOT))
      .rejects.toThrow("is not a declared palette token");
  });

  it("keeps MeshoptEncoder available for static packaging", async () => {
    await MeshoptEncoder.ready;
    expect(MeshoptEncoder.supported).toBe(true);
  });
});

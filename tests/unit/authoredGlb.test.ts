import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Document } from "@gltf-transform/core";
import { EXTMeshoptCompression } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import { prepareAssetTemplate } from "../../src/render/loaders/AssetLoader";
import type { AssetId } from "../../src/render/assets/AssetCatalog";

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

/** A textured quad with provider bounds and native PBR extensions. */
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
  // Some providers round UV bounds; native PBR extensions still belong to the source.
  const uv = json.accessors[json.meshes[0].primitives[0].attributes.TEXCOORD_0];
  if (!meshopt) {
    uv.min = [2.2250738585072014e-308, 2.2250738585072014e-308];
    uv.max = [1, 1];
  }
  json.materials[0].extensions = {
    KHR_materials_specular: { specularFactor: .27, specularColorFactor: [.9, .2, .6] },
    KHR_materials_volume: { thicknessFactor: .4, attenuationDistance: 3, attenuationColor: [.3, .8, .5] },
    KHR_materials_transmission: { transmissionFactor: .55 }
  };
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), ...Object.keys(json.materials[0].extensions)])];
  return encodeGlb(json, bin);
}

async function nativePbrFixture({ physical = false, colors, colorSize = 3 }: {
  physical?: boolean; colors?: number[]; colorSize?: 3 | 4;
} = {}): Promise<Uint8Array> {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (type: "VEC3" | "VEC4" | "SCALAR", array: Float32Array | Uint16Array) =>
    document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  const material = document.createMaterial("native_pbr")
    .setBaseColorFactor([.15, .85, .35, 1]).setRoughnessFactor(.18).setMetallicFactor(.65)
    .setDoubleSided(!physical);
  const primitive = document.createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", new Float32Array([0,0,0, 1,0,0, 0,1,1, 1,1,1])))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(new Array(4).fill([0, -Math.SQRT1_2, Math.SQRT1_2]).flat())))
    .setIndices(accessor("SCALAR", new Uint16Array([0,1,2, 2,1,3])))
    .setMaterial(material);
  if (colors) primitive.setAttribute("COLOR_0", accessor(colorSize === 4 ? "VEC4" : "VEC3", new Float32Array(colors)));
  document.createScene().addChild(document.createNode("fixture_root")
    .setMesh(document.createMesh("native_mesh").addPrimitive(primitive)));
  const bytes = await createNodeIO().writeBinary(document);
  if (!physical) return bytes;
  const { json, bin } = parseGlb(bytes);
  json.materials[0].extensions = {
    KHR_materials_specular: { specularFactor: .27, specularColorFactor: [.9, .2, .6] },
    KHR_materials_volume: { thicknessFactor: .4, attenuationDistance: 3, attenuationColor: [.3, .8, .5] },
    KHR_materials_transmission: { transmissionFactor: .55 }
  };
  json.extensionsUsed = Object.keys(json.materials[0].extensions);
  return encodeGlb(json, bin);
}

function nativePbrSpec(generator = "authored_glb"): CatalogAsset {
  return {
    id: "native_pbr_fixture", file: "native_pbr_fixture.glb", family: "prop", generator, seed: 1,
    dimensions: { width: 1, depth: 1, height: 1 }, palette: [],
    budget: { trianglesMin: 10, trianglesTarget: 20, trianglesMax: 30, materialsMax: 1 },
    pivot: "ground_center", collision: "none", instancing: false, lod: "none",
    rootNode: "fixture_root", requiredNodes: ["fixture_root"], readDistanceMeters: 20,
    parameters: { sourceGlb: "art/authored/native_pbr_fixture.glb", textureMaxSize: 1024 }
  };
}

describe("authored GLB normalization", () => {
  it("repairs provider bounds and caps textures while preserving native PBR extensions", async () => {
    const source = await texturedFixture();
    expect(await khronosIssues(source)).toContain("ACCESSOR_MIN_MISMATCH");
    const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 512, sharp });
    expect(report.preservedSourceBytes).toBe(false);
    expect(report.repairedBounds.map((entry: { pointer: string }) => entry.pointer)).toEqual(
      expect.arrayContaining([expect.stringMatching(/\/min\/0$/), expect.stringMatching(/\/min\/1$/)])
    );
    expect(report.removedMaterialExtensions).toEqual([]);
    expect(report.textures[0]).toMatchObject({
      resampled: true,
      source: { width: 2048, height: 2048 },
      output: { mimeType: "image/webp", width: 512, height: 512 }
    });
    expect(await khronosIssues(bytes)).toEqual([]);
    const { json } = parseGlb(bytes);
    expect(json.extensionsRequired).toContain("EXT_texture_webp");
    expect(json.materials[0].extensions).toEqual(parseGlb(source).json.materials[0].extensions);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining([
      "KHR_materials_specular", "KHR_materials_volume", "KHR_materials_transmission"
    ]));
    expect(json.textures[0].source).toBeUndefined();
    expect(json.textures[0].extensions.EXT_texture_webp.source).toBe(0);
  });

  it("only removes a zero-emission no-op extension that Khronos rejects", async () => {
    const { json, bin } = parseGlb(await nativePbrFixture({ physical: true }));
    json.materials[0].extensions.KHR_materials_emissive_strength = { emissiveStrength: 2 };
    json.extensionsUsed.push("KHR_materials_emissive_strength");
    const source = encodeGlb(json, bin);
    const before = await validateBytes(new Uint8Array(source), { uri: "fixture.glb" });
    expect(before.issues.messages.map((issue: { code: string }) => issue.code))
      .toContain("KHR_MATERIALS_EMISSIVE_STRENGTH_ZERO_FACTOR");
    const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 1024, sharp });
    expect(report.removedMaterialExtensions).toEqual([
      { material: "native_pbr", extension: "KHR_materials_emissive_strength" }
    ]);
    const normalized = parseGlb(bytes);
    expect(normalized.json.extensionsUsed).not.toContain("KHR_materials_emissive_strength");
    expect(normalized.json.materials[0].extensions.KHR_materials_specular)
      .toEqual(json.materials[0].extensions.KHR_materials_specular);
    expect(normalized.json.materials[0].extensions.KHR_materials_volume)
      .toEqual(json.materials[0].extensions.KHR_materials_volume);
    expect(normalized.bin).toEqual(bin);
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

  it.each(["house_cottage_a", "house_cottage_b"])("produces and packages %s through the published contract", async (id) => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-authored-glb-"));
    try {
      const cottage = spec(id);
      const report = await produceAuthoredGlb(cottage, stage, ROOT);
      expect(report).toMatchObject({ id, producer: "authored_glb", artContractStatus: "passed" });
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

  it("repacks an already compressed animated source so its keyframes share buffer views, value for value", async () => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-authored-glb-"));
    try {
      const cow = spec("fauna_cow_a");
      await produceAuthoredGlb(cow, stage, ROOT);
      const raw = path.join(stage, cow.file);
      const optimized = path.join(stage, `packaged_${cow.file}`);
      expect(await packageAuthoredGlb(raw, optimized, cow)).toBe("lossless-recompression");
      await ensureMeshoptReady();
      const io = createNodeIO();
      const before = (await io.readBinary(fs.readFileSync(raw))).getRoot();
      const after = (await io.readBinary(fs.readFileSync(optimized))).getRoot();
      expect(after.listAccessors().map((accessor) => Array.from(accessor.getArray()!)))
        .toEqual(before.listAccessors().map((accessor) => Array.from(accessor.getArray()!)));
      expect(after.listAnimations().map((animation) => [animation.getName(), animation.listChannels().length]))
        .toEqual(before.listAnimations().map((animation) => [animation.getName(), animation.listChannels().length]));
      expect(parseGlb(fs.readFileSync(optimized)).json.bufferViews.length)
        .toBeLessThan(parseGlb(fs.readFileSync(raw)).json.bufferViews.length / 4);
      await expect(validateGlb(optimized, cow, "test", ROOT)).resolves.toMatchObject({ artContractStatus: "passed" });
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("holds textured sources to the texture cap and permits native source materials without a palette", async () => {
    const tomas = spec("char_npc_tomas_b");
    const published = path.join(ROOT, "public/assets/models", tomas.file);
    await expect(validateGlb(published, tomas, "test", ROOT)).resolves.toMatchObject({ texturedPrimitives: 1 });
    await expect(validateGlb(published, { ...tomas, parameters: { ...tomas.parameters, textureMaxSize: 256 } }, "test", ROOT))
      .rejects.toThrow("above its 256px cap");
    const house = spec("house_cottage_a");
    const housePath = path.join(ROOT, "public/assets/models", house.file);
    await expect(validateGlb(housePath, { ...house, palette: [] }, "test", ROOT))
      .resolves.toMatchObject({ artContractStatus: "passed" });
  });

  it.each(["authored_glb", "imported_blend"])("preserves untextured native PBR factors through %s admission and runtime adoption", async (generator) => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-native-pbr-"));
    try {
      const source = await nativePbrFixture();
      const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 1024, sharp });
      expect(report.preservedSourceBytes).toBe(true);
      expect(bytes).toEqual(Buffer.from(source));
      const asset = nativePbrSpec(generator);
      const filename = path.join(stage, asset.file);
      fs.writeFileSync(filename, bytes);
      await expect(validateGlb(filename, asset, "test", ROOT)).resolves.toMatchObject({
        triangles: 2, vertexColorPrimitives: 0, texturedPrimitives: 0, doubleSidedMaterials: 1,
        qualityStatus: "below_target", artContractStatus: "passed"
      });
      const packaged = path.join(stage, `packaged_${asset.file}`);
      expect(await packageAuthoredGlb(filename, packaged, asset)).toBe("static-optimization");
      expect(parseGlb(fs.readFileSync(packaged)).json.materials[0].pbrMetallicRoughness)
        .toEqual(parseGlb(source).json.materials[0].pbrMetallicRoughness);
      const decoded = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(Uint8Array.from(fs.readFileSync(packaged)).buffer, "");
      const root = prepareAssetTemplate(decoded.scene, decoded.animations, { id: asset.id as AssetId, lodLevels: null });
      const mesh = root.getObjectByName("fixture_root") as THREE.Mesh;
      const native = mesh.material as THREE.MeshStandardMaterial;
      expect(mesh.geometry.getAttribute("color")).toBeUndefined();
      expect(native.color.toArray()).toEqual([.15, .85, .35]);
      expect(native.roughness).toBe(.18);
      expect(native.metalness).toBe(.65);
      expect(native.side).toBe(THREE.DoubleSide);
      expect(native.flatShading).toBe(false);
      await expect(validateGlb(packaged, asset, "test", ROOT)).resolves.toMatchObject({ artContractStatus: "passed" });
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("preserves supported source specular and volume extensions through normalization, packaging and runtime adoption", async () => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-native-physical-"));
    try {
      const source = await nativePbrFixture({ physical: true });
      const { bytes, report } = await normalizeAuthoredGlb(source, { textureMaxSize: 1024, sharp });
      expect(report.preservedSourceBytes).toBe(true);
      expect(bytes).toEqual(Buffer.from(source));
      const asset = nativePbrSpec();
      const filename = path.join(stage, asset.file);
      const packaged = path.join(stage, `packaged_${asset.file}`);
      fs.writeFileSync(filename, bytes);
      await packageAuthoredGlb(filename, packaged, asset);
      const sourceExtensions = parseGlb(source).json.materials[0].extensions;
      const packagedExtensions = parseGlb(fs.readFileSync(packaged)).json.materials[0].extensions;
      expect(packagedExtensions.KHR_materials_specular).toEqual(sourceExtensions.KHR_materials_specular);
      expect(packagedExtensions.KHR_materials_transmission).toEqual(sourceExtensions.KHR_materials_transmission);
      expect(packagedExtensions.KHR_materials_volume.attenuationDistance).toBe(3);
      expect(packagedExtensions.KHR_materials_volume.attenuationColor).toEqual([.3, .8, .5]);
      await expect(validateGlb(packaged, asset, "test", ROOT)).resolves.toMatchObject({ artContractStatus: "passed" });
      const decoded = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        .parseAsync(Uint8Array.from(fs.readFileSync(packaged)).buffer, "");
      const root = prepareAssetTemplate(decoded.scene, decoded.animations, { id: asset.id as AssetId, lodLevels: null });
      const mesh = root.getObjectByName("fixture_root") as THREE.Mesh;
      const native = mesh.material as THREE.MeshPhysicalMaterial;
      expect(native).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(native.specularIntensity).toBe(.27);
      expect(native.specularColor.toArray()).toEqual([.9, .2, .6]);
      expect(native.transmission).toBe(.55);
      // Static quantization adjusts volume thickness alongside node scale to preserve metres.
      expect(native.thickness * mesh.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(.4);
      expect(native.attenuationColor.toArray()).toEqual([.3, .8, .5]);
      expect(native.attenuationDistance).toBe(3);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it.each([
    { name: "RGB", size: 3 as const, colors: [0,1,0, 1,0,1, .1,.2,.9, .8,.4,.2] },
    { name: "RGBA", size: 4 as const, colors: [0,1,0,1, 1,0,1,.5, .1,.2,.9,0, .8,.4,.2,1] }
  ])("admits and preserves optional source $name gradients", async ({ size, colors }) => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-native-gradient-"));
    try {
      const asset = nativePbrSpec();
      const bytes = await nativePbrFixture({ colors, colorSize: size });
      const filename = path.join(stage, asset.file);
      fs.writeFileSync(filename, bytes);
      await expect(validateGlb(filename, asset, "test", ROOT)).resolves.toMatchObject({ vertexColorPrimitives: 1 });
      const decoded = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "");
      const root = prepareAssetTemplate(decoded.scene, decoded.animations, { id: asset.id as AssetId, lodLevels: null });
      const mesh = root.getObjectByName("fixture_root") as THREE.Mesh;
      const color = mesh.geometry.getAttribute("color");
      expect(color.itemSize).toBe(size);
      expect(Array.from({ length: color.count }, (_, vertex) => [
        color.getX(vertex), color.getY(vertex), color.getZ(vertex), ...(size === 4 ? [color.getW(vertex)] : [])
      ]).flat()).toEqual(Array.from(new Float32Array(colors)));
      expect((mesh.material as THREE.MeshStandardMaterial).color.toArray()).toEqual([.15, .85, .35]);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it.each([
    { reason: "out-of-range RGB", size: 3 as const, colors: [1.2,0,0, 0,1,0, 0,0,1, 1,1,1] },
    { reason: "out-of-range alpha", size: 4 as const, colors: [1,0,0,1.2, 0,1,0,1, 0,0,1,1, 1,1,1,1] },
    { reason: "nonfinite", size: 3 as const, colors: [NaN,0,0, 0,1,0, 0,0,1, 1,1,1] },
    { reason: "mismatched count", size: 3 as const, colors: [1,0,0, 0,1,0, 0,0,1] }
  ])("rejects $reason optional source COLOR_0", async ({ size, colors }) => {
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), "neva-native-color-"));
    try {
      const asset = nativePbrSpec();
      const filename = path.join(stage, asset.file);
      fs.writeFileSync(filename, await nativePbrFixture({ colors, colorSize: size }));
      await expect(validateGlb(filename, asset, "test", ROOT)).rejects.toThrow("validation failed");
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  });

  it("keeps MeshoptEncoder available for static packaging", async () => {
    await MeshoptEncoder.ready;
    expect(MeshoptEncoder.supported).toBe(true);
  });
});

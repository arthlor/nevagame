import path from "node:path";
import fs from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  weld,
  dedup,
  prune,
  quantize,
  reorder,
  meshopt,
  simplify,
  join,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

export const DEFAULT_OPTIMIZE_CONFIG = Object.freeze({
  weldTolerance: 0.0005,
  quantizePosition: 14,
  quantizeNormal: 10,
  quantizeTexcoord: 12,
  quantizeColor: 8,
  meshoptLevel: "medium",
});

let readyPromise = null;
export async function ensureMeshoptReady() {
  if (!readyPromise) {
    readyPromise = Promise.all([
      MeshoptDecoder.ready,
      MeshoptEncoder.ready,
    ]);
  }
  return readyPromise;
}

export function createNodeIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
}

export function mayJoinStaticNode(node, spec = {}) {
  const name = node.getName ? node.getName() : "";
  // LOD generators already consolidate each level by material. Joining here
  // could cross switch boundaries and invalidate runtime distance selection.
  if (spec.lodLevels && spec.lodLevels.length > 0) return false;
  const requiredNodes = spec.requiredNodes || [];
  if (requiredNodes.includes(name) || name.startsWith("COL_")) return false;
  // Preserve authored character hierarchy, rig, sockets, and skinned parts.
  if (spec.family === "character") return false;

  // Rowboat oars are presentation-rigged at runtime.
  if (spec.generator === "rowboat" && name.startsWith("rowboat_oar_")) return false;
  // Windmill hub/spars/sails are rotated dynamically at runtime.
  if (
    spec.generator === "windmill" &&
    (name === "windmill_hub" || name.startsWith("windmill_spar_") || name.startsWith("windmill_sail_"))
  ) {
    return false;
  }
  return true;
}

/**
 * Optimizes a single GLB asset using gltf-transform and meshoptimizer.
 */
export async function optimizeAsset(source, destination, spec = {}, options = {}) {
  await ensureMeshoptReady();
  const io = createNodeIO();

  let document;
  if (typeof source === "string") {
    document = await io.read(source);
  } else if (source instanceof Uint8Array || Buffer.isBuffer(source)) {
    document = await io.readBinary(source);
  } else {
    document = source;
  }

  const weldTol = options.weldTolerance ?? DEFAULT_OPTIMIZE_CONFIG.weldTolerance;
  const quantPos = options.quantizePosition ?? DEFAULT_OPTIMIZE_CONFIG.quantizePosition;
  const quantNorm = options.quantizeNormal ?? DEFAULT_OPTIMIZE_CONFIG.quantizeNormal;
  const quantTex = options.quantizeTexcoord ?? DEFAULT_OPTIMIZE_CONFIG.quantizeTexcoord;
  const quantCol = options.quantizeColor ?? DEFAULT_OPTIMIZE_CONFIG.quantizeColor;
  const meshLevel = options.meshoptLevel ?? DEFAULT_OPTIMIZE_CONFIG.meshoptLevel;

  const transforms = [
    dedup(),
    join({ cleanup: false, filter: (node) => mayJoinStaticNode(node, spec) }),
    prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
    weld({ tolerance: weldTol }),
    quantize({
      quantizePosition: quantPos,
      quantizeNormal: quantNorm,
      quantizeTexcoord: quantTex,
      quantizeColor: quantCol,
    }),
    reorder({ encoder: MeshoptEncoder }),
    meshopt({ encoder: MeshoptEncoder, level: meshLevel }),
  ];

  await document.transform(...transforms);

  if (typeof destination === "string") {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    await io.write(destination, document);
    return destination;
  }
  return io.writeBinary(document);
}

/**
 * Exporters such as Tripo's give every animation sampler accessor a buffer view of its own. Each
 * view then carries its own JSON record and Meshopt stream, which cost more than a short track's
 * keyframes (a character's JSON outweighed its geometry). Views that only animation accessors read,
 * without a stride, are concatenated per element size into one view; each accessor keeps its type,
 * count and bytes and only gains an offset into the shared view. Any other view, and any document
 * that references buffer views from somewhere this does not rewrite, is left as it is.
 */
function mergeAnimationBufferViews(json, binary, componentBytes, components) {
  const views = json.bufferViews ?? [];
  const accessors = json.accessors ?? [];
  const animationAccessors = new Set((json.animations ?? [])
    .flatMap((animation) => animation.samplers.flatMap((sampler) => [sampler.input, sampler.output])));
  if (!animationAccessors.size) return binary;
  // Only accessors and images reference buffer views in the documents this packages.
  const elsewhere = { ...json };
  delete elsewhere.accessors;
  delete elsewhere.images;
  delete elsewhere.bufferViews;
  if (JSON.stringify(elsewhere).includes("\"bufferView\"") || accessors.some((accessor) => accessor.sparse)) return binary;
  const readers = views.map(() => []);
  for (const [index, accessor] of accessors.entries()) if (accessor.bufferView !== undefined) readers[accessor.bufferView].push(index);
  const imageViews = new Set((json.images ?? []).map((image) => image.bufferView).filter((view) => view !== undefined));
  const strideOf = (viewIndex) => {
    const view = views[viewIndex];
    const readersOfView = readers[viewIndex];
    if (!readersOfView.length || imageViews.has(viewIndex) || view.buffer !== 0 || view.byteStride !== undefined
      || view.extensions || view.target !== undefined || !readersOfView.every((index) => animationAccessors.has(index))) return 0;
    const sizes = new Set(readersOfView.map((index) => componentBytes[accessors[index].componentType] * components[accessors[index].type]));
    const [stride] = sizes;
    return sizes.size === 1 && stride % 4 === 0 && stride <= 256 && view.byteLength % stride === 0 ? stride : 0;
  };
  const strides = views.map((_, index) => strideOf(index));
  const groups = new Map();
  strides.forEach((stride, index) => { if (stride) groups.set(stride, [...(groups.get(stride) ?? []), index]); });
  if (![...groups.values()].some((members) => members.length > 1)) return binary;

  const chunks = [];
  let total = 0;
  const place = (bytes) => {
    const offset = total;
    chunks.push(bytes);
    const padding = (4 - bytes.length % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    total += bytes.length + padding;
    return offset;
  };
  const merged = [];
  const remap = new Map();
  for (const [index, view] of views.entries()) {
    const stride = strides[index];
    const members = stride ? groups.get(stride) : null;
    if (members && members[0] !== index) continue;
    const newIndex = merged.length;
    if (!members) {
      const offset = view.byteOffset ?? 0;
      merged.push({ ...view, byteOffset: place(binary.subarray(offset, offset + view.byteLength)) });
      remap.set(index, { view: newIndex, shift: 0 });
      continue;
    }
    let length = 0;
    const parts = members.map((member) => {
      const offset = views[member].byteOffset ?? 0;
      remap.set(member, { view: newIndex, shift: length });
      length += views[member].byteLength;
      return binary.subarray(offset, offset + views[member].byteLength);
    });
    merged.push({ buffer: 0, byteLength: length, byteOffset: place(Buffer.concat(parts)) });
  }
  for (const accessor of accessors) {
    if (accessor.bufferView === undefined) continue;
    const { view, shift } = remap.get(accessor.bufferView);
    accessor.bufferView = view;
    if (shift || accessor.byteOffset) accessor.byteOffset = (accessor.byteOffset ?? 0) + shift;
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = remap.get(image.bufferView).view;
  json.bufferViews = merged;
  json.buffers[0].byteLength = total;
  return Buffer.concat(chunks);
}

/**
 * Lossless packaging for skinned or animated authored GLB sources. Unlike optimizeAsset, this does
 * not rewrite nodes, bind matrices, weights, animation channels or any decoded accessor value;
 * animation keyframes share buffer views (see mergeAnimationBufferViews).
 * INDICES avoids the cyclic triangle rotation permitted by the TRIANGLES codec.
 */
export async function compressImportedAsset(source, destination) {
  await ensureMeshoptReady();
  const bytes = typeof source === "string" ? fs.readFileSync(source) : Buffer.from(source);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("Imported compression requires a complete GLB 2.0");
  }
  let json;
  let binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) throw new Error("Truncated imported GLB chunk");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").trim());
    else if (type === 0x004e4942) binary = chunk;
    else throw new Error("Unexpected imported GLB chunk");
    offset += length + 8;
  }
  if (!json || !binary || json.buffers?.length !== 1 || json.buffers[0].uri) throw new Error("Imported GLB must embed one buffer");
  if (json.extensionsUsed?.includes("EXT_meshopt_compression")) throw new Error("Imported source is already compressed");
  const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
  binary = mergeAnimationBufferViews(json, binary, componentBytes, components);
  const indexAccessors = new Set((json.meshes ?? []).flatMap(mesh => mesh.primitives.map(p => p.indices)).filter(i => i !== undefined));
  const chunks = [];
  let total = 0;
  let compressedCount = 0;
  const append = data => {
    const offset = total;
    chunks.push(data);
    const padding = (4 - data.length % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    total += data.length + padding;
    return offset;
  };
  for (const [viewIndex, view] of (json.bufferViews ?? []).entries()) {
    if (view.buffer !== 0 || view.extensions) throw new Error("Imported compression expects plain, uncompressed buffer views");
    const originalOffset = view.byteOffset ?? 0;
    const raw = binary.subarray(originalOffset, originalOffset + view.byteLength);
    if (raw.length !== view.byteLength) throw new Error("Imported buffer view exceeds embedded buffer");
    const refs = (json.accessors ?? []).map((accessor, index) => ({ accessor, index })).filter(({ accessor }) => accessor.bufferView === viewIndex);
    const first = refs[0]?.accessor;
    const isIndices = refs.length > 0 && refs.every(({ index }) => indexAccessors.has(index));
    const stride = view.byteStride ?? (componentBytes[first?.componentType] * components[first?.type]);
    const compatible = refs.length > 0 && refs.every(({ accessor }) => !accessor.sparse)
      && Number.isInteger(stride) && stride > 0 && stride <= 256 && raw.length % stride === 0
      && (isIndices ? [2, 4].includes(stride) : stride % 4 === 0);
    if (!compatible) {
      view.byteOffset = append(raw);
      continue;
    }
    const count = raw.length / stride;
    const mode = isIndices ? "INDICES" : "ATTRIBUTES";
    const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode));
    const decoded = new Uint8Array(raw.length);
    MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, encoded, mode);
    if (!Buffer.from(decoded).equals(raw)) throw new Error(`Lossless Meshopt parity failed for buffer view ${viewIndex}`);
    view.buffer = 1;
    view.byteOffset = originalOffset;
    view.extensions = { EXT_meshopt_compression: { buffer: 0, byteOffset: append(encoded), byteLength: encoded.length, byteStride: stride, count, mode } };
    compressedCount++;
  }
  if (!compressedCount) throw new Error("Imported GLB has no compressible geometry or animation data");
  const originalLength = json.buffers[0].byteLength;
  json.buffers[0].byteLength = total;
  json.buffers.push({ byteLength: originalLength, extensions: { EXT_meshopt_compression: { fallback: true } } });
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "EXT_meshopt_compression"])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), "EXT_meshopt_compression"])];
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonPadding = Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + jsonPadding.length + total, 8);
  header.writeUInt32LE(jsonBytes.length + jsonPadding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(total, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([header, jsonBytes, jsonPadding, binaryHeader, ...chunks]);
  if (typeof destination === "string") {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, result);
    return destination;
  }
  return result;
}

/**
 * Optimizes LOD0 and generates simplified derived LODs (LOD1, LOD2, etc.) if configured.
 */
export async function optimizeAndGenerateLods(sourceGlbPath, outputBaseDir, assetSpec = {}, options = {}) {
  await ensureMeshoptReady();
  const io = createNodeIO();

  fs.mkdirSync(outputBaseDir, { recursive: true });
  const fileName = assetSpec.file || `${assetSpec.id}.glb`;
  const lod0Path = path.join(outputBaseDir, fileName);

  // 1. Optimize Base LOD0
  await optimizeAsset(sourceGlbPath, lod0Path, assetSpec, options);
  const generatedFiles = [lod0Path];

  // 2. Generate Derived LODs if spec defines lodLevels
  if (assetSpec.lodLevels && assetSpec.lodLevels.length > 1) {
    for (let i = 1; i < assetSpec.lodLevels.length; i++) {
      const level = assetSpec.lodLevels[i];
      const lodDoc = await io.read(sourceGlbPath); // read fresh unquantized copy

      const targetRatio = level.triangleRatioTarget ?? level.triangleRatioMax ?? (1.0 / (i + 1));
      const lodTransforms = [
        weld({ tolerance: 0.001 }),
        simplify({
          simplifier: MeshoptSimplifier,
          ratio: targetRatio,
          error: 0.02,
        }),
        dedup(),
        prune({ keepLeaves: true, keepAttributes: true, keepExtras: true }),
        quantize({
          quantizePosition: 12,
          quantizeNormal: 8,
          quantizeColor: 8,
        }),
        reorder({ encoder: MeshoptEncoder }),
        meshopt({ encoder: MeshoptEncoder, level: "medium" }),
      ];

      await lodDoc.transform(...lodTransforms);

      const baseName = fileName.replace(/\.glb$/, "");
      const lodFileName = `${baseName}.lod${i}.glb`;
      const lodPath = path.join(outputBaseDir, lodFileName);
      await io.write(lodPath, lodDoc);
      generatedFiles.push(lodPath);
    }
  }

  return {
    lod0Path,
    generatedFiles,
  };
}

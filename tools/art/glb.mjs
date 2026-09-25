/**
 * Byte-level GLB utilities for the `authored_glb` producer.
 *
 * An authored GLB (a Tripo download, a code-authored building export, or a frozen adapted
 * derivative) is normalized here before packaging. Every step works on the GLB's own JSON and
 * binary chunk, so node order, names, skins, clips and extras stay exactly as authored:
 *
 * - declared accessor `min`/`max` are recomputed from the data (Tripo rounds them, which Khronos
 *   rejects as ACCESSOR_MIN_MISMATCH);
 * - provider material extensions Neva's palette owns (`KHR_materials_specular`,
 *   `KHR_materials_volume`) are dropped, as is `KHR_materials_emissive_strength` on a material
 *   whose emissive factor is zero, where it has no effect;
 * - embedded textures larger than the asset's declared `textureMaxSize` are resampled to fit and
 *   re-encoded as WebP (`EXT_texture_webp`); textures within the cap keep their bytes.
 *
 * Geometry bytes are never rewritten here. When nothing changes, the source bytes are returned
 * unchanged.
 */
import { MeshoptDecoder } from "meshoptimizer";

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

/** Material extensions a provider may declare but Neva's palette owns. */
export const PROVIDER_MATERIAL_EXTENSIONS = Object.freeze(["KHR_materials_specular", "KHR_materials_volume"]);
/** Texture sizes an authored GLB may declare; the budget file owns which ones a class may use. */
export const TEXTURE_SIZES = Object.freeze([256, 512, 1024, 2048]);
/** WebP settings for resampled textures: near-transparent quality with exact alpha. */
export const TEXTURE_WEBP_OPTIONS = Object.freeze({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true });

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function asBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Parses a GLB 2.0 container into its JSON document and embedded binary chunk. */
export function parseGlb(bytes) {
  const buffer = asBuffer(bytes);
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Expected a GLB 2.0 file");
  }
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("GLB header length does not match the file");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error("Truncated GLB chunk header");
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > buffer.length) throw new Error("Truncated GLB chunk");
    const chunk = buffer.subarray(offset + 8, end);
    if (type === CHUNK_JSON) {
      if (json) throw new Error("GLB has more than one JSON chunk");
      json = JSON.parse(chunk.toString("utf8").replace(/[\s\0]+$/u, ""));
    } else if (type === CHUNK_BIN) {
      if (bin) throw new Error("GLB has more than one binary chunk");
      bin = chunk;
    } else {
      throw new Error(`Unexpected GLB chunk type 0x${type.toString(16)}`);
    }
    offset = end;
  }
  if (!json) throw new Error("GLB is missing its JSON chunk");
  return { json, bin };
}

/** Serializes a glTF JSON document and binary chunk into a spec-compliant GLB. */
export function encodeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binChunk = bin ? Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]) : null;
  const total = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(CHUNK_JSON, 4);
  const parts = [header, jsonHeader, jsonChunk];
  if (binChunk) {
    const binHeader = Buffer.alloc(8);
    binHeader.writeUInt32LE(binChunk.length, 0);
    binHeader.writeUInt32LE(CHUNK_BIN, 4);
    parts.push(binHeader, binChunk);
  }
  return Buffer.concat(parts);
}

/** Rejects documents whose data would not travel with the GLB. */
export function assertSelfContained(json, label = "GLB") {
  if ((json.buffers ?? []).some((buffer) => buffer.uri)) throw new Error(`${label} references an external buffer`);
  if ((json.images ?? []).some((image) => image.uri !== undefined)) throw new Error(`${label} references an external image`);
  const dataBuffers = (json.buffers ?? []).filter((buffer) => !buffer.extensions?.EXT_meshopt_compression?.fallback);
  if (dataBuffers.length > 1) throw new Error(`${label} must embed its data in a single buffer`);
}

/** Decoded element rows of one accessor, including Meshopt-compressed views. */
export async function accessorRows(json, bin, accessor) {
  if (accessor.sparse || typeof accessor.bufferView !== "number") return null;
  const view = json.bufferViews?.[accessor.bufferView];
  const components = COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  if (!view || !components || !componentBytes) return null;
  let data;
  let base;
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (meshopt) {
    await MeshoptDecoder.ready;
    const decoded = new Uint8Array(meshopt.count * meshopt.byteStride);
    const start = meshopt.byteOffset ?? 0;
    MeshoptDecoder.decodeGltfBuffer(decoded, meshopt.count, meshopt.byteStride,
      bin.subarray(start, start + meshopt.byteLength), meshopt.mode, meshopt.filter);
    data = Buffer.from(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    base = 0;
  } else {
    if (view.buffer !== 0 || !bin) return null;
    data = bin;
    base = view.byteOffset ?? 0;
  }
  const stride = view.byteStride ?? components * componentBytes;
  const start = base + (accessor.byteOffset ?? 0);
  const read = {
    5120: (offset) => data.readInt8(offset),
    5121: (offset) => data.readUInt8(offset),
    5122: (offset) => data.readInt16LE(offset),
    5123: (offset) => data.readUInt16LE(offset),
    5125: (offset) => data.readUInt32LE(offset),
    5126: (offset) => data.readFloatLE(offset),
  }[accessor.componentType];
  const rows = [];
  for (let element = 0; element < accessor.count; element++) {
    const row = [];
    for (let component = 0; component < components; component++) {
      row.push(read(start + element * stride + component * componentBytes));
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Recomputes every declared accessor `min`/`max` from its data. Float values are the exact
 * float32 values the data holds, so the validator's own reading matches.
 */
export async function repairAccessorBounds(json, bin) {
  const repaired = [];
  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    if (!accessor.min && !accessor.max) continue;
    const rows = await accessorRows(json, bin, accessor);
    if (!rows?.length) continue;
    const floating = accessor.componentType === 5126;
    // A declared bound that reads back as the same float32 is already exact; rewriting its decimal
    // spelling would change the file without changing what any reader sees.
    const same = (declared, actual) => floating
      ? typeof declared === "number" && Math.fround(declared) === actual
      : declared === actual;
    const minimum = [...rows[0]];
    const maximum = [...rows[0]];
    for (const row of rows) {
      for (let column = 0; column < row.length; column++) {
        if (row[column] < minimum[column]) minimum[column] = row[column];
        if (row[column] > maximum[column]) maximum[column] = row[column];
      }
    }
    for (const [bound, actual] of [["min", minimum], ["max", maximum]]) {
      if (!accessor[bound]) continue;
      if (accessor[bound].length !== actual.length) throw new Error(`Accessor ${index} declares a malformed ${bound}`);
      let changed = false;
      actual.forEach((value, column) => {
        if (!same(accessor[bound][column], value)) {
          changed = true;
          repaired.push({ pointer: `/accessors/${index}/${bound}/${column}`, declared: accessor[bound][column], actual: value });
        }
      });
      if (changed) accessor[bound] = actual;
    }
  }
  return repaired;
}

function declaredExtensionIsUsed(json, name) {
  let used = false;
  const visit = (value) => {
    if (used || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value.extensions && typeof value.extensions === "object" && Object.hasOwn(value.extensions, name)) {
      used = true;
      return;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (key !== "extensionsUsed" && key !== "extensionsRequired") visit(entry);
    }
  };
  visit(json);
  return used;
}

function dropUnusedExtensionDeclarations(json, names) {
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (!Array.isArray(json[key])) continue;
    json[key] = json[key].filter((name) => !names.includes(name) || declaredExtensionIsUsed(json, name));
    if (!json[key].length) delete json[key];
  }
}

function declareExtension(json, name, required) {
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), name])];
  if (required) json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), name])];
}

/** Drops provider material extensions and ineffective emissive strengths. */
export function normalizeMaterialExtensions(json) {
  const removed = [];
  for (const material of json.materials ?? []) {
    const extensions = material.extensions;
    if (!extensions) continue;
    for (const name of PROVIDER_MATERIAL_EXTENSIONS) {
      if (Object.hasOwn(extensions, name)) {
        removed.push({ material: material.name ?? null, extension: name });
        delete extensions[name];
      }
    }
    const emissive = material.emissiveFactor ?? [0, 0, 0];
    if (Object.hasOwn(extensions, "KHR_materials_emissive_strength") && emissive.every((value) => value === 0)) {
      removed.push({ material: material.name ?? null, extension: "KHR_materials_emissive_strength" });
      delete extensions.KHR_materials_emissive_strength;
    }
    if (!Object.keys(extensions).length) delete material.extensions;
  }
  dropUnusedExtensionDeclarations(json, [...PROVIDER_MATERIAL_EXTENSIONS, "KHR_materials_emissive_strength"]);
  return removed;
}

/**
 * Every byte range of the embedded buffer: plain buffer views plus Meshopt-compressed payloads.
 * Views that alias the same range are packed once.
 */
function embeddedRanges(json) {
  const ranges = [];
  for (const [index, view] of (json.bufferViews ?? []).entries()) {
    if (view.buffer === 0) ranges.push({ kind: "view", index, offset: view.byteOffset ?? 0, length: view.byteLength });
    const meshopt = view.extensions?.EXT_meshopt_compression;
    if (meshopt && meshopt.buffer === 0) {
      ranges.push({ kind: "meshopt", index, offset: meshopt.byteOffset ?? 0, length: meshopt.byteLength });
    }
  }
  return ranges.sort((left, right) => left.offset - right.offset || left.length - right.length);
}

/**
 * Rebuilds the embedded buffer with replacement bytes for selected plain buffer views, moving every
 * other range (including Meshopt payloads) unchanged. Partially overlapping ranges fail closed.
 */
export function repackEmbeddedBuffer(json, bin, replacements) {
  const ranges = embeddedRanges(json);
  let previous = null;
  for (const range of ranges) {
    if (range.offset + range.length > bin.length) throw new Error("A buffer view exceeds the embedded buffer");
    if (previous && range.offset === previous.offset && range.length === previous.length) continue;
    if (previous && range.offset < previous.offset + previous.length) {
      throw new Error("Overlapping buffer ranges cannot be repacked");
    }
    previous = range;
  }
  for (const viewIndex of replacements.keys()) {
    const aliases = ranges.filter((range) => range.kind === "view" && range.index === viewIndex);
    const target = aliases[0];
    if (!target) throw new Error(`Buffer view ${viewIndex} is not a plain embedded view`);
    if (ranges.some((range) => range !== target && range.offset === target.offset && range.length === target.length)) {
      throw new Error(`Buffer view ${viewIndex} shares its bytes and cannot be replaced`);
    }
  }
  const parts = [];
  const placed = new Map();
  let total = 0;
  const append = (data) => {
    const padding = (4 - (total % 4)) % 4;
    if (padding) {
      parts.push(Buffer.alloc(padding));
      total += padding;
    }
    const offset = total;
    parts.push(Buffer.from(data));
    total += data.length;
    return offset;
  };
  for (const range of ranges) {
    const replacement = range.kind === "view" ? replacements.get(range.index) : undefined;
    const key = `${range.offset}:${range.length}`;
    let offset;
    if (replacement) offset = append(replacement);
    else if (placed.has(key)) offset = placed.get(key);
    else {
      offset = append(bin.subarray(range.offset, range.offset + range.length));
      placed.set(key, offset);
    }
    const view = json.bufferViews[range.index];
    if (range.kind === "view") {
      view.byteOffset = offset;
      if (replacement) view.byteLength = replacement.length;
    } else {
      view.extensions.EXT_meshopt_compression.byteOffset = offset;
    }
  }
  const padding = (4 - (total % 4)) % 4;
  if (padding) {
    parts.push(Buffer.alloc(padding));
    total += padding;
  }
  json.buffers[0].byteLength = total;
  return Buffer.concat(parts);
}

/**
 * Resamples embedded images larger than `maxSize` to fit inside it and re-encodes them as WebP.
 * Returns the view replacements to repack plus a per-image report.
 */
export async function capEmbeddedTextures(json, bin, maxSize, sharp) {
  if (!TEXTURE_SIZES.includes(maxSize)) throw new Error(`Unsupported texture size cap ${maxSize}`);
  const replacements = new Map();
  const report = [];
  const views = new Set();
  for (const [index, image] of (json.images ?? []).entries()) {
    if (typeof image.bufferView !== "number") throw new Error(`Image ${index} is not embedded in a buffer view`);
    if (views.has(image.bufferView)) throw new Error(`Images share buffer view ${image.bufferView}`);
    views.add(image.bufferView);
    const view = json.bufferViews[image.bufferView];
    if (view.buffer !== 0 || view.extensions) throw new Error(`Image ${index} must be stored uncompressed in the embedded buffer`);
    const start = view.byteOffset ?? 0;
    const data = bin.subarray(start, start + view.byteLength);
    const metadata = await sharp(data).metadata();
    const entry = {
      image: index,
      name: image.name ?? null,
      source: { mimeType: image.mimeType ?? null, width: metadata.width, height: metadata.height, bytes: data.length },
    };
    if (Math.max(metadata.width, metadata.height) <= maxSize) {
      report.push({ ...entry, resampled: false });
      continue;
    }
    const output = await sharp(data)
      .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .webp(TEXTURE_WEBP_OPTIONS)
      .toBuffer({ resolveWithObject: true });
    replacements.set(image.bufferView, output.data);
    image.mimeType = "image/webp";
    for (const texture of json.textures ?? []) {
      if (texture.source !== index) continue;
      texture.extensions = { ...(texture.extensions ?? {}), EXT_texture_webp: { source: index } };
      delete texture.source;
    }
    declareExtension(json, "EXT_texture_webp", true);
    report.push({
      ...entry,
      resampled: true,
      output: { mimeType: "image/webp", width: output.info.width, height: output.info.height, bytes: output.data.length },
    });
  }
  return { replacements, report };
}

/** Largest embedded image dimension, for texture-cap validation of a packaged file. */
export async function largestEmbeddedImage(json, bin, sharp) {
  let largest = 0;
  for (const image of json.images ?? []) {
    if (typeof image.bufferView !== "number") continue;
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset ?? 0;
    const metadata = await sharp(bin.subarray(start, start + view.byteLength)).metadata();
    largest = Math.max(largest, metadata.width ?? 0, metadata.height ?? 0);
  }
  return largest;
}

/**
 * Normalizes an authored GLB source for packaging. Returns the source bytes unchanged when no
 * repair or texture resampling applies.
 */
export async function normalizeAuthoredGlb(sourceBytes, { textureMaxSize, sharp, label = "authored GLB" }) {
  const source = asBuffer(sourceBytes);
  const { json, bin } = parseGlb(source);
  assertSelfContained(json, label);
  const repairedBounds = await repairAccessorBounds(json, bin);
  const removedMaterialExtensions = normalizeMaterialExtensions(json);
  const textures = await capEmbeddedTextures(json, bin, textureMaxSize, sharp);
  const changed = repairedBounds.length > 0 || removedMaterialExtensions.length > 0 || textures.replacements.size > 0;
  if (!changed) {
    return {
      bytes: source,
      report: { preservedSourceBytes: true, repairedBounds, removedMaterialExtensions, textures: textures.report },
    };
  }
  const packed = textures.replacements.size ? repackEmbeddedBuffer(json, bin, textures.replacements) : bin;
  return {
    bytes: encodeGlb(json, packed),
    report: { preservedSourceBytes: false, repairedBounds, removedMaterialExtensions, textures: textures.report },
  };
}

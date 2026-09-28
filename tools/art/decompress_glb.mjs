#!/usr/bin/env node
/**
 * Writes the uncompressed derivative of a Meshopt-packed GLB, byte-for-byte what its decoder
 * returns: every `EXT_meshopt_compression` buffer view is decoded in place and all views share one
 * embedded buffer again. Nodes, accessors, materials, images, skins, clips and extras are kept.
 *
 * A frozen asset's published GLB is its record (`LLM/ASSET_PRODUCTION.md` §3.2): to move one onto
 * an `authored_glb` source, commit this derivative under `art/imported/<provider>/adapted/` and
 * publish it through `art:generate`, which normalizes and repackages it like any authored GLB.
 *
 *   node tools/art/decompress_glb.mjs <published.glb> <derivative.glb>
 */
import fs from "node:fs";
import path from "node:path";
import { MeshoptDecoder } from "meshoptimizer";

export async function decompressGlb(bytes) {
  await MeshoptDecoder.ready;
  const source = Buffer.from(bytes);
  if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) throw new Error("Expected a GLB 2.0");
  let json;
  let binary;
  for (let offset = 12; offset < source.length;) {
    const length = source.readUInt32LE(offset);
    const type = source.readUInt32LE(offset + 4);
    const chunk = source.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").trim());
    else if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("GLB needs a JSON and a binary chunk");
  const embedded = (json.buffers ?? []).findIndex((buffer) => buffer.uri === undefined && !buffer.extensions?.EXT_meshopt_compression?.fallback);
  if (embedded !== 0) throw new Error("Expected buffer 0 to be the embedded binary chunk");
  const chunks = [];
  let total = 0;
  const place = (data) => {
    const offset = total;
    chunks.push(Buffer.from(data));
    const padding = (4 - data.length % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    total += data.length + padding;
    return offset;
  };
  for (const view of json.bufferViews ?? []) {
    const packed = view.extensions?.EXT_meshopt_compression;
    let data;
    if (packed) {
      if (packed.buffer !== 0) throw new Error("Compressed data must live in the embedded buffer");
      data = new Uint8Array(packed.count * packed.byteStride);
      const stream = binary.subarray(packed.byteOffset ?? 0, (packed.byteOffset ?? 0) + packed.byteLength);
      MeshoptDecoder.decodeGltfBuffer(data, packed.count, packed.byteStride, stream, packed.mode, packed.filter ?? "NONE");
      if (data.length !== view.byteLength) throw new Error("Decoded view length disagrees with its declared byteLength");
      delete view.extensions.EXT_meshopt_compression;
      if (!Object.keys(view.extensions).length) delete view.extensions;
    } else {
      if (view.buffer !== 0) throw new Error("Uncompressed views must live in the embedded buffer");
      data = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    }
    view.buffer = 0;
    view.byteOffset = place(data);
  }
  json.buffers = [{ byteLength: total }];
  const withoutMeshopt = (list) => list?.filter((name) => name !== "EXT_meshopt_compression");
  json.extensionsUsed = withoutMeshopt(json.extensionsUsed);
  json.extensionsRequired = withoutMeshopt(json.extensionsRequired);
  for (const key of ["extensionsUsed", "extensionsRequired"]) if (json[key] && !json[key].length) delete json[key];
  const text = Buffer.from(JSON.stringify(json));
  const jsonChunk = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + total, 8);
  header.writeUInt32LE(jsonChunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(total, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunk, binaryHeader, ...chunks]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("usage: decompress_glb.mjs <published.glb> <derivative.glb>");
    process.exit(2);
  }
  const result = await decompressGlb(fs.readFileSync(input));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, result);
  console.info(`${output}: ${(result.length / 1e6).toFixed(2)} MB`);
}

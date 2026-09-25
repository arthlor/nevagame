#!/usr/bin/env node
/**
 * Authored code -> GLB builder.
 *
 * Bundles `tools/authored/export-entry.ts` with esbuild, runs it in a headless Chromium page (the
 * factories need a DOM 2D canvas for their textures), and writes one GLB per authored model into
 * `art/authored/<model>/export/`. That offline GLB is the `sourceGlb` a `prebuilt_glb` catalog entry
 * publishes to `public/assets/models/`.
 *
 * This path is only for the photo-reconstructed buildings, whose factories paint canvas textures.
 * Every other authored asset is a registered generator in `tools/authored/generators/` and is built
 * by the main art pipeline (`npm run art:generate`) in Node.
 *
 * Determinism: the bytes are not guaranteed identical run to run because three's GLTFExporter packs
 * textures asynchronously and only the order of the image bufferViews varies. `--verify` builds each
 * target twice and asserts the semantic digest (hierarchy, geometry, and the texture set) matches.
 *
 * This is the repo's one deliberate non-Blender production path; see tools/authored/README.md.
 * Usage:
 *   node tools/authored/export.mjs                       # all authored models (builds + publishes)
 *   node tools/authored/export.mjs --verify              # rebuild twice and check determinism
 *   node tools/authored/export.mjs --no-publish          # offline source only
 *   node tools/authored/export.mjs --raw                 # skip the palette re-skin
 *   node tools/authored/export.mjs --no-lod              # skip the LOD1 decimation
 *   node tools/authored/export.mjs building_wooden_outhouse_a
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRY = path.join(ROOT, "tools/authored/export-entry.ts");
const PUBLISH_DIR = path.join(ROOT, "public/assets/models");
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const MODELS = [
  {
    id: "building_thatched_cottage_a",
    output: "art/authored/thatched-cottage/export/building_thatched_cottage_a.glb"
  },
  {
    id: "building_wooden_outhouse_a",
    output: "art/authored/wooden-outhouse/export/building_wooden_outhouse_a.glb"
  },
  {
    id: "building_medieval_timber_cottage_a",
    output: "art/authored/medieval-cottage/export/building_medieval_timber_cottage_a.glb"
  },
  {
    id: "building_medieval_market_stall_a",
    output: "art/authored/medieval-market-stall/export/building_medieval_market_stall_a.glb"
  },
  {
    id: "building_fish_market_coastal_a",
    output: "art/authored/fish-market-shop/export/building_fish_market_coastal_a.glb"
  },
  {
    id: "building_sunreach_cove_market_a",
    output: "art/authored/sunreach-market-stall/export/building_sunreach_cove_market_a.glb"
  }
];

/** Positional args select specific model IDs; flags are ignored. */
function requestedIds() {
  return process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
}

async function bundleEntry() {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "warning",
    legalComments: "none"
  });
  const [output] = result.outputFiles;
  if (!output) throw new Error("esbuild produced no bundle for the authored export entry");
  return output.text;
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error("Authored export did not produce a GLB");
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(chunk.toString("utf8"));
    else if (type === CHUNK_BIN) bin = chunk;
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error("Authored GLB is missing its JSON or binary chunk");
  return { json, bin };
}

/**
 * Order-independent digest of everything that defines the asset: the glTF structure, the geometry
 * binary with image ranges masked out, and the sorted hashes of each texture. Ignores the async
 * ordering of image bufferViews, which is the only run-to-run difference.
 */
function semanticDigest(bytes) {
  const { json, bin } = parseGlb(bytes);
  const imageViews = new Set((json.images ?? []).map((image) => image.bufferView));
  const hash = createHash("sha256");
  hash.update(JSON.stringify({
    ...json,
    bufferViews: json.bufferViews.map((view, index) => (imageViews.has(index) ? null : view)),
    images: json.images ? json.images.map(() => null) : undefined,
    buffers: json.buffers ? json.buffers.map(({ byteLength }) => ({ byteLength })) : undefined
  }));
  const masked = Buffer.from(bin);
  for (const index of imageViews) {
    const view = json.bufferViews[index];
    const start = view.byteOffset ?? 0;
    masked.fill(0, start, start + view.byteLength);
  }
  hash.update(masked);
  hash.update((json.images ?? [])
    .map((image) => {
      const view = json.bufferViews[image.bufferView];
      const start = view.byteOffset ?? 0;
      return createHash("sha256").update(bin.subarray(start, start + view.byteLength)).digest("hex");
    })
    .sort()
    .join("\n"));
  return hash.digest("hex");
}

async function buildModel(page, id, adapt, lod) {
  // Playwright cannot return an ArrayBuffer by value, so the page encodes the GLB as base64 (in
  // chunks, to stay clear of the argument-count limit) and Node decodes it back to bytes.
  const base64 = await page.evaluate(async ({ modelId, adaptToPalette, withLod }) => {
    const buffer = await window.__nevaAuthoredExport(modelId, adaptToPalette, withLod);
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }, { modelId: id, adaptToPalette: adapt, withLod: lod });
  const { json, bin } = parseGlb(Buffer.from(base64, "base64"));
  return encodeGlb(stripExtras(json), bin);
}

/**
 * The factories keep a `sculptRuntime` inspector payload in `userData` that embeds three's random
 * UUIDs for every object and geometry. GLTFExporter copies `userData` into glTF `extras`, so that
 * metadata rides along into the asset and makes the bytes differ every build. Neva reads none of it,
 * so strip every `extras` object to keep the emitted GLB lean and deterministic.
 */
function stripExtras(json) {
  for (const key of ["nodes", "meshes", "materials", "scenes", "textures", "images", "accessors",
    "bufferViews", "buffers", "skins", "animations", "cameras"]) {
    for (const entry of json[key] ?? []) {
      if (entry && typeof entry === "object") delete entry.extras;
    }
  }
  delete json.extras;
  return json;
}

/** Re-serialize a parsed glTF JSON + binary chunk back into a spec-compliant GLB container. */
function encodeGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0x00)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binHeader);
  out.writeUInt32LE(CHUNK_BIN, binHeader + 4);
  binChunk.copy(out, binHeader + 8);
  return out;
}

async function main() {
  const verify = process.argv.includes("--verify");
  const publish = !process.argv.includes("--no-publish");
  const adapt = !process.argv.includes("--raw");
  const lod = !process.argv.includes("--no-lod");
  const only = requestedIds();
  const unknown = only.filter((id) => !MODELS.some((model) => model.id === id));
  if (unknown.length) throw new Error(`Unknown authored model id(s): ${unknown.join(", ")}`);
  const targets = only.length ? MODELS.filter((model) => only.includes(model.id)) : MODELS;

  const code = await bundleEntry();
  // Software 2D canvas only: GPU-accelerated canvas rasterizes the factories' procedural textures
  // with driver-dependent antialiasing, which would make the pixels themselves differ run to run.
  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome",
    args: ["--disable-gpu", "--disable-accelerated-2d-canvas"]
  });
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => console.error("[authored] page error:", error.message));
    page.on("console", (message) => {
      console.error(`[authored] page ${message.type()}:`, message.text());
    });
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: code });

    for (const model of targets) {
      const metrics = await page.evaluate(
        ({ modelId, adaptToPalette, withLod }) => window.__nevaAuthoredMetrics(modelId, adaptToPalette, withLod),
        { modelId: model.id, adaptToPalette: adapt, withLod: lod }
      );
      console.info(`[authored] ${model.id} metrics: ${JSON.stringify(metrics)}`);
      const bytes = await buildModel(page, model.id, adapt, lod);
      if (verify) {
        const repeat = await buildModel(page, model.id, adapt, lod);
        const stable = semanticDigest(bytes) === semanticDigest(repeat);
        console.info(`[authored] ${model.id} semantic-determinism: ${stable ? "ok" : "FAILED"}`);
        if (!stable) process.exitCode = 1;
      }
      const outputPath = path.join(ROOT, model.output);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, bytes);
      console.info(`[authored] ${model.id} -> ${model.output} (${bytes.byteLength} bytes)`);
      if (publish) {
        await mkdir(PUBLISH_DIR, { recursive: true });
        await copyFile(outputPath, path.join(PUBLISH_DIR, path.basename(model.output)));
        console.info(`[authored] ${model.id} -> public/assets/models/${path.basename(model.output)}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});

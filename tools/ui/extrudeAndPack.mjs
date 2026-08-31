/**
 * UI Texture Atlas Extruder & Lossless Bin Packer
 *
 * Implements 2D edge dilation (2px bleed/extrusion) and MaxRects bin packing
 * for UI sprites to eliminate bilinear and mipmap texture bleeding across
 * neighboring sprites and transparent borders.
 *
 * Emits:
 *   - public/assets/ui/atlas/ui-atlas_<bin>.webp (Lossless WebP)
 *   - public/assets/ui/atlas/ui-atlas_<bin>.png  (Lossless PNG)
 *   - public/assets/ui/atlas/ui-atlas.json       (Complete JSON manifest)
 *   - src/ui/atlas/AtlasManifest.ts              (Typed TS manifest & helper resolvers)
 *
 * Usage:
 *   node tools/ui/extrudeAndPack.mjs
 *   node tools/ui/extrudeAndPack.mjs --check
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { MaxRectsPacker } from "maxrects-packer";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");

/**
 * Dilates RGB colors into adjacent alpha=0 transparent pixels for `radius` passes.
 * This prevents bilinear sampling at transparent silhouette edges from interpolating
 * towards black (0,0,0) or white.
 *
 * @param {Buffer} rawBuffer - Raw RGBA pixel buffer
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Number of pixel dilation passes
 * @returns {Buffer} Dilated raw RGBA pixel buffer
 */
export function dilateAlphaRgb(rawBuffer, width, height, radius = 2) {
  if (radius <= 0) return Buffer.from(rawBuffer);

  const buf = Buffer.from(rawBuffer);
  const totalPixels = width * height;
  const hasColor = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    hasColor[i] = buf[i * 4 + 3] > 0 ? 1 : 0;
  }

  for (let pass = 0; pass < radius; pass++) {
    const updates = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (hasColor[idx] === 1) continue;

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;

            const nIdx = ny * width + nx;
            if (hasColor[nIdx] === 1) {
              const byteIdx = nIdx * 4;
              rSum += buf[byteIdx];
              gSum += buf[byteIdx + 1];
              bSum += buf[byteIdx + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          updates.push({
            idx,
            r: Math.round(rSum / count),
            g: Math.round(gSum / count),
            b: Math.round(bSum / count)
          });
        }
      }
    }

    if (updates.length === 0) break;

    for (const u of updates) {
      const byteIdx = u.idx * 4;
      buf[byteIdx] = u.r;
      buf[byteIdx + 1] = u.g;
      buf[byteIdx + 2] = u.b;
      // Alpha remains 0 so the transparent shape is preserved
      hasColor[u.idx] = 1;
    }
  }

  return buf;
}

/**
 * Dilates sprite borders outward by `extrude` pixels and applies alpha edge RGB bleed.
 * The outer border expands from (W, H) to (W + 2*extrude, H + 2*extrude).
 *
 * @param {Buffer|Uint8Array|string} input - Image buffer or file path
 * @param {number} extrude - Border extrusion in pixels (default 2)
 * @param {object} options - Optional configuration
 * @returns {Promise<{ buffer: Buffer, rawBuffer: Buffer, width: number, height: number, innerWidth: number, innerHeight: number, extrude: number }>}
 */
export async function dilateSpriteEdges(input, extrude = 2, options = {}) {
  const { dilateAlpha = true } = options;

  let image;
  if (typeof input === "string") {
    image = sharp(input).ensureAlpha();
  } else {
    image = sharp(input).ensureAlpha();
  }

  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error("Unable to read image dimensions for edge dilation");
  }

  let raw = await image.raw().toBuffer();

  if (dilateAlpha && extrude > 0) {
    raw = dilateAlphaRgb(raw, width, height, extrude);
  }

  const outW = width + extrude * 2;
  const outH = height + extrude * 2;
  const outBuf = Buffer.alloc(outW * outH * 4);

  // 1. Copy center inner region
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((y + extrude) * outW + (x + extrude)) * 4;
      outBuf.set(raw.subarray(srcIdx, srcIdx + 4), dstIdx);
    }
  }

  if (extrude > 0) {
    // 2. Extrude Top and Bottom edges
    for (let e = 0; e < extrude; e++) {
      for (let x = 0; x < width; x++) {
        const topSrc = (0 * width + x) * 4;
        const topDst = (e * outW + (x + extrude)) * 4;
        outBuf.set(raw.subarray(topSrc, topSrc + 4), topDst);

        const botSrc = ((height - 1) * width + x) * 4;
        const botDst = ((height + extrude + e) * outW + (x + extrude)) * 4;
        outBuf.set(raw.subarray(botSrc, botSrc + 4), botDst);
      }
    }

    // 3. Extrude Left and Right edges (with clamped corners)
    for (let y = 0; y < outH; y++) {
      const srcY = Math.min(Math.max(y - extrude, 0), height - 1);
      const leftSrc = (srcY * width + 0) * 4;
      const rightSrc = (srcY * width + (width - 1)) * 4;

      for (let e = 0; e < extrude; e++) {
        const leftDst = (y * outW + e) * 4;
        const rightDst = (y * outW + (width + extrude + e)) * 4;
        outBuf.set(raw.subarray(leftSrc, leftSrc + 4), leftDst);
        outBuf.set(raw.subarray(rightSrc, rightSrc + 4), rightDst);
      }
    }
  }

  const resultPng = await sharp(outBuf, {
    raw: { width: outW, height: outH, channels: 4 }
  }).png().toBuffer();

  return {
    buffer: resultPng,
    rawBuffer: outBuf,
    width: outW,
    height: outH,
    innerWidth: width,
    innerHeight: height,
    extrude
  };
}

/**
 * Packs dilated sprites into optimal lossless atlas sheets and emits JSON & TS manifests.
 *
 * @param {Array<{ id?: string, name: string, file?: string, buffer?: Buffer, path?: string }>} sprites
 * @param {string} outputBase - Target directory (e.g. public/assets/ui/atlas)
 * @param {string} atlasName - Name prefix (default "ui-atlas")
 * @param {object} options - Packing options
 */
export async function packLosslessUiAtlas(sprites, outputBase, atlasName = "ui-atlas", options = {}) {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    padding = 2,
    extrude = 2,
    smart = true,
    pot = true,
    allowRotation = false,
    writeFiles = true,
    tsManifestPath = path.join(ROOT, "src/ui/atlas/AtlasManifest.ts"),
    jsonManifestPath = path.join(outputBase, `${atlasName}.json`)
  } = options;

  const packer = new MaxRectsPacker(maxWidth, maxHeight, padding, {
    smart,
    pot,
    allowRotation
  });

  const preparedSprites = [];

  for (const sprite of sprites) {
    let inputBuf;
    if (sprite.buffer) {
      inputBuf = sprite.buffer;
    } else if (sprite.path) {
      inputBuf = fs.readFileSync(sprite.path);
    } else if (sprite.file) {
      inputBuf = fs.readFileSync(path.join(ROOT, "assets/ui/atlas", sprite.file));
    } else {
      throw new Error(`Sprite ${sprite.name || sprite.id} has no buffer or path`);
    }

    const dilated = await dilateSpriteEdges(inputBuf, extrude);
    const spriteName = sprite.name || sprite.id || path.basename(sprite.file || "", ".png");

    preparedSprites.push({
      name: spriteName,
      id: sprite.id || spriteName,
      file: sprite.file || `${spriteName}.png`,
      dilated
    });

    packer.add({
      name: spriteName,
      width: dilated.width,
      height: dilated.height,
      data: {
        ...sprite,
        name: spriteName,
        id: sprite.id || spriteName,
        dilated
      }
    });
  }

  const manifest = {
    atlas: atlasName,
    extrude,
    pages: [],
    frames: {}
  };

  const generatedImages = [];

  for (const [binIndex, bin] of packer.bins.entries()) {
    const pagePngName = `${atlasName}_${binIndex}.png`;
    const pageWebpName = `${atlasName}_${binIndex}.webp`;

    manifest.pages.push({
      index: binIndex,
      width: bin.width,
      height: bin.height,
      imagePng: pagePngName,
      imageWebp: pageWebpName
    });

    // Blit each dilated sprite into a zeroed RGBA sheet by raw byte copy. Going
    // through sharp's compositor instead would premultiply then un-premultiply
    // every rect, rounding RGB on translucent pixels (e.g. 30 -> 29) and
    // breaking lossless fidelity. Packed rects never overlap, so a plain copy is
    // both exact and sufficient.
    const sheetW = bin.width;
    const sheetH = bin.height;
    const sheet = Buffer.alloc(sheetW * sheetH * 4);
    for (const r of bin.rects) {
      const { rawBuffer, width: rw, height: rh } = r.data.dilated;
      for (let row = 0; row < rh; row++) {
        const srcStart = row * rw * 4;
        const dstStart = ((r.y + row) * sheetW + r.x) * 4;
        rawBuffer.copy(sheet, dstStart, srcStart, srcStart + rw * 4);
      }
    }

    const pngBuffer = await sharp(sheet, { raw: { width: sheetW, height: sheetH, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const webpBuffer = await sharp(pngBuffer).webp({ lossless: true }).toBuffer();

    generatedImages.push({
      binIndex,
      width: bin.width,
      height: bin.height,
      pngBuffer,
      webpBuffer,
      pagePngName,
      pageWebpName
    });

    if (writeFiles) {
      fs.mkdirSync(outputBase, { recursive: true });

      const pngPath = path.join(outputBase, pagePngName);
      const webpPath = path.join(outputBase, pageWebpName);

      fs.writeFileSync(pngPath, pngBuffer);
      fs.writeFileSync(webpPath, webpBuffer);

      // If single bin or first bin, also emit un-indexed default name
      if (binIndex === 0) {
        fs.writeFileSync(path.join(outputBase, `${atlasName}.png`), pngBuffer);
        fs.writeFileSync(path.join(outputBase, `${atlasName}.webp`), webpBuffer);
      }
    }

    for (const rect of bin.rects) {
      // Manifest UV and frame coordinates point strictly to the inner non-extruded frame
      const innerX = rect.x + extrude;
      const innerY = rect.y + extrude;
      const innerW = rect.data.dilated.innerWidth;
      const innerH = rect.data.dilated.innerHeight;

      const u0 = innerX / bin.width;
      const v0 = innerY / bin.height;
      const u1 = (innerX + innerW) / bin.width;
      const v1 = (innerY + innerH) / bin.height;

      const frameEntry = {
        name: rect.name,
        frame: {
          x: innerX,
          y: innerY,
          w: innerW,
          h: innerH
        },
        innerX,
        innerY,
        innerWidth: innerW,
        innerHeight: innerH,
        outerFrame: {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height
        },
        uv: {
          u0,
          v0,
          u1,
          v1
        },
        uvBounds: [u0, v0, u1, v1],
        binIndex,
        page: binIndex
      };

      manifest.frames[rect.name] = frameEntry;

      // Also register ID and filename aliases if different
      if (rect.data.id && rect.data.id !== rect.name) {
        manifest.frames[rect.data.id] = frameEntry;
      }
      if (rect.data.file && rect.data.file !== rect.name) {
        manifest.frames[rect.data.file] = frameEntry;
      }
    }
  }

  const tsCode = generateTypeScriptAtlasManifest(manifest);

  if (writeFiles) {
    fs.mkdirSync(outputBase, { recursive: true });
    fs.writeFileSync(jsonManifestPath, JSON.stringify(manifest, null, 2), "utf8");

    if (tsManifestPath) {
      fs.mkdirSync(path.dirname(tsManifestPath), { recursive: true });
      fs.writeFileSync(tsManifestPath, tsCode, "utf8");
    }
  }

  return {
    manifest,
    typeScriptManifest: tsCode,
    images: generatedImages,
    bins: packer.bins
  };
}

/**
 * Generates typed TypeScript definitions and helper resolvers from atlas manifest.
 *
 * @param {object} manifest - The JSON manifest object
 * @returns {string} TypeScript file contents
 */
export function generateTypeScriptAtlasManifest(manifest) {
  const lines = [
    "// This file is generated by `npm run ui:atlas` / `tools/ui/extrudeAndPack.mjs`.",
    "// Do not edit this file directly.",
    "",
    "export interface AtlasFrame {",
    "  x: number;",
    "  y: number;",
    "  w: number;",
    "  h: number;",
    "}",
    "",
    "export interface AtlasUv {",
    "  u0: number;",
    "  v0: number;",
    "  u1: number;",
    "  v1: number;",
    "}",
    "",
    "export interface AtlasSprite {",
    "  name: string;",
    "  frame: AtlasFrame;",
    "  innerX: number;",
    "  innerY: number;",
    "  innerWidth: number;",
    "  innerHeight: number;",
    "  outerFrame: AtlasFrame;",
    "  uv: AtlasUv;",
    "  uvBounds: [number, number, number, number];",
    "  binIndex: number;",
    "  page: number;",
    "}",
    "",
    "export interface AtlasPage {",
    "  index: number;",
    "  width: number;",
    "  height: number;",
    "  imagePng: string;",
    "  imageWebp: string;",
    "}",
    "",
    "export interface AtlasManifestData {",
    "  atlas: string;",
    "  extrude: number;",
    "  pages: AtlasPage[];",
    "  frames: Record<string, AtlasSprite>;",
    "}",
    "",
    `export const UI_ATLAS_MANIFEST: AtlasManifestData = ${JSON.stringify(manifest, null, 2)} as const;`,
    "",
    "export const UI_ATLAS_PAGES = UI_ATLAS_MANIFEST.pages;",
    "export const UI_ATLAS_FRAMES = UI_ATLAS_MANIFEST.frames;",
    "export type AtlasSpriteName = keyof typeof UI_ATLAS_FRAMES;",
    "",
    "/**",
    " * Looks up a sprite entry by sprite name, simulation ID, or filename.",
    " */",
    "export function getAtlasSprite(key: string | null | undefined): AtlasSprite | undefined {",
    "  if (!key) return undefined;",
    "  return UI_ATLAS_FRAMES[key];",
    "}",
    "",
    "/**",
    " * Returns normalized UV bounds [u0, v0, u1, v1] for a given sprite key.",
    " */",
    "export function getAtlasUv(key: string | null | undefined): [number, number, number, number] | undefined {",
    "  const sprite = getAtlasSprite(key);",
    "  return sprite ? sprite.uvBounds : undefined;",
    "}",
    "",
    "/**",
    " * Returns inner pixel frame coordinates { x, y, w, h } for a given sprite key.",
    " */",
    "export function getAtlasFrame(key: string | null | undefined): AtlasFrame | undefined {",
    "  const sprite = getAtlasSprite(key);",
    "  return sprite ? sprite.frame : undefined;",
    "}",
    "",
    "/**",
    " * Resolves the static URL for a specific atlas page sheet.",
    " */",
    'export function getAtlasPageUrl(binIndex = 0, format: "webp" | "png" = "webp"): string {',
    "  const page = UI_ATLAS_PAGES[binIndex] ?? UI_ATLAS_PAGES[0];",
    "  if (!page) {",
    "    return `/assets/ui/atlas/ui-atlas.${format}`;",
    "  }",
    '  return format === "webp" ? `/assets/ui/atlas/${page.imageWebp}` : `/assets/ui/atlas/${page.imagePng}`;',
    "}",
    ""
  ];

  return lines.join("\n");
}

/**
 * Loads all sprites defined in assets/ui/ui-atlas.manifest.json or reads assets/ui/atlas directory.
 */
export function loadAtlasSprites() {
  const manifestPath = path.join(ROOT, "assets/ui/ui-atlas.manifest.json");
  const atlasDir = path.join(ROOT, "assets/ui/atlas");

  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const sprites = [];
    const seenFiles = new Set();

    for (const sheet of raw.sheets ?? []) {
      for (const sprite of sheet.sprites ?? []) {
        seenFiles.add(sprite.file);
        sprites.push({
          id: sprite.id,
          name: sprite.id,
          file: sprite.file,
          path: path.join(ROOT, raw.atlasDir || "assets/ui/atlas", sprite.file)
        });
      }
    }

    for (const texture of raw.textures ?? []) {
      seenFiles.add(texture.file);
      sprites.push({
        id: texture.id,
        name: texture.id,
        file: texture.file,
        path: path.join(ROOT, raw.atlasDir || "assets/ui/atlas", texture.file)
      });
    }

    // Also include any standalone png files in atlasDir not in manifest
    if (fs.existsSync(atlasDir)) {
      for (const file of fs.readdirSync(atlasDir)) {
        if (file.endsWith(".png") && !seenFiles.has(file)) {
          const name = path.basename(file, ".png");
          sprites.push({
            id: name,
            name,
            file,
            path: path.join(atlasDir, file)
          });
        }
      }
    }

    return sprites;
  }

  // Fallback: scan atlas directory
  const files = fs.readdirSync(atlasDir).filter((f) => f.endsWith(".png"));
  return files.map((file) => {
    const name = path.basename(file, ".png");
    return {
      id: name,
      name,
      file,
      path: path.join(atlasDir, file)
    };
  });
}

/**
 * CLI Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const outputDir = path.join(ROOT, "public/assets/ui/atlas");
  const tsManifestPath = path.join(ROOT, "src/ui/atlas/AtlasManifest.ts");
  const jsonManifestPath = path.join(outputDir, "ui-atlas.json");

  console.log("[NEVA UI ATLAS] Loading sprites...");
  const sprites = loadAtlasSprites();
  console.log(`[NEVA UI ATLAS] Found ${sprites.length} sprites to pack`);

  const result = await packLosslessUiAtlas(sprites, outputDir, "ui-atlas", {
    maxWidth: 2048,
    maxHeight: 2048,
    padding: 2,
    extrude: 2,
    smart: true,
    pot: true,
    writeFiles: !checkOnly,
    tsManifestPath,
    jsonManifestPath
  });

  if (checkOnly) {
    if (!fs.existsSync(jsonManifestPath) || !fs.existsSync(tsManifestPath)) {
      throw new Error("UI Atlas manifests missing. Run `npm run ui:atlas`.");
    }
    const currentJson = fs.readFileSync(jsonManifestPath, "utf8");
    const generatedJson = JSON.stringify(result.manifest, null, 2);
    if (currentJson !== generatedJson) {
      throw new Error("UI Atlas manifest is stale. Run `npm run ui:atlas`.");
    }
    console.log("[NEVA UI ATLAS] Atlas is up to date and validated.");
    return;
  }

  console.log(`[NEVA UI ATLAS] Successfully packed ${sprites.length} sprites into ${result.bins.length} page(s):`);
  for (const [i, bin] of result.bins.entries()) {
    console.log(`  Page ${i}: ${bin.width}x${bin.height} (${bin.rects.length} sprites)`);
  }
  console.log(`[NEVA UI ATLAS] Wrote manifests:`);
  console.log(`  - ${path.relative(ROOT, jsonManifestPath)}`);
  console.log(`  - ${path.relative(ROOT, tsManifestPath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((err) => {
    console.error(`[NEVA UI ATLAS] Error: ${err.message}`);
    process.exitCode = 1;
  });
}

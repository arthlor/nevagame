/**
 * Cuts generated icon sheets into transparent sprites under assets/ui/atlas/.
 *
 *   node tools/ui/slice-sheet.mjs --sheet fish
 *   node tools/ui/slice-sheet.mjs --all
 *   node tools/ui/slice-sheet.mjs --sheet fish --debug
 *
 * `--debug` writes a numbered contact sheet next to the source so a detection
 * mismatch can be diagnosed by eye instead of by guesswork.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { analyzeSheet, extractSprite } from "./lib/sheetSlicer.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const MANIFEST_PATH = path.join(ROOT, "assets/ui/ui-atlas.manifest.json");
const ATLAS_DIR = path.join(ROOT, "assets/ui/atlas");
const DEBUG_DIR = path.join(ROOT, "assets/ui/sheets/debug");

export function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing UI atlas manifest: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  // Sprite ids only have to be unique within their family, because each family
  // becomes its own lookup map ("growing" is both a crop stage and a GIS chip).
  // Filenames share one directory, so those must be unique across everything.
  const seenIds = new Map();
  const seenFiles = new Map();

  const claimFile = (file, owner) => {
    if (seenFiles.has(file)) {
      throw new Error(`Duplicate sprite file ${file} in ${seenFiles.get(file)} and ${owner}`);
    }
    seenFiles.set(file, owner);
  };

  for (const sheet of manifest.sheets) {
    if (!manifest.families[sheet.family]) {
      throw new Error(`Sheet "${sheet.id}" declares unknown family "${sheet.family}"`);
    }
    for (const sprite of sheet.sprites) {
      const key = `${sheet.family}/${sprite.id}`;
      if (seenIds.has(key)) {
        throw new Error(`Duplicate sprite id ${key} in sheets ${seenIds.get(key)} and ${sheet.id}`);
      }
      seenIds.set(key, sheet.id);
      claimFile(sprite.file, `sheet ${sheet.id}`);
    }
  }

  for (const texture of manifest.textures ?? []) {
    claimFile(texture.file, `texture ${texture.id}`);
  }

  return manifest;
}

/**
 * Blends a tile with a half-offset copy of itself so it repeats without a seam.
 *
 * The weight falls to zero at every border and rises to one at the centre. At the
 * borders the result is therefore entirely the offset copy, which is continuous
 * across the wrap; at the centre it is entirely the original, which is continuous
 * there. Generated "seamless" textures rarely actually tile, and a visible seam
 * repeating behind every panel is very obvious.
 */
function makeSeamless(pixels, size) {
  const source = Uint8ClampedArray.from(pixels);
  const half = size / 2;
  const ramp = (v) => {
    const t = 1 - Math.abs(v / half - 1);
    return t * t * (3 - 2 * t);
  };

  for (let y = 0; y < size; y += 1) {
    const wy = ramp(y);
    const sy = (y + half) % size;
    for (let x = 0; x < size; x += 1) {
      const weight = ramp(x) * wy;
      const sx = (x + half) % size;
      const a = (y * size + x) * 4;
      const b = (sy * size + sx) * 4;
      for (let c = 0; c < 3; c += 1) {
        pixels[a + c] = source[a + c] * weight + source[b + c] * (1 - weight);
      }
    }
  }
  return pixels;
}

/**
 * Textures are full-bleed tiles rather than isolated icons, so they bypass keying
 * and segmentation entirely.
 */
async function copyTexture(texture) {
  const source = path.join(ROOT, texture.source);
  if (!fs.existsSync(source)) {
    throw new Error(`Texture source not found for "${texture.id}": ${texture.source}`);
  }

  const { size } = texture;
  const raw = await sharp(source)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer();

  const pixels = makeSeamless(new Uint8ClampedArray(raw), size);

  fs.mkdirSync(ATLAS_DIR, { recursive: true });
  await sharp(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length), {
    raw: { width: size, height: size, channels: 4 }
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(ATLAS_DIR, texture.file));

  console.log(`[NEVA UI] Copied texture "${texture.id}" (${size}x${size}, seamless)`);
}

async function writeDebugSheet(sheet, boxes, outputPath) {
  const overlays = boxes.map((box, index) => {
    const width = box.maxX - box.minX + 1;
    const height = box.maxY - box.minY + 1;
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#ff0000" stroke-width="3"/>
      <text x="8" y="34" font-family="monospace" font-size="34" fill="#ff0000" font-weight="bold">${index}</text>
    </svg>`;
    return { input: Buffer.from(svg), left: box.minX, top: box.minY };
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await sharp(sheet.pixels, { raw: { width: sheet.width, height: sheet.height, channels: 4 } })
    .flatten({ background: "#202020" })
    .composite(overlays)
    .png()
    .toFile(outputPath);
}

async function sliceSheet(manifest, sheetSpec, { debug }) {
  const source = path.join(ROOT, sheetSpec.source);
  if (!fs.existsSync(source)) {
    throw new Error(`Sheet source not found for "${sheetSpec.id}": ${sheetSpec.source}`);
  }

  const output = { ...manifest.output, ...(sheetSpec.output ?? {}) };
  const analysis = await analyzeSheet(source, { key: sheetSpec.key ?? manifest.key, ...(sheetSpec.detect ?? {}) });

  if (debug) {
    const debugPath = path.join(DEBUG_DIR, `${sheetSpec.id}.debug.png`);
    await writeDebugSheet(analysis, analysis.boxes, debugPath);
    console.log(`[NEVA UI] Debug overlay: ${path.relative(ROOT, debugPath)}`);
  }

  if (analysis.boxes.length !== sheetSpec.sprites.length) {
    throw new Error(
      `Sheet "${sheetSpec.id}" detected ${analysis.boxes.length} icons but declares ${sheetSpec.sprites.length}. ` +
        `Re-run with --debug to inspect detection, or regenerate the sheet with cleaner separation.`
    );
  }

  fs.mkdirSync(ATLAS_DIR, { recursive: true });
  for (const [index, sprite] of sheetSpec.sprites.entries()) {
    const buffer = await extractSprite(analysis, analysis.boxes[index], output);
    fs.writeFileSync(path.join(ATLAS_DIR, sprite.file), buffer);
  }

  console.log(`[NEVA UI] Sliced ${sheetSpec.sprites.length} sprites from "${sheetSpec.id}"`);
  return sheetSpec.sprites.length;
}

async function main() {
  const argv = process.argv.slice(2);
  const debug = argv.includes("--debug");
  const all = argv.includes("--all");
  const sheetIndex = argv.indexOf("--sheet");
  const sheetId = sheetIndex >= 0 ? argv[sheetIndex + 1] : null;

  if (!all && !sheetId) {
    throw new Error("Specify --sheet <id> or --all");
  }

  const manifest = loadManifest();
  const textures = manifest.textures ?? [];
  const targets = all ? manifest.sheets : manifest.sheets.filter((sheet) => sheet.id === sheetId);
  const textureTargets = all ? textures : textures.filter((texture) => texture.id === sheetId);
  if (targets.length === 0 && textureTargets.length === 0) {
    throw new Error(
      `Unknown sheet "${sheetId}". Known: ${[...manifest.sheets, ...textures].map((s) => s.id).join(", ")}`
    );
  }

  let total = 0;
  const failures = [];
  for (const sheet of targets) {
    try {
      total += await sliceSheet(manifest, sheet, { debug });
    } catch (error) {
      // Keep going so a single bad sheet does not hide the state of the rest.
      if (!all) throw error;
      failures.push(error.message);
      console.error(`[NEVA UI] ${error.message}`);
    }
  }
  for (const texture of textureTargets) {
    try {
      await copyTexture(texture);
      total += 1;
    } catch (error) {
      if (!all) throw error;
      failures.push(error.message);
      console.error(`[NEVA UI] ${error.message}`);
    }
  }

  console.log(`[NEVA UI] Wrote ${total} sprites to ${path.relative(ROOT, ATLAS_DIR)}`);
  if (failures.length > 0) {
    throw new Error(`${failures.length} sheet(s) failed to slice`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`[NEVA UI] ${error.message}`);
    process.exitCode = 1;
  });
}

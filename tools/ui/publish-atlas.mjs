/**
 * Publishes the authored UI atlas to the runtime static directory Vite serves.
 *
 *   node tools/ui/publish-atlas.mjs
 *   node tools/ui/publish-atlas.mjs --check
 *
 * Sprites are authored under assets/ui/atlas/ but the game requests them from
 * /assets/ui/atlas/, which resolves to public/assets/ui/atlas/. Without this step the
 * atlas silently 404s, which is exactly how the icon layer shipped broken before.
 *
 * Every sprite is validated before it is copied: correct size, RGBA, and genuinely
 * transparent. The transparency check is deliberate - the previous atlas was fully
 * opaque with a cream background, so each icon rendered as a visible cream tile.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { loadManifest } from "./slice-sheet.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");

/** Icons must leave at least this share of their frame transparent. */
const MIN_TRANSPARENT_RATIO = 0.04;

/**
 * Pages written into the same directory by `ui:atlas` (tools/ui/extrudeAndPack.mjs).
 * They are tracked outputs of a different step, never stale sprites.
 */
const PACKED_PAGE = /^ui-atlas(?:_\d+)?\.(?:png|webp|json)$/;

async function inspect(file, expectedSize) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== expectedSize || info.height !== expectedSize) {
    return `expected ${expectedSize}x${expectedSize} but found ${info.width}x${info.height}`;
  }

  let transparent = 0;
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] < 16) transparent += 1;
  }
  const ratio = transparent / (info.width * info.height);
  if (ratio < MIN_TRANSPARENT_RATIO) {
    return `only ${(ratio * 100).toFixed(1)}% transparent - background was not keyed out`;
  }
  return null;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const manifest = loadManifest();
  const atlasDir = path.join(ROOT, manifest.atlasDir);
  const runtimeDir = path.join(ROOT, manifest.runtimeDir);

  const entries = [
    ...manifest.sheets.flatMap((sheet) =>
      sheet.sprites.map((sprite) => ({
        file: sprite.file,
        size: sheet.output?.size ?? manifest.output.size,
        keyed: true
      }))
    ),
    ...(manifest.textures ?? []).map((texture) => ({ file: texture.file, size: texture.size, keyed: false }))
  ];

  const missing = [];
  const invalid = [];

  for (const entry of entries) {
    const source = path.join(atlasDir, entry.file);
    if (!fs.existsSync(source)) {
      missing.push(entry.file);
      continue;
    }
    // Tiles are meant to be opaque; only isolated icons must prove transparency.
    const problem = entry.keyed
      ? await inspect(source, entry.size)
      : null;
    if (problem) invalid.push(`${entry.file}: ${problem}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.length} sprite(s) missing from ${manifest.atlasDir}. Run npm run ui:slice -- --all.\n  ` +
        missing.join("\n  ")
    );
  }
  if (invalid.length > 0) {
    throw new Error(`${invalid.length} sprite(s) failed validation:\n  ${invalid.join("\n  ")}`);
  }

  const expected = new Set(entries.map((entry) => entry.file));
  const isStaleSprite = (file) => file.endsWith(".png") && !expected.has(file) && !PACKED_PAGE.test(file);

  if (checkOnly) {
    // Validating the sources alone let a stale or missing published copy pass.
    const unpublished = entries
      .filter((entry) => {
        const target = path.join(runtimeDir, entry.file);
        return !fs.existsSync(target)
          || !fs.readFileSync(target).equals(fs.readFileSync(path.join(atlasDir, entry.file)));
      })
      .map((entry) => entry.file);
    const stale = fs.existsSync(runtimeDir) ? fs.readdirSync(runtimeDir).filter(isStaleSprite) : [];
    if (unpublished.length > 0 || stale.length > 0) {
      throw new Error(
        `${manifest.runtimeDir} is out of date. Run npm run ui:publish.` +
          (unpublished.length ? `\n  Missing or changed: ${unpublished.join(", ")}` : "") +
          (stale.length ? `\n  Stale: ${stale.join(", ")}` : "")
      );
    }
    console.log(`[NEVA UI] ${entries.length} sprites validated and published in ${manifest.runtimeDir}`);
    return;
  }

  fs.mkdirSync(runtimeDir, { recursive: true });

  // Clear stale sprites so a renamed or removed icon cannot linger in the runtime
  // directory and keep resolving after it left the manifest.
  for (const file of fs.readdirSync(runtimeDir)) {
    if (isStaleSprite(file)) fs.unlinkSync(path.join(runtimeDir, file));
  }

  let copied = 0;
  for (const entry of entries) {
    const source = path.join(atlasDir, entry.file);
    const target = path.join(runtimeDir, entry.file);
    const staged = `${target}.tmp`;
    fs.copyFileSync(source, staged);
    fs.renameSync(staged, target);
    copied += 1;
  }

  console.log(`[NEVA UI] Published ${copied} sprites to ${manifest.runtimeDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(`[NEVA UI] ${error.message}`);
    process.exitCode = 1;
  });
}

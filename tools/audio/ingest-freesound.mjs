#!/usr/bin/env node
/**
 * Download CC0 Freesound preview MP3s into public/assets/audio, snapshot the
 * license page, and upsert source records in assets/audio/audio-manifest.json.
 *
 * Usage:
 *   node tools/audio/ingest-freesound.mjs
 *   node tools/audio/ingest-freesound.mjs --force
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INGEST_PATH = path.join(ROOT, "assets/audio/ingest.json");
const MANIFEST_PATH = path.join(ROOT, "assets/audio/audio-manifest.json");
const RUNTIME_DIR = path.join(ROOT, "public/assets/audio");
const LICENSE_DIR = path.join(ROOT, "assets/audio/licenses");
const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const UA = "NevaAudioIngest/1.0 (local CC0 game-asset bundling)";
const force = process.argv.includes("--force");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url) => {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status})`);
  }
  return response.text();
};

const fetchBuffer = async (url) => {
  const response = await fetch(url, { headers: { "User-Agent": UA } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const durationSeconds = (file) => {
  try {
    const info = execFileSync("afinfo", [file], { encoding: "utf8" });
    const match = info.match(/estimated duration:\s*([0-9.]+)/i);
    if (match) return Number(match[1]);
  } catch {
    // afinfo is macOS-only; fall through.
  }
  try {
    const info = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
      encoding: "utf8"
    });
    const value = Number(info.trim());
    if (Number.isFinite(value) && value > 0) return value;
  } catch {
    // Optional.
  }
  throw new Error(`Could not read duration for ${file}`);
};

const parseSoundPage = (html, freesoundId) => {
  if (!html.includes("creativecommons.org/publicdomain/zero")) {
    throw new Error(`Freesound ${freesoundId} is not CC0`);
  }
  const title = html.match(/property="og:audio:title" content="([^"]+)"/)?.[1];
  const creator = html.match(/property="og:audio:artist" content="([^"]+)"/)?.[1];
  const sourceUrl = html.match(/property="og:url" content="([^"]+)"/)?.[1];
  const previewUrl = html.match(/https:\/\/cdn\.freesound\.org\/previews\/\d+\/\d+_[^"' ]+-hq\.mp3/)?.[0];
  if (!title || !creator || !sourceUrl || !previewUrl) {
    throw new Error(`Could not parse Freesound page for ${freesoundId}`);
  }
  return { title, creator, sourceUrl, previewUrl };
};

const upsertSource = (manifest, source) => {
  const index = manifest.sources.findIndex((entry) => entry.id === source.id);
  if (index >= 0) {
    manifest.sources[index] = source;
    return;
  }
  manifest.sources.push(source);
};

const main = async () => {
  const ingest = readJson(INGEST_PATH);
  const manifest = readJson(MANIFEST_PATH);
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
  fs.mkdirSync(LICENSE_DIR, { recursive: true });

  for (const entry of ingest.sources) {
    const runtimeUrl = `/assets/audio/${entry.id}.mp3`;
    const mp3Path = path.join(ROOT, "public", runtimeUrl);
    const licenseSnapshot = `assets/audio/licenses/freesound-${entry.freesoundId}.html`;
    const licensePath = path.join(ROOT, licenseSnapshot);
    const existing = manifest.sources.find((source) => source.id === entry.id);
    if (!force && existing && fs.existsSync(mp3Path) && fs.existsSync(licensePath)) {
      console.log(`skip ${entry.id} (already bundled)`);
      continue;
    }

    try {
      const pageUrl = `https://freesound.org/people/${entry.user}/sounds/${entry.freesoundId}/`;
      const pageHtml = await fetchText(pageUrl);
      const parsed = parseSoundPage(pageHtml, entry.freesoundId);
      fs.writeFileSync(licensePath, pageHtml);
      fs.writeFileSync(mp3Path, await fetchBuffer(parsed.previewUrl));
      const source = {
        id: entry.id,
        title: parsed.title,
        creator: parsed.creator,
        sourceUrl: parsed.sourceUrl,
        previewUrl: parsed.previewUrl,
        licenseUrl: CC0,
        licenseSnapshot,
        runtimeUrl,
        sha256: sha256(mp3Path),
        durationSeconds: durationSeconds(mp3Path)
      };
      upsertSource(manifest, source);
      console.log(`ingested ${entry.id}  ${source.durationSeconds.toFixed(3)}s  ${parsed.title}`);
    } catch (error) {
      console.error(`skip ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(250);
  }

  manifest.license = ingest.license;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`updated ${path.relative(ROOT, MANIFEST_PATH)}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

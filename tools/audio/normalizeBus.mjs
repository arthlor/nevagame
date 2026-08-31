#!/usr/bin/env node
/**
 * Two-pass EBU R128 normalization for Neva's bundled runtime audio.
 *
 * Default: normalize every manifest source in place through a rollback-capable
 * staging transaction, then synchronize sha256, durationSeconds, and channels.
 * Use --source <id> or --category <name> to narrow the selection.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = path.join(ROOT, "assets/audio/audio-manifest.json");
const STAGING_ROOT = path.join(ROOT, "generated/.staging");
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";

export const AUDIO_BUS_TARGETS = Object.freeze({
  music: { targetLufs: -20, truePeak: -4, lra: 12 },
  ambience: { targetLufs: -24, truePeak: -6, lra: 12 },
  weather: { targetLufs: -18, truePeak: -6, lra: 12 },
  world_sfx: { targetLufs: -16, truePeak: -3, lra: 10 },
  player_sfx: { targetLufs: -15, truePeak: -3, lra: 8 },
  foley: { targetLufs: -17, truePeak: -3, lra: 8 },
  ui: { targetLufs: -15, truePeak: -3, lra: 8 }
});

function fail(message) {
  throw new Error(message);
}

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function sourceCues(manifest) {
  const cues = new Map(manifest.sources.map((source) => [source.id, []]));
  for (const cue of Object.values(manifest.cues ?? {})) {
    cues.get(cue.sourceId)?.push(cue);
  }
  return cues;
}

export function normalizationCategoryForSource(source, cues = []) {
  const buses = new Set(cues.map((cue) => cue.bus));
  if (source.id.startsWith("footsteps-") || source.id === "donkey-trot") {
    return "foley";
  }
  if (buses.has("music")) return "music";
  if (buses.has("weather")) return "weather";
  if (buses.has("ui") || (cues.length === 0 && source.id.startsWith("ui-"))) return "ui";
  if (buses.has("ambience")) return "ambience";
  if (cues.some((cue) => cue.spatial === true)) return "world_sfx";
  if (buses.has("boat") || buses.has("fishing") || buses.has("sfx")) return "player_sfx";
  fail(`No audio normalization category for source: ${source.id}`);
}

function outputChannelsForSource(source, cues) {
  if (cues.some((cue) => cue.spatial === true)) return 1;
  if (cues.length > 0 || source.id.startsWith("ui-")) return 2;
  fail(`No audio channel policy for source: ${source.id}`);
}

function run(binary, args, label) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${label} failed (${result.status ?? "no status"}):\n${(result.stderr || result.stdout).slice(-1200)}`);
  }
  return result;
}

function requireBinary(binary) {
  run(binary, ["-version"], `Required binary ${binary}`);
}

function loudnormStats(stderr) {
  const blocks = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!blocks?.length) fail(`Could not parse loudnorm pass-1 JSON:\n${stderr.slice(-1200)}`);
  return JSON.parse(blocks.at(-1));
}

export function normalizeAudioByBus(
  inputPath,
  outputPath,
  busConfig,
  ffmpeg = FFMPEG,
  minimumDurationSeconds = 0,
  outputChannels = 2
) {
  const { targetLufs, truePeak, lra } = busConfig;
  const pass1Filter = `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:print_format=json`;
  const pass1 = run(ffmpeg, [
    "-hide_banner", "-nostdin", "-i", inputPath,
    "-af", pass1Filter, "-f", "null", "-"
  ], `Audio analysis ${path.basename(inputPath)}`);
  const stats = loudnormStats(pass1.stderr);
  const measuredFields = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];
  const hasMeasuredStats = measuredFields.every((field) => Number.isFinite(Number(stats[field])));
  const pass2Filter = hasMeasuredStats
    ? [
        `loudnorm=I=${targetLufs}`,
        `TP=${truePeak}`,
        `LRA=${lra}`,
        `measured_I=${stats.input_i}`,
        `measured_TP=${stats.input_tp}`,
        `measured_LRA=${stats.input_lra}`,
        `measured_thresh=${stats.input_thresh}`,
        `offset=${stats.target_offset}`,
        "linear=true",
        "print_format=summary"
      ].join(":")
    : `loudnorm=I=${targetLufs}:TP=${truePeak}:LRA=${lra}:print_format=summary`;
  const outputFilter = minimumDurationSeconds > 0
    ? `${pass2Filter},apad=whole_dur=${minimumDurationSeconds}`
    : pass2Filter;
  run(ffmpeg, [
    "-hide_banner", "-nostdin", "-i", inputPath,
    "-map", "0:a:0", "-vn", "-af", outputFilter,
    "-ac", String(outputChannels),
    "-codec:a", "libmp3lame", "-q:a", "2", "-map_metadata", "-1",
    "-y", outputPath
  ], `Audio normalization ${path.basename(inputPath)}`);
}

function probeAudio(filename) {
  const result = run(FFPROBE, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "format=duration:stream=channels", "-of", "json", filename
  ], `Audio probe ${path.basename(filename)}`);
  const info = JSON.parse(result.stdout);
  const durationSeconds = Number(info.format?.duration);
  const channels = Number(info.streams?.[0]?.channels);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    fail(`Invalid duration for ${filename}`);
  }
  if (!Number.isSafeInteger(channels) || channels <= 0) {
    fail(`Invalid channel count for ${filename}`);
  }
  return { durationSeconds: Number(durationSeconds.toFixed(6)), channels };
}

function sha256(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function runtimePath(source) {
  if (!/^\/assets\/audio\/[a-z0-9-]+\.mp3$/.test(source.runtimeUrl)) {
    fail(`Unsafe runtime audio URL for ${source.id}: ${source.runtimeUrl}`);
  }
  return path.join(ROOT, "public", source.runtimeUrl);
}

function atomicReplace(source, destination) {
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.copyFileSync(source, temporary);
  fs.renameSync(temporary, destination);
}

function atomicWriteJson(filename, value) {
  const temporary = `${filename}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
    fs.renameSync(temporary, filename);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

function parseArgs(argv) {
  const options = { sources: [], categories: [], check: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--source") options.sources.push(argv[++index] ?? fail("--source requires an ID"));
    else if (arg === "--category") options.categories.push(argv[++index] ?? fail("--category requires a name"));
    else if (arg === "--check") options.check = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else fail(`Unknown audio option: ${arg}`);
  }
  return options;
}

function usage() {
  console.log(`Usage: node tools/audio/normalizeBus.mjs [options]

Options:
  --source <id>       Normalize one source (repeatable)
  --category <name>  Normalize one category (repeatable)
  --check             Verify manifest hash/duration/channel parity only
  --dry-run           Print the resolved plan without invoking ffmpeg
  --help              Show this help`);
}

function selectedSources(manifest, options) {
  const cues = sourceCues(manifest);
  const records = manifest.sources.map((source) => ({
    source,
    cues: cues.get(source.id),
    category: normalizationCategoryForSource(source, cues.get(source.id)),
    outputChannels: outputChannelsForSource(source, cues.get(source.id))
  }));
  for (const category of options.categories) {
    if (!(category in AUDIO_BUS_TARGETS)) fail(`Unknown audio category: ${category}`);
  }
  const sourceIds = new Set(options.sources);
  const categories = new Set(options.categories);
  const selected = records.filter(({ source, category }) =>
    (sourceIds.size === 0 || sourceIds.has(source.id))
    && (categories.size === 0 || categories.has(category))
  );
  for (const id of sourceIds) {
    if (!manifest.sources.some((source) => source.id === id)) fail(`Unknown audio source: ${id}`);
  }
  if (selected.length === 0) fail("Audio selection is empty");
  return selected;
}

function verifyManifest(records) {
  requireBinary(FFPROBE);
  const failures = [];
  for (const { source } of records) {
    const filename = runtimePath(source);
    if (!fs.existsSync(filename)) {
      failures.push(`${source.id}: runtime file missing`);
      continue;
    }
    const measured = probeAudio(filename);
    if (source.sha256 !== sha256(filename)) failures.push(`${source.id}: sha256 mismatch`);
    if (Math.abs(Number(source.durationSeconds) - measured.durationSeconds) > 0.01) {
      failures.push(`${source.id}: duration mismatch`);
    }
    if (source.channels !== measured.channels) failures.push(`${source.id}: channel mismatch`);
  }
  if (failures.length) fail(`Audio manifest check failed:\n${failures.join("\n")}`);
  console.log(`Audio manifest check passed for ${records.length} source(s).`);
}

function normalizeManifest(manifest, records) {
  requireBinary(FFMPEG);
  requireBinary(FFPROBE);
  fs.mkdirSync(STAGING_ROOT, { recursive: true });
  const staging = fs.mkdtempSync(path.join(STAGING_ROOT, "audio-normalize-"));
  const outputDirectory = path.join(staging, "output");
  const backupDirectory = path.join(staging, "backup");
  fs.mkdirSync(outputDirectory);
  fs.mkdirSync(backupDirectory);
  const nextManifest = structuredClone(manifest);
  const prepared = [];
  const promoted = [];

  try {
    for (const { source, category, outputChannels } of records) {
      const input = runtimePath(source);
      if (!fs.existsSync(input)) fail(`Missing runtime audio: ${source.runtimeUrl}`);
      const output = path.join(outputDirectory, `${source.id}.mp3`);
      const inputDuration = probeAudio(input).durationSeconds;
      const cueEnd = Object.values(manifest.cues ?? {})
        .filter((cue) => cue.sourceId === source.id)
        .reduce((maximum, cue) => Math.max(maximum, cue.offset + cue.duration), 0);
      normalizeAudioByBus(
        input,
        output,
        AUDIO_BUS_TARGETS[category],
        FFMPEG,
        Math.max(inputDuration, cueEnd),
        outputChannels
      );
      const measured = probeAudio(output);
      const nextSource = nextManifest.sources.find((candidate) => candidate.id === source.id);
      Object.assign(nextSource, measured, { sha256: sha256(output) });
      prepared.push({ source, category, input, output });
      console.log(
        `prepared ${source.id} (${category}, ${AUDIO_BUS_TARGETS[category].targetLufs} LUFS, ${outputChannels === 1 ? "mono" : "stereo"})`
      );
    }

    for (const record of prepared) {
      const backup = path.join(backupDirectory, `${record.source.id}.mp3`);
      fs.copyFileSync(record.input, backup);
      atomicReplace(record.output, record.input);
      promoted.push({ ...record, backup });
    }
    atomicWriteJson(MANIFEST_PATH, nextManifest);
    console.log(`Normalized ${prepared.length} source(s) and synchronized ${path.relative(ROOT, MANIFEST_PATH)}.`);
  } catch (error) {
    for (const record of promoted.reverse()) {
      try { atomicReplace(record.backup, record.input); } catch {}
    }
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const manifest = readManifest();
  const records = selectedSources(manifest, options);
  if (options.dryRun) {
    for (const { source, category, outputChannels } of records) {
      const target = AUDIO_BUS_TARGETS[category];
      console.log(
        `${source.id}\t${category}\t${target.targetLufs} LUFS\t${target.truePeak} dBTP\t${outputChannels === 1 ? "mono" : "stereo"}`
      );
    }
    return;
  }
  if (options.check) {
    verifyManifest(records);
    return;
  }
  normalizeManifest(manifest, records);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

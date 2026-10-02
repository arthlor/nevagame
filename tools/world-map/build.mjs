/** Explicit offline cartography build; never imported by dev/test/runtime. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import config from "./config.json" with { type: "json" };
import { ROOT, RECEIPT_PATH, OUTPUT_PATHS, collectInputs, fingerprint, hash } from "./inputs.mjs";

const args = process.argv.slice(2);
if (args.some(arg => !["--verify", "--keep-work"].includes(arg))) {
  console.error("Usage: npm run map:build -- [--verify] [--keep-work]");
  process.exit(2);
}
const python = process.env.PYTHON ?? "python3";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "neva-world-map-"));
const environment = { ...process.env, MPLCONFIGDIR: path.join(temporary, "matplotlib"), XDG_CACHE_HOME: path.join(temporary, "cache"), PYTHONHASHSEED: "0", OPENBLAS_NUM_THREADS: "1" };
const started = performance.now();

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed with exit ${result.status}`);
}

function pythonPrerequisite() {
  const script = `import importlib.metadata as m, json\nfrom PIL import features\nprint(json.dumps({**{p:m.version(p) for p in ['Pillow','numpy','scipy','matplotlib']},'libwebp':features.version('webp')}))`;
  const result = spawnSync(python, ["-c", script], { cwd: ROOT, env: environment, encoding: "utf8" });
  const setup = "Create a Python 3.11+ virtual environment and run: python -m pip install -r tools/world-map/requirements.txt. Set PYTHON=/path/to/venv/bin/python if needed.";
  if (result.error || result.status !== 0) throw new Error(`Map rendering prerequisites are unavailable. ${setup}\n${result.error?.message ?? result.stderr.trim()}`);
  const versions = JSON.parse(result.stdout);
  const requirements = fs.readFileSync(path.join(ROOT, "tools/world-map/requirements.txt"), "utf8").split("\n").filter(line => line.includes("=="));
  const mismatches = requirements.filter(line => { const [name, version] = line.split("=="); return versions[name] !== version; });
  if (mismatches.length || !versions.libwebp) throw new Error(`Map renderer versions differ: ${mismatches.join(", ") || "Pillow lacks WebP support"}. ${setup}`);
  return versions;
}

async function generate(directory, inputFingerprint) {
  fs.mkdirSync(directory, { recursive: true });
  run(process.execPath, [createRequire(path.join(ROOT, "package.json")).resolve("vite-node/cli"), "--config", "tools/world-map/vite.config.ts", "tools/world-map/extract.ts", "--", "--out", directory]);
  run(python, ["tools/world-map/render.py", directory]);
  const data = JSON.parse(fs.readFileSync(path.join(directory, "world-data.json"), "utf8"));
  const image = fs.readFileSync(path.join(directory, config.textureFile));
  const metadata = await sharp(image).metadata();
  const expectedHeight = Math.round(data.projection.height * config.textureWidth / data.projection.width);
  if (metadata.format !== "webp" || metadata.width !== config.textureWidth || metadata.height !== expectedHeight) {
    throw new Error("Rendered image dimensions/format do not match the shared projection.");
  }
  const manifest = {
    schemaVersion: config.schemaVersion,
    projection: data.projection,
    texture: { file: config.textureFile, width: metadata.width, height: metadata.height,
      fileBytes: image.length, decodedRgbaBytes: metadata.width * metadata.height * 4, sha256: hash(image) },
    source: { ...data.source, fingerprint: inputFingerprint },
    axes: { right: "+X", down: "+Z", north: "-Z" }
  };
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.fromEntries(OUTPUT_PATHS.map(filename => [filename, hash(fs.readFileSync(path.join(directory, path.basename(filename))))]));
}

try {
  const toolchain = pythonPrerequisite();
  const inputs = collectInputs();
  const inputFingerprint = fingerprint(inputs);
  const first = path.join(temporary, "first");
  const outputs = await generate(first, inputFingerprint);
  if (args.includes("--verify")) {
    const second = await generate(path.join(temporary, "second"), inputFingerprint);
    if (JSON.stringify(outputs) !== JSON.stringify(second)) throw new Error("Two fresh map builds differed; nothing was published.");
    console.info("Determinism verified: two fresh source extractions produced byte-identical WebP and manifest.");
  }
  if (fingerprint(collectInputs()) !== inputFingerprint) throw new Error("Map inputs changed during generation; nothing was published. Retry after edits settle.");
  // Complete both outputs first; publish the receipt last. A interrupted write is
  // caught by map:check rather than blessing a partially updated map.
  for (const filename of OUTPUT_PATHS) {
    const target = path.join(ROOT, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const staged = `${target}.tmp`;
    fs.copyFileSync(path.join(first, path.basename(filename)), staged);
    fs.renameSync(staged, target);
  }
  const receipt = { schemaVersion: 1, inputFingerprint, inputs, outputs, toolchain: { node: process.version, ...toolchain },
    determinismVerified: args.includes("--verify") };
  fs.writeFileSync(path.join(ROOT, `${RECEIPT_PATH}.tmp`), `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(path.join(ROOT, `${RECEIPT_PATH}.tmp`), path.join(ROOT, RECEIPT_PATH));
  console.info(`Built ${config.textureFile} in ${((performance.now() - started) / 1000).toFixed(1)}s (${inputFingerprint.slice(0, 12)}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (args.includes("--keep-work")) console.info(`Review extraction/master files: ${temporary}`);
  else fs.rmSync(temporary, { recursive: true, force: true });
}

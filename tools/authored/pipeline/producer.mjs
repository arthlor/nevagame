/**
 * The authored (Three.js) producer for the art pipeline.
 *
 * `tools/art/cli.mjs` calls `runAuthoredProducer` for every selected asset whose generator is an
 * authored generator, alongside the authored-GLB producer for committed source GLBs. It writes one
 * raw GLB per asset into the stage's `raw/` directory and returns per-asset reports in the shared
 * producer report shape, so everything downstream (Khronos and contract validation, optimisation,
 * cache, publication, manifest, determinism) treats both producers the same way.
 *
 * The TypeScript is bundled for Node with esbuild on first use into `generated/.cache/authored/`,
 * keyed by the hash of the authored sources, so repeated runs reuse the bundle.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "../../..");
const SOURCE_EXTENSIONS = new Set([".ts", ".json", ".mjs"]);
/** Authored source directories: the kit, the generators and this pipeline glue. */
const SOURCE_DIRECTORIES = ["tools/authored/kit", "tools/authored/generators", "tools/authored/pipeline"];

/** Parameter contracts by authored generator name, in the CLI's rule format. */
export function authoredParameterContracts(repoRoot = DEFAULT_ROOT) {
  const file = path.join(repoRoot, "tools/authored/generators/contracts.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function isAuthoredGenerator(generator, repoRoot = DEFAULT_ROOT) {
  return Object.hasOwn(authoredParameterContracts(repoRoot), generator);
}

/** Every file that can change an authored asset, for cache and determinism hashing. */
export function authoredToolchainFiles(repoRoot = DEFAULT_ROOT) {
  const files = [path.join(repoRoot, "art/palettes/neva.palette.json")];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(filename);
    }
  };
  for (const directory of SOURCE_DIRECTORIES) visit(path.join(repoRoot, directory));
  return files.sort();
}

export function authoredToolchainHash(repoRoot = DEFAULT_ROOT) {
  const digest = crypto.createHash("sha256");
  for (const filename of authoredToolchainFiles(repoRoot)) {
    digest.update(path.relative(repoRoot, filename));
    digest.update("\0");
    digest.update(fs.readFileSync(filename));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function authoredProducerVersion(repoRoot = DEFAULT_ROOT) {
  const three = JSON.parse(fs.readFileSync(path.join(repoRoot, "node_modules/three/package.json"), "utf8"));
  return `authored-three@${three.version}`;
}

const loaded = new Map();

/** Bundles and imports the Node entry once per source revision. */
export async function loadAuthoredProducer(repoRoot = DEFAULT_ROOT) {
  const hash = authoredToolchainHash(repoRoot);
  if (loaded.has(hash)) return loaded.get(hash);
  const outputDirectory = path.join(repoRoot, "generated/.cache/authored");
  const output = path.join(outputDirectory, `producer-${hash.slice(0, 16)}.mjs`);
  if (!fs.existsSync(output)) {
    const { build } = await import("esbuild");
    fs.mkdirSync(outputDirectory, { recursive: true });
    const temporary = `${output}.next-${process.pid}`;
    await build({
      entryPoints: [path.join(repoRoot, "tools/authored/pipeline/node-entry.ts")],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      outfile: temporary,
      logLevel: "warning",
      legalComments: "none"
    });
    fs.renameSync(temporary, output);
  }
  const module = await import(pathToFileURL(output).href);
  loaded.set(hash, module);
  return module;
}

/**
 * Builds the given catalog specs into `outputDir/<file>` and returns `{ assets: [report, ...] }`.
 * A failing art contract throws with the asset id.
 */
export async function runAuthoredProducer({ specs, outputDir, repoRoot = DEFAULT_ROOT }) {
  const producer = await loadAuthoredProducer(repoRoot);
  const assets = [];
  for (const spec of specs) {
    const started = Date.now();
    const { glb, report } = await producer.buildAuthoredAsset(spec);
    const target = path.join(outputDir, spec.file);
    fs.writeFileSync(target, glb);
    assets.push({ ...report, fileSizeBytes: glb.byteLength, durationMs: Date.now() - started });
    console.info(`[NEVA ART] Authored ${spec.id} (${report.triangles} triangles, ${glb.byteLength} bytes)`);
  }
  return { assets };
}

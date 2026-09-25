import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authoredToolchainFiles, isAuthoredGenerator } from "../authored/pipeline/producer.mjs";

const THIS_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(THIS_FILE);
const ROOT = path.resolve(HERE, "../..");

/** Bumped when cached results can no longer be trusted by a newer pipeline. */
export const ART_CACHE_VERSION = 2;
export const DEFAULT_CACHE_ROOT = path.join(ROOT, "generated/.cache/art");
/** The generator name of committed source-GLB assets (Tripo, code-authored buildings, adapted derivatives). */
export const AUTHORED_GLB_GENERATOR = "authored_glb";
/**
 * Every file that decides what the art pipeline publishes, relative to the repository root. The
 * published manifest records their combined hash, so any change here requires `art:sync`.
 */
export const PIPELINE_TOOLCHAIN_FILES = Object.freeze([
  "tools/art/cli.mjs",
  "tools/art/cache.mjs",
  "tools/art/glb.mjs",
  "tools/art/optimize.mjs",
  "tools/art/surface_contract.mjs",
  "tools/art/legacy-generators.json",
  "tools/art/asset_budgets.json",
  "assets/specs/asset-catalog.schema.json",
]);

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function hashFiles(files, relativeRoot = ROOT) {
  const digest = crypto.createHash("sha256");
  for (const filename of [...new Set(files)].sort()) {
    if (!fs.existsSync(filename)) throw new Error(`Cannot hash missing art input: ${filename}`);
    digest.update(path.relative(relativeRoot, filename));
    digest.update("\0");
    digest.update(fs.readFileSync(filename));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function pipelineToolchainFiles(repoRoot = ROOT) {
  return PIPELINE_TOOLCHAIN_FILES.map((relative) => path.join(repoRoot, relative));
}

/** The pipeline toolchain hash recorded in the published manifest. */
export function computeToolchainHash(repoRoot = ROOT) {
  return hashFiles(pipelineToolchainFiles(repoRoot), repoRoot);
}

function packageFiles(repoRoot) {
  return ["package.json", "package-lock.json", "npm-shrinkwrap.json"]
    .map((filename) => path.join(repoRoot, filename))
    .filter((filename) => fs.existsSync(filename));
}

/**
 * Every file that can change one asset's produced bytes. Authored generators add their kit,
 * generators and Node producer; committed source GLBs add nothing here because their source bytes
 * enter the input hash directly.
 */
export function computeAssetToolchainHash(asset, repoRoot = ROOT) {
  const files = [...pipelineToolchainFiles(repoRoot), ...packageFiles(repoRoot)];
  if (isAuthoredGenerator(asset.generator, repoRoot)) files.push(...authoredToolchainFiles(repoRoot));
  return hashFiles(files, repoRoot);
}

function repositoryFileHash(relative, repoRoot) {
  const root = fs.realpathSync(repoRoot);
  const resolved = fs.realpathSync(path.resolve(repoRoot, relative));
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Unsafe art source path: ${relative}`);
  }
  return sha256(fs.readFileSync(resolved));
}

export function computeAssetInputHash(
  asset,
  palette,
  producerVersion,
  optimizeConfig = {},
  repoRoot = ROOT
) {
  const paletteTokens = asset.palette
    ? Object.fromEntries(
        [...asset.palette]
          .sort()
          .filter((token) => palette?.tokens?.[token] !== undefined)
          .map((token) => [token, palette.tokens[token]])
      )
    : {};
  const sourceGlb = asset.generator === AUTHORED_GLB_GENERATOR ? asset.parameters?.sourceGlb : null;

  return sha256(
    stableStringify({
      cacheVersion: ART_CACHE_VERSION,
      producerVersion: String(producerVersion),
      asset,
      paletteVersion: palette?.version ?? 1,
      paletteTokens,
      sourceGlbHash: sourceGlb ? repositoryFileHash(sourceGlb, repoRoot) : null,
      optimizeConfig,
      toolchainHash: computeAssetToolchainHash(asset, repoRoot),
    })
  );
}

export function assetCachePlan(asset, context, producer, cacheRoot = DEFAULT_CACHE_ROOT) {
  if (!context.palette) throw new Error("Asset cache planning requires the validated palette");
  const inputHash = computeAssetInputHash(
    asset,
    context.palette,
    producer.version,
    context.optimizeConfig ?? {},
    context.repoRoot ?? ROOT
  );
  const directory = path.join(cacheRoot, inputHash);
  return {
    inputHash,
    directory,
    artifact: path.join(directory, asset.file),
    metadata: path.join(directory, `${asset.file}.json`),
  };
}

export async function readAssetCache(plan, spec, validatorFn = null) {
  if (!fs.existsSync(plan.artifact) || !fs.existsSync(plan.metadata)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(plan.metadata, "utf8"));
    if (
      record.version !== ART_CACHE_VERSION ||
      record.inputHash !== plan.inputHash ||
      record.id !== spec.id ||
      record.file !== spec.file ||
      !record.result ||
      record.result.artContractStatus !== "passed" ||
      (record.result.fileHash !== undefined && typeof record.result.fileHash !== "string")
    ) {
      return null;
    }
    const validation = validatorFn ? await validatorFn(plan.artifact, spec, "cache") : {};
    if (validatorFn && record.result.fileHash && validation.fileHash && record.result.fileHash !== validation.fileHash) {
      return null;
    }
    return {
      ...record.result,
      ...validation,
      semanticHash: record.result.semanticHash ?? validation.semanticHash,
      inputHash: plan.inputHash,
      cacheHit: true,
    };
  } catch (error) {
    console.warn(`[NEVA ART] Ignoring invalid cache for ${spec.id}: ${error.message}`);
    return null;
  }
}

export function writeAssetCache(plan, result, optimizedGlbPath, producerVersion) {
  fs.mkdirSync(path.dirname(plan.artifact), { recursive: true });
  fs.copyFileSync(optimizedGlbPath, plan.artifact);
  const metadataTemporary = `${plan.metadata}.next-${process.pid}`;
  fs.writeFileSync(
    metadataTemporary,
    `${JSON.stringify(
      {
        version: ART_CACHE_VERSION,
        inputHash: plan.inputHash,
        id: result.id,
        file: result.file,
        producerVersion: String(producerVersion),
        result: { ...result, cacheHit: false },
      },
      null,
      2
    )}\n`
  );
  fs.renameSync(metadataTemporary, plan.metadata);
}

/** Removes cache directories older than `maxAgeMs` or beyond the newest `maxEntries`. */
export function cleanCache(cacheRoot = DEFAULT_CACHE_ROOT, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxEntries = 500) {
  if (!fs.existsSync(cacheRoot)) return { kept: 0, removed: 0 };
  const now = Date.now();
  let removed = 0;
  let kept = 0;
  const directories = fs.readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(cacheRoot, entry.name);
      return { directory, modifiedAt: fs.statSync(directory).mtimeMs };
    })
    .sort((left, right) => right.modifiedAt - left.modifiedAt);
  directories.forEach((entry, index) => {
    if (now - entry.modifiedAt > maxAgeMs || index >= maxEntries) {
      fs.rmSync(entry.directory, { recursive: true, force: true });
      removed++;
    } else {
      kept++;
    }
  });
  return { kept, removed };
}

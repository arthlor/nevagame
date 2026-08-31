import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(THIS_FILE);
const ROOT = path.resolve(HERE, "../..");

export const ART_CACHE_VERSION = 1;
export const TOOLCHAIN_EXTENSIONS = Object.freeze(new Set([".json", ".mjs", ".mts", ".py"]));
export const DEFAULT_CACHE_ROOT = path.join(ROOT, "generated/.cache/art");

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

export function computeToolchainHash(directory = HERE) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && TOOLCHAIN_EXTENSIONS.has(path.extname(entry.name))) files.push(filename);
    }
  };
  visit(directory);
  const digest = crypto.createHash("sha256");
  for (const filename of files.sort()) {
    digest.update(path.relative(directory, filename));
    digest.update("\0");
    digest.update(fs.readFileSync(filename));
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function computeCommonToolchainHash(commonDir = path.join(HERE, "common")) {
  if (!fs.existsSync(commonDir)) return sha256("missing_common_dir");
  const hash = crypto.createHash("sha256");
  const files = fs.readdirSync(commonDir).filter((f) => f.endsWith(".py") || TOOLCHAIN_EXTENSIONS.has(path.extname(f))).sort();
  for (const file of files) {
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(commonDir, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function generatorModuleFor(generator, repoRoot = ROOT) {
  const registryPath = path.join(repoRoot, "tools/blender/generators/registry.py");
  if (!fs.existsSync(registryPath)) {
    return `${generator}.py`;
  }
  const registry = fs.readFileSync(registryPath, "utf8");
  for (const match of registry.matchAll(/^from \.([a-z0-9_]+) import ([^\n]+)$/gm)) {
    const importedNames = match[2].split(",").map((name) => name.trim());
    if (importedNames.includes(generator)) return `${match[1]}.py`;
  }
  const directPath = path.join(repoRoot, `tools/blender/generators/${generator}.py`);
  if (fs.existsSync(directPath)) return `${generator}.py`;
  throw new Error(`${generator}: no registered generator module was found`);
}

export function computeAssetToolchainHash(asset, repoRoot = ROOT) {
  const blenderDir = path.join(repoRoot, "tools/blender");
  const generatorModule = generatorModuleFor(asset.generator, repoRoot);
  const commonDirectory = path.join(blenderDir, "common");
  const commonFiles = fs.existsSync(commonDirectory)
    ? fs.readdirSync(commonDirectory)
        .filter((filename) => TOOLCHAIN_EXTENSIONS.has(path.extname(filename)))
        .map((filename) => path.join(commonDirectory, filename))
    : [];
  const packageFiles = ["package.json", "package-lock.json", "npm-shrinkwrap.json"]
    .map((filename) => path.join(repoRoot, filename))
    .filter((filename) => fs.existsSync(filename));

  const toolchainCandidates = [
    path.join(blenderDir, "cli.mjs"),
    path.join(blenderDir, "cache.mjs"),
    path.join(blenderDir, "optimize.mjs"),
    path.join(blenderDir, "pool.mjs"),
    path.join(blenderDir, "bootstrap.py"),
    path.join(blenderDir, "generators/registry.py"),
    path.join(blenderDir, "generators", generatorModule),
    ...commonFiles,
    path.join(repoRoot, "assets/specs/asset-catalog.schema.json"),
    path.join(blenderDir, "asset_budgets.json"),
    ...packageFiles,
  ].filter((f) => fs.existsSync(f));

  return hashFiles(toolchainCandidates, repoRoot);
}

export function computeAssetSourceHash(
  assetSpec,
  generatorCode,
  commonToolchainHash,
  paletteJson,
  blenderVersion,
  optimizeConfig = {}
) {
  const hash = crypto.createHash("sha256");
  hash.update(stableStringify(assetSpec));
  hash.update("\0");
  hash.update(generatorCode);
  hash.update("\0");
  hash.update(commonToolchainHash);
  hash.update("\0");
  hash.update(typeof paletteJson === "string" ? paletteJson : stableStringify(paletteJson));
  hash.update("\0");
  hash.update(String(blenderVersion));
  hash.update("\0");
  hash.update(stableStringify(optimizeConfig));
  return hash.digest("hex");
}

export function computeAssetInputHash(
  asset,
  palette,
  blenderVersion,
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

  return sha256(
    stableStringify({
      cacheVersion: ART_CACHE_VERSION,
      blenderVersion: String(blenderVersion),
      asset,
      paletteVersion: palette?.version ?? 1,
      paletteTokens,
      optimizeConfig,
      toolchainHash: computeAssetToolchainHash(asset, repoRoot),
    })
  );
}

export function computeAssetHash(catalogEntry, repoRoot = ROOT, overrides = {}) {
  const palettePath = path.join(repoRoot, "art/palettes/neva.palette.json");
  const palette = fs.existsSync(palettePath)
    ? JSON.parse(fs.readFileSync(palettePath, "utf8"))
    : { version: 1, tokens: {} };
  const blenderVersion = overrides.blenderVersion ?? "4.2.0";
  const optimizeConfig = overrides.optimizeConfig ?? {};
  return computeAssetInputHash(catalogEntry, palette, blenderVersion, optimizeConfig, repoRoot);
}

export function isAssetCurrent(cacheDir, assetId, sourceHash) {
  const metaPath = path.join(cacheDir, `${assetId}.meta.json`);
  if (!fs.existsSync(metaPath)) {
    const directMetaPath = path.join(cacheDir, sourceHash, `${assetId}.json`);
    if (fs.existsSync(directMetaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(directMetaPath, "utf8"));
        return meta.inputHash === sourceHash;
      } catch {
        return false;
      }
    }
    return false;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const hashMatches = meta.sourceHash === sourceHash || meta.inputHash === sourceHash;
    const artifactExists = meta.artifactPath
      ? fs.existsSync(meta.artifactPath)
      : fs.existsSync(path.join(cacheDir, meta.file || `${assetId}.glb`));
    return Boolean(hashMatches && artifactExists);
  } catch {
    return false;
  }
}

export function isCached(assetId, targetHash, outputDir = DEFAULT_CACHE_ROOT, cacheRoot = DEFAULT_CACHE_ROOT) {
  const hashDir = path.join(cacheRoot, targetHash);
  if (!fs.existsSync(hashDir)) {
    return isAssetCurrent(outputDir, assetId, targetHash);
  }
  const entries = fs.readdirSync(hashDir);
  const glbFile = entries.find((e) => e.endsWith(".glb") && (e.startsWith(assetId) || entries.length === 2));
  const jsonFile = entries.find((e) => e.endsWith(".json"));
  if (glbFile && jsonFile) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(hashDir, jsonFile), "utf8"));
      return meta.inputHash === targetHash || meta.sourceHash === targetHash;
    } catch {
      return false;
    }
  }
  return false;
}

export function assetCachePlan(asset, context, blenderInfo, cacheRoot = DEFAULT_CACHE_ROOT) {
  if (!context.palette) throw new Error("Asset cache planning requires the validated palette");
  const inputHash = computeAssetInputHash(
    asset,
    context.palette,
    blenderInfo.version,
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

export function writeAssetCache(plan, result, optimizedGlbPath, blenderVersion) {
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
        blenderVersion: String(blenderVersion),
        result: { ...result, cacheHit: false },
      },
      null,
      2
    )}\n`
  );
  fs.renameSync(metadataTemporary, plan.metadata);
}

export function recordCache(assetId, hash, metadata, artifactPath = null, cacheRoot = DEFAULT_CACHE_ROOT) {
  const hashDir = path.join(cacheRoot, hash);
  fs.mkdirSync(hashDir, { recursive: true });
  const fileName = metadata.file || `${assetId}.glb`;
  const targetGlb = path.join(hashDir, fileName);
  const targetJson = path.join(hashDir, `${fileName}.json`);

  if (artifactPath && fs.existsSync(artifactPath)) {
    fs.copyFileSync(artifactPath, targetGlb);
  }

  const metaRecord = {
    version: ART_CACHE_VERSION,
    inputHash: hash,
    sourceHash: hash,
    id: assetId,
    file: fileName,
    artifactPath: targetGlb,
    result: metadata.result || metadata,
    timestamp: Date.now(),
  };

  const tempJson = `${targetJson}.tmp-${process.pid}`;
  fs.writeFileSync(tempJson, JSON.stringify(metaRecord, null, 2), "utf8");
  fs.renameSync(tempJson, targetJson);

  return metaRecord;
}

export function cleanCache(cacheRoot = DEFAULT_CACHE_ROOT, maxAgeMs = 7 * 24 * 60 * 60 * 1000, maxEntries = 500) {
  if (!fs.existsSync(cacheRoot)) return { kept: 0, removed: 0 };
  const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
  const now = Date.now();
  let removedCount = 0;
  let keptCount = 0;

  const validDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const dirPath = path.join(cacheRoot, e.name);
      const stat = fs.statSync(dirPath);
      return { name: e.name, path: dirPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  validDirs.forEach((dir, idx) => {
    const isOld = now - dir.mtimeMs > maxAgeMs;
    const isOverCap = idx >= maxEntries;
    if (isOld || isOverCap) {
      try {
        fs.rmSync(dir.path, { recursive: true, force: true });
        removedCount++;
      } catch {}
    } else {
      keptCount++;
    }
  });

  return { kept: keptCount, removed: removedCount };
}

export function getCacheManifest(cacheRoot = DEFAULT_CACHE_ROOT) {
  const manifestPath = path.join(cacheRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) return { version: 1, entries: {} };
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { version: 1, entries: {} };
  }
}

export function saveCacheManifest(cacheRoot = DEFAULT_CACHE_ROOT, manifest = { version: 1, entries: {} }) {
  fs.mkdirSync(cacheRoot, { recursive: true });
  const manifestPath = path.join(cacheRoot, "manifest.json");
  const tempPath = `${manifestPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), "utf8");
  fs.renameSync(tempPath, manifestPath);
}

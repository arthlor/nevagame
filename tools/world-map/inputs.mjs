/** Cheap freshness ownership: transitive source imports plus explicit non-imported inputs. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RECEIPT_PATH = "tools/world-map/build-info.json";
export const OUTPUT_PATHS = ["public/assets/world-map/manifest.json", "public/assets/world-map/world-map-2048.webp"];
export const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const slash = value => value.split(path.sep).join("/");

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() && entry.name !== "__pycache__" ? filesUnder(filename) : entry.isFile() ? [filename] : [];
  });
}

/**
 * Discover again on every check: new/moved/deleted transitive imports cannot hide
 * behind the input list saved by the previous build. Lockfiles own external code;
 * the virtual catalog's current JSON and plugin own its non-imported data read.
 */
export function collectInputs(root = ROOT) {
  const pipeline = filesUnder(path.join(root, "tools/world-map"))
    .filter(filename => /\.(ts|mjs|py|json)$/.test(filename) && !filename.includes(".test.") && slash(path.relative(root, filename)) !== RECEIPT_PATH);
  const pending = [...pipeline, ...[
    "package.json", "package-lock.json", ".nvmrc", "tsconfig.json", "tools/world-map/requirements.txt",
    "assets/specs/asset-catalog.json", "tools/vite/runtimeAssetCatalogPlugin.ts"
  ].map(filename => path.join(root, filename))];
  const compiler = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile).config, ts.sys, root).options;
  const seen = new Set();
  while (pending.length) {
    const filename = path.resolve(pending.pop());
    if (seen.has(filename)) continue;
    if (!fs.existsSync(filename)) throw new Error(`Missing map input: ${slash(path.relative(root, filename))}`);
    seen.add(filename);
    if (!/\.(ts|tsx|mjs|js)$/.test(filename)) continue;
    const imports = ts.preProcessFile(fs.readFileSync(filename, "utf8"), true, true).importedFiles;
    for (const imported of imports) {
      const name = imported.fileName;
      if (name.startsWith("node:") || name.startsWith("virtual:")) continue;
      const resolved = ts.resolveModuleName(name, filename, compiler, ts.sys).resolvedModule;
      if (!resolved) {
        if (name.startsWith(".") || name.startsWith("@/")) throw new Error(`Cannot resolve map input ${name} from ${filename}`);
        continue;
      }
      if (!resolved.isExternalLibraryImport && !resolved.resolvedFileName.includes(`${path.sep}node_modules${path.sep}`)) {
        pending.push(resolved.resolvedFileName);
      }
    }
  }
  return [...seen].map(filename => ({ path: slash(path.relative(root, filename)), sha256: hash(fs.readFileSync(filename)) }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export const fingerprint = inputs => hash(JSON.stringify(inputs));

export function checkFreshness(root = ROOT) {
  const receiptFile = path.join(root, RECEIPT_PATH);
  if (!fs.existsSync(receiptFile)) throw new Error("World map has no build receipt. Run npm run map:build.");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const inputs = collectInputs(root);
  const problems = [];
  if (receipt.inputFingerprint !== fingerprint(inputs)) {
    const previous = new Map(receipt.inputs.map(input => [input.path, input.sha256]));
    const current = new Map(inputs.map(input => [input.path, input.sha256]));
    const changed = [...new Set([...previous.keys(), ...current.keys()])].filter(filename => previous.get(filename) !== current.get(filename));
    problems.push(`stale source inputs: ${changed.join(", ")}`);
  }
  for (const filename of OUTPUT_PATHS) {
    const output = path.join(root, filename);
    if (!fs.existsSync(output) || hash(fs.readFileSync(output)) !== receipt.outputs[filename]) {
      problems.push(`missing or modified output: ${filename}`);
    }
  }
  if (problems.length) throw new Error(`World map is stale (${problems.join("; ")}). Run npm run map:build, then review and include the regenerated outputs.`);
  return { inputFingerprint: receipt.inputFingerprint, inputCount: inputs.length };
}

// tools/art/sync_manifest.mjs
//
// Compatibility entry point for older local workflows. Manifest metrics are
// owned by tools/blender/cli.mjs; this shim deliberately refuses to fabricate
// triangle counts, material counts, hashes, or quality statuses from catalog
// metadata. Generate through the canonical Blender pipeline, then validate it.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = path.join(ROOT, "tools/blender/cli.mjs");

export function syncManifests() {
  const result = spawnSync(process.execPath, [CLI_PATH, "validate", "--all"], {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Published manifests are stale or invalid; run `node tools/blender/cli.mjs generate --all` first.");
  }
  console.log("Published manifests are current; no synthetic metrics were written.");
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    syncManifests();
  } catch (error) {
    console.error(`[NEVA ART] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

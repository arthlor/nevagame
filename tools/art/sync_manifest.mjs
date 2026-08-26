// tools/art/sync_manifest.mjs
//
// Compatibility entry point for older local workflows. Manifest metrics are
// owned by tools/blender/cli.mjs; this shim revalidates the published GLBs and
// derives metadata from those binaries instead of fabricating catalog metrics.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_PATH = path.join(ROOT, "tools/blender/cli.mjs");

export function syncManifests() {
  const result = spawnSync(process.execPath, [CLI_PATH, "sync", "--all"], {
    cwd: ROOT,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Published artifacts are stale or invalid; run `node tools/blender/cli.mjs generate --all` first.");
  }
  console.log("Published manifests were refreshed from the validated GLBs.");
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

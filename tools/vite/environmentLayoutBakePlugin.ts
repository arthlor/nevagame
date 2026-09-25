import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Plugin } from "vite";

export const ENVIRONMENT_LAYOUT_BAKES_ID = "virtual:neva-environment-layout-bakes";
const RESOLVED_ENVIRONMENT_LAYOUT_BAKES_ID = `\0${ENVIRONMENT_LAYOUT_BAKES_ID}`;
const NO_BAKES = "export default [];\n";

interface BakeSummary {
  worldSeed: number;
  layoutRevision: number;
  staticPlacements: number;
  groundCoverPlacements: number;
  bytes: number;
  seconds: number;
}

/** Runs the bake script in its own vite-node process, so it sees the same sources as the build. */
function runBake(rootDirectory: string, outFile: string): Promise<BakeSummary> {
  const viteNode = path.join(rootDirectory, "node_modules/vite-node/vite-node.mjs");
  const script = path.join(rootDirectory, "tools/world/bake-environment-layout.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteNode, script, "--", "--out", outFile], {
      cwd: rootDirectory,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Environment layout bake failed (exit ${code}):\n${stderr.trim() || stdout.trim()}`));
        return;
      }
      const summaryLine = stdout.trim().split("\n").reverse().find((line) => line.startsWith("{"));
      if (!summaryLine) {
        reject(new Error(`Environment layout bake printed no summary:\n${stdout.trim()}`));
        return;
      }
      resolve(JSON.parse(summaryLine) as BakeSummary);
    });
  });
}

/**
 * Production builds generate the new-game world's environment layout once and ship it as a
 * content-hashed asset, which startup adopts instead of generating ~30k placements on the main
 * thread (`src/world/loadEnvironmentLayoutBake.ts`). The bake is produced from the same sources in
 * the same build, so it cannot drift from them. Development servers and tests export no bakes:
 * the layout editor rewrites placement sources live.
 */
export function environmentLayoutBakePlugin(rootDirectory: string): Plugin {
  let command: "build" | "serve" = "serve";
  let isSsrBuild = false;
  let bakesModule = NO_BAKES;
  return {
    name: "neva-environment-layout-bake",
    configResolved(config) {
      command = config.command;
      isSsrBuild = Boolean(config.build.ssr);
    },
    async buildStart() {
      bakesModule = NO_BAKES;
      if (command !== "build" || isSsrBuild) return;
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "neva-environment-layout-"));
      try {
        const outFile = path.join(directory, "environment-layout.json");
        const summary = await runBake(rootDirectory, outFile);
        const referenceId = this.emitFile({
          type: "asset",
          name: `environment-layout-${summary.worldSeed}.json`,
          source: fs.readFileSync(outFile)
        });
        bakesModule = `export default [${JSON.stringify({
          worldSeed: summary.worldSeed,
          layoutRevision: summary.layoutRevision
        }).slice(0, -1)}, url: import.meta.ROLLUP_FILE_URL_${referenceId} }];\n`;
        this.info(
          `baked environment layout for seed ${summary.worldSeed} (layout ${summary.layoutRevision}): ` +
          `${summary.staticPlacements} static + ${summary.groundCoverPlacements} cover placements, ` +
          `${(summary.bytes / 1e6).toFixed(1)} MB in ${summary.seconds}s`
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
    resolveId(id) {
      return id === ENVIRONMENT_LAYOUT_BAKES_ID ? RESOLVED_ENVIRONMENT_LAYOUT_BAKES_ID : null;
    },
    load(id) {
      return id === RESOLVED_ENVIRONMENT_LAYOUT_BAKES_ID ? bakesModule : null;
    }
  };
}

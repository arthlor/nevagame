import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

// The rigged characters retarget ~18 clips against the UAL1 source, stepping the
// scene frame by frame, and land around 80s. The guard exists to catch a hung
// Blender, not to bound legitimate work, so it sits well clear of that.
export const DEFAULT_TIMEOUT_MS = 180000;
export const DEFAULT_RECYCLE_COUNT = 20;

export function resolveConcurrency(override = null) {
  if (override !== null && override !== undefined && !Number.isNaN(Number(override))) {
    return Math.max(1, Math.floor(Number(override)));
  }
  const cpus = os.cpus()?.length || 2;
  return Math.max(1, cpus - 1);
}

export class BlenderWorkerPool {
  constructor(options = {}) {
    this.concurrency = resolveConcurrency(options.concurrency);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.recycleJobLimit = options.recycleJobLimit ?? DEFAULT_RECYCLE_COUNT;
    this.activeProcesses = new Set();
    this.scratchDirs = new Set();
    this.aborted = false;

    this.onSigInt = () => this.terminateAll("SIGINT");
    this.onSigTerm = () => this.terminateAll("SIGTERM");
    process.once("SIGINT", this.onSigInt);
    process.once("SIGTERM", this.onSigTerm);
  }

  terminateAll(signal = "SIGKILL") {
    this.aborted = true;
    for (const proc of this.activeProcesses) {
      try {
        proc.kill(signal === "SIGINT" || signal === "SIGTERM" ? "SIGKILL" : signal);
      } catch {}
    }
    this.cleanupScratchDirs();
  }

  cleanupScratchDirs() {
    for (const dir of this.scratchDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {}
    }
    this.scratchDirs.clear();
  }

  dispose() {
    process.removeListener("SIGINT", this.onSigInt);
    process.removeListener("SIGTERM", this.onSigTerm);
    this.terminateAll();
  }

  async runTasks({
    blenderPath,
    bootstrapScript,
    catalogPath,
    assets,
    outputDir,
    strict = false,
    onProgress = null,
    repoRoot = process.cwd(),
  }) {
    if (!assets || assets.length === 0) {
      return { reports: [], results: [], errors: [], durationMs: 0 };
    }

    const startTime = Date.now();
    const queue = [...assets];
    const totalCount = assets.length;
    let completedCount = 0;
    const results = [];
    const errors = [];

    const workerCount = Math.min(this.concurrency, queue.length);

    const workerLoop = async (workerId) => {
      const workerScratch = path.join(outputDir, `.worker-${workerId}-${process.pid}`);
      this.scratchDirs.add(workerScratch);
      fs.mkdirSync(workerScratch, { recursive: true });

      let jobsProcessedByWorker = 0;

      while (queue.length > 0 && !this.aborted) {
        const asset = queue.shift();
        if (!asset) break;

        const reportPath = path.join(workerScratch, `${asset.id}.report.json`);
        const args = [
          "--background",
          "--python",
          bootstrapScript,
          "--",
          "--catalog",
          catalogPath,
          "--output",
          outputDir,
          "--report",
          reportPath,
          "--asset",
          asset.id,
        ];
        if (strict) args.push("--strict");

        const taskStart = Date.now();

        try {
          const report = await new Promise((resolve, reject) => {
            let proc = null;
            let timer = null;
            let stderr = "";
            let stdout = "";

            try {
              proc = spawn(blenderPath, args, {
                cwd: repoRoot,
                stdio: ["ignore", "pipe", "pipe"],
              });
            } catch (spawnErr) {
              return reject(spawnErr);
            }

            this.activeProcesses.add(proc);

            proc.stdout.on("data", (chunk) => {
              stdout += chunk.toString();
            });

            proc.stderr.on("data", (chunk) => {
              stderr += chunk.toString();
            });

            timer = setTimeout(() => {
              if (proc) {
                try {
                  proc.kill("SIGKILL");
                } catch {}
              }
              reject(
                new Error(
                  `Timeout (${this.timeoutMs}ms) executing Blender for asset "${asset.id}".`
                )
              );
            }, this.timeoutMs);

            proc.on("error", (err) => {
              clearTimeout(timer);
              this.activeProcesses.delete(proc);
              reject(err);
            });

            proc.on("close", (code) => {
              clearTimeout(timer);
              this.activeProcesses.delete(proc);

              if (code !== 0) {
                const tailLines = stderr
                  .trim()
                  .split(/\r?\n/)
                  .slice(-30)
                  .join("\n");
                reject(
                  new Error(
                    `Blender process for asset "${asset.id}" exited with code ${code}.\n` +
                      (tailLines ? `Stderr excerpt:\n${tailLines}` : `Stdout:\n${stdout.slice(-500)}`)
                  )
                );
                return;
              }

              if (!fs.existsSync(reportPath)) {
                reject(new Error(`Worker emitted no report file for asset "${asset.id}" at ${reportPath}`));
                return;
              }

              try {
                const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
                resolve(parsed);
              } catch (parseErr) {
                reject(new Error(`Failed to parse worker report for "${asset.id}": ${parseErr.message}`));
              }
            });
          });

          const taskDuration = Date.now() - taskStart;
          const assetEntry = report.assets?.find((a) => a.id === asset.id) || { id: asset.id };
          results.push({
            assetId: asset.id,
            durationMs: taskDuration,
            report,
            assetEntry,
          });

          completedCount++;
          if (onProgress) {
            onProgress({
              assetId: asset.id,
              completed: completedCount,
              total: totalCount,
              workerId,
              durationMs: taskDuration,
            });
          }

          jobsProcessedByWorker++;
          if (jobsProcessedByWorker >= this.recycleJobLimit) {
            jobsProcessedByWorker = 0;
          }
        } catch (taskErr) {
          errors.push({
            assetId: asset.id,
            error: taskErr,
            message: taskErr.message,
          });
          completedCount++;
          if (onProgress) {
            onProgress({
              assetId: asset.id,
              completed: completedCount,
              total: totalCount,
              workerId,
              error: taskErr,
            });
          }
        }
      }

      try {
        if (fs.existsSync(workerScratch)) {
          fs.rmSync(workerScratch, { recursive: true, force: true });
        }
        this.scratchDirs.delete(workerScratch);
      } catch {}
    };

    await Promise.all(Array.from({ length: workerCount }, (_, i) => workerLoop(i)));

    this.cleanupScratchDirs();

    const totalDuration = Date.now() - startTime;

    if (errors.length > 0) {
      const errorSummary = errors.map((e) => `[${e.assetId}]: ${e.message}`).join("\n");
      const err = new Error(
        `Blender dynamic worker pool failed for ${errors.length} / ${totalCount} asset(s):\n${errorSummary}`
      );
      err.errors = errors;
      err.results = results;
      throw err;
    }

    // Merge individual asset reports into aggregated blenderReport format
    const aggregatedAssets = results.flatMap((r) => r.report.assets || []);
    const aggregatedReport = {
      version: 1,
      generatedAt: new Date().toISOString(),
      assets: aggregatedAssets,
    };

    return {
      rawDir: outputDir,
      blenderReport: aggregatedReport,
      results,
      durationMs: totalDuration,
    };
  }
}

export async function runDynamicBlenderPool({
  blenderPath,
  bootstrapScript,
  catalogPath,
  missAssets,
  outputDir,
  strict = false,
  concurrency = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onProgress = null,
  repoRoot = process.cwd(),
}) {
  if (!missAssets || missAssets.length === 0) {
    return {
      rawDir: outputDir,
      blenderReport: { version: 1, generatedAt: new Date().toISOString(), assets: [] },
      results: [],
      durationMs: 0,
    };
  }

  const pool = new BlenderWorkerPool({ concurrency, timeoutMs });
  try {
    return await pool.runTasks({
      blenderPath,
      bootstrapScript,
      catalogPath,
      assets: missAssets,
      outputDir,
      strict,
      onProgress,
      repoRoot,
    });
  } finally {
    pool.dispose();
  }
}

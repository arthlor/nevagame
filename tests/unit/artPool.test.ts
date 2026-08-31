import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BlenderWorkerPool,
  resolveConcurrency,
  runDynamicBlenderPool,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RECYCLE_COUNT,
} from "../../tools/blender/pool.mjs";

describe("BlenderWorkerPool & Dynamic Concurrency", () => {
  it("resolves concurrency with automatic CPU detection and overrides", () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_RECYCLE_COUNT).toBeGreaterThan(0);

    const autoCpus = resolveConcurrency();
    expect(autoCpus).toBeGreaterThanOrEqual(1);

    expect(resolveConcurrency(4)).toBe(4);
    expect(resolveConcurrency("8")).toBe(8);
    expect(resolveConcurrency(0)).toBe(1);
    expect(resolveConcurrency(-5)).toBe(1);
  });

  it("handles empty asset list gracefully", async () => {
    const result = await runDynamicBlenderPool({
      blenderPath: "non_existent_blender",
      bootstrapScript: "dummy_script.py",
      catalogPath: "dummy_catalog.json",
      missAssets: [],
      outputDir: "/tmp/dummy_out",
    });

    expect(result.results).toEqual([]);
    expect(result.blenderReport.assets).toEqual([]);
    expect(result.durationMs).toBe(0);
  });

  it("cleans up scratch directories and manages process termination on dispose", () => {
    const pool = new BlenderWorkerPool({ concurrency: 2, timeoutMs: 1000 });
    const tempScratch = path.join(os.tmpdir(), `pool-test-${Date.now()}`);
    fs.mkdirSync(tempScratch, { recursive: true });
    pool.scratchDirs.add(tempScratch);

    expect(fs.existsSync(tempScratch)).toBe(true);
    pool.dispose();
    expect(fs.existsSync(tempScratch)).toBe(false);
  });

  it("captures task errors and aborts with descriptive error messages", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-err-test-"));
    const pool = new BlenderWorkerPool({ concurrency: 1, timeoutMs: 2000 });

    try {
      await expect(
        pool.runTasks({
          blenderPath: "node", // use node with a failing inline script to simulate failure
          bootstrapScript: "-e process.exit(1)",
          catalogPath: "dummy.json",
          assets: [{ id: "failing_asset_1" }],
          outputDir: tempDir,
        })
      ).rejects.toThrow(/Blender dynamic worker pool failed/);
    } finally {
      pool.dispose();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

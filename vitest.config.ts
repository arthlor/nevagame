import { defineConfig } from "vitest/config";
import path from "path";

import { runtimeAssetCatalogPlugin } from "./tools/vite/runtimeAssetCatalogPlugin";
import { environmentLayoutBakePlugin } from "./tools/vite/environmentLayoutBakePlugin";

export default defineConfig({
  plugins: [runtimeAssetCatalogPlugin(__dirname), environmentLayoutBakePlugin(__dirname)],
  test: {
    globals: true,
    environment: "node",
    // The v3 heightfield and Rapier edge-case suites are intentionally
    // substantial; cap worker contention and allow the collision setup to
    // finish without making a slow host look like a behavioral failure.
    maxWorkers: 1,
    testTimeout: 30_000,
    // The same reasoning applies to setup: several suites build a whole
    // Simulation or world layout in `beforeEach`, and the 10s default left
    // those reporting "Hook timed out" on a loaded host while every assertion
    // passed when the file was run on its own.
    hookTimeout: 30_000,
    include: ["tests/unit/**/*.test.ts", "tests/simulation/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/._*"]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});

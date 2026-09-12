import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.NEVA_E2E_PORT ?? 3000);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const useExternalServer = process.env.NEVA_E2E_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  // These suites own separate servers and configs: the production render budget
  // (`playwright.budget.config.ts`), deterministic visual gold
  // (`playwright.visual.config.ts`) and the DEV art benchmark
  // (`playwright.art.config.ts`). None can pass under this dev-server run.
  testIgnore: ["render-budget.spec.ts", "visual-regression.spec.ts", "art-pipeline.spec.ts"],
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    // A locator action with no timeout inherits the whole test budget, so the
    // long acceptance routes would let one stale selector consume an hour before
    // reporting. Actions are bounded independently of how long a route may run;
    // waits that legitimately need longer pass their own explicit timeout.
    actionTimeout: 15_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: useExternalServer ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${e2ePort}`,
    port: e2ePort,
    reuseExistingServer: process.env.NEVA_E2E_REUSE_SERVER === "1" && !process.env.CI
  },
  projects: [
    {
      name: "chromium",
      // The current P12 acceptance gate is intentionally Chrome-only and uses
      // the installed desktop Chrome channel.
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ]
});

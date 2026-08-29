import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number(process.env.NEVA_E2E_PORT ?? 3000);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: {
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

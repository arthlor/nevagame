import { defineConfig, devices } from "@playwright/test";

/**
 * Render-budget gate, run against a PRODUCTION build.
 *
 * Static prefab batching is production-only (`WorldScene.mergeStaticPrefabMeshes`
 * is skipped under `import.meta.env.DEV`), so a draw-call budget measured on the
 * dev server measures the wrong configuration. This config builds and previews
 * the real bundle instead.
 *
 * Deliberately a separate config rather than a project inside
 * `playwright.config.ts`: the two need different web servers, and building is
 * slow enough that it should not be paid by every e2e run.
 */
const port = Number(process.env.NEVA_BUDGET_PORT ?? 3388);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "render-budget.spec.ts",
  timeout: 480_000,
  expect: { timeout: 450_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  webServer: {
    // `worldAcceptance=1` is localhost-only, so the preview host must stay
    // 127.0.0.1 for the debug overlay and auto-start to be reachable.
    // `npx vite build`, not `npm run build`: the latter fires a `prebuild`
    // assets:sync in WRITE mode, which would regenerate committed artifacts
    // mid-run. CI verifies those separately via the :check scripts.
    command: `npx tsc && npx vite build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    timeout: 600_000,
    reuseExistingServer: process.env.NEVA_BUDGET_REUSE_SERVER === "1" && !process.env.CI
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" }
    }
  ]
});

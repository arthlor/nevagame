import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.NEVA_VISUAL_PORT ?? 3314);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "visual-regression.spec.ts",
  timeout: 180_000,
  expect: { timeout: 90_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "Europe/Istanbul",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader"]
    }
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: process.env.NEVA_VISUAL_REUSE_SERVER === "1" && !process.env.CI
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1
      }
    }
  ]
});

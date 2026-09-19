// tests/e2e/render-budget.spec.ts
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Draw-call and triangle budget, measured against a PRODUCTION build.
 *
 * This assertion used to live in `gameplay.spec.ts`, which runs against the
 * dev server. That stopped being a meaningful gate once static prefab batching
 * became production-only (`WorldScene.mergeStaticPrefabMeshes` is skipped under
 * `import.meta.env.DEV`, because merging is destructive — it removes the LOD
 * controllers — and would break the dev placement editor). In dev the scene
 * therefore renders thousands of unbatched meshes and reports draw calls
 * roughly 8x the shipping budget: a real number, but not the one this budget
 * describes.
 *
 * `worldAcceptance=1` is the existing localhost-only escape hatch that enables
 * the debug overlay and auto-start outside DEV, so the production bundle can be
 * measured without shipping debug affordances to players.
 */

const highSceneBudget = (
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "tools/blender/asset_budgets.json"), "utf8")
  ) as {
    sceneProfiles: {
      high: {
        visibleTriangles: { targetMax: number };
        drawCalls: { preferredMax: number };
      };
    };
  }
).sceneProfiles.high;

test("production build stays within the representative render budget", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The representative render budget is measured once in Chromium");
  test.setTimeout(480_000);

  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    // Analytics beacons are aborted on scroll/unload by design. They say
    // nothing about the game's render or runtime health.
    if (new URL(request.url()).hostname.endsWith("google-analytics.com")) return;
    runtimeErrors.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) runtimeErrors.push(`${response.status()}: ${response.url()}`);
  });

  await page.addInitScript(() => window.localStorage.setItem("neva.graphics-quality.v1", "high"));
  await page.goto("/?debug=1&worldAcceptance=1");

  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const stats = page.getByTestId("render-stats");
  await expect(stats).toBeVisible();
  await expect.poll(async () => stats.textContent()).toMatch(/Draws: [1-9]\d* \| Triangles: [1-9][\d,]*/);

  // Sample repeatedly and keep the worst frame.
  //
  // A single sample is under-reporting: although the light rig keeps
  // `shadowMap.autoUpdate = false`, it sets `shadowMap.needsUpdate = true` on
  // every presentation update, so most visible frames do include the shadow
  // pass. Earlier runs still measured 1.55M / 2.77M / 1.55M, so take the max
  // rather than whichever frame the poll happened to land on.
  let drawCalls = 0;
  let triangles = 0;
  let text = "";
  for (let sample = 0; sample < 12; sample += 1) {
    const sampled = (await stats.textContent()) ?? "";
    const parsed = sampled.match(/Draws: (\d+) \| Triangles: ([\d,]+)/);
    if (parsed) {
      const sampledDraws = Number(parsed[1]);
      const sampledTriangles = Number(parsed[2].replaceAll(",", ""));
      if (sampledTriangles > triangles) {
        triangles = sampledTriangles;
        text = sampled;
      }
      drawCalls = Math.max(drawCalls, sampledDraws);
    }
    // Advance the clock between samples so the sun moves; pacing the window
    // this way keeps sampling deterministic regardless of frame cadence.
    await page.evaluate(() => {
      const debug = (window as unknown as { __NEVA_DEBUG?: { advanceGameMinutes?: (m: number) => void } }).__NEVA_DEBUG;
      debug?.advanceGameMinutes?.(15);
    });
    await page.waitForTimeout(250);
  }
  expect(triangles, "never sampled a render-stats frame").toBeGreaterThan(0);
  const objectStats = text.match(/Meshes: (\d+) \| Shadows: (\d+) \| Batches: (\d+) \| Instances: (\d+)/);

  // When this gate fails, the first question is always "which layer?" — so
  // answer it in the failure output rather than making someone go and measure.
  const snapshot = await page.evaluate(() => {
    const debug = (window as unknown as { __NEVA_DEBUG?: { renderDiagnostics: () => unknown } }).__NEVA_DEBUG;
    const diagnostics = debug ? (debug.renderDiagnostics() as {
      world?: { trianglesByGroup?: unknown; qualityTier?: string; pipeline?: unknown; presentationWork?: unknown; assetCache?: unknown };
      presentation?: {
        frameTiming?: {
          samples: number;
          p50Ms: number;
          p95Ms: number;
          maxMs: number;
          stallsOver50Ms: number;
        };
      };
    }) : undefined;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      qualityTier: diagnostics?.world?.qualityTier,
      pipeline: diagnostics?.world?.pipeline,
      trianglesByGroup: diagnostics?.world?.trianglesByGroup,
      presentationWork: diagnostics?.world?.presentationWork,
      assetCache: diagnostics?.world?.assetCache,
      frameTiming: diagnostics?.presentation?.frameTiming
    };
  });
  console.info(`[E2E] Render scenario: ${JSON.stringify(snapshot)}`);
  console.info(`[E2E] Runtime errors: ${JSON.stringify(runtimeErrors)}`);

  console.info(
    `[E2E] Production render budget: ${drawCalls} draw calls, ${triangles} triangles` +
    (objectStats
      ? `, ${objectStats[1]} meshes, ${objectStats[2]} shadow casters, ${objectStats[3]} batches, ${objectStats[4]} instanced meshes`
      : "")
  );
  console.info(`[E2E] Raw frame timing: ${JSON.stringify(snapshot.frameTiming)}`);

  // Companion to the draw/triangle budget: those can stay flat while CPU-side
  // rebuild work regresses. These bounds are deliberately wide — they catch
  // order-of-magnitude regressions without turning hardware variance into a
  // false failure, and the percentiles above are the actionable record.
  const frameTiming = snapshot.frameTiming;
  expect(frameTiming?.samples ?? 0, "raw frame-time ring never filled").toBeGreaterThan(30);
  expect(frameTiming!.p50Ms).toBeGreaterThan(0);
  expect(frameTiming!.p95Ms).toBeLessThan(250);
  expect(frameTiming!.maxMs).toBeLessThan(2000);
  expect(frameTiming!.stallsOver50Ms).toBeLessThanOrEqual(120);

  // Batching is the whole reason this gate is meaningful here. If a production
  // build reports zero batches, the budget below would be measuring the dev
  // configuration again and the failure should say so.
  if (objectStats) {
    expect(
      Number(objectStats[3]),
      "production build reported zero static batches — is mergeStaticPrefabMeshes running?"
    ).toBeGreaterThan(0);
  }

  expect(runtimeErrors).toEqual([]);
  expect(snapshot.viewport).toEqual({ width: 1920, height: 1080, dpr: 1 });
  expect(snapshot.qualityTier).toBe("high");
  expect(drawCalls).toBeLessThanOrEqual(highSceneBudget.drawCalls.preferredMax);
  expect(triangles).toBeLessThanOrEqual(highSceneBudget.visibleTriangles.targetMax);
});

/**
 * Repeatable gameplay-performance routes.
 *
 * The frozen-camera test above answers "does the settled frame fit its draw
 * budget"; it cannot see a populated farm, a loaded harbor, boat travel,
 * fishing presentation, storm weather or dawn/dusk. Each scenario below boots
 * the same production bundle into a deterministic state through the existing
 * `debugStart`/`goldTest` entry points, optionally orbits the camera, and
 * records raw frame percentiles, main-thread phase attribution and per-pass GPU
 * timings. Bounds are wide on purpose: the value is the recorded evidence.
 */
const performanceScenarios = [
  { id: "populated-farm", query: "debugStart=farm-art", settleMs: 5_000, rotate: true },
  { id: "harbor-skiff", query: "debugStart=harbor-skiff", settleMs: 5_000, rotate: true },
  { id: "boat-driving", query: "debugStart=boat-driving", settleMs: 5_000, rotate: false },
  { id: "sport-fishing", query: "debugStart=sport-fishing", settleMs: 6_000, rotate: true },
  { id: "storm-river-source", query: "goldTest=river_source&artWeather=storm", settleMs: 5_000, rotate: false },
  { id: "dawn-farm", query: "goldTest=starter_farm&artMinute=420", settleMs: 5_000, rotate: false }
] as const;

test.describe("gameplay performance routes", () => {
  for (const scenario of performanceScenarios) {
    test(`${scenario.id} records frame, phase and GPU evidence`, async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "Production performance routes are measured once in Chromium");
      test.setTimeout(300_000);

      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        if (new URL(request.url()).hostname.endsWith("google-analytics.com")) return;
        runtimeErrors.push(`${request.url()}: ${request.failure()?.errorText}`);
      });

      await page.addInitScript(() => window.localStorage.setItem("neva.graphics-quality.v1", "high"));
      await page.goto(`/?debug=1&worldAcceptance=1&${scenario.query}`);
      const diagnostics = page.getByTestId("diagnostics");
      await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 300_000 });
      await page.waitForTimeout(scenario.settleMs);

      if (scenario.rotate) {
        const bounds = await page.locator("#game-canvas").boundingBox();
        if (bounds) {
          const centreX = bounds.x + bounds.width / 2;
          const centreY = bounds.y + bounds.height / 2;
          await page.mouse.move(centreX, centreY);
          await page.mouse.down({ button: "right" });
          for (let step = 1; step <= 10; step += 1) {
            await page.mouse.move(centreX - step * 14, centreY + step * 2, { steps: 1 });
          }
          await page.mouse.up({ button: "right" });
          await page.waitForTimeout(1_200);
        }
      }

      const metrics = await page.evaluate(() => {
        const debug = window.__NEVA_DEBUG;
        const rendered = debug?.renderDiagnostics();
        if (!rendered) return null;
        return {
          renderMode: rendered.renderMode,
          qualityTier: rendered.world.qualityTier,
          draws: rendered.world.render.calls,
          triangles: rendered.world.render.triangles,
          frame: rendered.presentation.frameTiming ?? null,
          phase: rendered.presentation.phaseTiming ?? null,
          gpu: rendered.world.pipeline.gpuTiming,
          atlas: rendered.world.shadowAtlas,
          work: rendered.world.presentationWork
        };
      });

      console.info(`[E2E] Scenario ${scenario.id}: ${JSON.stringify(metrics)}`);
      const runDirectory = process.env.NEVA_BUDGET_RUN_DIR;
      if (runDirectory) {
        fs.mkdirSync(runDirectory, { recursive: true });
        fs.writeFileSync(
          path.join(runDirectory, `scenario-${scenario.id}.json`),
          JSON.stringify({ scenario: scenario.id, query: scenario.query, metrics }, null, 1)
        );
      }
      expect(runtimeErrors).toEqual([]);
      expect(metrics, `${scenario.id} never produced render diagnostics`).not.toBeNull();
      expect(metrics!.draws).toBeGreaterThan(0);
      expect(metrics!.triangles).toBeGreaterThan(0);
      expect(metrics!.qualityTier).toBe("high");
      // Same wide stall bound as the frozen-camera gate; percentiles are the record.
      expect(metrics!.frame?.samples ?? 0, `${scenario.id} frame ring never filled`).toBeGreaterThan(20);
      expect(metrics!.frame!.p95Ms).toBeLessThan(250);
      // `maxMs` is deliberately not gated here: boot-time shader compilation
      // for a first-seen weather state (storm) still sits inside the ring and
      // is a recorded finding, not a scenario regression.
      expect(metrics!.phase?.length ?? 0, `${scenario.id} phase attribution missing`).toBeGreaterThan(0);
    });
  }
});

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

  await page.goto("/?debug=1&worldAcceptance=1");

  const diagnostics = page.getByTestId("diagnostics");
  await expect(diagnostics).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
  const stats = page.getByTestId("render-stats");
  await expect(stats).toBeVisible();
  await expect.poll(async () => stats.textContent()).toMatch(/Draws: [1-9]\d* \| Triangles: [1-9][\d,]*/);

  // Sample repeatedly and keep the worst frame.
  //
  // A single sample is bimodal: shadowMap.autoUpdate is false, so most frames
  // skip the shadow pass entirely and a frame that happens to include it
  // reports ~1.8x the triangles and ~1.25x the draw calls. Three identical runs
  // measured 1.55M / 2.77M / 1.55M. A budget is a worst-frame guarantee, so
  // take the max rather than whichever frame the poll happened to land on.
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
    // Advance the clock between samples so the sun moves and the shadow map is
    // forced to refresh. Waiting for a natural refresh is unreliable — a 3 s
    // window caught it twice in three runs, which is how this gate ended up
    // reporting 2.80M / 2.80M / 1.40M for an identical build.
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
  const breakdown = await page.evaluate(() => {
    const debug = (window as unknown as { __NEVA_DEBUG?: { renderDiagnostics: () => unknown } }).__NEVA_DEBUG;
    return debug ? (debug.renderDiagnostics() as { world?: { trianglesByGroup?: unknown } }).world?.trianglesByGroup : undefined;
  });
  if (breakdown) console.info(`[E2E] Triangles by scene group: ${JSON.stringify(breakdown)}`);

  console.info(
    `[E2E] Production render budget: ${drawCalls} draw calls, ${triangles} triangles` +
    (objectStats
      ? `, ${objectStats[1]} meshes, ${objectStats[2]} shadow casters, ${objectStats[3]} batches, ${objectStats[4]} instanced meshes`
      : "")
  );

  // Batching is the whole reason this gate is meaningful here. If a production
  // build reports zero batches, the budget below would be measuring the dev
  // configuration again and the failure should say so.
  if (objectStats) {
    expect(
      Number(objectStats[3]),
      "production build reported zero static batches — is mergeStaticPrefabMeshes running?"
    ).toBeGreaterThan(0);
  }

  expect(drawCalls).toBeLessThanOrEqual(highSceneBudget.drawCalls.preferredMax);
  expect(triangles).toBeLessThanOrEqual(highSceneBudget.visibleTriangles.targetMax);
});

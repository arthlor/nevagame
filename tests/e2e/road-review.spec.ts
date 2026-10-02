import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { followWaypoints, orbitCamera, readSimulationSeed, resampleRoute } from "./support/performanceBaseline";

/** Opt-in inspection of the production build served through the existing e2e external-server option. */
test.use({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  video: { mode: "on", size: { width: 1920, height: 1080 } }
});

if (process.env.NEVA_ROAD_REVIEW === "1" && process.env.NEVA_E2E_EXTERNAL_SERVER !== "1") {
  throw new Error("Road review requires an existing production preview with NEVA_E2E_EXTERNAL_SERVER=1");
}

// Weather fades over seven seconds, then the shared ground wetness follows it.
// Settle each weather once so successive clear captures cannot inherit rain.
const WEATHER_SETTLE_MS = 30_000;
const CAMERA_SETTLE_MS = 3_000;

for (const quality of ["low", "medium", "high"] as const) {
  test(`${quality} roads retain continuous ground in clear and wet weather`, async ({ page }, testInfo) => {
    test.skip(process.env.NEVA_ROAD_REVIEW !== "1", "Focused road inspection is opt-in");
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.addInitScript(quality => window.localStorage.setItem("neva.graphics-quality.v1", quality), quality);
    await page.goto("/?debug=1&worldAcceptance=1&debugStart=farm-art&seed=42");
    await expect(page.getByTestId("diagnostics")).toHaveAttribute("data-boot-ready", "true", { timeout: 450_000 });
    const simulationSeed = await readSimulationSeed(page);
    const routes = await page.evaluate(() => {
      const debug = window.__NEVA_DEBUG!;
      return {
        farm: debug.acceptanceRoute("farm-entry"),
        commons: debug.acceptanceRoute("village-homestead"),
        mainland: debug.acceptanceRoute("mainland-farm-pinewatch"),
        grade: debug.acceptanceRoute("mainland-pinewatch-highridge"),
        headland: debug.acceptanceRoute("headland-coastal-walk"),
        sunreach: debug.acceptanceRoute("route.sunreach.scrub-ridge"),
        harbor: debug.acceptanceRoute("village-harbor"),
        bridge: debug.acceptanceBridgePosition()
      };
    });
    const along = (route: readonly { x: number; z: number }[], index: number) => {
      const point = route[index], toward = route[Math.min(route.length - 1, index + 1)];
      // Camera yaw describes its boom: the view points opposite this bearing.
      return { point, yaw: Math.atan2(toward.x - point.x, toward.z - point.z) + Math.PI };
    };
    const scenes = [
      { id: "farm-lane", ...along(routes.farm, 1) },
      { id: "village-compound", ...along(routes.commons,
        routes.commons.findIndex(point => point.distance >= routes.commons.at(-1)!.distance - 8)) },
      { id: "mainland-fork", ...along(routes.mainland, routes.mainland.length - 4) },
      { id: "mainland-grade", ...along(routes.grade, Math.floor(routes.grade.length * 0.45)) },
      { id: "headland-footpath", ...along(routes.headland, Math.floor(routes.headland.length * 0.35)) },
      { id: "sunreach-join", ...along(routes.sunreach, 0) },
      { id: "bridge-entry", point: { x: routes.bridge.x - 11, z: routes.bridge.z }, yaw: -Math.PI / 2 },
      { id: "harbor-transition", ...along(routes.harbor, routes.harbor.length - 5) }
    ];
    const manifest: unknown[] = [];
    for (const weather of ["clear", "storm"] as const) {
      await page.evaluate(weather => window.__NEVA_DEBUG!.setReviewEnvironment({ minute: 600, weather, presentationTimeSeconds: null }), weather);
      await page.waitForTimeout(WEATHER_SETTLE_MS);
      for (const scene of scenes) {
        await page.evaluate(({ point, yaw, weather }) => {
          const debug = window.__NEVA_DEBUG!;
          debug.teleport(point.x, point.z, yaw);
          debug.setReviewEnvironment({ minute: 600, weather, presentationTimeSeconds: null });
        }, { ...scene, weather });
        await page.waitForTimeout(CAMERA_SETTLE_MS);
        const evidence = await page.evaluate(() => ({ pose: window.__NEVA_DEBUG!.pose(), render: window.__NEVA_DEBUG!.renderDiagnostics() }));
        expect(evidence.render.world.qualityTier).toBe(quality);
        expect(evidence.pose.weather).toBe(weather);
        expect(Math.hypot(evidence.pose.x - scene.point.x, evidence.pose.z - scene.point.z)).toBeLessThan(0.2);
        const filename = `${quality}-${scene.id}-${weather}.png`;
        await page.locator("#game-canvas").screenshot({ path: testInfo.outputPath(filename) });
        manifest.push({ scene: scene.id, weather, filename, target: scene, ...evidence });
      }
    }
    // Actual input and camera movement supplement fixed screenshots and the recorded video.
    const course = resampleRoute(routes.mainland.slice(-8), 3);
    await page.evaluate(([from, toward]) => {
      const debug = window.__NEVA_DEBUG!;
      debug.teleport(from.x, from.z, Math.atan2(toward.x - from.x, toward.z - from.z) + Math.PI);
      debug.setReviewEnvironment({ minute: 600, weather: "clear", presentationTimeSeconds: null });
    }, course);
    await page.waitForTimeout(WEATHER_SETTLE_MS);
    await orbitCamera(page, 12, 18);
    const drive = await followWaypoints(page, course.slice(1), { mode: "foot", durationMs: 8_000, arrivalRadius: 1 });
    expect(drive.distanceMeters).toBeGreaterThan(4);
    expect(drive.skippedWaypoints).toBe(0);
    manifest.push({ movement: drive });
    if (quality === "high") {
      await page.locator("#game-canvas").screenshot({ path: testInfo.outputPath("high-mainland-final.png") });
      await page.evaluate(() => window.__NEVA_DEBUG!.setCaptureRenderMode("no-post"));
      await page.waitForTimeout(1_000);
      await page.locator("#game-canvas").screenshot({ path: testInfo.outputPath("high-mainland-no-post.png") });
      await page.evaluate(() => window.__NEVA_DEBUG!.setCaptureRenderMode("final"));
    }
    const destination = testInfo.outputPath("road-review-manifest.json");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify({
      quality, viewport: { width: 1920, height: 1080, dpr: 1 },
      requestedSeed: 42, simulationSeed, simulationSeedSource: "DebugOverlay canonical state label",
      manifest, errors
    }, null, 2));
    expect(errors).toEqual([]);
  });
}

import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { lightningEnvelope } from "../../src/render/lighting/LightingRig";

const strikeTime = (() => {
  for (let time = 0; time < 11; time += 0.01) {
    if (lightningEnvelope(42891, time) > 0.92) return time;
  }
  throw new Error("Could not locate deterministic storm-lightning capture frame");
})();

const allCaptures = [
  { name: "clear-dawn-0530", view: "farm", minute: 330, weather: "clear", time: 0 },
  { name: "clear-morning-0800", view: "farm", minute: 480, weather: "clear", time: 0, candidate: "farm" },
  { name: "clear-noon-1200", view: "bridge", minute: 720, weather: "clear", time: 0, candidate: "bridge" },
  { name: "clear-harbor-1200", view: "harbor", minute: 720, weather: "clear", time: 0, candidate: "harbor" },
  { name: "clear-coast-1200", view: "coast", minute: 720, weather: "clear", time: 0, candidate: "coast" },
  { name: "clear-sunset-1830", view: "coast", minute: 1110, weather: "clear", time: 0 },
  { name: "clear-night-2100", view: "farm", minute: 1260, weather: "clear", time: 0 },
  { name: "light-rain-day", view: "coast", minute: 720, weather: "light-rain", time: 0 },
  { name: "storm-between-strikes", view: "harbor", minute: 900, weather: "storm", time: 0 },
  { name: "storm-lightning-frame", view: "harbor", minute: 900, weather: "storm", time: strikeTime },
  { name: "on-foot-farmhouse", view: "farm", minute: 480, weather: "clear", time: 0 },
  { name: "on-foot-bridge", view: "bridge", minute: 480, weather: "clear", time: 0 },
  { name: "boat-harbor-night", view: "harbor", minute: 1260, weather: "clear", time: 0 },
  { name: "sport-fishing-framing", view: "sport-fishing", minute: 1080, weather: "cloudy", time: 0 }
] as const;
const isExtendedCapture = process.env.NEVA_ART_EXTENDED === "1";
const captures = isExtendedCapture
  ? allCaptures
  : allCaptures.filter((capture) => "candidate" in capture);
const highSceneBudget = (
  JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), "tools/blender/asset_budgets.json"), "utf8")
  ) as {
    sceneProfiles: {
      high: {
        visibleTriangles: { targetMin: number; targetMax: number; hardMax: number };
        drawCalls: { preferredMax: number; hardMax: number };
      };
    };
  }
).sceneProfiles.high;

interface ArtSceneMeasurement {
  name: (typeof captures)[number]["name"];
  view: (typeof captures)[number]["view"];
  drawCalls: number;
  triangles: number;
  meshes: number;
  shadowCasters: number;
  batches: number;
  instances: number;
  fps: number;
  reachesHighQualityTriangleTarget: boolean;
  candidate?: "bridge" | "farm" | "harbor" | "coast";
}

test("captures deterministic 1440x900 gameplay-camera lighting and mode candidates", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The deterministic candidate set is captured once in Chromium");
  // Each deterministic navigation preloads the complete catalog so the
  // capture cannot hide missing runtime assets. The expanded authored catalog
  // needs a wider orchestration timeout even though steady-state frame budgets
  // are measured only after loading settles.
  // SwiftShader can spend close to a minute rebuilding the full published
  // catalog for each of the fourteen extended views. Keep the standard four
  // candidates tight while allowing the deliberate weather sweep to finish.
  test.setTimeout(isExtendedCapture ? 1_200_000 : 480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const output = path.resolve(process.cwd(), "output/playwright/neva-foundation");
  const candidateOutput = path.resolve(process.cwd(), "tests/visual/candidates");
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(candidateOutput, { recursive: true });
  const browserErrors: string[] = [];
  const measurements: ArtSceneMeasurement[] = [];
  let gpu = { vendor: "unknown", renderer: "unknown" };
  page.on("pageerror", (error) => {
    const message = `pageerror: ${error.message}`;
    browserErrors.push(message);
    console.error(message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = `console: ${message.text()}`;
      browserErrors.push(text);
      console.error(text);
    }
  });

  for (const capture of captures) {
    const candidate = "candidate" in capture ? capture.candidate : undefined;
    const query = new URLSearchParams({
      debug: "1",
      artView: capture.view,
      artMinute: String(capture.minute),
      artWeather: capture.weather,
      artTimeSeconds: String(capture.time)
    });
    await page.goto(`/?${query}`);
    const canvas = page.locator("#game-canvas");
    await expect(canvas).toBeVisible();
    if (gpu.renderer === "unknown") {
      gpu = await canvas.evaluate((element) => {
        const context = (element as HTMLCanvasElement).getContext("webgl2")
          ?? (element as HTMLCanvasElement).getContext("webgl");
        const extension = context?.getExtension("WEBGL_debug_renderer_info");
        return {
          vendor: context && extension
            ? String(context.getParameter(extension.UNMASKED_VENDOR_WEBGL))
            : "unavailable",
          renderer: context && extension
            ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL))
            : "unavailable"
        };
      });
    }
    const diagnostics = page.getByTestId("diagnostics");
    await expect(diagnostics).toContainText("Draws:", {
      timeout: 90_000
    });
    // Let async GLB decode/shader compilation leave the rolling 0.5 s FPS
    // window before recording steady-state diagnostics for this camera.
    await page.waitForTimeout(1_800);
    const diagnosticsText = (await diagnostics.textContent()) ?? "";
    const statsText = diagnosticsText;
    const renderMatch = statsText.match(/Draws: (\d+) \| Triangles: ([\d,]+)/);
    const objectMatch = statsText.match(
      /Meshes: (\d+) \| Shadows: (\d+) \| Batches: (\d+) \| Instances: (\d+)/
    );
    const fpsMatch = diagnosticsText.match(/FPS: (\d+)/);
    expect(renderMatch, `${capture.name} render statistics`).not.toBeNull();
    expect(objectMatch, `${capture.name} object statistics`).not.toBeNull();
    expect(fpsMatch, `${capture.name} FPS measurement`).not.toBeNull();
    const drawCalls = Number(renderMatch?.[1]);
    const triangles = Number(renderMatch?.[2].replaceAll(",", ""));
    const fps = Number(fpsMatch?.[1]);
    measurements.push({
      name: capture.name,
      view: capture.view,
      drawCalls,
      triangles,
      meshes: Number(objectMatch?.[1]),
      shadowCasters: Number(objectMatch?.[2]),
      batches: Number(objectMatch?.[3]),
      instances: Number(objectMatch?.[4]),
      fps,
      reachesHighQualityTriangleTarget: triangles >= highSceneBudget.visibleTriangles.targetMin,
      candidate
    });
    const screenshotPath = path.join(output, `${capture.name}.png`);
    await page.screenshot({ path: screenshotPath });
    if (candidate) {
      fs.copyFileSync(screenshotPath, path.join(candidateOutput, `${candidate}-candidate.png`));
    }
  }

  const benchmarkNote =
    "FPS is an observed Playwright browser sample; use the recorded renderer identity to distinguish hardware evidence from software-renderer diagnostics.";
  fs.writeFileSync(
    path.join(output, isExtendedCapture ? "art-benchmark-extended.json" : "art-benchmark.json"),
    `${JSON.stringify({ version: 1, viewport: [1440, 900], gpu, budget: highSceneBudget, benchmarkNote, scenes: measurements }, null, 2)}\n`
  );

  const candidateScenes = measurements
    .filter((measurement) => measurement.candidate)
    .map(({ candidate, ...measurement }) => ({ scene: candidate, ...measurement }));
  expect(candidateScenes).toHaveLength(4);
  fs.writeFileSync(
    path.join(candidateOutput, "art-benchmark.json"),
    `${JSON.stringify({ version: 1, viewport: [1440, 900], gpu, budget: highSceneBudget, benchmarkNote, scenes: candidateScenes }, null, 2)}\n`
  );

  for (const capture of captures) {
    expect(fs.existsSync(path.join(output, `${capture.name}.png`))).toBe(true);
  }
  const drawCallViolations = measurements
    .filter((measurement) => measurement.drawCalls > highSceneBudget.drawCalls.preferredMax)
    .map((measurement) => `${measurement.name}: ${measurement.drawCalls}`);
  const triangleViolations = measurements
    .filter((measurement) => measurement.triangles > highSceneBudget.visibleTriangles.targetMax)
    .map((measurement) => `${measurement.name}: ${measurement.triangles}`);
  expect(drawCallViolations, "preferred draw-call budget violations").toEqual([]);
  expect(triangleViolations, "target triangle budget violations").toEqual([]);
  expect(browserErrors).toEqual([]);
});

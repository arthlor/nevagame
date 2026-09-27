import { test, expect, type Page } from "@playwright/test";

// Automated entry skips the optional entry cinematic (see gameplay.spec.ts).
test.use({ contextOptions: { reducedMotion: "reduce" }, viewport: { width: 1440, height: 900 } });

test.setTimeout(240_000);

interface PipelineProbe {
  path: string;
  failedStages: string[];
  active: { gtao: boolean; hdrBloom: boolean; fxaa: boolean; colorFinish: boolean };
  targets: string[];
  pixelRatio: number;
  exposure: number;
  canvas: [number, number];
}

async function probe(page: Page): Promise<PipelineProbe> {
  return page.evaluate(() => {
    const diagnostics = window.__NEVA_DEBUG!.renderDiagnostics();
    const pipeline = diagnostics.world.pipeline;
    const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
    return {
      path: pipeline.path,
      failedStages: [...pipeline.failedStages],
      active: pipeline.activeEffects,
      targets: pipeline.renderTargets.map((target) => target.id).filter((id) => !id.startsWith("shadow.")),
      pixelRatio: pipeline.renderSize.pixelRatio,
      exposure: diagnostics.world.exposure,
      canvas: [canvas.width, canvas.height] as [number, number]
    };
  });
}

function storedEffects(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem("neva.graphics-effects.v1") ?? "null"));
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // A failed shader compile or link reaches the console through three.js.
    if (message.type() === "error" && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("pause graphics settings drive the High render path through real callbacks without shader errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("neva.graphics-quality.v1", "high");
    window.localStorage.setItem("neva.locale", "en");
    window.localStorage.removeItem("neva.graphics-effects.v1");
  });
  await page.goto("/?debug=1&debugStart=farm");
  await page.waitForFunction(() => {
    try { return window.__NEVA_DEBUG?.renderDiagnostics().sceneIdentity.bootReady === true; } catch { return false; }
  }, null, { timeout: 180_000, polling: 1000 });

  const entry = await probe(page);
  expect(entry.path).toBe("enhanced");
  expect(entry.failedStages).toEqual([]);
  expect(entry.active).toMatchObject({ gtao: true, fxaa: true, hdrBloom: false, colorFinish: false });
  expect(entry.targets).toEqual(expect.arrayContaining(["enhanced.scene", "enhanced.output", "gtao.gather", "water.opaqueSnapshot"]));

  await page.getByRole("button", { name: "Open game menu" }).click();
  const pause = page.getByRole("dialog", { name: "Paused" });
  await expect(pause).toBeVisible();
  await pause.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("graphics-post-auto")).toHaveAttribute("aria-checked", "true");
  await page.getByText("Advanced effects").click();

  await page.getByTestId("graphics-glow-hdr").click();
  await expect.poll(async () => (await probe(page)).active.hdrBloom, { timeout: 20_000 }).toBe(true);
  await expect(page.getByText("Bright highlights bloom softly.")).toBeVisible();
  await expect(page.getByTestId("graphics-post-custom")).toHaveAttribute("aria-checked", "true");
  expect(await storedEffects(page)).toMatchObject({ version: 1, postProcessing: "custom", custom: { glow: "hdr" } });

  await page.getByTestId("graphics-ao-off").click();
  await expect.poll(async () => (await probe(page)).active.gtao, { timeout: 10_000 }).toBe(false);
  const withoutAo = await probe(page);
  // Ambient occlusion off keeps the High scene target and the water snapshot.
  expect(withoutAo.targets).toEqual(expect.arrayContaining(["enhanced.scene", "water.opaqueSnapshot"]));
  expect(withoutAo.targets.some((id) => id.startsWith("gtao."))).toBe(false);

  await page.getByTestId("graphics-brightness").fill("115");
  await expect.poll(async () => (await storedEffects(page))?.brightness).toBe(1.15);
  await expect.poll(async () => (await probe(page)).exposure / entry.exposure, { timeout: 10_000 }).toBeGreaterThan(1.1);

  await page.getByTestId("graphics-resolution-0.7").click();
  await expect.poll(async () => (await probe(page)).pixelRatio, { timeout: 10_000 }).toBeCloseTo(0.7, 3);
  // The High path presents its scaled scene at full canvas size.
  expect((await probe(page)).canvas).toEqual(entry.canvas);
  await expect(page.getByTestId("graphics-render-size")).toContainText("0.70×");

  await page.getByTestId("graphics-reset").click();
  await expect.poll(() => storedEffects(page)).toMatchObject({ postProcessing: "auto", brightness: 1, renderResolution: "auto", custom: { glow: "subtle", ambientOcclusion: "auto" } });
  expect(await page.evaluate(() => window.localStorage.getItem("neva.graphics-quality.v1"))).toBe("auto");
  await expect(page.getByTestId("graphics-reset")).toBeDisabled();

  expect(errors).toEqual([]);
});

test("title options offer the same graphics controls and persist a choice before entry", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("neva.locale", "en");
    window.localStorage.removeItem("neva.graphics-effects.v1");
  });
  await page.goto("/");
  await page.getByTestId("startup-options-button").click();
  const options = page.getByRole("dialog", { name: "Options" });
  await expect(options).toBeVisible();
  await expect(options.getByTestId("graphics-post-auto")).toBeVisible();
  await expect(options.getByTestId("graphics-brightness")).toBeVisible();
  // No frames exist yet, so nothing claims to be active.
  await expect(options.getByText("is active")).toHaveCount(0);
  await options.getByText("Advanced effects").click();
  await options.getByTestId("graphics-edge-off").click();
  expect(await storedEffects(page)).toMatchObject({ postProcessing: "custom", custom: { edgeSmoothing: "off" } });
  await options.getByTestId("graphics-reset").click();
  await expect.poll(() => storedEffects(page)).toMatchObject({ postProcessing: "auto", custom: { edgeSmoothing: "auto" } });
  expect(errors).toEqual([]);
});

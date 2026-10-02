import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import { FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";

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
  quality: string;
  shadowType: number;
  shadowDimension: number;
  shadowCascades: number;
  shadowCombines: number;
}

test("adopted renderer materials remain active through day, night and weather", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("neva.graphics-quality.v1", "high");
    window.localStorage.setItem("neva.locale", "en");
  });
  await page.goto("/?debug=1&worldAcceptance=1&debugStart=farm-art");
  await page.waitForFunction(() => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG), undefined, { timeout: 180_000 });
  await page.evaluate(() => window.__NEVA_DEBUG!.setReviewEnvironment({ minute: 600, weather: "clear", presentationTimeSeconds: null }));
  await expect.poll(async () => (await probe(page)).shadowCascades, { timeout: 20_000 }).toBe(2);
  const adoption = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world.materialAdoption);
  expect(adoption.surfaceMaps).toHaveLength(7);
  for (const texture of adoption.surfaceMaps) {
    expect(texture.compressed).toBe(true);
    expect(texture.mipLevels).toBeGreaterThan(1);
    expect(texture.mipBytes).toBeGreaterThan(0);
  }
  const textureRuntimePath = path.join(testInfo.outputDir, "surface-texture-runtime.json");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(textureRuntimePath, JSON.stringify(await page.evaluate(() => ({
      maps: window.__NEVA_DEBUG!.renderDiagnostics().world.materialAdoption.surfaceMaps,
      resources: performance.getEntriesByType("resource").filter(entry =>
        /\.ktx2|basis_transcoder/.test(entry.name)
      ).map(entry => {
        const resource = entry as PerformanceResourceTiming;
        return { name: resource.name, duration: resource.duration, transferBytes: resource.transferSize,
          encodedBytes: resource.encodedBodySize, decodedBytes: resource.decodedBodySize };
      })
    })), null, 2));
  await testInfo.attach("surface-texture-runtime", { path: textureRuntimePath, contentType: "application/json" });
  expect(adoption.practicalGlows).toBeGreaterThan(0);
  expect(adoption.nodeGlows).toBe(adoption.practicalGlows);
  await expect.poll(async () => {
    const sky = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world.pipeline.atmosphere);
    return sky?.materialReflections.enabled;
  }).toBe(true);
  await page.screenshot({ path: path.join(testInfo.outputDir, "farm-day.png") });
  await page.evaluate(() => window.__NEVA_DEBUG!.setReviewEnvironment({ minute: 120, weather: "storm", presentationTimeSeconds: null }));
  await expect.poll(async () => (await probe(page)).shadowCascades, { timeout: 20_000 }).toBe(1);
  await page.screenshot({ path: path.join(testInfo.outputDir, "farm-night-storm.png") });
  expect((await probe(page)).failedStages).toEqual([]);
  expect(errors).toEqual([]);
});

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
      canvas: [canvas.width, canvas.height] as [number, number],
      quality: diagnostics.world.qualityTier,
      shadowType: diagnostics.world.shadowMap.type,
      shadowDimension: diagnostics.world.shadowAtlas.dimension,
      shadowCascades: diagnostics.world.shadowAtlas.cascades,
      shadowCombines: diagnostics.world.shadowAtlas.combines
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
    if (message.type() === "error" && /shader|webgl|program|THREE|SurfaceTextureLoader|KTX2/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("pause graphics settings switch quality tiers and drive the High render path without shader errors", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("neva.graphics-quality.v1", "high");
    window.localStorage.setItem("neva.locale", "en");
    window.localStorage.removeItem("neva.graphics-effects.v1");
  });
  await page.goto("/?debug=1&worldAcceptance=1&debugStart=farm");
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
  // Both directions exercise shadow-map replacement and enhanced-path disposal/recreation.
  for (const tier of ["low", "medium", "high", "medium", "low", "high"] as const) {
    await page.getByTestId(`graphics-quality-${tier}`).click();
    await expect.poll(async () => {
      const current = await probe(page);
      return {
        quality: current.quality,
        dimension: current.shadowDimension,
        type: current.shadowType,
        path: current.path,
        gtao: current.active.gtao,
        failedStages: current.failedStages
      };
    }, { timeout: 20_000 }).toEqual({
      quality: tier,
      dimension: CANONICAL_RENDER_CONFIG.shadows.cascades.enabled[tier]
        ? Math.floor(CANONICAL_RENDER_CONFIG.quality[tier].shadowMapSize / Math.SQRT2 / 32) * 32
        : CANONICAL_RENDER_CONFIG.quality[tier].shadowMapSize,
      type: CANONICAL_RENDER_CONFIG.shadows.type[tier],
      path: tier === "high" ? "enhanced" : "direct",
      gtao: tier === "high",
      failedStages: []
    });
    const settled = await probe(page);
    expect(settled.failedStages).toEqual([]);
    expect(settled.path).toBe(tier === "high" ? "enhanced" : "direct");
    expect(settled.active.gtao).toBe(tier === "high");
    await expect.poll(async () => (await probe(page)).shadowCombines, { timeout: 10_000 })
      .toBeGreaterThan(settled.shadowCombines);
  }
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
  await expect.poll(async () => {
    const diagnostics = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics());
    const tier = diagnostics.graphics.effectiveTier;
    return diagnostics.graphics.preference === "auto"
      && diagnostics.world.qualityTier === tier
      && diagnostics.world.shadowAtlas.dimension === (CANONICAL_RENDER_CONFIG.shadows.cascades.enabled[tier]
        ? Math.floor(CANONICAL_RENDER_CONFIG.quality[tier].shadowMapSize / Math.SQRT2 / 32) * 32
        : CANONICAL_RENDER_CONFIG.quality[tier].shadowMapSize)
      && diagnostics.world.shadowMap.type === CANONICAL_RENDER_CONFIG.shadows.type[tier];
  }, { timeout: 20_000 }).toBe(true);
  expect((await probe(page)).failedStages).toEqual([]);

  expect(errors).toEqual([]);
});

test("restores the world context and retains it across repeated character previews and resize", async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("neva.graphics-quality.v1", "high");
    window.localStorage.setItem("neva.locale", "en");
    window.localStorage.removeItem("neva.graphics-effects.v1");
    const visibilityListeners = new Set<EventListenerOrEventListenerObject>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions) => {
      if (type === "visibilitychange" && listener) visibilityListeners.add(listener);
      add(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions) => {
      if (type === "visibilitychange" && listener) visibilityListeners.delete(listener);
      remove(type, listener, options);
    }) as typeof document.removeEventListener;
    Object.defineProperty(window, "__nevaTestVisibilityListenerCount", {
      value: () => visibilityListeners.size
    });
  });
  await page.goto("/?debug=1&debugStart=farm&worldAcceptance=1");
  await page.waitForFunction(() => {
    try { return window.__NEVA_DEBUG?.renderDiagnostics().sceneIdentity.bootReady === true; } catch { return false; }
  }, null, { timeout: 180_000, polling: 1000 });
  const restoresBefore = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world.pipeline.contextRestores);
  await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Chrome cannot exercise WebGL context restoration");
    await new Promise<void>((resolve) => {
      canvas.addEventListener("webglcontextlost", () => {
        setTimeout(() => extension.restoreContext(), 250);
      }, { once: true });
      canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true });
      extension.loseContext();
    });
  });
  await expect.poll(async () => {
    const world = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world);
    return { restores: world.pipeline.contextRestores, path: world.pipeline.path, gtao: world.pipeline.activeEffects.gtao };
  }, { timeout: 20_000 }).toEqual({ restores: restoresBefore + 1, path: "enhanced", gtao: true });
  const restored = await probe(page);
  expect(restored.failedStages).toEqual([]);
  expect(restored.shadowCascades).toBe(2);
  expect(restored.shadowDimension ** 2 * restored.shadowCascades).toBeLessThanOrEqual(CANONICAL_RENDER_CONFIG.quality.high.shadowMapSize ** 2);
  await expect.poll(async () => (await probe(page)).shadowCombines, { timeout: 10_000 }).toBeGreaterThan(restored.shadowCombines);

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => (await probe(page)).canvas).toEqual([viewport.width, viewport.height]);
    expect((await probe(page)).failedStages).toEqual([]);
  }

  const character = page.getByRole("dialog", { name: "Character & Gear" });
  const visibilityListenerCount = (): Promise<number> => page.evaluate(() =>
    (window as unknown as { __nevaTestVisibilityListenerCount: () => number }).__nevaTestVisibilityListenerCount());
  const listenersBeforePreview = await visibilityListenerCount();
  for (let cycle = 0; cycle < 20; cycle += 1) {
    await page.keyboard.press("KeyC");
    await expect(character).toBeVisible();
    await expect(character.locator(".character-preview-canvas")).toBeVisible();
    await expect(character.locator(".character-preview-fallback")).toHaveCount(0);
    await expect.poll(visibilityListenerCount).toBe(listenersBeforePreview + 1);
    await page.keyboard.press("Escape");
    await expect(character).not.toBeVisible();
    await expect.poll(visibilityListenerCount).toBe(listenersBeforePreview);
  }
  expect(await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
    return !canvas.getContext("webgl2")!.isContextLost();
  })).toBe(true);
  expect(await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world.pipeline.contextRestores)).toBe(restoresBefore + 1);
  expect((await probe(page)).failedStages).toEqual([]);
  expect(errors).toEqual([]);
});

test("covered farmhouse probes remain scoped across lighting changes and context recovery", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem("neva.graphics-quality.v1", "high");
    localStorage.setItem("neva.locale", "en");
  });
  await page.goto("/?debug=1&worldAcceptance=1&debugStart=farm");
  await page.waitForFunction(() => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG), undefined, { timeout: 180_000 });
  const room = () => page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics().world.materialAdoption.shelter);
  expect(await room()).toMatchObject({ active: false });
  expect((await room()).published).toBeGreaterThan(0);
  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleport(x, z), FARMHOUSE_OUTSIDE_DOOR);
  await expect.poll(async () => (await page.evaluate(() => window.__NEVA_DEBUG!.snapshot())).interactionTarget?.id)
    .toBe("interior:farmhouse:enter");
  await page.evaluate(() => window.__NEVA_DEBUG!.beginPerformanceWindow("farmhouse:first-probe"));
  await page.keyboard.press("KeyE");
  await expect.poll(async () => (await room()).active).toBe(true);
  await expect.poll(async () => (await room()).published, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  const firstWindow = await page.evaluate(() => window.__NEVA_DEBUG!.endPerformanceWindow());
  await page.screenshot({ path: path.join(testInfo.outputDir, "farmhouse-day.png") });
  const day = await room();
  expect(day.captureMeshes).toBeGreaterThan(1);
  expect(day.atlasBytes).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__NEVA_DEBUG!.beginPerformanceWindow("farmhouse:first-night-probe");
    window.__NEVA_DEBUG!.setReviewEnvironment({ minute: 120, weather: "storm", presentationTimeSeconds: null });
  });
  await expect.poll(async () => (await room()).published, { timeout: 20_000 }).toBeGreaterThan(day.published);
  await page.waitForTimeout(3000);
  const nightWindow = await page.evaluate(() => window.__NEVA_DEBUG!.endPerformanceWindow());
  await page.screenshot({ path: path.join(testInfo.outputDir, "farmhouse-night-storm.png") });
  await page.evaluate(() => {
    const renderer = (window as unknown as { __NEVA_PROBE: { renderer: { getContext(): WebGLRenderingContext } } }).__NEVA_PROBE.renderer;
    const extension = renderer.getContext().getExtension("WEBGL_lose_context")!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 200);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics())).world.pipeline.contextRestores,
    { timeout: 20_000 }).toBe(1);
  await expect.poll(async () => (await room()).published, { timeout: 20_000 }).toBeGreaterThan(0);
  const restored = await room();
  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleport(x, z), FARMHOUSE_OUTSIDE_DOOR);
  await expect.poll(async () => (await room()).active).toBe(false);
  const afterExit = await room();
  await page.waitForTimeout(300);
  expect((await room()).published).toBe(afterExit.published);
  await writeFile(path.join(testInfo.outputDir, "farmhouse-probe-runtime.json"), JSON.stringify({ day, restored, afterExit, firstWindow, nightWindow }, null, 2));
  expect((await probe(page)).failedStages).toEqual([]);
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

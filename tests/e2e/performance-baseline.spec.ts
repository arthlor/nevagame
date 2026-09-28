// tests/e2e/performance-baseline.spec.ts
import { test, expect, type Browser, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cdpDelta,
  cdpMetrics,
  followWaypoints,
  installPerformanceObservers,
  observedStallsBetween,
  orbitCamera,
  readPose,
  resampleRoute,
  routeSlice,
  settledHeapBytes,
  startupEvidence,
  writeBaselineSummary,
  type BaselineRunRecord,
  type DriveResult,
  type PassRecord,
  type RoutePoint
} from "./support/performanceBaseline";

/**
 * Sustained-play performance baseline, measured against the PRODUCTION build
 * served by `playwright.budget.config.ts`.
 *
 * The render-budget routes in `render-budget.spec.ts` prepare a scene and orbit
 * briefly; they catch order-of-magnitude regressions but cannot describe smooth
 * play. Each scenario here drives real keyboard/mouse input through a populated
 * part of the world and separates three things a single ring mixes together:
 *
 * - cold startup: a fresh browser (empty HTTP and shader caches) from
 *   navigation to released control, with stage marks, main-thread stalls and
 *   bytes transferred before control;
 * - first use: the first pass over the route, where uploads and shader
 *   compilation for newly seen content land;
 * - warm play: a second pass over the same route.
 *
 * Every pass records every visible frame (p50/p95/p99, stalls), the debug
 * main-thread phase split, submitted draws/triangles, per-pass GPU timer
 * queries, Chromium task/layout counters, long tasks with long-animation-frame
 * script attribution, and renderer resource counts. A settled (post-GC) heap
 * is read between passes, outside the measured windows.
 *
 * Opt-in: `npm run perf:baseline` (sets NEVA_PERF_BASELINE=1). Repetitions are
 * interleaved (A B C … A B C …) so thermal and order drift spread across
 * scenarios. NEVA_PERF_REPEATS (default 3) and NEVA_PERF_SCENARIOS (comma list)
 * narrow a run; NEVA_PERF_BUILD_LABEL names the served build in the report.
 * For an A/B, alternate single-repetition runs of each build into one run
 * directory per build and set NEVA_PERF_FIRST_REPETITION so records accumulate.
 * NEVA_PERF_CPU_PROFILE=1 also writes a V8 CPU profile of each warm pass
 * (`cpu-<scenario>-r<n>.cpuprofile`); build with `--sourcemap` to symbolicate
 * it. Profiling adds sampling overhead, so those runs are attribution, not
 * timing evidence. NEVA_PERF_STARTUP_PROFILE=1 profiles navigation to control
 * the same way (`startup-<scenario>-r<n>.cpuprofile`), and NEVA_PERF_STARTUP_ONLY=1
 * records cold startup without the route passes.
 */

const enabled = process.env.NEVA_PERF_BASELINE === "1";
const repetitions = Math.max(1, Number(process.env.NEVA_PERF_REPEATS ?? 3));
const firstRepetition = Math.max(1, Number(process.env.NEVA_PERF_FIRST_REPETITION ?? 1));
const selectedScenarios = process.env.NEVA_PERF_SCENARIOS
  ? new Set(process.env.NEVA_PERF_SCENARIOS.split(",").map((id) => id.trim()))
  : null;
const PASS_MS = Number(process.env.NEVA_PERF_PASS_MS ?? 25_000);
const captureCpuProfile = process.env.NEVA_PERF_CPU_PROFILE === "1";
const captureStartupProfile = process.env.NEVA_PERF_STARTUP_PROFILE === "1";
const startupOnly = process.env.NEVA_PERF_STARTUP_ONLY === "1";
const VIEWPORT = { width: 1920, height: 1080 };

type RouteSample = RoutePoint & { distance: number };

interface Routes {
  farmEntry: RouteSample[];
  farmWork: RouteSample[];
  farmVillage: RouteSample[];
  villageHarbor: RouteSample[];
  sailing: RouteSample[];
}

interface ScenarioContext {
  page: Page;
  routes: Routes;
  /** Pose at control, used to return vehicles to the same start. */
  start: { x: number; z: number; rotationY: number };
  events: Array<Record<string, unknown>>;
}

interface Scenario {
  id: string;
  covers: readonly string[];
  query: string;
  /** Before each pass and outside the window: return to the start and restore conditions. */
  reset: (context: ScenarioContext) => Promise<void>;
  /** One measured pass. */
  pass: (context: ScenarioContext) => Promise<DriveResult | null>;
}

const settle = (page: Page, ms: number) => page.waitForTimeout(ms);

/** Farm gate → yard → work zone and back: the populated starter farm. */
function farmLoop(routes: Routes): RoutePoint[] {
  const entry = [...routes.farmEntry].reverse();
  const outward = [...entry, ...routes.farmWork];
  return resampleRoute([...outward, ...[...outward].reverse().slice(1)], 3);
}

async function farmWalkPass({ page, routes }: ScenarioContext): Promise<DriveResult> {
  await orbitCamera(page);
  return followWaypoints(page, farmLoop(routes), { mode: "foot", durationMs: PASS_MS - 1_500, loop: true });
}

async function resetFarm({ page, routes }: ScenarioContext, weather: "clear" | "storm"): Promise<void> {
  const start = routes.farmEntry.at(-1)!;
  await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleport(x, z, -Math.PI / 2), start);
  const minute = (await readPose(page)).minute;
  await page.evaluate(({ minute, weather }) =>
    window.__NEVA_DEBUG!.setReviewEnvironment({ minute, weather, presentationTimeSeconds: null }), { minute, weather });
  await settle(page, weather === "storm" ? 4_000 : 1_500);
}

async function timedInPage<T>(page: Page, action: () => Promise<T>): Promise<{ result: T; startMs: number; endMs: number }> {
  const startMs = await page.evaluate(() => performance.now());
  const result = await action();
  const endMs = await page.evaluate(() => performance.now());
  return { result, startMs, endMs };
}

const scenarios: readonly Scenario[] = [
  {
    id: "farm-populated-walk",
    covers: ["populated farm", "camera orbit"],
    query: "debugStart=farm-art",
    reset: (context) => resetFarm(context, "clear"),
    pass: farmWalkPass
  },
  {
    id: "farm-storm-walk",
    covers: ["populated farm", "storm weather", "camera orbit"],
    query: "debugStart=farm-art",
    reset: (context) => resetFarm(context, "storm"),
    pass: farmWalkPass
  },
  {
    id: "village-market-save-harbor",
    covers: ["village", "market UI", "save during play", "harbor", "new-game startup and first save"],
    // No debugStart: a fresh profile starts a new game with persistence, so the
    // entry commit, periodic autosave and the explicit save use the real store.
    query: "",
    reset: async ({ page, routes }) => {
      const [from, toward] = routeSlice(routes.farmVillage, 110, 120);
      await page.evaluate(({ from, toward }) => window.__NEVA_DEBUG!.teleport(from.x, from.z,
        Math.atan2(toward.x - from.x, toward.z - from.z)), { from, toward });
      await settle(page, 1_500);
    },
    pass: async ({ page, routes, events }) => {
      const stall = routes.farmVillage.at(-1)!;
      // The route reaches the stall from behind its counter; the market is
      // served from the south, so walk around the east end of the stall.
      const eastLane = stall.x + 6.3;
      const counterFront = stall.z - 4.1;
      const aroundStall = [
        { x: eastLane, z: stall.z + 2.9 },
        { x: eastLane, z: counterFront },
        { x: stall.x + 2.3, z: counterFront }
      ];
      const approach = [
        ...resampleRoute(routeSlice(routes.farmVillage, 110, stall.distance - 5), 6),
        ...aroundStall
      ];
      const toMarket = await followWaypoints(page, approach, {
        mode: "foot",
        durationMs: 40_000,
        onPoll: async (pose) => {
          if (Math.hypot(pose.x - stall.x, pose.z - stall.z) > 7 || pose.z > stall.z - 1) return false;
          const target = await page.evaluate(() => window.__NEVA_DEBUG!.snapshot().interactionTarget);
          return target?.entityId === "market.village" && target.action === "trade";
        }
      });
      // The picked target follows the player's final drift and facing, so settle
      // and, if another target won, take short steps toward the stall.
      const marketTargeted = async () => {
        const target = await page.evaluate(() => window.__NEVA_DEBUG!.snapshot().interactionTarget);
        return target?.entityId === "market.village" && target.action === "trade";
      };
      let reachable = false;
      for (let attempt = 0; attempt < 8 && !reachable; attempt += 1) {
        await settle(page, 250);
        reachable = await marketTargeted();
        if (!reachable) await followWaypoints(page, [{ x: stall.x, z: counterFront + 1.2 }], { mode: "foot", durationMs: 300, sprint: false, arrivalRadius: 0.5 });
      }
      if (reachable) {
        const dialog = page.locator('[role="dialog"][aria-labelledby="market-title"]');
        const opened = await timedInPage(page, async () => {
          await page.keyboard.press("KeyE");
          await dialog.waitFor({ state: "visible", timeout: 15_000 });
        });
        events.push({ name: "market open", durationMs: Math.round(opened.endMs - opened.startMs), startMs: Math.round(opened.startMs),
          stalls: await observedStallsBetween(page, opened.startMs, opened.endMs + 250) });
        await settle(page, 1_500);
        const closed = await timedInPage(page, async () => {
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden", timeout: 15_000 });
        });
        events.push({ name: "market close", durationMs: Math.round(closed.endMs - closed.startMs), startMs: Math.round(closed.startMs) });
      } else {
        events.push({ name: "market unreachable", pose: toMarket.endPose });
      }
      let saved = false;
      // Back around the stall and through the square to the harbor road.
      const harbor = [
        { x: eastLane, z: counterFront },
        ...resampleRoute([{ x: eastLane, z: stall.z + 2.9 }, routes.villageHarbor[0]], 6),
        ...resampleRoute(routes.villageHarbor, 6).slice(1)
      ];
      const midpoint = routes.villageHarbor[Math.floor(routes.villageHarbor.length / 2)];
      const toHarbor = await followWaypoints(page, harbor, {
        mode: "foot",
        durationMs: 40_000,
        onPoll: async (pose) => {
          if (saved || Math.hypot(pose.x - midpoint.x, pose.z - midpoint.z) > 6) return false;
          saved = true;
          // Movement keys stay held: this is a save while the player walks.
          const save = await page.evaluate(async () => {
            const startMs = performance.now();
            const ok = await window.__NEVA_DEBUG!.saveNow();
            return { ok, startMs, endMs: performance.now() };
          });
          events.push({ name: "save while walking", ok: save.ok, durationMs: Math.round(save.endMs - save.startMs),
            startMs: Math.round(save.startMs), stalls: await observedStallsBetween(page, save.startMs, save.endMs + 100) });
          return false;
        }
      });
      if (!saved) events.push({ name: "save point not reached", pose: toHarbor.endPose });
      return {
        durationMs: toMarket.durationMs + toHarbor.durationMs,
        distanceMeters: Number((toMarket.distanceMeters + toHarbor.distanceMeters).toFixed(2)),
        reachedWaypoints: toMarket.reachedWaypoints + toHarbor.reachedWaypoints,
        skippedWaypoints: toMarket.skippedWaypoints + toHarbor.skippedWaypoints,
        endPose: toHarbor.endPose
      };
    }
  },
  {
    id: "loaded-wagon-drive",
    covers: ["loaded wagon", "farm-village road"],
    query: "debugStart=loaded-wagon",
    reset: async ({ page, start }) => {
      await page.evaluate(({ x, z, rotationY }) =>
        window.__NEVA_DEBUG!.teleport(x, z, rotationY, { keepMount: true }), start);
      await settle(page, 2_000);
    },
    pass: ({ page, routes, start }) => {
      // Join the road ahead of the parked carriage and follow it toward the village.
      const joinAt = routes.farmVillage.reduce((best, point) =>
        Math.hypot(point.x - start.x, point.z - start.z) < Math.hypot(best.x - start.x, best.z - start.z) ? point : best);
      const road = resampleRoute(routeSlice(routes.farmVillage, joinAt.distance + 4, joinAt.distance + 90), 5);
      return followWaypoints(page, road, { mode: "carriage", durationMs: PASS_MS, arrivalRadius: 2.5 });
    }
  },
  {
    id: "boat-journey",
    covers: ["boat journey", "harbor departure", "open water"],
    query: "debugStart=boat-driving",
    reset: async ({ page, start }) => {
      await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleportActiveBoat(x, z), start);
      await settle(page, 2_000);
    },
    pass: ({ page, routes, start }) => {
      const course = resampleRoute([{ x: start.x, z: start.z }, ...routes.sailing.slice(0, 3)], 20).slice(1);
      return followWaypoints(page, course, { mode: "boat", durationMs: PASS_MS });
    }
  },
  {
    id: "storm-sailing",
    covers: ["storm weather", "boat journey", "open water"],
    query: "debugStart=storm-skiff",
    reset: async ({ page, start }) => {
      await page.evaluate(({ x, z }) => window.__NEVA_DEBUG!.teleportActiveBoat(x, z), start);
      const minute = (await readPose(page)).minute;
      await page.evaluate((minute) =>
        window.__NEVA_DEBUG!.setReviewEnvironment({ minute, weather: "storm", presentationTimeSeconds: null }), minute);
      await settle(page, 2_000);
    },
    pass: ({ page, start }) => {
      const square = [
        { x: start.x, z: start.z + 70 },
        { x: start.x + 70, z: start.z + 70 },
        { x: start.x + 70, z: start.z },
        { x: start.x, z: start.z }
      ];
      return followWaypoints(page, resampleRoute([{ x: start.x, z: start.z }, ...square], 20).slice(1),
        { mode: "boat", durationMs: PASS_MS, loop: true });
    }
  },
  {
    id: "sport-fishing-fight",
    covers: ["sport fishing", "fishing HUD"],
    query: "debugStart=sport-fishing",
    // The encounter cannot be restarted without a reload, so the warm pass is
    // the continuation of the same fight; the report records its end state.
    reset: (context) => settle(context.page, 500),
    pass: async ({ page, events }) => {
      const started = Date.now();
      const pattern: ReadonlyArray<readonly [string[], number]> = [
        [["KeyW"], 900], [[], 400], [["KeyW", "KeyA"], 700], [[], 500], [["KeyS"], 400], [["KeyW", "KeyD"], 700], [[], 400]
      ];
      let step = 0;
      while (Date.now() - started < PASS_MS) {
        const [keys, holdMs] = pattern[step % pattern.length];
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(holdMs);
        for (const key of keys) await page.keyboard.up(key);
        step += 1;
      }
      const state = await page.evaluate(() => ({ mode: window.__NEVA_DEBUG!.pose().mode, fight: window.__NEVA_DEBUG!.snapshot().sportFishing }));
      events.push({ name: "fight state at window end", ...state });
      return null;
    }
  }
];

function gitIdentity(): Record<string, unknown> {
  try {
    return {
      head: execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(),
      dirtyFiles: execSync("git status --porcelain", { encoding: "utf8" }).split("\n").filter(Boolean).length
    };
  } catch {
    return { head: "unknown" };
  }
}

async function runScenario(browser: Browser, baseURL: string, scenario: Scenario, repetition: number): Promise<BaselineRunRecord> {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, baseURL });
  const page = await context.newPage();
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith("google-analytics.com")) return;
    if (url.pathname === "/assets/video/intro.mp4" && request.failure()?.errorText === "net::ERR_ABORTED") return;
    runtimeErrors.push(`${request.url()}: ${request.failure()?.errorText}`);
  });
  await installPerformanceObservers(page);
  // Manual High: Auto must not change the tier under measurement.
  await page.addInitScript(() => window.localStorage.setItem("neva.graphics-quality.v1", "high"));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const loadAverageStart = os.loadavg();

  try {
    if (captureStartupProfile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
      await cdp.send("Profiler.start");
    }
    await page.goto(`/?debug=1&worldAcceptance=1${scenario.query ? `&${scenario.query}` : ""}`);
    await page.waitForFunction(() => window.__NEVA_RENDER_READY === true && Boolean(window.__NEVA_DEBUG),
      undefined, { timeout: 300_000 });
    if (captureStartupProfile) {
      const { profile } = await cdp.send("Profiler.stop");
      const runDirectory = process.env.NEVA_BUDGET_RUN_DIR;
      if (runDirectory) {
        fs.mkdirSync(runDirectory, { recursive: true });
        fs.writeFileSync(path.join(runDirectory, `startup-${scenario.id}-r${repetition}.cpuprofile`), JSON.stringify(profile));
      }
    }
    const startup = await startupEvidence(page);
    const startupStalls = await observedStallsBetween(page, 0, startup.timeToControlMs ?? Number.POSITIVE_INFINITY);
    // Let the reveal fade and entry hold finish before any window opens.
    await settle(page, 3_000);

    const routes = await page.evaluate(() => {
      const debug = window.__NEVA_DEBUG!;
      return {
        farmEntry: debug.acceptanceRoute("farm-entry"),
        farmWork: debug.acceptanceRoute("farm-work-zone"),
        farmVillage: debug.acceptanceRoute("farm-village"),
        villageHarbor: debug.acceptanceRoute("village-harbor"),
        sailing: debug.acceptanceRoute("sailing.neva-sunreach")
      };
    }) as Routes;
    const startPose = await readPose(page);
    const scenarioContext: ScenarioContext = {
      page,
      routes,
      start: { x: startPose.x, z: startPose.z, rotationY: startPose.rotationY },
      events: []
    };
    const diagnostics = await page.evaluate(() => {
      const rendered = window.__NEVA_DEBUG!.renderDiagnostics();
      return {
        viewport: rendered.viewport,
        seed: rendered.sceneIdentity.worldSeed,
        qualityTier: rendered.world.qualityTier,
        graphics: rendered.graphics,
        renderPath: rendered.world.pipeline.path,
        activeEffects: rendered.world.pipeline.activeEffects,
        gpuRenderer: rendered.world.pipeline.gpuTiming.renderer,
        softwareRenderer: rendered.world.pipeline.gpuTiming.softwareRenderer,
        bundles: performance.getEntriesByType("resource").map((entry) => entry.name)
          .filter((name) => /\/assets\/(index|GameApp)[^/]*\.js$/.test(name))
          .map((name) => name.replace(/^.*\/assets\//, ""))
      };
    });

    const passes: PassRecord[] = [];
    const heap = { afterFirstUseBytes: 0, afterWarmBytes: 0 };
    for (const label of startupOnly ? [] : ["first-use", "warm"] as const) {
      scenarioContext.events = [];
      await scenario.reset(scenarioContext);
      const before = await cdpMetrics(cdp);
      const profiling = captureCpuProfile && label === "warm";
      if (profiling) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
        await cdp.send("Profiler.start");
      }
      await page.evaluate((name) => window.__NEVA_DEBUG!.beginPerformanceWindow(name), `${scenario.id}:${label}`);
      const drive = await scenario.pass(scenarioContext);
      const measured = await page.evaluate(() => window.__NEVA_DEBUG!.endPerformanceWindow());
      if (profiling) {
        const { profile } = await cdp.send("Profiler.stop");
        const runDirectory = process.env.NEVA_BUDGET_RUN_DIR;
        if (runDirectory) {
          fs.mkdirSync(runDirectory, { recursive: true });
          fs.writeFileSync(path.join(runDirectory, `cpu-${scenario.id}-r${repetition}.cpuprofile`), JSON.stringify(profile));
        }
      }
      const after = await cdpMetrics(cdp);
      expect(measured, `${scenario.id} ${label} window`).not.toBeNull();
      passes.push({
        label,
        window: measured!,
        drive,
        cdp: cdpDelta(before, after),
        stalls: await observedStallsBetween(page, measured!.startedAtMs, measured!.endedAtMs),
        events: scenarioContext.events
      });
      const settled = await settledHeapBytes(cdp);
      if (label === "first-use") heap.afterFirstUseBytes = settled;
      else heap.afterWarmBytes = settled;
    }

    return {
      scenario: scenario.id,
      covers: scenario.covers,
      repetition,
      query: scenario.query,
      identity: {
        buildLabel: process.env.NEVA_PERF_BUILD_LABEL ?? null,
        ...gitIdentity(),
        browser: browser.version(),
        host: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGiB: Math.round(os.totalmem() / 2 ** 30),
          platform: `${os.platform()} ${os.release()}` },
        loadAverage: { start: loadAverageStart, end: os.loadavg() },
        passMs: PASS_MS,
        ...diagnostics
      },
      startup: { ...startup, stalls: startupStalls },
      passes,
      heap,
      runtimeErrors
    };
  } finally {
    await context.close();
  }
}

test.describe("sustained-play performance baseline", () => {
  test.skip(!enabled, "Opt-in lane: run `npm run perf:baseline`");

  test.afterAll(() => {
    const runDirectory = process.env.NEVA_BUDGET_RUN_DIR;
    if (!runDirectory) return;
    const written = writeBaselineSummary(runDirectory);
    if (written) console.info(`[perf-baseline] Summary: ${written.markdownPath}`);
  });

  for (let repetition = firstRepetition; repetition < firstRepetition + repetitions; repetition += 1) {
    for (const scenario of scenarios) {
      if (selectedScenarios && !selectedScenarios.has(scenario.id)) continue;
      test(`${scenario.id} run ${repetition}`, async ({ playwright, browserName }, testInfo) => {
        test.skip(browserName !== "chromium", "The baseline uses Chromium timing, long-task and CDP APIs");
        test.setTimeout(600_000);
        // A fresh browser per run: empty HTTP cache and GPU shader cache, so
        // every startup is cold rather than only the first test in a worker.
        const browser = await playwright.chromium.launch({ channel: "chrome" });
        try {
          const baseURL = String(testInfo.project.use.baseURL);
          const record = await runScenario(browser, baseURL, scenario, repetition);
          const runDirectory = process.env.NEVA_BUDGET_RUN_DIR;
          if (runDirectory) {
            fs.mkdirSync(runDirectory, { recursive: true });
            fs.writeFileSync(path.join(runDirectory, `baseline-${scenario.id}-r${repetition}.json`), JSON.stringify(record, null, 1));
          }
          console.info(`[perf-baseline] ${scenario.id} r${repetition}: control ${record.startup.timeToControlMs} ms; `
            + record.passes.map((pass) => `${pass.label} p50/p95/p99 ${pass.window.frames.p50Ms}/${pass.window.frames.p95Ms}/`
              + `${pass.window.frames.p99Ms} ms, stalls ${pass.window.frames.stallsOver50Ms}`).join("; "));

          expect(record.runtimeErrors).toEqual([]);
          expect(record.identity.qualityTier).toBe("high");
          expect(record.identity.viewport).toEqual({ width: VIEWPORT.width, height: VIEWPORT.height, devicePixelRatio: 1 });
          for (const pass of record.passes) {
            expect(pass.window.frames.samples, `${scenario.id} ${pass.label} frames`).toBeGreaterThan(60);
            expect(pass.window.truncated).toBe(false);
            if (pass.drive) {
              expect(pass.drive.distanceMeters, `${scenario.id} ${pass.label} moved`).toBeGreaterThan(10);
            }
          }
        } finally {
          await browser.close();
        }
      });
    }
  }
});

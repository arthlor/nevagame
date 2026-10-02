import type { CDPSession, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Route drivers, browser evidence collectors and the run summary for the
 * sustained-play performance baseline (`performance-baseline.spec.ts`).
 *
 * Everything here observes the production bundle through the localhost
 * `worldAcceptance` debug harness; it never mutates simulation state except
 * through the same debug entry points the other acceptance lanes use.
 */

export interface RoutePoint {
  x: number;
  z: number;
}

export type DriveMode = "foot" | "boat" | "carriage";

export interface DriveOptions {
  mode: DriveMode;
  /** Pass ends when this elapses, even if waypoints remain. */
  durationMs: number;
  /** Restart from the first waypoint after the last (ping-pong routes). */
  loop?: boolean;
  arrivalRadius?: number;
  sprint?: boolean;
  /** Called once per poll; return true to stop the pass early. */
  onPoll?: (pose: PoseSample) => Promise<boolean | void>;
}

export interface PoseSample {
  mode: string;
  x: number;
  z: number;
  rotationY: number;
  cameraYaw: number;
  weather: string;
  minute: number;
}

export interface DriveResult {
  durationMs: number;
  distanceMeters: number;
  reachedWaypoints: number;
  skippedWaypoints: number;
  endPose: PoseSample;
}

const POLL_MS = 150;

export function readPose(page: Page): Promise<PoseSample> {
  return page.evaluate(() => window.__NEVA_DEBUG!.pose());
}

/** The existing label reads canonical state; render scene identity names a benchmark seed. */
export async function readSimulationSeed(page: Page): Promise<number> {
  const label = await page.getByTestId("diagnostics").getByText(/^Seed \d+$/).textContent();
  const match = /^Seed (\d+)$/.exec(label?.trim() ?? "");
  const seed = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(seed)) throw new Error(`Invalid simulation seed label: ${label}`);
  return seed;
}

async function syncHeldKeys(page: Page, held: Set<string>, desiredKeys: readonly string[]): Promise<void> {
  const desired = new Set(desiredKeys);
  for (const key of [...held]) {
    if (desired.has(key)) continue;
    await page.keyboard.up(key);
    held.delete(key);
  }
  for (const key of desired) {
    if (held.has(key)) continue;
    await page.keyboard.down(key);
    held.add(key);
  }
}

function steeringKeys(mode: DriveMode, pose: PoseSample, target: RoutePoint, sprint: boolean): string[] {
  const dx = target.x - pose.x;
  const dz = target.z - pose.z;
  const distance = Math.hypot(dx, dz);
  const keys: string[] = [];
  if (mode === "foot") {
    // Camera-relative WASD, as in the world acceptance walker.
    const forwardX = -Math.sin(pose.cameraYaw);
    const forwardZ = -Math.cos(pose.cameraYaw);
    const localX = dx * -forwardZ + dz * forwardX;
    const localZ = -(dx * forwardX + dz * forwardZ);
    const length = Math.hypot(localX, localZ) || 1;
    if (localX / length > 0.16) keys.push("KeyD");
    if (localX / length < -0.16) keys.push("KeyA");
    if (localZ / length < -0.16) keys.push("KeyW");
    if (localZ / length > 0.16) keys.push("KeyS");
    // Waypoints are a few metres apart, so sprint on the leg, not on the gap.
    if (sprint && distance > 2) keys.push("ShiftLeft");
    return keys;
  }
  // Vehicles steer by heading. `rotationY` follows atan2(dx, dz); a hull turns
  // toward positive heading on D, while the carriage's front axle turns the
  // other way.
  const heading = Math.atan2(dx, dz);
  const delta = Math.atan2(Math.sin(heading - pose.rotationY), Math.cos(heading - pose.rotationY));
  const turnPositive = mode === "boat" ? "KeyD" : "KeyA";
  const turnNegative = mode === "boat" ? "KeyA" : "KeyD";
  if (delta > 0.06) keys.push(turnPositive);
  if (delta < -0.06) keys.push(turnNegative);
  if (Math.abs(delta) < (distance < 8 ? 0.55 : 1.2) || mode === "carriage") keys.push("KeyW");
  return keys;
}

/**
 * Drives the player along waypoints with real keyboard input for a bounded
 * time. A waypoint that makes no progress for several seconds is skipped and
 * counted, so one collider cannot end the whole measurement; the report keeps
 * the skip count and distance so a degraded route is visible.
 */
export async function followWaypoints(page: Page, waypoints: readonly RoutePoint[], options: DriveOptions): Promise<DriveResult> {
  const held = new Set<string>();
  const arrivalRadius = options.arrivalRadius ?? (options.mode === "foot" ? 1.4 : 4);
  const started = Date.now();
  let index = 0;
  let reached = 0;
  let skipped = 0;
  let distance = 0;
  let pose = await readPose(page);
  let previous = pose;
  let best = Number.POSITIVE_INFINITY;
  let stagnantPolls = 0;
  const stagnantLimit = options.mode === "foot" ? 30 : 60;
  try {
    while (Date.now() - started < options.durationMs && index < waypoints.length) {
      pose = await readPose(page);
      distance += Math.hypot(pose.x - previous.x, pose.z - previous.z);
      previous = pose;
      if (options.onPoll && await options.onPoll(pose)) break;
      const target = waypoints[index];
      const toTarget = Math.hypot(target.x - pose.x, target.z - pose.z);
      if (toTarget <= arrivalRadius) {
        reached += 1;
        index += 1;
        if (index >= waypoints.length && options.loop) index = 0;
        best = Number.POSITIVE_INFINITY;
        stagnantPolls = 0;
        continue;
      }
      if (toTarget < best - 0.02) {
        best = toTarget;
        stagnantPolls = 0;
      } else if (++stagnantPolls >= stagnantLimit) {
        skipped += 1;
        index += 1;
        if (index >= waypoints.length && options.loop) index = 0;
        best = Number.POSITIVE_INFINITY;
        stagnantPolls = 0;
        continue;
      }
      await syncHeldKeys(page, held, steeringKeys(options.mode, pose, target, options.sprint ?? true));
      await page.waitForTimeout(POLL_MS);
    }
  } finally {
    await syncHeldKeys(page, held, []);
  }
  return {
    durationMs: Date.now() - started,
    distanceMeters: Number(distance.toFixed(2)),
    reachedWaypoints: reached,
    skippedWaypoints: skipped,
    endPose: pose
  };
}

/** Right-drag orbit in fixed pixel steps: a reliable, repeatable camera turn. */
export async function orbitCamera(page: Page, steps = 24, pixelsPerStep = 22): Promise<void> {
  const bounds = await page.locator("#game-canvas").boundingBox();
  if (!bounds) return;
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;
  await page.mouse.move(centreX, centreY);
  await page.mouse.down({ button: "right" });
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(centreX - step * pixelsPerStep, centreY, { steps: 1 });
    await page.waitForTimeout(40);
  }
  await page.mouse.up({ button: "right" });
}

/** Resamples a polyline so vehicle and foot drivers see evenly spaced targets. */
export function resampleRoute(points: readonly RoutePoint[], spacingMeters: number): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.round(length / spacingMeters));
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      result.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
    }
  }
  return result;
}

/** Portion of a route between two distances along it. */
export function routeSlice<T extends RoutePoint & { distance: number }>(points: readonly T[], fromMeters: number, toMeters: number): T[] {
  return points.filter((point) => point.distance >= fromMeters && point.distance <= toMeters);
}

// ---------------------------------------------------------------------------
// In-page observers and browser-side evidence
// ---------------------------------------------------------------------------

export interface ObservedTask {
  startMs: number;
  durationMs: number;
}

export interface ObservedAnimationFrame extends ObservedTask {
  blockingMs: number;
  scripts: ReadonlyArray<{ durationMs: number; invoker: string; sourceUrl: string; functionName: string }>;
}

/**
 * Long tasks and long animation frames (Chromium) are observed from the first
 * script, so startup stalls outside the game loop are attributed too. The
 * resource buffer is enlarged because the world requests hundreds of models.
 */
export async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(50_000);
    const observed = {
      longTasks: [] as Array<{ startMs: number; durationMs: number }>,
      animationFrames: [] as Array<{
        startMs: number;
        durationMs: number;
        blockingMs: number;
        scripts: Array<{ durationMs: number; invoker: string; sourceUrl: string; functionName: string }>;
      }>
    };
    (window as unknown as { __NEVA_PERF_OBSERVED: typeof observed }).__NEVA_PERF_OBSERVED = observed;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          observed.longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // Not supported: the report records an empty list.
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & {
          blockingDuration?: number;
          scripts?: Array<{ duration: number; invoker?: string; sourceURL?: string; sourceFunctionName?: string }>;
        }>) {
          if (entry.duration < 50) continue;
          observed.animationFrames.push({
            startMs: entry.startTime,
            durationMs: entry.duration,
            blockingMs: entry.blockingDuration ?? 0,
            scripts: [...(entry.scripts ?? [])]
              .sort((left, right) => right.duration - left.duration)
              .slice(0, 3)
              .map((script) => ({
                durationMs: Math.round(script.duration),
                invoker: script.invoker ?? "",
                sourceUrl: (script.sourceURL ?? "").replace(/^.*\/assets\//, ""),
                functionName: script.sourceFunctionName ?? ""
              }))
          });
        }
      }).observe({ type: "long-animation-frame", buffered: true });
    } catch {
      // Long animation frames are Chromium-only.
    }
  });
}

export interface StallSummary {
  count: number;
  totalMs: number;
  maxMs: number;
}

export interface ObservedStalls {
  longTasks: StallSummary;
  animationFrames: StallSummary;
  /** Largest long animation frames with their heaviest scripts. */
  worstAnimationFrames: ObservedAnimationFrame[];
}

export async function observedStallsBetween(page: Page, fromMs: number, toMs: number): Promise<ObservedStalls> {
  const observed = await page.evaluate(() =>
    (window as unknown as { __NEVA_PERF_OBSERVED?: { longTasks: ObservedTask[]; animationFrames: ObservedAnimationFrame[] } })
      .__NEVA_PERF_OBSERVED ?? { longTasks: [], animationFrames: [] });
  const within = <T extends ObservedTask>(entries: readonly T[]): T[] =>
    entries.filter((entry) => entry.startMs >= fromMs && entry.startMs < toMs);
  const summarize = (entries: readonly ObservedTask[]): StallSummary => ({
    count: entries.length,
    totalMs: Math.round(entries.reduce((total, entry) => total + entry.durationMs, 0)),
    maxMs: Math.round(entries.reduce((max, entry) => Math.max(max, entry.durationMs), 0))
  });
  const frames = within(observed.animationFrames);
  return {
    longTasks: summarize(within(observed.longTasks)),
    animationFrames: summarize(frames),
    worstAnimationFrames: [...frames].sort((left, right) => right.durationMs - left.durationMs).slice(0, 5)
      .map((frame) => ({ ...frame, startMs: Math.round(frame.startMs), durationMs: Math.round(frame.durationMs), blockingMs: Math.round(frame.blockingMs) }))
  };
}

export interface TransferSummary {
  requests: number;
  transferBytes: number;
  encodedBytes: number;
  decodedBytes: number;
}

export interface StartupEvidence {
  /** Navigation start to `neva.startup.interactive` (control released). */
  timeToControlMs: number | null;
  domContentLoadedMs: number | null;
  marks: ReadonlyArray<{ name: string; atMs: number }>;
  /** Resources whose response finished before control, by kind. */
  beforeControl: Record<string, TransferSummary> & { total: TransferSummary };
  afterControl: TransferSummary;
}

export async function startupEvidence(page: Page): Promise<StartupEvidence> {
  return page.evaluate(() => {
    const marks = performance.getEntriesByType("mark")
      .filter((mark) => mark.name.startsWith("neva.startup."))
      .map((mark) => ({ name: mark.name.replace("neva.startup.", ""), atMs: Math.round(mark.startTime) }));
    const control = marks.find((mark) => mark.name === "interactive")?.atMs ?? null;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const kindOf = (url: string): string => {
      const pathname = new URL(url, location.href).pathname;
      if (/\.glb$/.test(pathname)) return "model";
      if (/\.(webp|png|jpe?g|ktx2|avif)$/.test(pathname)) return "image";
      if (/\.m?js$/.test(pathname)) return "script";
      if (/\.wasm$/.test(pathname)) return "wasm";
      if (/\.css$/.test(pathname)) return "style";
      if (/\.(mp3|ogg|m4a|wav|webm|mp4)$/.test(pathname)) return "media";
      if (/\.(json|bin)$/.test(pathname)) return "data";
      if (/\.(woff2?|ttf|otf)$/.test(pathname) || /fonts\.g/.test(url)) return "font";
      return "other";
    };
    const empty = () => ({ requests: 0, transferBytes: 0, encodedBytes: 0, decodedBytes: 0 });
    const beforeControl: Record<string, ReturnType<typeof empty>> = { total: empty() };
    const afterControl = empty();
    for (const entry of performance.getEntriesByType("resource") as PerformanceResourceTiming[]) {
      const add = (bucket: ReturnType<typeof empty>) => {
        bucket.requests += 1;
        bucket.transferBytes += entry.transferSize;
        bucket.encodedBytes += entry.encodedBodySize;
        bucket.decodedBytes += entry.decodedBodySize;
      };
      if (control !== null && entry.responseEnd <= control) {
        const kind = kindOf(entry.name);
        add(beforeControl[kind] ??= empty());
        add(beforeControl.total);
      } else {
        add(afterControl);
      }
    }
    return {
      timeToControlMs: control,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      marks,
      beforeControl: beforeControl as StartupEvidence["beforeControl"],
      afterControl
    };
  });
}

/** Chromium task/script/layout counters; deltas attribute main-thread time a window's rings cannot see. */
export async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

export function cdpDelta(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const keys = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "V8CompileDuration",
    "LayoutCount", "RecalcStyleCount"];
  const delta: Record<string, number> = {};
  for (const key of keys) {
    const value = (after[key] ?? 0) - (before[key] ?? 0);
    // Durations are reported in seconds.
    delta[key.endsWith("Duration") ? `${key}Ms` : key] = key.endsWith("Duration")
      ? Math.round(value * 1000)
      : value;
  }
  return delta;
}

/** Forces a major GC, then reads the settled heap. Only between measured windows. */
export async function settledHeapBytes(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = await cdpMetrics(cdp);
  return metrics.JSHeapUsedSize ?? 0;
}

// ---------------------------------------------------------------------------
// Run summary
// ---------------------------------------------------------------------------

type WindowReport = NonNullable<ReturnType<NonNullable<Window["__NEVA_DEBUG"]>["endPerformanceWindow"]>>;

export interface PassRecord {
  label: "first-use" | "warm";
  window: WindowReport;
  drive: DriveResult | null;
  cdp: Record<string, number>;
  stalls: ObservedStalls;
  events: ReadonlyArray<Record<string, unknown>>;
}

export interface BaselineRunRecord {
  scenario: string;
  covers: readonly string[];
  repetition: number;
  query: string;
  identity: Record<string, unknown>;
  startup: StartupEvidence & { stalls: ObservedStalls };
  cachedStartup?: StartupEvidence & {
    stalls: ObservedStalls;
    cacheCondition: string;
    startPose: PoseSample;
  };
  passes: PassRecord[];
  heap: { afterFirstUseBytes: number; afterWarmBytes: number };
  runtimeErrors: string[];
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const spread = (values: readonly number[]): { median: number; min: number; max: number; runs: number } => ({
  median: Number(median(values).toFixed(2)),
  min: Number(Math.min(...values).toFixed(2)),
  max: Number(Math.max(...values).toFixed(2)),
  runs: values.length
});

/**
 * Phases that partition a parent. Ranking uses leaves so a cost is counted
 * once, and each parent contributes its unattributed remainder as
 * `<parent>:other`: `frame` ⊃ top-level phases; `render` ⊃
 * `render:world-update` (⊃ `wu:*`) and `render:pipeline`; `sync:scene` ⊃ the
 * `sync:*` scene sub-phases; `sync` ⊃ the `env:*` environment sub-phases.
 */
const TOP_LEVEL_PHASES = ["physics", "simulation", "sync:scene", "sync", "camera", "audio+interaction", "render", "overlays", "ui"];
function phaseChildren(parent: string, phases: ReadonlySet<string>): string[] {
  const all = [...phases];
  switch (parent) {
    case "frame": return TOP_LEVEL_PHASES.filter((phase) => phases.has(phase));
    case "render": return all.filter((phase) => phase === "render:world-update" || phase === "render:pipeline");
    case "render:world-update": return all.filter((phase) => phase.startsWith("wu:"));
    case "sync:scene": return all.filter((phase) => phase.startsWith("sync:") && phase !== "sync:scene");
    case "sync": return all.filter((phase) => phase.startsWith("env:"));
    default: return [];
  }
}

function startupStages(marks: ReadonlyArray<{ name: string; atMs: number }>): Record<string, number> {
  const at = (name: string) => marks.find((mark) => mark.name === name)?.atMs;
  const stage = (from: string, to: string) => {
    const start = at(from);
    const end = at(to);
    return start === undefined || end === undefined ? undefined : end - start;
  };
  const stages: Record<string, number | undefined> = {
    "navigation→begin": at("begin"),
    "layout (traversal + bake)": stage("layout", "assets"),
    "asset transfer + decode": stage("assets", "scenery-ready"),
    "world geometry": stage("world", "geometry-ready"),
    "prefab population": stage("geometry-ready", "population-ready"),
    "physics": stage("physics", "presentation"),
    "presentation + shader warm-up": stage("presentation", "technical-ready"),
    "reveal → control": stage("technical-ready", "interactive")
  };
  return Object.fromEntries(Object.entries(stages).filter((entry): entry is [string, number] => entry[1] !== undefined));
}

export function writeBaselineSummary(runDirectory: string): { jsonPath: string; markdownPath: string } | null {
  const records: BaselineRunRecord[] = fs.readdirSync(runDirectory)
    .filter((name) => /^baseline-.*-r\d+\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(runDirectory, name), "utf8")) as BaselineRunRecord);
  if (records.length === 0) return null;
  const byScenario = new Map<string, BaselineRunRecord[]>();
  for (const record of records) byScenario.set(record.scenario, [...(byScenario.get(record.scenario) ?? []), record]);

  const scenarios = [...byScenario.entries()].map(([scenario, runs]) => {
    const pass = (label: PassRecord["label"]) => runs.map((run) => run.passes.find((entry) => entry.label === label)).filter(Boolean) as PassRecord[];
    const passSummary = (label: PassRecord["label"]) => {
      const passes = pass(label);
      if (passes.length === 0) return null;
      const minutes = (entry: PassRecord) => Math.max(entry.window.durationMs / 60_000, 1e-6);
      return {
        frameP50Ms: spread(passes.map((entry) => entry.window.frames.p50Ms)),
        frameP95Ms: spread(passes.map((entry) => entry.window.frames.p95Ms)),
        frameP99Ms: spread(passes.map((entry) => entry.window.frames.p99Ms)),
        frameMaxMs: spread(passes.map((entry) => entry.window.frames.maxMs)),
        stallsPerMinute: spread(passes.map((entry) => entry.window.frames.stallsOver50Ms / minutes(entry))),
        cpuFrameMeanMs: spread(passes.map((entry) => entry.window.phases.find((phase) => phase.phase === "frame")?.meanMs ?? 0)),
        gpuFrameP50Ms: spread(passes.map((entry) => entry.window.gpu?.p50Milliseconds ?? Number.NaN).filter(Number.isFinite)),
        drawsP50: spread(passes.map((entry) => entry.window.draws.p50)),
        drawsMax: spread(passes.map((entry) => entry.window.draws.max)),
        trianglesP50: spread(passes.map((entry) => entry.window.triangles.p50)),
        longTaskMaxMs: spread(passes.map((entry) => entry.stalls.longTasks.maxMs)),
        distanceMeters: spread(passes.map((entry) => entry.drive?.distanceMeters ?? 0)),
        skippedWaypoints: passes.reduce((total, entry) => total + (entry.drive?.skippedWaypoints ?? 0), 0)
      };
    };
    const stageNames = new Set(runs.flatMap((run) => Object.keys(startupStages(run.startup.marks))));
    const cached = runs.flatMap((run) => run.cachedStartup ? [run.cachedStartup] : []);
    return {
      scenario,
      covers: runs[0].covers,
      runs: runs.length,
      startup: {
        timeToControlMs: spread(runs.map((run) => run.startup.timeToControlMs ?? Number.NaN).filter(Number.isFinite)),
        stages: Object.fromEntries([...stageNames].map((name) => [name,
          spread(runs.map((run) => startupStages(run.startup.marks)[name]).filter((value) => value !== undefined))])),
        transferBeforeControlBytes: spread(runs.map((run) => run.startup.beforeControl.total.transferBytes)),
        decodedBeforeControlBytes: spread(runs.map((run) => run.startup.beforeControl.total.decodedBytes)),
        longTaskMaxMs: spread(runs.map((run) => run.startup.stalls.longTasks.maxMs))
      },
      cachedStartup: cached.length > 0 ? {
        cacheCondition: cached[0].cacheCondition,
        timeToControlMs: spread(cached.map((entry) => entry.timeToControlMs ?? Number.NaN).filter(Number.isFinite)),
        transferBeforeControlBytes: spread(cached.map((entry) => entry.beforeControl.total.transferBytes)),
        longTaskMaxMs: spread(cached.map((entry) => entry.stalls.longTasks.maxMs))
      } : null,
      firstUse: passSummary("first-use"),
      warm: passSummary("warm"),
      heap: {
        afterFirstUseMiB: spread(runs.map((run) => run.heap.afterFirstUseBytes / 2 ** 20)),
        afterWarmMiB: spread(runs.map((run) => run.heap.afterWarmBytes / 2 ** 20))
      }
    };
  });

  // Ranked recurring CPU cost: warm-pass leaf phases by mean ms per frame.
  const cpuCosts: Array<{ scenario: string; phase: string; meanMs: ReturnType<typeof spread>; p95Ms: ReturnType<typeof spread> }> = [];
  const gpuCosts: Array<{ scenario: string; pass: string; p50Ms: ReturnType<typeof spread> }> = [];
  for (const [scenario, runs] of byScenario) {
    const warm = runs.map((run) => run.passes.find((entry) => entry.label === "warm")).filter(Boolean) as PassRecord[];
    const phases = new Set(warm.flatMap((entry) => entry.window.phases.map((phase) => phase.phase)));
    const meanOf = (entry: PassRecord, phase: string) => entry.window.phases.find((candidate) => candidate.phase === phase)?.meanMs ?? 0;
    for (const phase of phases) {
      const children = phaseChildren(phase, phases);
      if (children.length > 0) {
        // Remainder only; its p95 is not derivable from the children.
        const remainders = warm.map((entry) => Math.max(0, meanOf(entry, phase)
          - children.reduce((total, child) => total + meanOf(entry, child), 0)));
        cpuCosts.push({ scenario, phase: `${phase}:other`, meanMs: spread(remainders), p95Ms: spread([Number.NaN]) });
        continue;
      }
      if (phase === "frame") continue;
      const samples = warm.map((entry) => entry.window.phases.find((candidate) => candidate.phase === phase)).filter(Boolean);
      cpuCosts.push({
        scenario,
        phase,
        meanMs: spread(samples.map((sample) => sample!.meanMs)),
        p95Ms: spread(samples.map((sample) => sample!.p95Ms))
      });
    }
    const passes = new Set(warm.flatMap((entry) => entry.window.gpu?.passes.map((gpuPass) => gpuPass.name) ?? []));
    for (const name of passes) {
      const values = warm.map((entry) => entry.window.gpu?.passes.find((gpuPass) => gpuPass.name === name)?.p50Milliseconds)
        .filter((value): value is number => typeof value === "number");
      if (values.length > 0) gpuCosts.push({ scenario, pass: name, p50Ms: spread(values) });
    }
  }
  cpuCosts.sort((left, right) => right.meanMs.median - left.meanMs.median);
  gpuCosts.sort((left, right) => right.p50Ms.median - left.p50Ms.median);

  const oneOff: Array<{ scenario: string; cost: string; ms: ReturnType<typeof spread> }> = [];
  for (const [scenario, runs] of byScenario) {
    const stageNames = new Set(runs.flatMap((run) => Object.keys(startupStages(run.startup.marks))));
    for (const name of stageNames) {
      const values = runs.map((run) => startupStages(run.startup.marks)[name]).filter((value) => value !== undefined);
      oneOff.push({ scenario, cost: `startup: ${name}`, ms: spread(values) });
    }
    for (const label of ["first-use", "warm"] as const) {
      const passes = runs.map((run) => run.passes.find((entry) => entry.label === label)).filter(Boolean) as PassRecord[];
      oneOff.push({ scenario, cost: `${label}: worst frame`, ms: spread(passes.map((entry) => entry.window.frames.maxMs)) });
      const eventNames = new Set(passes.flatMap((entry) => entry.events.map((event) => String(event.name))));
      for (const name of eventNames) {
        const values = passes.flatMap((entry) => entry.events.filter((event) => event.name === name).map((event) => Number(event.durationMs)))
          .filter(Number.isFinite);
        if (values.length > 0) oneOff.push({ scenario, cost: `${label}: ${name}`, ms: spread(values) });
      }
    }
  }
  oneOff.sort((left, right) => right.ms.median - left.ms.median);

  const identity = records[0].identity;
  const summary = { generatedAt: new Date().toISOString(), identity, scenarios, ranked: { cpuCosts, gpuCosts, oneOff } };
  const jsonPath = path.join(runDirectory, "performance-baseline-summary.json");
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 1));

  const format = (value: ReturnType<typeof spread>, digits = 1) => !Number.isFinite(value.median)
    ? "–"
    : value.runs > 1
      ? `${value.median.toFixed(digits)} (${value.min.toFixed(digits)}–${value.max.toFixed(digits)})`
      : value.median.toFixed(digits);
  const lines: string[] = [
    "# Performance baseline",
    "",
    `Generated ${summary.generatedAt}. Values are medians across repetitions with the (min–max) run range; `
      + "a difference inside that range is measurement noise, not an improvement.",
    "",
    "## Identity",
    "",
    "```json",
    JSON.stringify(identity, null, 1),
    "```",
    "",
    "## Scenarios (warm pass unless noted)",
    "",
    "| Scenario | Runs | Control (s) | Frame p50 | p95 | p99 | Stalls/min | CPU frame mean | GPU p50 | Draws p50 | Heap after warm (MiB) |",
    "|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  for (const scenario of scenarios) {
    const warm = scenario.warm;
    lines.push(`| ${scenario.scenario} | ${scenario.runs} | ${format({ ...scenario.startup.timeToControlMs,
      median: scenario.startup.timeToControlMs.median / 1000, min: scenario.startup.timeToControlMs.min / 1000,
      max: scenario.startup.timeToControlMs.max / 1000 })} | ${warm ? format(warm.frameP50Ms) : "–"} | ${warm ? format(warm.frameP95Ms) : "–"} | `
      + `${warm ? format(warm.frameP99Ms) : "–"} | ${warm ? format(warm.stallsPerMinute) : "–"} | ${warm ? format(warm.cpuFrameMeanMs) : "–"} | `
      + `${warm && warm.gpuFrameP50Ms.runs > 0 ? format(warm.gpuFrameP50Ms) : "–"} | ${warm ? format(warm.drawsP50, 0) : "–"} | ${format(scenario.heap.afterWarmMiB, 0)} |`);
  }
  const cachedScenarios = scenarios.filter((scenario) => scenario.cachedStartup !== null);
  if (cachedScenarios.length > 0) {
    lines.push("", "## Cached startup", "",
      "Same disposable browser/context after the measured passes. Its IndexedDB is reset to preserve the starting world; HTTP/shader caches remain warm.", "",
      "| Scenario | Samples | Control (ms) | Transfer before control (bytes) | Worst long task (ms) |",
      "|---|---|---|---|---|");
    for (const scenario of cachedScenarios) {
      const cached = scenario.cachedStartup!;
      lines.push(`| ${scenario.scenario} | ${cached.timeToControlMs.runs} | ${format(cached.timeToControlMs, 0)} | `
        + `${format(cached.transferBeforeControlBytes, 0)} | ${format(cached.longTaskMaxMs, 0)} |`);
    }
  }
  lines.push("", "## Ranked recurring CPU cost (warm pass, leaf phases, mean ms per frame)", "",
    "| # | Scenario | Phase | Mean ms | p95 ms |", "|---|---|---|---|---|");
  cpuCosts.slice(0, 25).forEach((cost, index) => lines.push(`| ${index + 1} | ${cost.scenario} | ${cost.phase} | ${format(cost.meanMs, 2)} | ${format(cost.p95Ms, 2)} |`));
  lines.push("", "## Ranked GPU pass cost (warm pass, p50 ms; timer queries on this driver are indicative)", "",
    "| # | Scenario | Pass | p50 ms |", "|---|---|---|---|");
  gpuCosts.slice(0, 20).forEach((cost, index) => lines.push(`| ${index + 1} | ${cost.scenario} | ${cost.pass} | ${format(cost.p50Ms, 2)} |`));
  lines.push("", "## Ranked one-off costs (startup stages, worst frames, scripted events; ms)", "",
    "| # | Scenario | Cost | ms |", "|---|---|---|---|");
  oneOff.slice(0, 30).forEach((cost, index) => lines.push(`| ${index + 1} | ${cost.scenario} | ${cost.cost} | ${format(cost.ms, 0)} |`));
  const markdownPath = path.join(runDirectory, "performance-baseline-summary.md");
  fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`);
  return { jsonPath, markdownPath };
}

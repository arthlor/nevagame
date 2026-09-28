/**
 * Debug-only measurement window for sustained gameplay routes.
 *
 * The always-on diagnostic rings in `GameApp` keep the last few seconds, which
 * is enough to describe a settled camera but not a 20-second walk, and their
 * stall counter runs from boot so startup and first-use compilation leak into
 * every later reading. A window records every visible frame between an
 * explicit begin and end, so a harness can separate cold startup, first-use and
 * warmed play over the same route. Presentation diagnostics only: nothing here
 * reads or writes simulation state.
 */

export interface DistributionSummary {
  samples: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface PerformanceWindowPhase extends DistributionSummary {
  phase: string;
  /** Sum over the window; divide by frames for the per-frame share. */
  totalMs: number;
}

export interface CountSummary {
  p50: number;
  p95: number;
  max: number;
}

export interface PerformanceWindowSummary {
  label: string;
  durationMs: number;
  /** True when the sample cap was reached and later frames were not recorded. */
  truncated: boolean;
  frames: DistributionSummary & {
    stallsOver50Ms: number;
    framesOver33Ms: number;
    framesOver16_7Ms: number;
  };
  /** Main-thread phase rings, largest p95 first. */
  phases: readonly PerformanceWindowPhase[];
  draws: CountSummary;
  triangles: CountSummary;
}

/** About six minutes at 60 Hz; a route that needs more should be split. */
export const PERFORMANCE_WINDOW_SAMPLE_CAP = 21_600;

/** Nearest-rank percentile of an ascending array. */
export function nearestRank(sorted: ArrayLike<number>, fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

export function summarizeDistribution(values: readonly number[]): DistributionSummary {
  if (values.length === 0) return { samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  const sorted = Float64Array.from(values).sort();
  let total = 0;
  for (const value of values) total += value;
  return {
    samples: values.length,
    meanMs: round(total / values.length),
    p50Ms: round(nearestRank(sorted, 0.5)),
    p95Ms: round(nearestRank(sorted, 0.95)),
    p99Ms: round(nearestRank(sorted, 0.99)),
    maxMs: round(sorted[sorted.length - 1])
  };
}

function summarizeCounts(values: readonly number[]): CountSummary {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = Float64Array.from(values).sort();
  return {
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    max: sorted[sorted.length - 1]
  };
}

export class PerformanceWindow {
  private readonly frames: number[] = [];
  private readonly phases = new Map<string, number[]>();
  private readonly draws: number[] = [];
  private readonly triangles: number[] = [];
  private truncated = false;

  constructor(
    public readonly label: string,
    private readonly startedAtMs: number,
    private readonly sampleCap = PERFORMANCE_WINDOW_SAMPLE_CAP
  ) {}

  /** Raw elapsed time of one visible frame. */
  public recordFrame(elapsedMs: number): void {
    if (this.frames.length >= this.sampleCap) {
      this.truncated = true;
      return;
    }
    this.frames.push(elapsedMs);
  }

  public recordPhase(phase: string, elapsedMs: number): void {
    let samples = this.phases.get(phase);
    if (!samples) {
      samples = [];
      this.phases.set(phase, samples);
    }
    if (samples.length < this.sampleCap) samples.push(elapsedMs);
  }

  /** Submitted work of one rendered frame, including shadow and capture passes. */
  public recordRender(drawCalls: number, triangles: number): void {
    if (this.draws.length >= this.sampleCap) return;
    this.draws.push(drawCalls);
    this.triangles.push(triangles);
  }

  public summary(endedAtMs: number): PerformanceWindowSummary {
    let stalls = 0;
    let over33 = 0;
    let over16 = 0;
    for (const frame of this.frames) {
      if (frame > 50) stalls += 1;
      if (frame > 33.4) over33 += 1;
      if (frame > 16.7) over16 += 1;
    }
    const phases = [...this.phases.entries()].map(([phase, samples]) => {
      let total = 0;
      for (const sample of samples) total += sample;
      return { phase, ...summarizeDistribution(samples), totalMs: round(total, 1) };
    }).sort((left, right) => right.p95Ms - left.p95Ms || right.totalMs - left.totalMs);
    return {
      label: this.label,
      durationMs: round(endedAtMs - this.startedAtMs, 1),
      truncated: this.truncated,
      frames: {
        ...summarizeDistribution(this.frames),
        stallsOver50Ms: stalls,
        framesOver33Ms: over33,
        framesOver16_7Ms: over16
      },
      phases,
      draws: summarizeCounts(this.draws),
      triangles: summarizeCounts(this.triangles)
    };
  }
}

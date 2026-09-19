export interface GpuPassTimingSnapshot {
  name: string;
  samples: number;
  p50Milliseconds: number | null;
  p95Milliseconds: number | null;
}

export interface GpuFrameTimingSnapshot {
  supported: boolean;
  blockedReason: string | null;
  softwareRenderer: boolean;
  renderer: string;
  sampleCount: number;
  disjointCount: number;
  p50Milliseconds: number | null;
  p95Milliseconds: number | null;
  /** Named pass costs. Empty unless pass timing was explicitly enabled. */
  passes: readonly GpuPassTimingSnapshot[];
}

interface TimerQueryExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface PendingQuery {
  query: WebGLQuery;
  ended: boolean;
  /** null measures the whole frame; a name measures one named segment. */
  pass: string | null;
  frame: number;
}

interface FrameAccumulator {
  totals: Map<string, number>;
  pending: number;
}

function percentile(samples: readonly number[], amount: number): number | null {
  if (samples.length === 0) return null;
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * amount) - 1));
  return ordered[index];
}

function roundedPercentiles(samples: readonly number[]): { p50: number | null; p95: number | null } {
  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  return {
    p50: p50 === null ? null : Number(p50.toFixed(4)),
    p95: p95 === null ? null : Number(p95.toFixed(4))
  };
}

/**
 * Non-blocking WebGL2 timer-query ring. Results are polled on later frames.
 *
 * A context allows one active query per target, so named passes cannot nest.
 * Pass timing therefore alternates with whole-frame timing: each frame runs
 * either one frame query or a sequence of pass queries. Segments sharing a
 * pass name inside one frame (the scene splits around the water capture blit)
 * are summed into one sample before being recorded.
 */
export class GpuFrameTimer {
  private readonly extension: TimerQueryExtension | null;
  private readonly pending: PendingQuery[] = [];
  private readonly samples: number[] = [];
  private readonly passSamples = new Map<string, number[]>();
  private readonly frameAccumulators = new Map<number, FrameAccumulator>();
  private active: PendingQuery | null = null;
  private disjointCount = 0;
  private frameSequence = 0;
  private frameParity = 0;
  private passTimingEnabled = false;
  private passModeThisFrame = false;
  private readonly rendererName: string;
  private readonly softwareRenderer: boolean;

  private static readonly MAX_PENDING_QUERIES = 24;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerQueryExtension | null;
    const debug = gl.getExtension("WEBGL_debug_renderer_info") as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    this.rendererName = debug
      ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) ?? "unknown")
      : String(gl.getParameter(gl.RENDERER) ?? "unknown");
    this.softwareRenderer = /swiftshader|llvmpipe|software/i.test(this.rendererName);
  }

  /** Enables alternating per-pass measurement. Off by default: debug/acceptance only. */
  public setPassTimingEnabled(enabled: boolean): void {
    this.passTimingEnabled = enabled;
  }

  public get currentPassName(): string | null {
    return this.active?.pass ?? null;
  }

  /**
   * Starts a measurement frame and returns whether this frame measures named
   * passes instead of the whole frame.
   */
  public beginFrame(): boolean {
    this.poll();
    this.passModeThisFrame = false;
    this.frameSequence += 1;
    if (!this.extension || this.active || this.pending.length >= GpuFrameTimer.MAX_PENDING_QUERIES) {
      return false;
    }
    this.frameParity ^= 1;
    if (this.passTimingEnabled && this.frameParity === 1) {
      this.passModeThisFrame = true;
      this.frameAccumulators.set(this.frameSequence, { totals: new Map(), pending: 0 });
      return true;
    }
    this.enqueue(null);
    return false;
  }

  /** Ends the current pass segment (if any) and starts `name`. */
  public beginPass(name: string): void {
    if (!this.passModeThisFrame) return;
    this.endActive();
    this.enqueue(name);
  }

  public endFrame(): void {
    if (!this.extension) return;
    if (this.passModeThisFrame) {
      this.endActive();
      const accumulator = this.frameAccumulators.get(this.frameSequence);
      if (accumulator && accumulator.pending === 0 && accumulator.totals.size === 0) {
        this.frameAccumulators.delete(this.frameSequence);
      }
      return;
    }
    this.endActive();
  }

  public snapshot(): GpuFrameTimingSnapshot {
    this.poll();
    const supported = this.extension !== null;
    const passSampleCount = [...this.passSamples.values()].reduce((sum, samples) => sum + samples.length, 0);
    const blockedReason = !supported
      ? "EXT_disjoint_timer_query_webgl2 unavailable"
      : this.softwareRenderer
        ? "software renderer is not valid hardware evidence"
        : this.samples.length === 0 && passSampleCount === 0
          ? "GPU timer queries have not produced a valid sample"
          : null;
    const framePercentiles = roundedPercentiles(this.samples);
    return {
      supported,
      blockedReason,
      softwareRenderer: this.softwareRenderer,
      renderer: this.rendererName,
      sampleCount: this.samples.length,
      disjointCount: this.disjointCount,
      p50Milliseconds: framePercentiles.p50,
      p95Milliseconds: framePercentiles.p95,
      passes: [...this.passSamples.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, samples]) => {
        const percentiles = roundedPercentiles(samples);
        return {
          name,
          samples: samples.length,
          p50Milliseconds: percentiles.p50,
          p95Milliseconds: percentiles.p95
        };
      })
    };
  }

  public dispose(): void {
    if (this.active) this.gl.deleteQuery(this.active.query);
    for (const pending of this.pending) this.gl.deleteQuery(pending.query);
    this.active = null;
    this.pending.length = 0;
    this.samples.length = 0;
    this.passSamples.clear();
    this.frameAccumulators.clear();
  }

  private enqueue(pass: string | null): void {
    if (!this.extension) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = { query, ended: false, pass, frame: this.frameSequence };
    if (this.passModeThisFrame && pass !== null) {
      const accumulator = this.frameAccumulators.get(this.frameSequence);
      if (accumulator) accumulator.pending += 1;
    }
  }

  private endActive(): void {
    if (!this.active) return;
    this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
    this.active.ended = true;
    this.pending.push(this.active);
    this.active = null;
  }

  private poll(): void {
    if (!this.extension || this.pending.length === 0) return;
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT) === true) {
      this.disjointCount += 1;
      for (const pending of this.pending) this.gl.deleteQuery(pending.query);
      this.pending.length = 0;
      this.frameAccumulators.clear();
      return;
    }
    // Scan the whole ring rather than only the head: a driver can hold one
    // result back while later queries are ready, and a blocked head would
    // otherwise freeze every pass sample for the rest of the session.
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const pending = this.pending[index];
      if (!pending.ended || this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT_AVAILABLE) !== true) continue;
      const nanoseconds = Number(this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT));
      this.gl.deleteQuery(pending.query);
      this.pending.splice(index, 1);
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) continue;
      const milliseconds = nanoseconds / 1_000_000;
      if (pending.pass === null) {
        this.samples.push(milliseconds);
        if (this.samples.length > 240) this.samples.shift();
        continue;
      }
      const accumulator = this.frameAccumulators.get(pending.frame);
      if (!accumulator) continue;
      accumulator.totals.set(pending.pass, (accumulator.totals.get(pending.pass) ?? 0) + milliseconds);
      accumulator.pending -= 1;
      if (accumulator.pending > 0) continue;
      for (const [name, total] of accumulator.totals) {
        const samples = this.passSamples.get(name) ?? [];
        samples.push(total);
        if (samples.length > 240) samples.shift();
        this.passSamples.set(name, samples);
      }
      this.frameAccumulators.delete(pending.frame);
    }
  }
}

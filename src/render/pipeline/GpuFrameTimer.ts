export interface GpuFrameTimingSnapshot {
  supported: boolean;
  blockedReason: string | null;
  softwareRenderer: boolean;
  renderer: string;
  sampleCount: number;
  disjointCount: number;
  p50Milliseconds: number | null;
  p95Milliseconds: number | null;
}

interface TimerQueryExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface PendingQuery {
  query: WebGLQuery;
  ended: boolean;
}

function percentile(samples: readonly number[], amount: number): number | null {
  if (samples.length === 0) return null;
  const ordered = [...samples].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * amount) - 1));
  return ordered[index];
}

/** Non-blocking WebGL2 timer-query ring. Results are polled on later frames. */
export class GpuFrameTimer {
  private readonly extension: TimerQueryExtension | null;
  private readonly pending: PendingQuery[] = [];
  private readonly samples: number[] = [];
  private active: PendingQuery | null = null;
  private disjointCount = 0;
  private readonly rendererName: string;
  private readonly softwareRenderer: boolean;

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

  public beginFrame(): void {
    this.poll();
    if (!this.extension || this.active || this.pending.length >= 8) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = { query, ended: false };
  }

  public endFrame(): void {
    if (!this.extension || !this.active) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.active.ended = true;
    this.pending.push(this.active);
    this.active = null;
  }

  public snapshot(): GpuFrameTimingSnapshot {
    this.poll();
    const supported = this.extension !== null;
    const blockedReason = !supported
      ? "EXT_disjoint_timer_query_webgl2 unavailable"
      : this.softwareRenderer
        ? "software renderer is not valid hardware evidence"
        : this.samples.length === 0
          ? "GPU timer queries have not produced a valid sample"
          : null;
    return {
      supported,
      blockedReason,
      softwareRenderer: this.softwareRenderer,
      renderer: this.rendererName,
      sampleCount: this.samples.length,
      disjointCount: this.disjointCount,
      p50Milliseconds: percentile(this.samples, 0.5),
      p95Milliseconds: percentile(this.samples, 0.95)
    };
  }

  public dispose(): void {
    if (this.active) this.gl.deleteQuery(this.active.query);
    for (const pending of this.pending) this.gl.deleteQuery(pending.query);
    this.active = null;
    this.pending.length = 0;
    this.samples.length = 0;
  }

  private poll(): void {
    if (!this.extension || this.pending.length === 0) return;
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT) === true) {
      this.disjointCount += 1;
      for (const pending of this.pending) this.gl.deleteQuery(pending.query);
      this.pending.length = 0;
      return;
    }
    while (this.pending.length > 0) {
      const pending = this.pending[0];
      if (!pending.ended || this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT_AVAILABLE) !== true) break;
      const nanoseconds = Number(this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT));
      this.gl.deleteQuery(pending.query);
      this.pending.shift();
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) continue;
      this.samples.push(nanoseconds / 1_000_000);
      if (this.samples.length > 240) this.samples.shift();
    }
  }
}

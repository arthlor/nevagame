import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { GpuFrameTimer } from "../../src/render/pipeline/GpuFrameTimer";
import { renderTargetDiagnostic } from "../../src/render/pipeline/RendererPipeline";

interface MockTimerContextOptions {
  extension?: boolean;
  renderer?: string;
  disjoint?: boolean;
  results?: number[];
}

function mockTimerContext(options: MockTimerContextOptions = {}): WebGL2RenderingContext {
  const extension = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const debug = { UNMASKED_RENDERER_WEBGL: 0x9246 };
  const results = [...(options.results ?? [])];
  const queryResults = new Map<object, number>();
  return {
    RENDERER: 0x1f01,
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    getExtension(name: string) {
      if (name === "EXT_disjoint_timer_query_webgl2") return options.extension === false ? null : extension;
      if (name === "WEBGL_debug_renderer_info") return debug;
      return null;
    },
    getParameter(parameter: number) {
      if (parameter === extension.GPU_DISJOINT_EXT) return options.disjoint ?? false;
      if (parameter === debug.UNMASKED_RENDERER_WEBGL || parameter === 0x1f01) {
        return options.renderer ?? "Apple M-series";
      }
      return null;
    },
    createQuery() {
      const query = {};
      queryResults.set(query, results.shift() ?? 1_000_000);
      return query;
    },
    beginQuery() {},
    endQuery() {},
    deleteQuery() {},
    getQueryParameter(query: object, parameter: number) {
      if (parameter === 0x8867) return true;
      return queryResults.get(query) ?? 0;
    }
  } as unknown as WebGL2RenderingContext;
}

describe("GPU frame timing and render-target diagnostics", () => {
  it("reports unsupported and software-rendered evidence as explicitly blocked", () => {
    const unsupported = new GpuFrameTimer(mockTimerContext({ extension: false }));
    expect(unsupported.snapshot()).toMatchObject({
      supported: false,
      blockedReason: "EXT_disjoint_timer_query_webgl2 unavailable",
      sampleCount: 0
    });

    const software = new GpuFrameTimer(mockTimerContext({ renderer: "ANGLE SwiftShader" }));
    software.beginFrame();
    software.endFrame();
    expect(software.snapshot()).toMatchObject({
      supported: true,
      softwareRenderer: true,
      blockedReason: "software renderer is not valid hardware evidence"
    });
  });

  it("polls completed queries without blocking and reports p50/p95 milliseconds", () => {
    const timer = new GpuFrameTimer(mockTimerContext({ results: [1_000_000, 3_000_000, 2_000_000] }));
    for (let index = 0; index < 3; index++) {
      timer.beginFrame();
      timer.endFrame();
    }
    expect(timer.snapshot()).toMatchObject({
      blockedReason: null,
      sampleCount: 3,
      p50Milliseconds: 2,
      p95Milliseconds: 3
    });
  });

  it("discards pending samples when the context reports a disjoint event", () => {
    const timer = new GpuFrameTimer(mockTimerContext({ disjoint: true }));
    timer.beginFrame();
    timer.endFrame();
    expect(timer.snapshot()).toMatchObject({
      sampleCount: 0,
      disjointCount: 1,
      blockedReason: "GPU timer queries have not produced a valid sample"
    });
  });

  it("accounts for color, multisample, depth, and stencil storage", () => {
    const target = new THREE.WebGLRenderTarget(10, 20, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true
    });
    target.samples = 4;
    expect(renderTargetDiagnostic("test", target)).toMatchObject({
      id: "test",
      width: 10,
      height: 20,
      samples: 4,
      depthBuffer: true,
      stencilBuffer: true,
      estimatedBytes: 9_600
    });
    target.dispose();
  });
});

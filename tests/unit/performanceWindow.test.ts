import { describe, expect, it } from "vitest";
import { nearestRank, PerformanceWindow, summarizeDistribution } from "../../src/app/PerformanceWindow";

describe("PerformanceWindow", () => {
  it("uses nearest-rank percentiles so a single long frame reaches p99 of a short window", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(nearestRank(sorted, 0.5)).toBe(5);
    expect(nearestRank(sorted, 0.95)).toBe(10);
    expect(nearestRank([], 0.5)).toBe(0);
    const frames = [...Array.from({ length: 99 }, () => 16.7), 120];
    expect(summarizeDistribution(frames)).toMatchObject({ samples: 100, p50Ms: 16.7, p99Ms: 16.7, maxMs: 120 });
  });

  it("counts every frame of the window, not a trailing ring, and separates stall bands", () => {
    const window = new PerformanceWindow("route", 1_000);
    for (let frame = 0; frame < 600; frame += 1) window.recordFrame(frame % 100 === 0 ? 60 : 16.6);
    window.recordFrame(40);
    window.recordFrame(20);
    const summary = window.summary(11_000);
    expect(summary.label).toBe("route");
    expect(summary.durationMs).toBe(10_000);
    expect(summary.frames.samples).toBe(602);
    expect(summary.frames.stallsOver50Ms).toBe(6);
    expect(summary.frames.framesOver33Ms).toBe(7);
    expect(summary.frames.framesOver16_7Ms).toBe(8);
    expect(summary.truncated).toBe(false);
  });

  it("ranks phases by p95 and keeps totals for per-frame share", () => {
    const window = new PerformanceWindow("phases", 0);
    for (let frame = 0; frame < 20; frame += 1) {
      window.recordPhase("render", 8);
      window.recordPhase("sync", frame === 19 ? 30 : 1);
    }
    const [first, second] = window.summary(1_000).phases;
    expect(first).toMatchObject({ phase: "render", p95Ms: 8, totalMs: 160 });
    // One 30 ms outlier in twenty frames is visible at max, not at p95.
    expect(second).toMatchObject({ phase: "sync", p95Ms: 1, maxMs: 30, totalMs: 49 });
  });

  it("summarizes submitted draws and triangles per rendered frame", () => {
    const window = new PerformanceWindow("render", 0);
    window.recordRender(300, 900_000);
    window.recordRender(420, 1_200_000);
    window.recordRender(310, 910_000);
    const summary = window.summary(100);
    expect(summary.draws).toEqual({ p50: 310, p95: 420, max: 420 });
    expect(summary.triangles.max).toBe(1_200_000);
  });

  it("stops at the sample cap and says so rather than growing without bound", () => {
    const window = new PerformanceWindow("capped", 0, 4);
    for (let frame = 0; frame < 10; frame += 1) window.recordFrame(16);
    const summary = window.summary(1);
    expect(summary.frames.samples).toBe(4);
    expect(summary.truncated).toBe(true);
  });
});

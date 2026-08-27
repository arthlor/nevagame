import { describe, expect, it } from "vitest";

import { computePlaybackRate, finiteAudioValue } from "../../src/audio/audioParams";

describe("audio param safety", () => {
  it("never returns a non-finite playback rate from a poisoned voice seed", () => {
    expect(Number.isFinite(computePlaybackRate(Number.NEGATIVE_INFINITY, 0.97, 1.03))).toBe(true);
    expect(computePlaybackRate(Number.NEGATIVE_INFINITY, 0.97, 1.03)).toBeGreaterThan(0);
    expect(Number.isFinite(computePlaybackRate(Number.NaN, Number.NaN, Number.NaN))).toBe(true);
    expect(computePlaybackRate(1, 0.94, 1.06)).toBeGreaterThanOrEqual(0.94);
    expect(computePlaybackRate(1, 0.94, 1.06)).toBeLessThanOrEqual(1.06);
  });

  it("falls back when an AudioParam value is non-finite", () => {
    expect(finiteAudioValue(Number.NaN, 1)).toBe(1);
    expect(finiteAudioValue(Number.POSITIVE_INFINITY, 0.34)).toBe(0.34);
    expect(finiteAudioValue(0.42, 1)).toBe(0.42);
  });
});

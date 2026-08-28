import { describe, expect, it } from "vitest";

import {
  GROUND_COVER_WIND_AMPLITUDE,
  groundCoverSwaysInWind,
  groundCoverWindPhase,
  groundCoverWindRootWeight,
  groundCoverWindStrength
} from "../../src/render/scene/groundCoverWind";
import { createWeatherMotionSignal } from "../../src/render/motion/WeatherMotionSignal";

describe("groundCoverWind", () => {
  it("hashes a stable 0-1 phase so the same tuft never drifts between sessions", () => {
    const phase = groundCoverWindPhase("seeded-fill.ground-cover.grass.014");
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
    expect(groundCoverWindPhase("seeded-fill.ground-cover.grass.014")).toBe(phase);
    expect(groundCoverWindPhase("seeded-fill.ground-cover.grass.015")).not.toBe(phase);
  });

  it("sways living cover and leaves paving and pebbles planted", () => {
    expect(groundCoverSwaysInWind("grass")).toBe(true);
    expect(groundCoverSwaysInWind("flowers")).toBe(true);
    expect(groundCoverSwaysInWind("bushes")).toBe(true);
    expect(groundCoverSwaysInWind("meadowTall")).toBe(true);
    expect(groundCoverSwaysInWind("driftwood")).toBe(true);
    expect(groundCoverSwaysInWind("pebbles")).toBe(false);
    expect(groundCoverSwaysInWind("paving")).toBe(false);
    expect(GROUND_COVER_WIND_AMPLITUDE.meadowTall).toBeGreaterThan(GROUND_COVER_WIND_AMPLITUDE.grass);
    expect(GROUND_COVER_WIND_AMPLITUDE.grass).toBeGreaterThan(GROUND_COVER_WIND_AMPLITUDE.bushes);
    expect(GROUND_COVER_WIND_AMPLITUDE.grass).toBeGreaterThanOrEqual(0.18);
    expect(GROUND_COVER_WIND_AMPLITUDE.pebbles).toBe(0);
    expect(GROUND_COVER_WIND_AMPLITUDE.paving).toBe(0);
  });

  it("keeps wind strength finite and monotonic with weather evidence", () => {
    const calm = createWeatherMotionSignal();
    const breeze = { ...calm, normalizedStrength: 0.4, gust: 0.1 };
    const gale = { ...calm, normalizedStrength: 1.5, gust: 1 };
    expect(groundCoverWindStrength(calm)).toBeGreaterThan(0);
    expect(groundCoverWindStrength(breeze)).toBeGreaterThan(groundCoverWindStrength(calm));
    expect(groundCoverWindStrength(gale)).toBeGreaterThan(groundCoverWindStrength(breeze));
    expect(Number.isFinite(groundCoverWindStrength(gale))).toBe(true);
  });

  it("locks planted bases and releases the tips smoothly", () => {
    expect(groundCoverWindRootWeight(0)).toBe(0);
    expect(groundCoverWindRootWeight(0.03)).toBe(0);
    expect(groundCoverWindRootWeight(0.24)).toBe(1);
    expect(groundCoverWindRootWeight(1)).toBe(1);
    expect(groundCoverWindRootWeight(0.12)).toBeGreaterThan(0);
    expect(groundCoverWindRootWeight(0.12)).toBeLessThan(1);
    expect(groundCoverWindRootWeight(Number.NaN)).toBe(0);
  });
});

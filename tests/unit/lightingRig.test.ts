import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import {
  deriveLightingFrame,
  lightningEnvelope
} from "../../src/render/lighting/LightingRig";

describe("LightingRig", () => {
  it("derives stable time-of-day light from simulation inputs", () => {
    const state = createInitialGameState(42);
    const first = deriveLightingFrame(state, 12);
    const second = deriveLightingFrame(state, 12);
    expect(first.sunDirection.toArray()).toEqual(second.sunDirection.toArray());
    expect(first.sunDirection.y).toBeGreaterThan(0.3);
    expect(first.sunIntensity).toBeGreaterThan(1);
  });

  it("uses deterministic multi-stroke storm lightning and tighter atmosphere", () => {
    const state = createInitialGameState(42);
    state.weather.type = "storm";
    state.weather.visibility = 0.4;
    const clearWeather = createInitialGameState(42);
    const storm = deriveLightingFrame(state, 14);
    const clear = deriveLightingFrame(clearWeather, 14);
    expect(storm.fogFar).toBeLessThan(clear.fogFar);
    expect(lightningEnvelope(42, 14)).toBe(lightningEnvelope(42, 14));
    expect(lightningEnvelope(42, 14)).toBeGreaterThanOrEqual(0);
    expect(lightningEnvelope(42, 14)).toBeLessThanOrEqual(1);
  });
});

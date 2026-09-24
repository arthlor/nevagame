import { describe, expect, it } from "vitest";
import { WeatherPresentation } from "../../src/render/weather/WeatherPresentation";
import { WeatherFramePresentation } from "../../src/render/scene/WeatherFramePresentation";
import { deriveLightingFrame } from "../../src/render/lighting/LightingRig";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyWeatherProfile } from "../../src/simulation/weather/updateWeather";

describe("shared visible weather", () => {
  it("shares one sampled transition with the water conditions in a frame", () => {
    const state = createInitialGameState(42);
    const frame = new WeatherFramePresentation();
    const first = frame.sample(state, 0);
    const initialRoughness = first.weather.seaRoughness;
    applyWeatherProfile(state.weather, "storm");
    const next = frame.sample(state, 1);
    expect(next.weather.seaRoughness).toBeGreaterThan(initialRoughness);
    expect(frame.sample(state, 1)).toBe(next);
    const water = frame.waterConditions(state.weather, 7);
    expect(water.seaRoughness).toBe(next.weather.seaRoughness);
    expect(water.precipitation).toBe(next.weather.precipitation);
    expect(water.windSpeed).toBe(7);
  });

  it("eases ground light, cloud cover, rain, sea and visibility together without changing gameplay", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 720;
    applyWeatherProfile(state.weather, "clear");
    const presentation = new WeatherPresentation();
    const initial = structuredClone(presentation.sample(state.weather, 42, 0));
    const lightBefore = deriveLightingFrame(state, 0);
    applyWeatherProfile(state.weather, "storm");
    const source = structuredClone(state.weather);
    const middle = structuredClone(presentation.sample(state.weather, 42, 0.016));
    const lightDuring = deriveLightingFrame({ ...state, weather: middle.weather }, 0.016, undefined, undefined, false, middle);
    expect(middle.storm).toBeGreaterThan(0);
    expect(middle.storm).toBeLessThan(0.01);
    for (const key of ["cloudCover", "precipitation", "seaRoughness"] as const) {
      expect(middle.weather[key]).toBeGreaterThan(initial.weather[key]);
      expect(middle.weather[key]).toBeLessThan(source[key]);
    }
    expect(Math.abs(lightDuring.sunIntensity - lightBefore.sunIntensity)).toBeLessThan(0.01);
    expect(Math.abs(lightDuring.fogFar - lightBefore.fogFar)).toBeLessThan(2);
    expect(presentation.sample(state.weather, 42, 70).storm).toBeGreaterThan(0.999);
    expect(state.weather).toEqual(source);
  });

  it("takes the short wind rotation and is idempotent for multiple consumers in one frame", () => {
    const state = createInitialGameState(42);
    state.weather.windDirectionDeg = 359;
    const presentation = new WeatherPresentation();
    presentation.sample(state.weather, 42, 0);
    state.weather.windDirectionDeg = 1;
    const first = structuredClone(presentation.sample(state.weather, 42, 1));
    expect(first.weather.windDirectionDeg).toBeGreaterThan(359);
    expect(presentation.sample(state.weather, 42, 1)).toEqual(first);
    expect(presentation.sample(state.weather, 42, 100).weather.windDirectionDeg).toBeCloseTo(1, 4);
  });

  it("restores exact requested weather when a capture rewinds or a world changes", () => {
    const state = createInitialGameState(42);
    const presentation = new WeatherPresentation();
    presentation.sample(state.weather, 42, 100);
    applyWeatherProfile(state.weather, "storm");
    expect(presentation.sample(state.weather, 42, 0).weather).toEqual(state.weather);
    applyWeatherProfile(state.weather, "clear");
    expect(presentation.sample(state.weather, 43, 0).weather).toEqual(state.weather);
  });
});

import { describe, expect, it } from "vitest";
import { AtmosphereSky, atmosphereTargetSize } from "../../src/render/atmosphere/AtmosphereSky";
import { CANONICAL_RENDER_CONFIG, QUALITY_TIERS } from "../../src/render/config/VisualRenderConfig";
import { deriveLightingFrame } from "../../src/render/lighting/LightingRig";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyWeatherProfile } from "../../src/simulation/weather/updateWeather";
import { WeatherPresentation } from "../../src/render/weather/WeatherPresentation";

describe("weather sky", () => {
  it("bounds fill rate on high-DPR and ultrawide screens without distorting the sky", () => {
    for (const tier of QUALITY_TIERS) {
      const size = atmosphereTargetSize(7680, 2160, tier);
      expect(size.width).toBeLessThanOrEqual(CANONICAL_RENDER_CONFIG.atmosphere.quality[tier].maximumWidth);
      expect(size.width / size.height).toBeCloseTo(7680 / 2160, 1);
      expect(atmosphereTargetSize(0, 0, tier)).toEqual({ width: 1, height: 1 });
    }
  });

  it("starts a fixed weather capture at its requested state and does not mutate gameplay", () => {
    const state = createInitialGameState(42);
    applyWeatherProfile(state.weather, "storm");
    const original = structuredClone(state.weather);
    const sky = new AtmosphereSky("high");
    sky.update(deriveLightingFrame(state, 120), state.weather, state.worldSeed, 120, false);
    expect(sky.diagnostics().coverage).toBe(state.weather.cloudCover);
    expect(sky.diagnostics().storm).toBe(1);
    expect(state.weather).toEqual(original);
    sky.dispose();
  });

  it("eases weather changes and retains advected clouds when wind changes direction", () => {
    const state = createInitialGameState(42);
    applyWeatherProfile(state.weather, "clear");
    const sky = new AtmosphereSky("high");
    const transition = new WeatherPresentation();
    transition.sample(state.weather, state.worldSeed, 500);
    sky.update(deriveLightingFrame(state, 500), state.weather, state.worldSeed, 500, false);
    const before = sky.diagnostics();
    applyWeatherProfile(state.weather, "storm");
    state.weather.windDirectionDeg += 90;
    const appearance = transition.sample(state.weather, state.worldSeed, 500.016);
    const frame = deriveLightingFrame({ ...state, weather: appearance.weather }, 500.016, undefined, undefined, false, appearance);
    sky.update(frame, appearance.weather, state.worldSeed, 500.016, false);
    const after = sky.diagnostics();
    expect(after.coverage).toBeGreaterThan(before.coverage);
    expect(after.coverage).toBeLessThan(state.weather.cloudCover);
    expect(after.coverage).toBe(appearance.weather.cloudCover);
    expect(Math.hypot(after.windOffset[0] - before.windOffset[0], after.windOffset[1] - before.windOffset[1])).toBeLessThan(0.1);
    sky.dispose();
  });

  it("changes rendering cost across tiers without resetting weather or allocating history", () => {
    const state = createInitialGameState(42);
    const sky = new AtmosphereSky("high");
    sky.update(deriveLightingFrame(state, 20), state.weather, state.worldSeed, 20, false);
    const before = sky.diagnostics();
    const texture = sky.target.texture;
    expect(before.mode).toBe("volume");
    for (const tier of ["medium", "low"] as const) {
      sky.setQuality(tier);
      const after = sky.diagnostics();
      expect(after.mode).toBe("layered");
      expect(after.primarySteps).toBe(0);
      expect(after.lightSteps).toBe(0);
      expect(after.coverage).toBe(before.coverage);
      expect(after.windOffset).toEqual(before.windOffset);
      expect(after.history).toBe("none");
      expect(sky.target.texture).toBe(texture);
    }
    sky.dispose();
  });

  it("suppresses lightning in the shared lighting frame with reduced motion", () => {
    const state = createInitialGameState(42);
    applyWeatherProfile(state.weather, "storm");
    let flashTime = 0;
    for (let time = 0; time < 12; time += 0.01) {
      if (deriveLightingFrame(state, time).lightning > 0.5) { flashTime = time; break; }
    }
    expect(flashTime).toBeGreaterThan(0);
    const calm = deriveLightingFrame(state, flashTime, undefined, undefined, true);
    expect(calm.lightning).toBe(0);
    const sky = new AtmosphereSky("high");
    sky.update(calm, state.weather, state.worldSeed, flashTime, true);
    expect(sky.diagnostics().lightning).toBe(0);
    expect(sky.diagnostics().bolt).toBe(0);
    sky.update(deriveLightingFrame(state, flashTime), state.weather, state.worldSeed, flashTime + 0.001, false);
    expect(sky.diagnostics().bolt).toBeGreaterThan(0);
    sky.update(deriveLightingFrame(state, 0), state.weather, state.worldSeed, flashTime + 0.002, false);
    expect(sky.diagnostics().bolt).toBe(0);
    sky.dispose();
  });
});

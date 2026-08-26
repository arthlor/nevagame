import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { PALETTE_HEX } from "../../src/render/materials/PaletteTokens";
import {
  deriveCelestialDirections,
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

  it("puts the sun below the horizon and the moon above it at night", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 0;
    const night = deriveLightingFrame(state, 12);
    expect(night.sunDirection.y).toBeLessThan(-0.7);
    expect(night.moonDirection.y).toBeGreaterThan(0.7);
    expect(night.sunDirection.dot(night.moonDirection)).toBeCloseTo(-1, 6);
    expect(night.sunIntensity).toBe(0);
    expect(night.moonIntensity).toBeGreaterThan(0.2);
    expect(night.starVisibility).toBeGreaterThan(0.5);
    expect(night.practicalLightIntensity).toBeGreaterThan(0.9);
  });

  it("uses one continuous east-to-west celestial orbit", () => {
    const sunrise = deriveCelestialDirections(6 * 60);
    const noon = deriveCelestialDirections(12 * 60);
    const sunset = deriveCelestialDirections(18 * 60);
    expect(Math.abs(sunrise.sunDirection.y)).toBeLessThan(0.001);
    expect(noon.sunDirection.y).toBeGreaterThan(0.8);
    expect(Math.abs(sunset.sunDirection.y)).toBeLessThan(0.001);
    expect(sunrise.sunDirection.dot(sunset.sunDirection)).toBeCloseTo(-1, 5);
  });

  it("keeps the visible-disc direction and directional-light frame on the same vector", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 8 * 60;
    const frame = deriveLightingFrame(state, 5);
    const celestial = deriveCelestialDirections(state.clock.currentMinute);
    expect(frame.sunDirection.toArray()).toEqual(celestial.sunDirection.toArray());
    expect(frame.sunVisibility).toBeGreaterThan(0.9);
  });

  it("orders night, dawn, and day illumination with a controlled night readability lift", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 0;
    const night = deriveLightingFrame(state, 0);
    state.clock.currentMinute = 6 * 60;
    const dawn = deriveLightingFrame(state, 0);
    state.clock.currentMinute = 12 * 60;
    const day = deriveLightingFrame(state, 0);
    state.clock.currentMinute = 18 * 60;
    const dusk = deriveLightingFrame(state, 0);
    expect(day.sunIntensity).toBeGreaterThan(dawn.sunIntensity);
    expect(dawn.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(dusk.sunIntensity).toBeCloseTo(dawn.sunIntensity, 5);
    expect(night.moonIntensity).toBeGreaterThan(day.moonIntensity);
    expect(night.exposure).toBeGreaterThan(day.exposure);
    expect(dawn.exposure).toBeGreaterThan(day.exposure);
    expect(dusk.exposure).toBeGreaterThan(day.exposure);
    expect(day.exposure).toBeCloseTo(1.04, 5);
  });

  it("keeps rainy pre-dawn gameplay readable with the shared brighter night profile", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 4 * 60 + 47;
    state.weather.type = "light-rain";
    state.weather.cloudCover = 0.8;
    state.weather.visibility = 0.72;

    const frame = deriveLightingFrame(state, 0);
    const calibratedNightSky = new THREE.Color(PALETTE_HEX.water_deep_01).multiplyScalar(0.36);

    expect(frame.daylight).toBe(0);
    expect(frame.moonIntensity).toBeGreaterThan(0.35);
    expect(frame.skyFillIntensity).toBeGreaterThan(0.45);
    expect(frame.skyFillColor.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      frame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 }).l
    );
    expect(frame.skyTopColor.getHex()).toBe(calibratedNightSky.getHex());
    expect(frame.exposure).toBeGreaterThan(1.04);
  });

  it("attenuates one shared weather frame and activates practicals only at night or in storms", () => {
    const clear = createInitialGameState(42);
    clear.clock.currentMinute = 12 * 60;
    const cloudy = structuredClone(clear);
    cloudy.weather.type = "cloudy";
    cloudy.weather.cloudCover = 0.9;
    cloudy.weather.visibility = 0.62;
    const storm = structuredClone(cloudy);
    storm.weather.type = "storm";
    const clearFrame = deriveLightingFrame(clear, 0);
    const cloudyFrame = deriveLightingFrame(cloudy, 0);
    const stormFrame = deriveLightingFrame(storm, 0);
    expect(cloudyFrame.sunIntensity).toBeLessThan(clearFrame.sunIntensity);
    expect(cloudyFrame.fogFar).toBeLessThan(clearFrame.fogFar);
    expect(clearFrame.practicalLightIntensity).toBe(0);
    expect(stormFrame.practicalLightIntensity).toBeGreaterThanOrEqual(0.48);
    clear.clock.currentMinute = 0;
    expect(deriveLightingFrame(clear, 0).practicalLightIntensity).toBeGreaterThan(0.9);
  });

  it("keeps storm lightning deterministic, storm-only, and coherent across sky and fog", () => {
    const storm = createInitialGameState(73);
    storm.weather.type = "storm";
    let strikeTime = 0;
    for (let time = 0; time < 11; time += 0.01) {
      if (lightningEnvelope(storm.worldSeed, time) > 0.7) {
        strikeTime = time;
        break;
      }
    }
    const flashA = deriveLightingFrame(storm, strikeTime);
    const flashB = deriveLightingFrame(storm, strikeTime);
    const clear = structuredClone(storm);
    clear.weather.type = "clear";
    const noFlash = deriveLightingFrame(clear, strikeTime);
    const stormBetweenStrikes = deriveLightingFrame(storm, 0);
    expect(flashA.lightning).toBeGreaterThan(0.7);
    expect(flashA.lightning).toBe(flashB.lightning);
    expect(flashA.lightningDirection.toArray()).toEqual(flashB.lightningDirection.toArray());
    expect(noFlash.lightning).toBe(0);
    expect(flashA.skyTopColor.getHex()).not.toBe(stormBetweenStrikes.skyTopColor.getHex());
    expect(flashA.fogColor.getHex()).not.toBe(stormBetweenStrikes.fogColor.getHex());
  });
});

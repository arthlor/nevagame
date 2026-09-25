import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { applyWeatherProfile } from "../../src/simulation/weather/updateWeather";
import { PALETTE_HEX } from "../../src/render/materials/PaletteTokens";
import { CANONICAL_RENDER_CONFIG } from "../../src/render/config/VisualRenderConfig";
import {
  advanceWrappedMinute,
  clockWindowAmbient,
  dawnMistEnvelope,
  deriveCelestialDirections,
  deriveLightingFrame,
  LightingRig,
  lightningEnvelope,
  snapShadowFocus
} from "../../src/render/lighting/LightingRig";

describe("LightingRig", () => {
  it("keeps dawn and dusk ambient continuous across every label boundary", () => {
    const edge = CANONICAL_RENDER_CONFIG.skyFill.dawnDuskEdgeAmbient;
    const shoulder = CANONICAL_RENDER_CONFIG.twilight.ambientShoulderMinutes;
    for (const boundary of [4 * 60, 8 * 60, 18 * 60, 22 * 60]) {
      const before = clockWindowAmbient(boundary - 0.01, edge, shoulder);
      const after = clockWindowAmbient(boundary + 0.01, edge, shoulder);
      expect(Math.abs(after - before)).toBeLessThan(0.001);
    }
  });

  it("smooths integer clock steps and takes the short path across midnight", () => {
    const stepped = advanceWrappedMinute(239, 240, 0.375, 0.75);
    expect(stepped).toBeGreaterThan(239);
    expect(stepped).toBeLessThan(240);

    const wrapped = advanceWrappedMinute(1439, 1, 0.375, 0.75);
    expect(wrapped).toBeGreaterThan(1439);
    expect(wrapped).toBeLessThan(1440);
  });

  it("snaps shadow centers on the directional light's projected texel grid", () => {
    const focus = new THREE.Vector3(17.13, 0.47, -23.82);
    const lightDirection = new THREE.Vector3(0.58, 0.62, 0.53).normalize();
    const texelSize = 0.02734375;
    const snapped = snapShadowFocus(focus, lightDirection, texelSize);
    const right = new THREE.Vector3(0, 1, 0).cross(lightDirection).normalize();
    const up = lightDirection.clone().cross(right).normalize();
    expect(snapped.dot(right) / texelSize).toBeCloseTo(
      Math.round(snapped.dot(right) / texelSize),
      6
    );
    expect(snapped.dot(up) / texelSize).toBeCloseTo(
      Math.round(snapped.dot(up) / texelSize),
      6
    );
    expect(snapped.distanceTo(focus)).toBeLessThan(texelSize);
  });

  it("refreshes the shadow depth map on every moving-light update", () => {
    const renderer = {
      shadowMap: {
        autoUpdate: true,
        enabled: false,
        type: THREE.PCFSoftShadowMap,
        needsUpdate: false,
        render: () => undefined
      },
      toneMappingExposure: 1
    } as unknown as THREE.WebGLRenderer;
    const rig = new LightingRig(new THREE.Scene(), renderer);
    for (const tier of ["low", "medium", "high"] as const) {
      rig.setQuality(tier);
      expect(renderer.shadowMap.enabled).toBe(true);
      expect(renderer.shadowMap.type).toBe(tier === "low" ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap);
    }
    const state = createInitialGameState(42);
    const focus = new THREE.Vector3(4, 0.5, -6);

    rig.update(state, 0, focus);
    expect(renderer.shadowMap.needsUpdate).toBe(true);

    renderer.shadowMap.needsUpdate = false;
    rig.update(state, 0.016, new THREE.Vector3(focus.x + 0.5, focus.y, focus.z));
    expect(renderer.shadowMap.needsUpdate).toBe(true);
  });

  it("derives stable time-of-day light from simulation inputs", () => {
    const state = createInitialGameState(42);
    const first = deriveLightingFrame(state, 12);
    const second = deriveLightingFrame(state, 12);
    expect(first.sunDirection.toArray()).toEqual(second.sunDirection.toArray());
    expect(first.sunDirection.y).toBeGreaterThan(0.25);
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
    const canonicalElevationY = Math.sin(
      THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg)
    );
    expect(night.sunDirection.y).toBeCloseTo(-canonicalElevationY, 6);
    expect(night.moonDirection.y).toBeCloseTo(canonicalElevationY, 6);
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
    expect(noon.sunDirection.y).toBeCloseTo(
      Math.sin(THREE.MathUtils.degToRad(CANONICAL_RENDER_CONFIG.sun.maxElevationDeg)),
      6
    );
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

  it("opens clear morning distance and sunlight without changing rainy or cloudy atmosphere", () => {
    const clear = createInitialGameState(42);
    clear.clock.currentMinute = 8 * 60;
    const cloudy = structuredClone(clear);
    applyWeatherProfile(cloudy.weather, "cloudy");
    const rainy = structuredClone(clear);
    applyWeatherProfile(rainy.weather, "light-rain");

    const clearFrame = deriveLightingFrame(clear, 0);
    const cloudyFrame = deriveLightingFrame(cloudy, 0);
    const rainyFrame = deriveLightingFrame(rainy, 0);
    const config = CANONICAL_RENDER_CONFIG;

    expect(clearFrame.fogNear).toBe(config.fog.clearDayNear);
    expect(clearFrame.fogFar).toBe(config.fog.clearDayFar);
    const clearSky = clearFrame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 });
    const cloudySky = cloudyFrame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 });
    expect(clearSky.s).toBeGreaterThan(cloudySky.s + 0.08);
    expect(clearSky.l).toBeLessThan(cloudySky.l);
    const clearFogDistance = Math.hypot(
      clearFrame.fogColor.r - clearFrame.skyTopColor.r,
      clearFrame.fogColor.g - clearFrame.skyTopColor.g,
      clearFrame.fogColor.b - clearFrame.skyTopColor.b
    );
    const cloudyFogDistance = Math.hypot(
      cloudyFrame.fogColor.r - cloudyFrame.skyTopColor.r,
      cloudyFrame.fogColor.g - cloudyFrame.skyTopColor.g,
      cloudyFrame.fogColor.b - cloudyFrame.skyTopColor.b
    );
    expect(clearFogDistance).toBeLessThan(cloudyFogDistance);
    expect(clearFrame.sunIntensity).toBeGreaterThan(config.sun.intensity * 0.98);
    expect(clearFrame.sunIntensity).toBeLessThanOrEqual(config.sun.intensity);
    for (const [state, frame] of [[cloudy, cloudyFrame], [rainy, rainyFrame]] as const) {
      expect(frame.fogNear).toBe(config.fog.near);
      expect(frame.fogFar).toBeCloseTo(
        config.fog.far * THREE.MathUtils.lerp(0.45, 1, state.weather.visibility)
      );
      expect(frame.sunIntensity).toBeCloseTo(
        config.sun.intensity * THREE.MathUtils.lerp(1, 0.58, state.weather.cloudCover)
      );
      expect(frame.fogFar).toBeLessThan(clearFrame.fogFar);
      expect(frame.exposure).toBe(clearFrame.exposure);
    }
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
    for (const frame of [night, dawn, dusk]) {
      expect(frame.fogNear).toBe(CANONICAL_RENDER_CONFIG.fog.near);
      expect(frame.fogFar).toBeLessThanOrEqual(CANONICAL_RENDER_CONFIG.fog.far);
    }
    expect(night.fogFar).toBeLessThan(CANONICAL_RENDER_CONFIG.fog.far);
  });

  it("keeps dawn and dusk progressively lighter than night", () => {
    const state = createInitialGameState(42);
    const illumination = (minute: number) => {
      state.clock.currentMinute = minute;
      const frame = deriveLightingFrame(state, 0);
      const sky = frame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 });
      return {
        key: frame.sunIntensity + frame.moonIntensity + frame.skyFillIntensity * 0.55,
        fill: frame.skyFillIntensity,
        skyL: sky.l,
        exposure: frame.exposure,
        ambient: frame.ambientDaylight,
        practicals: frame.practicalLightIntensity
      };
    };

    const night = illumination(0);
    const dawnStart = illumination(4 * 60);
    const preDawn = illumination(5 * 60 + 30);
    const sunrise = illumination(6 * 60);
    const lateDawn = illumination(7 * 60);
    const sunset = illumination(18 * 60);
    const dusk = illumination(19 * 60);
    const lateDusk = illumination(21 * 60);
    const noon = illumination(12 * 60);

    for (const sample of [dawnStart, preDawn, sunrise, lateDawn, sunset, dusk, lateDusk]) {
      expect(sample.key).toBeGreaterThan(night.key);
      expect(sample.fill).toBeGreaterThan(night.fill);
      expect(sample.skyL).toBeGreaterThan(night.skyL);
      expect(sample.ambient).toBeGreaterThan(night.ambient);
    }
    expect(dawnStart.exposure).toBeCloseTo(night.exposure, 5);
    expect(preDawn.exposure).toBeCloseTo(night.exposure, 5);
    expect(lateDusk.exposure).toBeCloseTo(night.exposure, 5);
    expect(dawnStart.ambient).toBeGreaterThan(0.3);
    expect(preDawn.ambient).toBeGreaterThan(dawnStart.ambient);
    expect(sunrise.ambient).toBeGreaterThan(preDawn.ambient);
    expect(lateDawn.ambient).toBeGreaterThan(sunrise.ambient);
    expect(sunrise.key).toBeGreaterThan(preDawn.key);
    expect(noon.key).toBeGreaterThan(sunrise.key);
    expect(sunset.key).toBeGreaterThan(dusk.key);
    expect(dusk.key).toBeGreaterThan(lateDusk.key);
    expect(sunset.key).toBeGreaterThan(sunrise.key);
    expect(dawnStart.practicals).toBeGreaterThan(0.7);
    expect(noon.practicals).toBe(0);
  });

  it("keeps rainy pre-dawn gameplay readable with the shared brighter night profile", () => {
    const state = createInitialGameState(42);
    state.clock.currentMinute = 4 * 60 + 47;
    state.weather.type = "light-rain";
    state.weather.cloudCover = 0.8;
    state.weather.visibility = 0.72;

    const frame = deriveLightingFrame(state, 0);
    const midnight = structuredClone(state);
    midnight.clock.currentMinute = 0;
    const night = deriveLightingFrame(midnight, 0);
    const calibratedNightSky = new THREE.Color(PALETTE_HEX.water_deep_01).multiplyScalar(0.36);

    expect(frame.daylight).toBe(0);
    expect(frame.moonIntensity).toBeGreaterThan(0.35);
    expect(frame.skyFillIntensity).toBeGreaterThan(0.45);
    expect(frame.skyFillColor.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      frame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 }).l
    );
    expect(frame.skyTopColor.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      calibratedNightSky.getHSL({ h: 0, s: 0, l: 0 }).l
    );
    expect(frame.skyFillIntensity).toBeGreaterThan(night.skyFillIntensity);
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

  describe("golden hour and twilight", () => {
    const frameAt = (minute: number, weather: "clear" | "cloudy" | "light-rain" | "storm" = "clear") => {
      const state = createInitialGameState(42);
      applyWeatherProfile(state.weather, weather);
      state.clock.currentMinute = minute;
      return deriveLightingFrame(state, 0);
    };
    const hsl = (color: THREE.Color) => color.getHSL({ h: 0, s: 0, l: 0 });
    const warmth = (color: THREE.Color) => color.r / Math.max(0.0001, color.b);

    it("keeps a deeper, cooler clear zenith at golden hour instead of the pale overcast dome", () => {
      const clear = frameAt(17 * 60 + 40);
      const cloudy = frameAt(17 * 60 + 40, "cloudy");
      expect(hsl(clear.skyTopColor).l).toBeLessThan(hsl(cloudy.skyTopColor).l);
      expect(hsl(clear.skyTopColor).s).toBeGreaterThan(hsl(cloudy.skyTopColor).s);
      expect(clear.skyTopColor.b).toBeGreaterThan(clear.skyTopColor.r);
      // The warm colour belongs to the horizon, not the whole dome.
      expect(warmth(clear.skyHorizonColor)).toBeGreaterThan(warmth(clear.skyTopColor));
    });

    it("pairs a warm key with cool shade and a warm ground bounce at clear golden hour", () => {
      const noon = frameAt(12 * 60);
      const golden = frameAt(17 * 60 + 40);
      expect(warmth(golden.sunColor)).toBeGreaterThan(warmth(noon.sunColor));
      expect(warmth(golden.skyFillColor)).toBeLessThan(warmth(golden.sunColor));
      expect(warmth(golden.groundFillColor)).toBeGreaterThan(warmth(golden.skyFillColor));
      expect(warmth(golden.groundFillColor)).toBeGreaterThan(warmth(noon.groundFillColor));
    });

    it("deepens the key into an ember only in the last minutes around the horizon", () => {
      const lateAfternoon = frameAt(17 * 60);
      const horizon = frameAt(17 * 60 + 58);
      expect(warmth(horizon.sunColor)).toBeGreaterThan(warmth(lateAfternoon.sunColor));
    });

    it("lifts the grazing key without changing noon, sunrise or sunset", () => {
      const sun = CANONICAL_RENDER_CONFIG.sun;
      const lift = sun.goldenKeyLift;
      const minutes = [12 * 60, 17 * 60 + 40, 6 * 60, 18 * 60];
      const lifted = minutes.map((minute) => frameAt(minute).sunIntensity);
      let unlifted: number[];
      try {
        sun.goldenKeyLift = 0;
        unlifted = minutes.map((minute) => frameAt(minute).sunIntensity);
      } finally {
        sun.goldenKeyLift = lift;
      }
      expect(lifted[0]).toBe(unlifted[0]);
      expect(frameAt(17 * 60 + 40).sunDirection.y).toBeGreaterThan(0.04);
      expect(lifted[1]).toBeGreaterThan(unlifted[1] * 1.1);
      expect(lifted[1]).toBeLessThanOrEqual(unlifted[1] * (1 + lift) + 1e-9);
      expect(lifted[2]).toBe(unlifted[2]);
      expect(lifted[3]).toBe(unlifted[3]);
    });

    it("confines the sunward glow, rose band and afterglow to the low sun and clear skies", () => {
      const noon = frameAt(12 * 60);
      expect(noon.sunGlow).toBe(0);
      expect(noon.antiTwilight).toBe(0);
      const clear = frameAt(17 * 60 + 55);
      const cloudy = frameAt(17 * 60 + 55, "cloudy");
      const storm = frameAt(17 * 60 + 55, "storm");
      const glow = (frame: ReturnType<typeof frameAt>) => frame.sunGlow;
      expect(glow(clear)).toBeGreaterThan(glow(cloudy));
      expect(glow(storm)).toBe(0);
      expect(clear.antiTwilight).toBeGreaterThan(0);
      expect(cloudy.antiTwilight).toBeLessThan(clear.antiTwilight);
      // After sunset the clouds' key turns rose while the land's key has gone.
      const afterglow = frameAt(18 * 60 + 12);
      expect(afterglow.sunDirection.y).toBeLessThan(0);
      expect(afterglow.cloudSunColor.getHex()).not.toBe(afterglow.sunColor.getHex());
      expect(frameAt(16 * 60).cloudSunColor.getHex()).toBe(frameAt(16 * 60).sunColor.getHex());
    });

    it("gathers valley mist on clear and cloudy mornings only", () => {
      const [start, peak, end] = CANONICAL_RENDER_CONFIG.atmosphere.aerialPerspective.dawnMistMinutes;
      expect(dawnMistEnvelope(start)).toBe(0);
      expect(dawnMistEnvelope(peak)).toBeCloseTo(1, 6);
      expect(dawnMistEnvelope(end)).toBe(0);
      expect(dawnMistEnvelope(12 * 60)).toBe(0);
      expect(dawnMistEnvelope(0)).toBe(0);
      expect(frameAt(peak).valleyMist).toBeCloseTo(1, 6);
      expect(frameAt(peak, "cloudy").valleyMist).toBeGreaterThan(0.9);
      expect(frameAt(peak, "light-rain").valleyMist).toBeLessThan(frameAt(peak).valleyMist);
      expect(frameAt(peak, "storm").valleyMist).toBe(0);
    });

    it("keeps the moonlit night bluer than the sea-teal it is derived from", () => {
      const night = frameAt(0);
      const teal = new THREE.Color(PALETTE_HEX.water_deep_01);
      expect(hsl(night.skyTopColor).h).toBeGreaterThan(hsl(teal).h);
      expect(night.skyTopColor.b).toBeGreaterThan(night.skyTopColor.g);
    });

    it("shapes each storm strike with its own deterministic seed", () => {
      const state = createInitialGameState(42);
      applyWeatherProfile(state.weather, "storm");
      const cycle = CANONICAL_RENDER_CONFIG.weather.lightningCycleSeconds;
      const first = deriveLightingFrame(state, 1).lightningSeed;
      expect(deriveLightingFrame(state, 2).lightningSeed).toBe(first);
      expect(deriveLightingFrame(state, 1 + cycle).lightningSeed).not.toBe(first);
    });
  });
});

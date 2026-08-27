import { describe, expect, it } from "vitest";
import {
  activateRainSplash,
  createRainDrop,
  hashedUnit,
  rainActiveDropCount,
  rainPhysicsConfig,
  rainVisualIntensity,
  rainWindVelocity,
  respawnRainDrop,
  sampleRainHitSurface,
  stepRainDrop,
  wrapToVolume,
  type RainSplashState,
  type RainSurfaceSample
} from "../../src/render/weather/rainPhysics";

const config = rainPhysicsConfig();
const focus = { x: 0, y: 2, z: 0 };
const stillWind = { directionX: 0, directionZ: 1, effectiveWindSpeed: 0 };

describe("rainPhysics", () => {
  it("keeps fog-level precipitation visually dry and lights up from light rain", () => {
    expect(rainVisualIntensity(0.05)).toBe(0);
    expect(rainVisualIntensity(0.12)).toBe(0);
    expect(rainVisualIntensity(0.45)).toBeGreaterThan(0.3);
    expect(rainVisualIntensity(1)).toBe(1);
    expect(rainVisualIntensity(Number.NaN)).toBe(0);
  });

  it("scales the live drop budget by intensity, quality, and reduced motion", () => {
    expect(rainActiveDropCount("high", 0)).toBe(0);
    expect(rainActiveDropCount("low", 1)).toBe(140);
    expect(rainActiveDropCount("high", 1)).toBe(360);
    expect(rainActiveDropCount("high", 1, 0.35)).toBe(126);
    expect(rainActiveDropCount("high", 0.5)).toBeGreaterThan(rainActiveDropCount("medium", 0.5));
  });

  it("hashes and wraps volumes deterministically", () => {
    expect(hashedUnit(9)).toBe(hashedUnit(9));
    expect(hashedUnit(9)).not.toBe(hashedUnit(10));
    expect(wrapToVolume(12, 0, 10)).toBe(-8);
    expect(wrapToVolume(-12, 0, 10)).toBe(8);
    expect(wrapToVolume(3, 0, 10)).toBe(3);
  });

  it("falls under gravity, couples to wind, and stops at terminal speed", () => {
    const drop = createRainDrop();
    respawnRainDrop(drop, 0, focus, stillWind, config);
    drop.vy = 0;
    const wind = { directionX: 1, directionZ: 0, effectiveWindSpeed: 12 };
    const expectedWind = rainWindVelocity(wind, config);
    const surface = (): RainSurfaceSample => ({ height: -50, kind: "terrain" });

    stepRainDrop(drop, 1 / 60, focus, wind, config, surface);
    expect(drop.vy).toBeLessThan(0);
    expect(drop.vx).toBeGreaterThan(0);

    for (let step = 0; step < 120; step += 1) {
      stepRainDrop(drop, 1 / 30, focus, wind, config, surface);
    }
    expect(drop.vy).toBeCloseTo(-config.terminalSpeed, 5);
    expect(drop.vx).toBeCloseTo(expectedWind.vx, 3);
  });

  it("reports a terrain hit and can seed a splash at the sampled surface", () => {
    const drop = createRainDrop();
    drop.active = true;
    drop.x = 4;
    drop.y = 1.02;
    drop.z = -3;
    drop.vx = 0;
    drop.vy = -18;
    drop.vz = 0;
    const result = stepRainDrop(drop, 1 / 30, focus, stillWind, config, () => ({
      height: 1,
      kind: "terrain"
    }));
    expect(result).toBe("hit-terrain");

    const splash: RainSplashState = {
      active: false,
      x: 0,
      y: 0,
      z: 0,
      bornAt: 0,
      duration: 1,
      size: 1,
      kind: "terrain"
    };
    activateRainSplash(splash, drop, { height: 1, kind: "terrain" }, 4, config);
    expect(splash.active).toBe(true);
    expect(splash.y).toBeCloseTo(1.02, 5);
    expect(splash.kind).toBe("terrain");
  });

  it("samples canonical interior, water, and land hit surfaces", () => {
    const stillWater = { seaRoughness: 0.2, windDirectionDeg: 0, windSpeed: 0 };
    expect(sampleRainHitSurface(240, -240, 0, stillWater).kind).toBe("interior");
    expect(sampleRainHitSurface(0, 180, 0, stillWater).kind).toBe("water");
    expect(sampleRainHitSurface(-65, -55, 0, stillWater).kind).toBe("terrain");
  });
});

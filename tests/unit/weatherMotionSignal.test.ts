import { describe, expect, it } from "vitest";
import {
  createWeatherMotionSignal,
  sampleWeatherMotionSignal
} from "../../src/render/motion/WeatherMotionSignal";
import type { WeatherState } from "../../src/simulation/core/types";

const weather: WeatherState = {
  type: "clear",
  windDirectionDeg: 90,
  windSpeed: 8,
  precipitation: 0,
  cloudCover: 0.2,
  seaRoughness: 0.35,
  visibility: 1,
  temperatureC: 18,
  nextWeatherMinute: 600,
  nextWeatherType: "cloudy"
};

describe("WeatherMotionSignal", () => {
  it("reuses the caller target and resolves one deterministic world wind direction", () => {
    const target = createWeatherMotionSignal();
    const result = sampleWeatherMotionSignal(weather, 12.5, target);
    expect(result).toBe(target);
    expect(result.directionX).toBeCloseTo(1, 6);
    expect(result.directionZ).toBeCloseTo(0, 6);

    const repeated = sampleWeatherMotionSignal(weather, 12.5, createWeatherMotionSignal());
    expect(repeated).toEqual(result);
  });

  it("keeps gust and effective strength finite across storm-scale wind", () => {
    const result = sampleWeatherMotionSignal(
      { ...weather, type: "storm", windSpeed: 18, seaRoughness: 1 },
      9_999,
      createWeatherMotionSignal()
    );
    expect(result.gust).toBeGreaterThanOrEqual(-1);
    expect(result.gust).toBeLessThanOrEqual(1);
    expect(result.normalizedStrength).toBe(1.5);
    expect(Number.isFinite(result.effectiveWindSpeed)).toBe(true);
    expect(Number.isFinite(result.cloudTravelMeters)).toBe(true);
  });
});

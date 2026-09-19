import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { SeededRng } from "../../src/simulation/core/Rng";
import { DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import {
  SEASONAL_WEATHER_WEIGHTS,
  WEATHER_FRONT_MAX_MINUTES,
  WEATHER_FRONT_MIN_MINUTES,
  applyWeatherProfile,
  rollWeatherType
} from "../../src/simulation/weather/updateWeather";
import {
  CROP_GROWTH_MODIFIERS,
  calculateEffectiveGrowthDelta,
  moistureChangePerHour
} from "../../src/simulation/farming/calculateCropGrowth";

describe("drought weather", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("applies a hot, cloudless, rainless profile in summer", () => {
    const state = createInitialGameState(7);
    applyWeatherProfile(state.weather, "drought", "summer");
    expect(state.weather.type).toBe("drought");
    expect(state.weather.precipitation).toBe(0);
    expect(state.weather.cloudCover).toBeCloseTo(0.05);
    expect(state.weather.seaRoughness).toBeCloseTo(0.08);
    expect(state.weather.temperatureC).toBe(28);
  });

  it("rolls only in summer and stays absent from the other seasons", () => {
    const summerWeights = SEASONAL_WEATHER_WEIGHTS.summer;
    expect(summerWeights.find((entry) => entry.value === "drought")?.weight).toBeGreaterThan(0);
    for (const season of ["spring", "autumn", "winter"] as const) {
      expect(SEASONAL_WEATHER_WEIGHTS[season].some((entry) => entry.value === "drought")).toBe(false);
    }

    const summerMinute = DAYS_PER_SEASON * MINUTES_PER_DAY;
    const summer = new SeededRng(11);
    const rolled = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      rolled.add(rollWeatherType(summer, summerMinute));
    }
    expect(rolled.has("drought")).toBe(true);

    const winterMinute = DAYS_PER_SEASON * MINUTES_PER_DAY * 3;
    const winter = new SeededRng(11);
    for (let index = 0; index < 300; index += 1) {
      expect(rollWeatherType(winter, winterMinute)).not.toBe("drought");
    }

    expect(WEATHER_FRONT_MIN_MINUTES).toBeLessThan(WEATHER_FRONT_MAX_MINUTES);
  });

  it("slows crop growth to three quarters of the neutral rate", () => {
    const crop = ContentRegistry.crops.get("crop.wheat")!;
    const base = { climate: "temperate", moisture: 100, fertility: 50 } as const;
    const clear = calculateEffectiveGrowthDelta(
      60, crop, base.climate, base.moisture, base.fertility, "clear"
    );
    const drought = calculateEffectiveGrowthDelta(
      60, crop, base.climate, base.moisture, base.fertility, "drought"
    );
    expect(drought).toBeCloseTo(clear * CROP_GROWTH_MODIFIERS.weather.drought, 5);
    expect(CROP_GROWTH_MODIFIERS.weather.drought).toBeLessThan(CROP_GROWTH_MODIFIERS.weather.other);
  });

  it("drains soil moisture harder than clear or windy weather", () => {
    const environment = { rainfallEffectiveness: 1, evaporationMultiplier: 1, moistureRetention: 0 } as const;
    const clear = moistureChangePerHour(50, { ...environment, weatherType: "clear" });
    const windy = moistureChangePerHour(50, { ...environment, weatherType: "windy" });
    const drought = moistureChangePerHour(50, { ...environment, weatherType: "drought" });
    expect(clear).toBe(-20);
    expect(windy).toBe(-30);
    expect(drought).toBe(-45);
    expect(drought).toBeLessThan(windy);
  });

  it("accepts a drought weather state in a current save envelope", () => {
    const state = createInitialGameState(7);
    applyWeatherProfile(state.weather, "drought", "summer");
    state.weather.nextWeatherType = "drought";
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state
    })).toBe(true);
  });

  it("keeps drought-tolerant species in the authored content", () => {
    expect(ContentRegistry.fishSpecies.get("fish.catfish")?.weatherPreferences).toContain("drought");
    expect(ContentRegistry.fishSpecies.get("fish.pike")?.weatherPreferences).toContain("drought");
  });
});

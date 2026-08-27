import { SeasonId, WeatherState, WeatherTag } from "../core/types";
import { Rng } from "../core/Rng";
import { seasonAtMinute } from "../core/GameClock";

interface WeatherProfile {
  windSpeed: number;
  precipitation: number;
  cloudCover: number;
  seaRoughness: number;
  visibility: number;
  temperatureDelta: number;
}

const SEASONAL_BASELINE_C: Record<SeasonId, number> = {
  spring: 16,
  summer: 22,
  autumn: 14,
  winter: 4
};

function seasonalBaselineC(season: SeasonId): number {
  return SEASONAL_BASELINE_C[season];
}

const WEATHER_PROFILES: Record<WeatherTag, WeatherProfile> = {
  clear: { windSpeed: 4, precipitation: 0, cloudCover: 0.15, seaRoughness: 0.1, visibility: 1, temperatureDelta: 2 },
  cloudy: { windSpeed: 5, precipitation: 0, cloudCover: 0.65, seaRoughness: 0.18, visibility: 0.82, temperatureDelta: 0 },
  "light-rain": { windSpeed: 6, precipitation: 0.45, cloudCover: 0.8, seaRoughness: 0.28, visibility: 0.72, temperatureDelta: -2 },
  "heavy-rain": { windSpeed: 9, precipitation: 0.9, cloudCover: 0.95, seaRoughness: 0.5, visibility: 0.52, temperatureDelta: -4 },
  windy: { windSpeed: 11, precipitation: 0, cloudCover: 0.45, seaRoughness: 0.48, visibility: 0.8, temperatureDelta: -1 },
  fog: { windSpeed: 2, precipitation: 0.05, cloudCover: 0.7, seaRoughness: 0.12, visibility: 0.35, temperatureDelta: -3 },
  storm: { windSpeed: 17, precipitation: 1, cloudCover: 1, seaRoughness: 0.82, visibility: 0.28, temperatureDelta: -5 }
};

export const WEATHER_FRONT_MIN_MINUTES = 360;
export const WEATHER_FRONT_MAX_MINUTES = 720;

export const SEASONAL_WEATHER_WEIGHTS: Record<SeasonId, ReadonlyArray<{ value: WeatherTag; weight: number }>> = {
  spring: [
    { value: "clear", weight: 20 },
    { value: "cloudy", weight: 20 },
    { value: "light-rain", weight: 22 },
    { value: "windy", weight: 10 },
    { value: "fog", weight: 8 },
    { value: "heavy-rain", weight: 12 },
    { value: "storm", weight: 8 }
  ],
  summer: [
    { value: "clear", weight: 40 },
    { value: "cloudy", weight: 18 },
    { value: "light-rain", weight: 12 },
    { value: "windy", weight: 12 },
    { value: "fog", weight: 4 },
    { value: "heavy-rain", weight: 8 },
    { value: "storm", weight: 6 }
  ],
  autumn: [
    { value: "clear", weight: 18 },
    { value: "cloudy", weight: 22 },
    { value: "light-rain", weight: 14 },
    { value: "windy", weight: 10 },
    { value: "fog", weight: 20 },
    { value: "heavy-rain", weight: 10 },
    { value: "storm", weight: 6 }
  ],
  winter: [
    { value: "clear", weight: 14 },
    { value: "cloudy", weight: 20 },
    { value: "light-rain", weight: 12 },
    { value: "windy", weight: 14 },
    { value: "fog", weight: 12 },
    { value: "heavy-rain", weight: 14 },
    { value: "storm", weight: 14 }
  ]
};

export function applyWeatherProfile(weather: WeatherState, type: WeatherTag, season: SeasonId = "spring"): void {
  const profile = WEATHER_PROFILES[type];
  weather.type = type;
  weather.windSpeed = profile.windSpeed;
  weather.precipitation = profile.precipitation;
  weather.cloudCover = profile.cloudCover;
  weather.seaRoughness = profile.seaRoughness;
  weather.visibility = profile.visibility;
  weather.temperatureC = Math.max(-10, Math.min(38, seasonalBaselineC(season) + profile.temperatureDelta));
}

function weightsForMinute(currentMinute: number): ReadonlyArray<{ value: WeatherTag; weight: number }> {
  return SEASONAL_WEATHER_WEIGHTS[seasonAtMinute(currentMinute)];
}

export function rollWeatherType(rng: Rng, currentMinute: number): WeatherTag {
  return rng.weighted(weightsForMinute(currentMinute));
}

export function forecastWeatherAt(
  weather: WeatherState,
  currentMinute: number,
  offsetMinutes: number
): WeatherTag {
  const at = currentMinute + Math.max(0, offsetMinutes);
  if (at < weather.nextWeatherMinute) return weather.type;
  return weather.nextWeatherType;
}

/** Advances all overdue scheduled weather periods and returns whether the visible weather changed. */
export function advanceScheduledWeather(weather: WeatherState, currentMinute: number, rng: Rng): boolean {
  const initialType = weather.type;
  while (currentMinute >= weather.nextWeatherMinute) {
    const nextType = weather.nextWeatherType ?? rollWeatherType(rng, currentMinute);
    applyWeatherProfile(weather, nextType, seasonAtMinute(weather.nextWeatherMinute));
    weather.windDirectionDeg = rng.range(0, 360);
    weather.nextWeatherMinute += rng.intInclusive(WEATHER_FRONT_MIN_MINUTES, WEATHER_FRONT_MAX_MINUTES);
    weather.nextWeatherType = rollWeatherType(rng, weather.nextWeatherMinute);
  }
  return weather.type !== initialType;
}

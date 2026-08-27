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

interface WeatherProfile {
  windSpeed: number;
  precipitation: number;
  cloudCover: number;
  seaRoughness: number;
  visibility: number;
  temperatureDelta: number;
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

const WEATHER_WEIGHTS: ReadonlyArray<{ value: WeatherTag; weight: number }> = [
  { value: "clear", weight: 32 },
  { value: "cloudy", weight: 22 },
  { value: "light-rain", weight: 16 },
  { value: "windy", weight: 12 },
  { value: "fog", weight: 7 },
  { value: "heavy-rain", weight: 7 },
  { value: "storm", weight: 4 }
];

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

/** Advances all overdue scheduled weather periods and returns whether the visible weather changed. */
export function advanceScheduledWeather(weather: WeatherState, currentMinute: number, rng: Rng): boolean {
  const initialType = weather.type;
  while (currentMinute >= weather.nextWeatherMinute) {
    const nextType = rng.weighted(WEATHER_WEIGHTS);
    applyWeatherProfile(weather, nextType, seasonAtMinute(weather.nextWeatherMinute));
    weather.windDirectionDeg = rng.range(0, 360);
    weather.nextWeatherMinute += rng.intInclusive(120, 300);
  }
  return weather.type !== initialType;
}

import type { WeatherState } from "../core/types";
import type { Rng } from "../core/Rng";
import { advanceScheduledWeather } from "../weather/updateWeather";

/**
 * Walks elapsed game minutes in weather-bounded segments so live ticks and
 * offline catch-up apply the same weather snapshot to crops and cargo.
 * Resolves a weather change that lands exactly at the final minute.
 */
export function forEachWeatherBoundedSegment(
  weather: WeatherState,
  startMinute: number,
  totalMinutes: number,
  rng: Rng,
  onSegment: (segmentMinutes: number) => void
): void {
  if (totalMinutes <= 0) return;

  let remainingMinutes = totalMinutes;
  let currentMinute = startMinute;
  while (remainingMinutes > 0) {
    advanceScheduledWeather(weather, currentMinute, rng);
    const untilWeatherChange = Math.max(1, weather.nextWeatherMinute - currentMinute);
    const segmentMinutes = Math.min(remainingMinutes, untilWeatherChange);
    onSegment(segmentMinutes);
    currentMinute += segmentMinutes;
    remainingMinutes -= segmentMinutes;
  }
  advanceScheduledWeather(weather, currentMinute, rng);
}

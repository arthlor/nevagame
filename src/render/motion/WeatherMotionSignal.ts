import * as THREE from "three";
import type { WeatherState } from "../../simulation/core/types";

/** Shared render-only wind evidence. Gameplay weather remains authoritative. */
export interface WeatherMotionSignal {
  directionRadians: number;
  directionX: number;
  directionZ: number;
  normalizedStrength: number;
  gust: number;
  effectiveWindSpeed: number;
  cloudTravelMeters: number;
}

export function createWeatherMotionSignal(): WeatherMotionSignal {
  return {
    directionRadians: 0,
    directionX: 0,
    directionZ: 1,
    normalizedStrength: 0,
    gust: 0,
    effectiveWindSpeed: 0,
    cloudTravelMeters: 0
  };
}

/**
 * Produces one deterministic weather-driven signal for all ambient renderers.
 * The caller owns and reuses `target`, keeping the frame path allocation-free.
 */
export function sampleWeatherMotionSignal(
  weather: Readonly<WeatherState>,
  timeSeconds: number,
  target: WeatherMotionSignal
): WeatherMotionSignal {
  const directionRadians = THREE.MathUtils.degToRad(weather.windDirectionDeg);
  const broadGust = Math.sin(timeSeconds * 0.37 + directionRadians * 1.7);
  const detailGust = Math.sin(timeSeconds * 0.91 - directionRadians * 0.6 + 1.9);
  const gust = THREE.MathUtils.clamp(broadGust * 0.7 + detailGust * 0.3, -1, 1);
  const normalizedStrength = THREE.MathUtils.clamp(weather.windSpeed / 12, 0, 1.5);
  const effectiveWindSpeed = Math.max(0, weather.windSpeed * (1 + gust * 0.12));

  target.directionRadians = directionRadians;
  target.directionX = Math.sin(directionRadians);
  target.directionZ = Math.cos(directionRadians);
  target.normalizedStrength = normalizedStrength;
  target.gust = gust;
  target.effectiveWindSpeed = effectiveWindSpeed;
  target.cloudTravelMeters = ((timeSeconds * (0.12 + effectiveWindSpeed * 0.018)) % 150) - 75;
  return target;
}

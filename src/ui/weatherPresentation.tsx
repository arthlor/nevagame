import React from "react";
import type { WeatherTag } from "../simulation/core/types";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForWeather } from "./chrome/uiAtlas";

type WeatherType = WeatherTag | string;

const WEATHER_LABELS: Record<WeatherTag, string> = {
  clear: "Clear sky",
  cloudy: "Overcast",
  "light-rain": "Light rain",
  "heavy-rain": "Heavy rain",
  windy: "Windy",
  fog: "Fog",
  storm: "Storm"
};

function normalizeWeatherType(type: WeatherType): string {
  return type.toLowerCase().replaceAll("_", "-");
}

function fallbackWeatherLabel(type: WeatherType): string {
  return type
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatWeatherLabel(type: WeatherType): string {
  return WEATHER_LABELS[normalizeWeatherType(type) as WeatherTag] ?? fallbackWeatherLabel(type);
}

function timeOfDayFromHour(hour?: number): "dawn" | "day" | "dusk" | "night" | undefined {
  if (hour === undefined) return undefined;
  if (hour >= 4 && hour < 8) return "dawn";
  if (hour >= 18 && hour < 22) return "dusk";
  if (hour < 4 || hour >= 22) return "night";
  return "day";
}

interface WeatherIconProps {
  type: WeatherType;
  hour?: number;
  size?: number;
  className?: string;
}

export const WeatherIcon: React.FC<WeatherIconProps> = ({ type, hour, size = 18, className }) => (
  <AtlasImage
    src={atlasForWeather(normalizeWeatherType(type), timeOfDayFromHour(hour))}
    size={size}
    className={className}
    aria-hidden="true"
  />
);

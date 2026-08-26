// src/ui/components/FarmForecastPopover.tsx
import React from "react";
import { WeatherState, ClockState } from "../../simulation/core/types";
import { IconWeatherClear, IconWeatherRain, IconWeatherStorm, IconWeatherOvercast } from "./HudIcons";

interface FarmForecastPopoverProps {
  weather: WeatherState;
  clock: ClockState;
  onClose: () => void;
}

export const FarmForecastPopover: React.FC<FarmForecastPopoverProps> = ({
  weather,
  clock,
  onClose
}) => {
  const currentTemp = Math.round(weather.temperatureC);
  const currentDay = ((clock.dayCount - 1) % 30) + 1;
  const condition = weather.type === "storm" ? "Storm" : weather.type === "heavy-rain" ? "Heavy rain" : weather.type === "light-rain" ? "Light rain" : weather.type === "cloudy" ? "Cloudy" : weather.type === "windy" ? "Windy" : weather.type === "fog" ? "Fog" : "Clear";
  const icon = weather.type === "storm" ? <IconWeatherStorm size={18} /> : weather.type === "heavy-rain" || weather.type === "light-rain" ? <IconWeatherRain size={18} /> : weather.type === "cloudy" || weather.type === "fog" ? <IconWeatherOvercast size={18} /> : <IconWeatherClear size={18} />;
  const minutesUntilChange = Math.max(0, weather.nextWeatherMinute - clock.currentMinute);

  return (
    <div className="forecast-popover interactive" role="dialog" aria-label="Farm weather forecast">
      <div className="forecast-header">
        <div className="forecast-title-group">
          <span className="forecast-badge-icon">🌾</span>
            <strong>Current Farm Conditions</strong>
        </div>
        <button type="button" className="forecast-close-btn" onClick={onClose} aria-label="Close forecast">
          ✕
        </button>
      </div>

      <div className="forecast-days-grid">
        <div className="forecast-day-card is-today">
          <div className="forecast-day-meta">
            <span className="forecast-day-label">DAY {currentDay} · {clock.timeOfDay.toUpperCase()}</span>
            <span className="forecast-day-cond">{icon}{condition}</span>
          </div>
          <div className="forecast-temp-row">
            <span className="temp-high">{currentTemp}°C</span>
            <span className="rain-prob">💧 {Math.round(weather.precipitation * 100)}%</span>
          </div>
          <div className="forecast-impact-list">
            <div className="forecast-impact-item"><span>Wind</span><span>{weather.windSpeed.toFixed(1)} m/s</span></div>
            <div className="forecast-impact-item"><span>Visibility</span><span>{Math.round(weather.visibility * 100)}%</span></div>
            <div className="forecast-impact-item"><span>Next weather update</span><span>{minutesUntilChange} min</span></div>
          </div>
        </div>
      </div>

      <div className="forecast-footer-note">
        <span>Future weather is not simulated in this save; these values are the current world conditions.</span>
      </div>
    </div>
  );
};

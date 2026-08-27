// src/ui/components/FarmForecastPopover.tsx
import React, { useRef } from "react";
import { WeatherState, ClockState } from "../../simulation/core/types";
import { forecastWeatherAt } from "../../simulation/weather/updateWeather";
import { formatWeatherLabel, WeatherIcon } from "../weatherPresentation";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeClose, ChromePanel } from "../chrome/Chrome";

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
  const popoverRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(popoverRef, onClose);

  const currentTemp = Math.round(weather.temperatureC);
  const seasonName = clock.season.charAt(0).toUpperCase() + clock.season.slice(1);
  const slots = [
    { label: "Now", type: forecastWeatherAt(weather, clock.currentMinute, 0) },
    { label: "+2h", type: forecastWeatherAt(weather, clock.currentMinute, 120) },
    { label: "+5h", type: forecastWeatherAt(weather, clock.currentMinute, 300) }
  ] as const;

  return (
    <ChromePanel
      id="farm-forecast-popover"
      ref={popoverRef}
      tone="slate"
      as="div"
      className="forecast-popover interactive"
      role="dialog"
      aria-label="Current farm conditions and forecast"
      tabIndex={-1}
      flourish
    >
      <div className="forecast-header">
        <div className="forecast-title-group">
          <strong className="forecast-title">Almanac & Forecast</strong>
          <span className="forecast-season">{seasonName}</span>
        </div>
        <ChromeClose onClick={onClose} label="Close forecast" className="forecast-close-btn" />
      </div>

      <div className="forecast-days-grid">
        {slots.map((slot) => (
          <div className={`forecast-day-card${slot.label === "Now" ? " is-today" : ""}`} key={slot.label}>
            <div className="forecast-day-meta">
              <span className="forecast-day-cond">
                <WeatherIcon type={slot.type} size={18} />
                <span className="forecast-slot-label">{slot.label}</span>
                <span className="forecast-slot-type">{formatWeatherLabel(slot.type)}</span>
                {slot.label === "Now" ? <span className="forecast-slot-temp">{`${currentTemp}°C`}</span> : null}
              </span>
            </div>
          </div>
        ))}
        <div className="forecast-day-card forecast-metrics-card">
          <div className="forecast-impact-list">
            <div className="forecast-impact-item">
              <span className="impact-label">Precipitation</span>
              <span className="impact-value">{`${Math.round(weather.precipitation * 100)}%`}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">Wind Speed</span>
              <span className="impact-value">{`${Math.round(weather.windSpeed * 1.944)} kn`}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">Sea Swell</span>
              <span className="impact-value">{`${Math.round(weather.seaRoughness * 100)}%`}</span>
            </div>
          </div>
        </div>
      </div>
    </ChromePanel>
  );
};


import React from "react";
import type { FarmForecastDto } from "../../simulation/core/contracts";
import { formatWeatherLabel, WeatherIcon } from "../weatherPresentation";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";

interface FarmForecastPopoverProps {
  forecast: FarmForecastDto;
  onClose: () => void;
}

export const FarmForecastPopover: React.FC<FarmForecastPopoverProps> = ({
  forecast,
  onClose
}) => {
  return (
    <GameSheet
      id="farm-forecast-popover"
      family="ink"
      tone="slate"
      as="div"
      className="forecast-popover interactive"
      role="region"
      aria-label="Current farm conditions and forecast"
    >
      <div className="forecast-header">
        <div className="forecast-title-group">
          <strong className="forecast-title">Coast forecast</strong>
          <span className="forecast-season">{forecast.seasonLabel}</span>
        </div>
        <ChromeClose onClick={onClose} label="Close forecast" className="forecast-close-btn" />
      </div>

      <div className="forecast-days-grid">
        {forecast.slots.map((slot) => (
          <div className={`forecast-day-card${slot.label === "Now" ? " is-today" : ""}`} key={slot.label}>
            <div className="forecast-day-meta">
              <span className="forecast-day-cond">
                <WeatherIcon type={slot.type} size={18} />
                <span className="forecast-slot-label">{slot.label}</span>
                <span className="forecast-slot-type">{formatWeatherLabel(slot.type)}</span>
                {slot.label === "Now" ? <span className="forecast-slot-temp">{`${forecast.currentTemperatureC}°C`}</span> : null}
              </span>
            </div>
          </div>
        ))}
        <div className="forecast-day-card forecast-metrics-card">
          <div className="forecast-impact-list">
            <div className="forecast-impact-item">
              <span className="impact-label">Rain</span>
              <span className="impact-value">{forecast.rainLabel}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">Wind</span>
              <span className="impact-value">{forecast.windLabel}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">Sea</span>
              <span className="impact-value">{forecast.seaLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </GameSheet>
  );
};

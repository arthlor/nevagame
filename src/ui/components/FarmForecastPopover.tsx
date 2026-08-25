// src/ui/components/FarmForecastPopover.tsx
import React from "react";
import { WeatherState, ClockState } from "../../simulation/core/types";
import { IconWeatherClear, IconWeatherRain, IconWeatherStorm, IconWeatherOvercast } from "./HudIcons";

interface FarmForecastPopoverProps {
  weather: WeatherState;
  clock: ClockState;
  farmingProficiency: number;
  onClose: () => void;
}

export const FarmForecastPopover: React.FC<FarmForecastPopoverProps> = ({
  weather,
  clock,
  farmingProficiency,
  onClose
}) => {
  const currentTemp = Math.round(weather.temperatureC);
  const currentDay = ((clock.dayCount - 1) % 30) + 1;
  const isMasterFarmer = farmingProficiency >= 5000;

  // Deterministic 3-day forecast derived from current simulation weather & dayCount
  const days = [
    {
      label: "TODAY",
      dayNumber: currentDay,
      tempHigh: currentTemp + 2,
      tempLow: Math.max(5, currentTemp - 6),
      rainProb: weather.type === "storm" ? 95 : weather.type === "heavy-rain" ? 85 : weather.type === "light-rain" ? 40 : 10,
      condition: weather.type === "storm" ? "Gale Storm" : weather.type === "heavy-rain" ? "Heavy Rain" : weather.type === "light-rain" ? "Light Rain" : weather.type === "cloudy" ? "Cloudy" : "Dry / Clear",
      icon: weather.type === "storm" ? <IconWeatherStorm size={18} /> : weather.type === "heavy-rain" || weather.type === "light-rain" ? <IconWeatherRain size={18} /> : weather.type === "cloudy" ? <IconWeatherOvercast size={18} /> : <IconWeatherClear size={18} />,

      cropImpacts: [
        { crop: "Barley", impact: "+12%", tone: "positive" },
        { crop: "Potatoes", impact: "+6%", tone: "positive" },
        { crop: "Strawberry", impact: weather.type === "storm" ? "-15%" : "+2%", tone: weather.type === "storm" ? "negative" : "neutral" }
      ]
    },
    {
      label: "TOMORROW",
      dayNumber: currentDay + 1,
      tempHigh: currentTemp + 3,
      tempLow: Math.max(6, currentTemp - 5),
      rainProb: ((clock.dayCount * 37) % 65) + 15,
      condition: ((clock.dayCount * 37) % 100) > 60 ? "Showers" : "Mild & Sunny",
      icon: ((clock.dayCount * 37) % 100) > 60 ? <IconWeatherRain size={18} /> : <IconWeatherClear size={18} />,
      cropImpacts: [
        { crop: "Wheat", impact: "+8%", tone: "positive" },
        { crop: "Tomato", impact: "+10%", tone: "positive" }
      ]
    },
    {
      label: "DAY 3",
      dayNumber: currentDay + 2,
      tempHigh: currentTemp + 5,
      tempLow: Math.max(7, currentTemp - 4),
      rainProb: ((clock.dayCount * 53) % 40) + 10,
      condition: "Warm & Breezy",
      icon: <IconWeatherClear size={18} />,
      cropImpacts: [
        { crop: "Corn", impact: "+15%", tone: "positive" },
        { crop: "Carrot", impact: "+5%", tone: "positive" }
      ]
    }
  ];

  return (
    <div className="forecast-popover interactive" role="dialog" aria-label="Farm weather forecast">
      <div className="forecast-header">
        <div className="forecast-title-group">
          <span className="forecast-badge-icon">🌾</span>
          <strong>Farm Weather Forecast</strong>
        </div>
        <button type="button" className="forecast-close-btn" onClick={onClose} aria-label="Close forecast">
          ✕
        </button>
      </div>

      <div className="forecast-days-grid">
        {days.map((d, index) => (
          <div key={d.label} className={`forecast-day-card ${index === 0 ? "is-today" : ""}`}>
            <div className="forecast-day-meta">
              <span className="forecast-day-label">{d.label} (Day {d.dayNumber})</span>
              <span className="forecast-day-cond">
                {d.icon}
                {d.condition}
              </span>
            </div>
            <div className="forecast-temp-row">
              <span className="temp-high">{d.tempHigh}°</span>
              <span className="temp-sep">/</span>
              <span className="temp-low">{d.tempLow}°C</span>
              <span className="rain-prob" title="Precipitation probability">
                💧 {isMasterFarmer ? `${d.rainProb}% (${Math.round(d.rainProb * 0.2)}mm)` : `${d.rainProb}%`}
              </span>
            </div>

            <div className="forecast-impact-list">
              <span className="forecast-impact-heading">Crop Growth Impact</span>
              {d.cropImpacts.map((imp) => (
                <div key={imp.crop} className="forecast-impact-item">
                  <span className="impact-crop-name">{imp.crop}</span>
                  <span className={`impact-badge impact-${imp.tone}`}>{imp.impact}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="forecast-footer-note">
        <span>💡 Higher farming proficiency unlocks deeper soil & precipitation accuracy.</span>
      </div>
    </div>
  );
};

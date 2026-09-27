import React, { useEffect, useRef } from "react";
import type { FarmForecastDto } from "../../simulation/core/contracts";
import { formatWeatherLabel, WeatherIcon } from "../weatherPresentation";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { useTranslation } from "../../i18n/useTranslation";

interface FarmForecastPopoverProps {
  forecast: FarmForecastDto;
  onClose: () => void;
  /** When false, Escape is left for an open modal instead of closing this popover. */
  captureEscape?: boolean;
}

const SLOT_LABEL_TR: Record<string, string> = {
  Now: "Şimdi",
  Morning: "Sabah",
  Afternoon: "Öğle",
  Evening: "Akşam",
  Night: "Gece",
  Tomorrow: "Yarın"
};

function localizeWeatherCondition(label: string, isTr: boolean): string {
  if (!isTr) return label;
  const lower = label.toLowerCase();
  if (lower.includes("clear") || lower.includes("sunny") || lower.includes("fine")) return "Açık";
  if (lower.includes("cloud") || lower.includes("overcast")) return "Bulutlu";
  if (lower.includes("fog") || lower.includes("mist")) return "Sisli";
  if (lower.includes("drizzle") || lower.includes("sprinkle")) return "Çiseleme";
  if (lower.includes("rain") || lower.includes("shower")) return "Yağmurlu";
  if (lower.includes("storm") || lower.includes("gale") || lower.includes("squall")) return "Fırtına";
  if (lower.includes("snow") || lower.includes("blizzard")) return "Karlı";
  if (lower.includes("calm")) return "Sakin";
  if (lower.includes("breeze")) return "Esintili";
  if (lower.includes("chop") || lower.includes("swell") || lower.includes("rough")) return "Dalgalı";
  return label;
}

export const FarmForecastPopover: React.FC<FarmForecastPopoverProps> = ({
  forecast,
  onClose,
  captureEscape = true
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!captureEscape) return;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => window.removeEventListener("keydown", handleWindowKeyDown, true);
  }, [captureEscape]);

  return (
    <GameSheet
      id="farm-forecast-popover"
      family="ink"
      tone="slate"
      as="div"
      className="forecast-popover interactive"
      role="region"
      aria-label={isTr ? "Mevcut çiftlik koşulları ve hava tahmini" : "Current farm conditions and forecast"}
    >
      <div className="forecast-header">
        <div className="forecast-title-group">
          <strong className="forecast-title">{isTr ? "Kıyı Hava Durumu" : "Coast forecast"}</strong>
          <span className="forecast-season">{forecast.seasonLabel}</span>
        </div>
        <ChromeClose onClick={onClose} label={isTr ? "Tahmini kapat" : "Close forecast"} className="forecast-close-btn" />
      </div>

      <div className="forecast-days-grid">
        {forecast.slots.map((slot) => {
          const slotLabel = isTr ? (SLOT_LABEL_TR[slot.label] ?? slot.label) : slot.label;
          return (
            <div className={`forecast-day-card${slot.label === "Now" ? " is-today" : ""}`} key={slot.label}>
              <div className="forecast-day-meta">
                <span className="forecast-day-cond">
                  <WeatherIcon type={slot.type} size={18} />
                  <span className="forecast-slot-label">{slotLabel}</span>
                  <span className="forecast-slot-type">{formatWeatherLabel(slot.type)}</span>
                  {slot.label === "Now" ? <span className="forecast-slot-temp">{`${forecast.currentTemperatureC}°C`}</span> : null}
                </span>
              </div>
            </div>
          );
        })}
        <div className="forecast-day-card forecast-metrics-card">
          <div className="forecast-impact-list">
            <div className="forecast-impact-item">
              <span className="impact-label">{isTr ? "Yağış" : "Rain now"}</span>
              <span className="impact-value">{localizeWeatherCondition(forecast.rainLabel, isTr)}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">{isTr ? "Rüzgar" : "Wind now"}</span>
              <span className="impact-value">{localizeWeatherCondition(forecast.windLabel, isTr)}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">{isTr ? "Deniz" : "Sea now"}</span>
              <span className="impact-value">{localizeWeatherCondition(forecast.seaLabel, isTr)}</span>
            </div>
          </div>
        </div>
      </div>
    </GameSheet>
  );
};

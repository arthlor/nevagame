import React, { useEffect, useRef } from "react";
import type { FarmForecastDto } from "../../simulation/core/contracts";
import { formatWeatherLabel, WeatherIcon } from "../weatherPresentation";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { useTranslation } from "../../i18n/useTranslation";
import { seasonLabel } from "../../i18n/placesTr";

interface FarmForecastPopoverProps {
  forecast: FarmForecastDto;
  onClose: () => void;
  /** When false, Escape is left for an open modal instead of closing this popover. */
  captureEscape?: boolean;
}

const SLOT_LABEL_TR: Record<FarmForecastDto["slots"][number]["label"], string> = {
  Now: "Şimdi",
  "+2h": "+2 sa",
  "+5h": "+5 sa"
};

const CONDITION_LABEL_TR: Record<FarmForecastDto["rainLabel"] | FarmForecastDto["windLabel"] | FarmForecastDto["seaLabel"], string> = {
  Soaking: "Yoğun yağış",
  "Showers possible": "Yer yer yağış",
  "Mostly dry": "Çoğunlukla kuru",
  Gale: "Kuvvetli",
  Breezy: "Esintili",
  Light: "Hafif",
  Rough: "Çalkantılı",
  Swell: "Dalgalı",
  Calm: "Sakin"
};

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
          <strong className="forecast-title">{isTr ? "Hava durumu" : "Forecast"}</strong>
          <span className="forecast-season">{seasonLabel(forecast.seasonLabel, locale)}</span>
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
              <span className="impact-label">{isTr ? "Yağış" : "Rain"}</span>
              <span className="impact-value">{isTr ? CONDITION_LABEL_TR[forecast.rainLabel] : forecast.rainLabel}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">{isTr ? "Rüzgâr" : "Wind"}</span>
              <span className="impact-value">{isTr ? CONDITION_LABEL_TR[forecast.windLabel] : forecast.windLabel}</span>
            </div>
            <div className="forecast-impact-item">
              <span className="impact-label">{isTr ? "Deniz" : "Sea"}</span>
              <span className="impact-value">{isTr ? CONDITION_LABEL_TR[forecast.seaLabel] : forecast.seaLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </GameSheet>
  );
};

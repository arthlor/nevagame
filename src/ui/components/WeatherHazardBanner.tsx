import React, { useState } from "react";
import type { MaritimeHazardDto } from "../../simulation/core/contracts";
import { IconWarning, IconWave } from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";
import { useTranslation } from "../../i18n/useTranslation";

export interface WeatherHazardBannerProps {
  hazard?: MaritimeHazardDto | { text: string; tone: "caution" | "danger" } | null;
  onDismiss?: () => void;
  className?: string;
}

type ResolvedHazard = Omit<MaritimeHazardDto, "hazardId"> & {
  hazardId: MaritimeHazardDto["hazardId"] | "weather";
};

const HAZARD_COPY = {
  "dense-fog": { en: ["Dense fog", "Use the chart and compass."], tr: ["Yoğun sis", "Harita ve pusulayla yönünü bul."] },
  squall: { en: ["Strong winds", "Allow room for drift."], tr: ["Kuvvetli rüzgâr", "Sürüklenmeye karşı mesafe bırak."] },
  "storm-waves": { en: ["Rough water", "Choose a sheltered route."], tr: ["Dalgalı deniz", "Korunaklı bir rota seç."] },
  storm: { en: ["Coastal storm", "At sea, face the wind or ease off the throttle."], tr: ["Kıyı fırtınası", "Denizde pruvayı rüzgâra çevir veya gazı azalt."] }
} satisfies Record<MaritimeHazardDto["hazardId"], { en: [string, string]; tr: [string, string] }>;

export function resolveMaritimeHazard(
  hazard?: WeatherHazardBannerProps["hazard"],
  locale = "en"
): ResolvedHazard | null {
  if (!hazard) return null;
  // Detailed measurements belong to the supplying DTO. A generic warning
  // cannot establish visibility in metres, wind in knots or a speed penalty.
  if ("hazardId" in hazard) return hazard;

  const text = hazard.text.toLowerCase();
  const hazardId = text.includes("fog") ? "dense-fog"
    : /gale|wind|squall/.test(text) ? "squall"
    : /swell|wave/.test(text) ? "storm-waves"
    : text.includes("storm") ? "storm" : "weather";
  const copy = hazardId === "weather" ? null : HAZARD_COPY[hazardId][locale === "tr" ? "tr" : "en"];
  return {
    hazardId,
    title: copy?.[0] ?? hazard.text,
    severity: hazard.tone,
    conditionLabel: "",
    navigationalAdvisory: copy?.[1] ?? ""
  };
}

export const WeatherHazardBanner: React.FC<WeatherHazardBannerProps> = React.memo(({
  hazard,
  onDismiss,
  className = ""
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const [dismissed, setDismissed] = useState(false);
  const resolved = resolveMaritimeHazard(hazard, locale);

  if (!resolved || dismissed) return null;

  const isDanger = resolved.severity === "danger";

  return (
    <aside
      className={`weather-hazard-banner severity--${resolved.severity} ${className}`.trim()}
      role={isDanger ? "alert" : "status"}
      aria-live={isDanger ? "assertive" : "polite"}
      data-testid="weather-hazard-banner"
      data-hazard-id={resolved.hazardId}
      data-severity={resolved.severity}
    >
      <div className="hazard-banner-icon-col">
        {isDanger ? (
          <IconWarning size={18} className="hazard-icon hazard-icon--danger" aria-hidden="true" />
        ) : (
          <IconWave size={18} className="hazard-icon hazard-icon--caution" aria-hidden="true" />
        )}
      </div>

      <div className="hazard-banner-content">
        <div className="hazard-banner-header-row">
          <strong className="hazard-banner-title">{resolved.title}</strong>
          {resolved.conditionLabel && <span className="hazard-condition-badge">{resolved.conditionLabel}</span>}
        </div>
        {resolved.navigationalAdvisory && <p className="hazard-banner-advisory">{resolved.navigationalAdvisory}</p>}
      </div>

      <ChromeClose
        onClick={() => {
          onDismiss?.();
          setDismissed(true);
        }}
        label={isTr ? "Hava uyarısını kapat" : "Dismiss weather warning"}
        className="hazard-banner-close hazard-banner-dismiss-btn"
      />
    </aside>
  );
});

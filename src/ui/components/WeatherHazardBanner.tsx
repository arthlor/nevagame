import React, { useState } from "react";
import type { MaritimeHazardDto } from "../../simulation/core/contracts";
import { IconWarning, IconWave } from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";

export interface WeatherHazardBannerProps {
  hazard?: MaritimeHazardDto | { text: string; tone: "caution" | "danger" } | null;
  onDismiss?: () => void;
  className?: string;
}

export function resolveMaritimeHazard(
  hazard?: MaritimeHazardDto | { text: string; tone: "caution" | "danger" } | null
): MaritimeHazardDto | null {
  if (!hazard) return null;

  if ("hazardId" in hazard) return hazard;

  const textLower = hazard.text.toLowerCase();
  if (textLower.includes("fog")) {
    return {
      hazardId: "dense-fog",
      title: "Dense Maritime Fog",
      severity: "caution",
      conditionLabel: "Visibility < 50m",
      navigationalAdvisory: "Zero horizon reference. Rely strictly on nautical compass bearings.",
      speedPenaltyPercent: 15
    };
  }

  if (textLower.includes("gale") || textLower.includes("wind") || textLower.includes("squall")) {
    return {
      hazardId: "squall",
      title: "Gale-Force Squall",
      severity: "caution",
      conditionLabel: "Gusts > 22 kn",
      navigationalAdvisory: "High vessel drift. Steer into wind and maintain engine power.",
      speedPenaltyPercent: 20
    };
  }

  if (textLower.includes("swell") || textLower.includes("wave")) {
    return {
      hazardId: "storm-waves",
      title: "Hazardous Rough Swell",
      severity: "caution",
      conditionLabel: "Sea swell > 0.70",
      navigationalAdvisory: "Heavy roll on open water. Keep off shoals and shallow bars.",
      speedPenaltyPercent: 25
    };
  }

  return {
    hazardId: "storm",
    title: "Severe Coastal Storm",
    severity: hazard.tone === "danger" ? "danger" : "caution",
    conditionLabel: "Heavy Gale & Waves",
    navigationalAdvisory: "Hazardous sea state. Small vessels risk severe hull damage. Head for shelter.",
    speedPenaltyPercent: 30
  };
}

export const WeatherHazardBanner: React.FC<WeatherHazardBannerProps> = ({
  hazard,
  onDismiss,
  className = ""
}) => {
  const [dismissed, setDismissed] = useState(false);
  const resolved = resolveMaritimeHazard(hazard);

  if (!resolved || dismissed) return null;

  const isDanger = resolved.severity === "danger";

  return (
    <aside
      className={`weather-hazard-banner severity--${resolved.severity} ${className}`.trim()}
      role="alert"
      aria-live="assertive"
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
          <span className="hazard-condition-badge">{resolved.conditionLabel}</span>
        </div>
        <p className="hazard-banner-advisory">{resolved.navigationalAdvisory}</p>
      </div>

      {onDismiss ? (
        <ChromeClose
          onClick={onDismiss}
          label="Dismiss weather warning"
          className="hazard-banner-close"
        />
      ) : (
        <button
          type="button"
          className="hazard-banner-dismiss-btn"
          aria-label="Hide warning"
          onClick={() => setDismissed(true)}
        >
          ×
        </button>
      )}
    </aside>
  );
};

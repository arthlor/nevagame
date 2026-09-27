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

const TR_HAZARDS: Record<string, { title: string; conditionLabel: string; advisory: string }> = {
  "dense-fog": {
    title: "Yoğun Deniz Sisi",
    conditionLabel: "Görüş < 50m",
    advisory: "Ufuk çizgisi kayboldu. Yalnızca pusula kerterizine güven."
  },
  "squall": {
    title: "Fırtına Borası",
    conditionLabel: "Sağanak > 22 kn",
    advisory: "Tekne sürüklenmesi yüksek. Rüzgara karşı dümen kır ve motor gücünü koru."
  },
  "storm-waves": {
    title: "Tehlikeli Azgın Dalga",
    conditionLabel: "Dalga kabarması > 0.70",
    advisory: "Açık denizde şiddetli yalpa. Sığlıklardan ve topuklardan uzak dur."
  },
  "storm": {
    title: "Şiddetli Kıyı Fırtınası",
    conditionLabel: "Kuvvetli Fırtına & Dalgalar",
    advisory: "Tehlikeli deniz durumu. Küçük teknelerin gövdesi darbe alır — pruvayı rüzgara tut ya da alargaya çıkıp bekle."
  }
};

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
    navigationalAdvisory: "Hazardous sea state. Small vessels take hull damage — keep her head to the wind, or heave to and wait.",
    speedPenaltyPercent: 30
  };
}

export const WeatherHazardBanner: React.FC<WeatherHazardBannerProps> = ({
  hazard,
  onDismiss,
  className = ""
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const [dismissed, setDismissed] = useState(false);
  const resolved = resolveMaritimeHazard(hazard);

  if (!resolved || dismissed) return null;

  const isDanger = resolved.severity === "danger";
  const title = (isTr ? TR_HAZARDS[resolved.hazardId]?.title : null) || resolved.title;
  const conditionLabel = (isTr ? TR_HAZARDS[resolved.hazardId]?.conditionLabel : null) || resolved.conditionLabel;
  const advisory = (isTr ? TR_HAZARDS[resolved.hazardId]?.advisory : null) || resolved.navigationalAdvisory;

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
          <strong className="hazard-banner-title">{title}</strong>
          <span className="hazard-condition-badge">{conditionLabel}</span>
        </div>
        <p className="hazard-banner-advisory">{advisory}</p>
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
};

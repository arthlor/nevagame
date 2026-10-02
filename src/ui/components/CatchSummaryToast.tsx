import React, { useEffect, useRef, useState } from "react";
import type { FishCargoState } from "../../simulation/core/types";
import type { TrophyCatchDto } from "../../simulation/core/contracts";
import { ContentRegistry } from "../../content/ContentRegistry";
import { catchStorageLabel } from "../../simulation/fishing/trophyCatch";
import { IconFish } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";
import { useTranslation } from "../../i18n/useTranslation";

export interface CatchSummaryToastProps {
  cargo?: FishCargoState | null;
  catchData?: TrophyCatchDto | null;
  onDismiss: () => void;
  onClick?: () => void;
  className?: string;
}

function localizeStorageLabel(label: string, locale: string): string {
  if (locale !== "tr") return label;
  if (label.includes("Satchel")) return "Heybe";
  if (label.includes("Boat hold") || label.includes("hold")) return "Tekne ambarı";
  if (label.includes("Farm storage")) return "Çiftlik deposu";
  if (label.includes("Waiting in hand")) return "Elde bekliyor";
  return label;
}

export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({
  cargo,
  catchData,
  onDismiss,
  onClick,
  className = ""
}) => {
  const { locale, getLocalizedFish } = useTranslation();
  const [visible, setVisible] = useState(true);
  const [held, setHeld] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const resolvedId = catchData?.cargoId ?? cargo?.id ?? "catch";
  const speciesId = catchData?.speciesId ?? cargo?.speciesId ?? "";
  const weightKg = catchData?.weightKg ?? cargo?.weightKg ?? 0;
  const quality = catchData?.quality ?? cargo?.quality ?? "common";
  const freshness = catchData?.freshnessPercent ?? (cargo ? Math.round(cargo.freshness) : 100);

  const rawStorageLabel =
    catchData?.storageLocationLabel ?? catchStorageLabel(cargo?.location.type ?? "player");
  const storageLabel = localizeStorageLabel(rawStorageLabel, locale);

  useEffect(() => {
    setVisible(true);
    playUiSound("chime");
  }, [resolvedId]);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current();
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [resolvedId, held]);

  if (!visible) return null;

  const species = ContentRegistry.fishSpecies.get(speciesId);
  const rawSpeciesName = catchData?.speciesName ?? species?.name ?? (locale === "tr" ? "Sportif balık" : "Sport fish");
  const speciesName = (locale === "tr" ? getLocalizedFish(speciesId).name : null) || rawSpeciesName;

  const summary = (
    <>
      <div className="catch-summary-icon" aria-hidden="true">
        <AtlasImage src={atlasForFish(speciesId)} alt="" size={40} />
        {!atlasForFish(speciesId) && <IconFish size={19} />}
      </div>
      <div className="catch-summary-copy">
        <strong className="catch-summary-name">{speciesName}</strong>
        <span className="catch-summary-stats">
          {weightKg.toFixed(1)} kg · <ChromeQuality quality={quality} /> · {storageLabel}
        </span>
        <div className="catch-summary-subline">
          <small>{locale === "tr" ? `%${freshness} taze` : `${freshness}% fresh`}</small>
          {onClick && (
            <span className="catch-summary-inspect-hint">
              {locale === "tr" ? "Avı incele" : "Inspect catch"}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <GameSheet
      family="ink"
      as="aside"
      className={`catch-summary interactive ${className}`.trim()}
      tone="slate"
      corners
      role="status"
      aria-live="polite"
      data-testid="catch-summary"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false);
      }}
    >
      {onClick ? (
        <button
          type="button"
          className="catch-summary-open"
          aria-label={locale === "tr" ? `${speciesName} avını incele` : `Inspect ${speciesName} catch`}
          onClick={onClick}
        >
          {summary}
        </button>
      ) : (
        <div className="catch-summary-open">{summary}</div>
      )}
      <ChromeClose
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        label={locale === "tr" ? "Av özetini kapat" : "Dismiss catch summary"}
        className="catch-summary-close"
      />
    </GameSheet>
  );
};

import React, { useEffect, useRef, useState } from "react";
import type { FishCargoState } from "../../simulation/core/types";
import type { TrophyCatchDto } from "../../simulation/core/contracts";
import { ContentRegistry } from "../../content/ContentRegistry";
import { IconFish } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";

export interface CatchSummaryToastProps {
  cargo?: FishCargoState | null;
  catchData?: TrophyCatchDto | null;
  onDismiss: () => void;
  onClick?: () => void;
  className?: string;
}

export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({
  cargo,
  catchData,
  onDismiss,
  onClick,
  className = ""
}) => {
  const [visible, setVisible] = useState(true);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const resolvedId = catchData?.cargoId ?? cargo?.id ?? "catch";
  const speciesId = catchData?.speciesId ?? cargo?.speciesId ?? "";
  const weightKg = catchData?.weightKg ?? cargo?.weightKg ?? 0;
  const quality = catchData?.quality ?? cargo?.quality ?? "common";
  const freshness = catchData?.freshnessPercent ?? (cargo ? Math.round(cargo.freshness) : 100);

  const storageLabel =
    catchData?.storageLocationLabel ??
    (cargo?.location.type === "player"
      ? "Carried by hand"
      : cargo?.location.type === "boat-hold"
        ? "Stowed in hold"
        : cargo?.location.type === "boat-hook"
          ? "Hung on transom hook"
          : "Stowed in hold");

  useEffect(() => {
    setVisible(true);
    playUiSound("chime");
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current();
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [resolvedId]);

  if (!visible) return null;

  const species = ContentRegistry.fishSpecies.get(speciesId);
  const speciesName = catchData?.speciesName ?? species?.name ?? "Sport fish";

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
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
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
          <small>{freshness}% fresh</small>
          {onClick && <span className="catch-summary-inspect-hint">Click to inspect</span>}
        </div>
      </div>
      <ChromeClose
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        label="Dismiss catch summary"
        className="catch-summary-close"
      />
    </GameSheet>
  );
};

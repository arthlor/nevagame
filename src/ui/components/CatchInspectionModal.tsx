import React, { useEffect, useRef, useState } from "react";
import type { FishCargoState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { IconFish } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";

interface CatchSummaryToastProps {
  cargo: FishCargoState;
  onDismiss: () => void;
}

export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({ cargo, onDismiss }) => {
  const [visible, setVisible] = useState(true);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setVisible(true);
    playUiSound("chime");
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current();
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [cargo.id]);

  if (!visible) return null;

  const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
  const storageLabel = cargo.location.type === "player" ? "Carried by hand" : "Stowed in hold";

  return (
    <GameSheet family="ink" as="aside" className="catch-summary interactive" tone="slate" corners role="status" aria-live="polite" data-testid="catch-summary">
      <div className="catch-summary-icon" aria-hidden="true">
        <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={40} />
        {!atlasForFish(cargo.speciesId) && <IconFish size={19} />}
      </div>
      <div className="catch-summary-copy">
        <strong>{species?.name ?? "Sport fish"}</strong>
        <span>
          {cargo.weightKg.toFixed(1)} kg · <ChromeQuality quality={cargo.quality} /> · {storageLabel}
        </span>
        <small>{Math.round(cargo.freshness)}% fresh</small>
      </div>
      <ChromeClose onClick={onDismiss} label="Dismiss catch summary" className="catch-summary-close" />
    </GameSheet>
  );
};

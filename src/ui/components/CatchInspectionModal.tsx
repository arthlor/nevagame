import React, { useEffect, useRef, useState } from "react";
import type { FishCargoState, MarketState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateFishPrice } from "../../simulation/economy/calculateFishValue";
import { IconFish } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeClose, ChromePanel, ChromeQuality } from "../chrome/Chrome";
import { playUiSound } from "../audio/uiAudio";

interface CatchSummaryToastProps {
  cargo: FishCargoState;
  harborMarket?: MarketState | null;
  onDismiss: () => void;
}

export function calculateCatchSummaryHarborEstimate(
  cargo: FishCargoState,
  harborMarket?: MarketState | null
): number | null {
  const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
  const commodity = harborMarket?.commodities[cargo.speciesId];
  if (!species || !commodity) return null;
  return calculateFishPrice(
    species,
    cargo.weightKg,
    cargo.quality,
    cargo.freshness,
    commodity.demandIndex,
    commodity.seasonalModifier
  ).finalPrice;
}

/**
 * A landed fish is already cargo when this surface appears. Keep the result
 * informative and transient; selling, discarding, and delivery belong to the
 * market/contract surfaces where their consequences are explicit.
 */
export const CatchSummaryToast: React.FC<CatchSummaryToastProps> = ({ cargo, harborMarket, onDismiss }) => {
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
  const harborEstimate = calculateCatchSummaryHarborEstimate(cargo, harborMarket);
  const storageLabel = cargo.location.type === "player" ? "Carried by hand" : "Stowed in hold";

  return (
    <ChromePanel as="aside" className="catch-summary interactive" tone="slate" flourish corners role="status" aria-live="polite" data-testid="catch-summary">
      <div className="catch-summary-icon" aria-hidden="true">
        <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={40} />
        {!atlasForFish(cargo.speciesId) && <IconFish size={19} />}
      </div>
      <div className="catch-summary-copy">
        <strong>{species?.name ?? "Sport fish"}</strong>
        <span>
          {cargo.weightKg.toFixed(1)} kg · <ChromeQuality quality={cargo.quality} /> · {storageLabel}
        </span>
        {harborEstimate != null && <small>Harbor estimate {harborEstimate} G · {Math.round(cargo.freshness)}% fresh</small>}
      </div>
      <ChromeClose onClick={onDismiss} label="Dismiss catch summary" className="catch-summary-close" />
    </ChromePanel>
  );
};

import React, { useEffect } from "react";
import type { TrophyCatchDto } from "../../simulation/core/contracts";
import { IconCoin, IconFish, IconSparkle, IconStar} from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeQuality } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";

export { CatchSummaryToast, type CatchSummaryToastProps } from "./CatchSummaryToast";

export interface CatchInspectionModalProps {
  catchData: TrophyCatchDto;
  onDismiss: () => void;
  onOpenHoldOrSatchel?: () => void;
  className?: string;
}

const RECORD_LABELS: Record<"first" | "weight" | "quality", { title: string; subtitle: string }> = {
  first: { title: "NEW SPECIES RECORD", subtitle: "First specimen recorded in Coastal Almanac" },
  weight: { title: "HEAVIEST CATCH RECORD", subtitle: "Surpasses previous personal weight record" },
  quality: { title: "FINEST GRADE RECORD", subtitle: "Surpasses previous personal quality record" }
};

export const CatchInspectionModal: React.FC<CatchInspectionModalProps> = ({
  catchData,
  onDismiss,
  onOpenHoldOrSatchel,
  className = ""
}) => {
  useEffect(() => {
    playUiSound("fanfare");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      } else if ((event.key === "l" || event.key === "L") && onOpenHoldOrSatchel) {
        event.preventDefault();
        event.stopPropagation();
        onOpenHoldOrSatchel();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onDismiss, onOpenHoldOrSatchel]);



  return (
    <div
      className="modal-backdrop catch-inspection-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <GameSheet
        as="section"
        className={`catch-inspection-modal interactive ${className}`.trim()}
        tone="plaque"
        corners
        rivets
        role="dialog"
        aria-modal="true"
        aria-labelledby="catch-modal-title"
        tabIndex={0}
        data-testid="catch-inspection-modal"
      >
        <header className="catch-modal-header">
          <div className="catch-celebration-title">
            <span className="catch-celebration-subtitle">COASTAL SPORT ANGLING</span>
            <strong id="catch-modal-title" className="catch-celebration-headline">
              Trophy Catch Landed!
            </strong>
          </div>
          <ChromeClose onClick={onDismiss} label="Close trophy inspection" className="catch-modal-close" />
        </header>

        {catchData.record && (
          <div className={`catch-record-banner record-${catchData.record}`} role="status">
            <span className="record-star-glyph"><IconSparkle size={13} /></span>
            <div className="record-text-group">
              <strong className="record-title">{RECORD_LABELS[catchData.record].title}</strong>
              <span className="record-subtitle">{RECORD_LABELS[catchData.record].subtitle}</span>
            </div>
            <span className="record-star-glyph"><IconSparkle size={13} /></span>
          </div>
        )}

        <div className="catch-modal-body">
          <div className="catch-portrait-column">
            <div className="catch-portrait-frame">
              <AtlasImage src={atlasForFish(catchData.speciesId)} alt={catchData.speciesName} size={96} />
              {!atlasForFish(catchData.speciesId) && <IconFish size={64} aria-hidden="true" />}
            </div>
            <div className="catch-quality-badge-row">
              <span className="catch-stars" aria-label={`${catchData.qualityStars} out of 4 stars`}>
                {Array.from({ length: 4 }, (_, index) => (
                  <IconStar
                    key={index}
                    size={14}
                    filled={index < catchData.qualityStars}
                    className={index < catchData.qualityStars ? "is-earned" : "is-unearned"}
                  />
                ))}
              </span>
              <ChromeQuality quality={catchData.quality} />
            </div>
            <span className="catch-cargo-class">{`${catchData.cargoClass.toUpperCase()} CLASS`}</span>
          </div>

          <div className="catch-details-column">
            <h3 className="catch-species-name">{catchData.speciesName}</h3>

            <dl className="catch-metrics-grid">
              <div className="catch-metric-tile">
                <dt>Weight</dt>
                <dd className="metric-weight">{`${catchData.weightKg.toFixed(2)} kg`}</dd>
              </div>

              <div className="catch-metric-tile">
                <dt>Length</dt>
                <dd className="metric-length">{`${catchData.lengthCm.toFixed(1)} cm`}</dd>
              </div>

              <div className="catch-metric-tile">
                <dt>Estimated Value</dt>
                <dd className="metric-value">
                  <IconCoin size={15} className="coin-icon" aria-hidden="true" />
                  <strong>{`${catchData.estimatedMarketValue} G`}</strong>
                </dd>
              </div>

              <div className="catch-metric-tile">
                <dt>Freshness</dt>
                <dd className={`metric-freshness freshness-${catchData.freshnessTone}`}>
                  <span>{`${catchData.freshnessPercent}%`}</span>
                  <small>{`~${catchData.estimatedShelfLifeMinutes}m remaining`}</small>
                </dd>
              </div>
            </dl>

            <div className="catch-storage-box">
              <span className="storage-destination-label">Storage:</span>
              <strong>{catchData.storageLocationLabel}</strong>
            </div>
          </div>
        </div>

        <footer className="catch-modal-footer">
          {onOpenHoldOrSatchel && (
            <ChromeButton
              variant="secondary"
              onClick={onOpenHoldOrSatchel}
              className="catch-inspect-hold-btn"
            >
              Inspect Hold <kbd>[L]</kbd>
            </ChromeButton>
          )}
          <ChromeButton
            variant="primary"
            onClick={onDismiss}
            className="catch-continue-btn"
          >
            Continue Fishing <kbd>[Space]</kbd>
          </ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

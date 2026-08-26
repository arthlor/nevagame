// src/ui/components/CatchInspectionModal.tsx
import React from "react";
import { FishCargoState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateFishPrice } from "../../simulation/economy/calculateFishValue";
import { IconFish } from "./HudIcons";

interface CatchInspectionModalProps {
  cargo: FishCargoState;
  onKeep: () => void;
  onRelease: () => void;
}

export const CatchInspectionModal: React.FC<CatchInspectionModalProps> = ({
  cargo,
  onKeep,
  onRelease
}) => {
  const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
  const breakdown = speciesDef
    ? calculateFishPrice(speciesDef, cargo.weightKg, cargo.quality, cargo.freshness, 1.0, 1.0)
    : null;
  const isTrophy = cargo.quality === "trophy";

  return (
    <div className="modal-overlay interactive catch-inspection-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="catch-plaque-modal" role="dialog" aria-label="Catch Inspection">
        <div className="plaque-rivets-top">
          <span className="plaque-rivet" />
          <span className="plaque-rivet" />
        </div>

        <header className="catch-plaque-header">
          <div className="plaque-icon-wrap">
            <IconFish size={24} className="plaque-fish-icon" />
          </div>
          <span className="plaque-kicker">CATCH RECORD</span>
          <h2 className="plaque-species-title">{speciesDef?.name ?? "Sport Fish"}</h2>
          {isTrophy && <div className="trophy-banner">★ PERSONAL BEST RECORD ★</div>}
        </header>

        <div className="catch-plaque-body">
          <div className="plaque-specs-row">
            <div className="spec-card">
              <span className="spec-label">Weight</span>
              <strong className="spec-value">{cargo.weightKg.toFixed(1)} <small>kg</small></strong>
            </div>
            <div className="spec-card">
              <span className="spec-label">Freshness</span>
              <strong className="spec-value">{Math.round(cargo.freshness)} <small>%</small></strong>
            </div>
          </div>

          <div className="plaque-attributes-grid">
            <div className="attr-row">
              <span className="attr-label">Quality Grade:</span>
              <span className={`quality-badge quality-${cargo.quality}`}>{cargo.quality.toUpperCase()}</span>
            </div>
            <div className="attr-row">
              <span className="attr-label">Base value:</span>
              <strong className="value-estimate">{breakdown ? `${breakdown.finalPrice} G` : "Unavailable"}</strong>
            </div>
          </div>

          <p className="plaque-logistics-notice">
            📦 Physical cargo: Stows into your vessel hold or player carry. Cargo loses freshness over time.
          </p>
        </div>

        <footer className="catch-plaque-actions">
          <button
            type="button"
            className="neva-button plaque-keep-btn"
            onClick={onKeep}
          >
            KEEP CARGO
          </button>
          <button
            type="button"
            className="neva-button plaque-release-btn"
            onClick={onRelease}
          >
            RELEASE FISH
          </button>
        </footer>

        <div className="plaque-rivets-bottom">
          <span className="plaque-rivet" />
          <span className="plaque-rivet" />
        </div>
      </div>
    </div>
  );
};

// src/ui/components/LogisticsLedgerModal.tsx
import React, { useRef, useState } from "react";
import { GameState, FishCargoState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateFishPrice } from "../../simulation/economy/calculateFishValue";
import { IconCoin, IconFish, IconSprout, IconBoat, IconLedger } from "./HudIcons";
import { useModalAccessibility } from "../useModalAccessibility";
import { ChromeButton, ChromeClose, ChromeMeter, ChromePanel, ChromeQuality, ChromeSlot } from "../chrome/Chrome";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";

interface LogisticsLedgerModalProps {
  state: GameState;
  onClose: () => void;
  initialTab?: LedgerTab;
}

type LedgerTab = "money" | "cargo";

export const LogisticsLedgerModal: React.FC<LogisticsLedgerModalProps> = ({
  state,
  onClose,
  initialTab = "money"
}) => {
  const [activeTab, setActiveTab] = useState<LedgerTab>(initialTab);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const { player } = state;
  const totalGold = player.money;
  const allCargo = Object.values(state.fishCargo);
  const totalCargoWeightKg = allCargo.reduce((sum, cargo) => sum + cargo.weightKg, 0);
  const harborMarket = state.markets["market.harbor"];
  const estimatedCargoValue = allCargo.reduce((sum, cargo) => {
    const species = ContentRegistry.fishSpecies.get(cargo.speciesId);
    const commodity = harborMarket?.commodities[cargo.speciesId];
    if (!species || !commodity) return sum;
    return sum + calculateFishPrice(
      species,
      cargo.weightKg,
      cargo.quality,
      cargo.freshness,
      commodity.demandIndex,
      commodity.seasonalModifier
    ).finalPrice;
  }, 0);
  const ownedBoats = Object.values(state.boats);
  const estimatedBoatValue = ownedBoats.reduce(
    (sum, boat) => sum + (ContentRegistry.boats.get(boat.boatTypeId)?.costMoney ?? 0),
    0
  );
  const plantedCount = Object.keys(state.crops).length;
  const totalFarmPlots = Object.values(state.farms).reduce(
    (sum, farm) => sum + farm.placedCropIds.length,
    0
  );
  const selectTab = (tab: LedgerTab) => {
    playUiSound("page-turn");
    setActiveTab(tab);
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
        ref={modalRef}
        as="div"
        className="ledger-modal"
        tone="slate"
        flourish
        corners
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ledger-title"
        tabIndex={-1}
      >
        <header className="ledger-header">
          <div className="ledger-title-group">
            <span className="ledger-icon" aria-hidden="true"><IconLedger size={24} /></span>
            <div>
              <h2 id="ledger-title" className="ledger-title">Captain's ledger</h2>
              <span className="ledger-subtitle">Gold, cargo, and vessels</span>
            </div>
          </div>

          <div className="ledger-tabs-bar mm-ribbon-tabs" role="tablist" aria-label="Ledger sections" data-testid="ledger-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "money"}
              aria-controls="ledger-tab-content"
              className={`ledger-tab-btn ${activeTab === "money" ? "is-active" : ""}`}
              onClick={() => selectTab("money")}
            >
              <IconCoin size={18} aria-hidden="true" />
              Money
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cargo"}
              aria-controls="ledger-tab-content"
              className={`ledger-tab-btn ${activeTab === "cargo" ? "is-active" : ""}`}
              onClick={() => selectTab("cargo")}
            >
              <IconFish size={18} aria-hidden="true" />
              Cargo & boats
            </button>
          </div>

          <ChromeClose onClick={onClose} label="Close ledger" className="ledger-close-btn" />
        </header>

        <div id="ledger-tab-content" className="ledger-body" role="tabpanel">
          {activeTab === "money" ? (
            <div className="ledger-ledger-sheet">
              <section className="ledger-section" aria-labelledby="ledger-position-title">
                <h3 id="ledger-position-title">Position</h3>
                <dl className="ledger-entry-list">
                  <div className="ledger-entry-row">
                    <dt><IconCoin size={18} aria-hidden="true" /> Gold on hand</dt>
                    <dd className="gold-text">{totalGold.toLocaleString()} G</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconBoat size={18} aria-hidden="true" /> Vessels at cost</dt>
                    <dd>{estimatedBoatValue.toLocaleString()} G</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconFish size={18} aria-hidden="true" /> Fish at harbor prices</dt>
                    <dd className="green-text">{estimatedCargoValue.toLocaleString()} G</dd>
                  </div>
                  <div className="ledger-entry-row ledger-entry-total">
                    <dt>Estimated holdings</dt>
                    <dd>{(totalGold + estimatedBoatValue + estimatedCargoValue).toLocaleString()} G</dd>
                  </div>
                </dl>
              </section>

              <section className="ledger-section" aria-labelledby="ledger-holdings-title">
                <h3 id="ledger-holdings-title">What is in hand</h3>
                <dl className="ledger-entry-list">
                  <div className="ledger-entry-row">
                    <dt><IconFish size={18} aria-hidden="true" /> Sport fish</dt>
                    <dd>{allCargo.length} fish · {totalCargoWeightKg.toFixed(1)} kg</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconSprout size={18} aria-hidden="true" /> Planted crops</dt>
                    <dd>{plantedCount}</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconBoat size={18} aria-hidden="true" /> Owned vessels</dt>
                    <dd>{ownedBoats.length}</dd>
                  </div>
                </dl>
              </section>

              <p className="ledger-note">This ledger records the present balance and holdings. It does not invent a sales history or operating-cost history.</p>
            </div>
          ) : (
            <div className="ledger-ledger-sheet">
              <section className="ledger-section" aria-labelledby="ledger-stores-title">
                <h3 id="ledger-stores-title">Stores and vessels</h3>
                <dl className="ledger-entry-list">
                  <div className="ledger-entry-row">
                    <dt><IconSprout size={18} aria-hidden="true" /> Homestead plots in use</dt>
                    <dd>{totalFarmPlots}</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconSprout size={18} aria-hidden="true" /> Planted crops</dt>
                    <dd>{plantedCount}</dd>
                  </div>
                  <div className="ledger-entry-row">
                    <dt><IconBoat size={18} aria-hidden="true" /> Registered vessels</dt>
                    <dd>{ownedBoats.length}</dd>
                  </div>
                </dl>
              </section>

              {ownedBoats.map((boat) => {
                const boatDef = ContentRegistry.boats.get(boat.boatTypeId);
                const boatCargoSlots: (FishCargoState | null)[] = boat.fishCargoSlotIds.map((id) =>
                  id ? state.fishCargo[id] ?? null : null
                );
                const occupiedHold = boatCargoSlots.filter(Boolean).length;
                const boatWeightKg = boatCargoSlots.reduce((sum, cargo) => sum + (cargo ? cargo.weightKg : 0), 0);
                return (
                  <section
                    key={boat.id}
                    className="vessel-spatial-bay-section ledger-section"
                    aria-labelledby={`ledger-hold-title-${boat.id}`}
                  >
                    <h3 id={`ledger-hold-title-${boat.id}`}>{boatDef?.name ?? "Vessel"} hold</h3>
                    <ChromeMeter
                      className="ledger-hold-meter"
                      label="Hold occupancy"
                      value={occupiedHold}
                      max={Math.max(1, boatCargoSlots.length)}
                      valueText={`${occupiedHold} / ${boatCargoSlots.length} · ${boatWeightKg.toFixed(1)} kg`}
                      variant="gold"
                    />
                    <div className="vessel-slots-grid" aria-label={`${boatDef?.name ?? "Vessel"} hold slots`} data-testid="ledger-hold-grid">
                      {boatCargoSlots.map((cargo, index) => {
                        if (!cargo) {
                          return (
                            <ChromeSlot
                              key={`${boat.id}-slot-${index}`}
                              className="vessel-hold-slot"
                              slotNumber={index + 1}
                              label={`Empty hold slot ${index + 1}`}
                            />
                          );
                        }
                        const freshnessTone = cargo.freshness > 65 ? "fresh" : cargo.freshness > 35 ? "medium" : "stale";
                        const fishName = ContentRegistry.fishSpecies.get(cargo.speciesId)?.name ?? "Fish";
                        return (
                          <ChromeSlot
                            key={`${boat.id}-slot-${index}`}
                            className="vessel-hold-slot is-occupied"
                            filled
                            slotNumber={index + 1}
                            label={`${fishName}, ${cargo.weightKg.toFixed(1)} kg, ${Math.round(cargo.freshness)}% fresh`}
                          >
                            <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={28} />
                            <ChromeQuality quality={cargo.quality} showLabel={false} />
                            <span className="cell-cargo-meta">{cargo.weightKg.toFixed(1)} kg</span>
                            <div className="cargo-freshness-track" aria-hidden="true">
                              <div
                                className={`cargo-freshness-fill freshness-${freshnessTone}`}
                                style={{ width: `${Math.round(cargo.freshness)}%` }}
                              />
                            </div>
                          </ChromeSlot>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <footer className="modal-footer">
          <ChromeButton onClick={onClose}>Close ledger</ChromeButton>
        </footer>
      </ChromePanel>
    </div>
  );
};

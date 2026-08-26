// src/ui/components/LogisticsLedgerModal.tsx
import React, { useState } from "react";
import { GameState, FishCargoState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { calculateFishPrice } from "../../simulation/economy/calculateFishValue";
import { IconCoin, IconFish, IconSprout, IconBoat } from "./HudIcons";

interface LogisticsLedgerModalProps {
  state: GameState;
  onClose: () => void;
}

type LedgerTab = "pnl" | "logistics";

export const LogisticsLedgerModal: React.FC<LogisticsLedgerModalProps> = ({ state, onClose }) => {
  const [activeTab, setActiveTab] = useState<LedgerTab>("pnl");
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
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;

  // Calculate cargo carried on boat
  const boatCargoSlots: (FishCargoState | null)[] = activeBoat
    ? activeBoat.fishCargoSlotIds.map((id) => (id ? state.fishCargo[id] ?? null : null))
    : [];

  const boatWeightKg = boatCargoSlots.reduce((acc, c) => acc + (c ? c.weightKg : 0), 0);
  // These are current holdings only. Sales history and warehouse capacity are
  // not persisted in the simulation, so the ledger does not invent them.
  const plantedCount = Object.keys(state.crops).length;
  const totalFarmPlots = Object.values(state.farms).reduce(
    (sum, farm) => sum + farm.placedCropIds.length,
    0
  );

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="ledger-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Captain & Master Ledger">
        <header className="ledger-header">
          <div className="ledger-title-group">
            <span className="ledger-icon">📖</span>
            <div>
              <h2 className="ledger-title">MERCHANT & LOGISTICS LEDGER</h2>
              <span className="ledger-subtitle">Financial Accounting & Physical Cargo Holdings</span>
            </div>
          </div>

          <div className="ledger-tabs-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "pnl"}
              className={`ledger-tab-btn ${activeTab === "pnl" ? "is-active" : ""}`}
              onClick={() => setActiveTab("pnl")}
            >
              Financial Analytics (P&L)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "logistics"}
              className={`ledger-tab-btn ${activeTab === "logistics" ? "is-active" : ""}`}
              onClick={() => setActiveTab("logistics")}
            >
              Physical Assets & Logistics
            </button>
          </div>

          <button type="button" className="ledger-close-btn" onClick={onClose} aria-label="Close ledger">
            ✕
          </button>
        </header>

        <div className="ledger-body">
          {activeTab === "pnl" ? (
            <div className="ledger-pnl-view">
              {/* Current, save-derived financial position */}
              <div className="ledger-kpi-grid">
                <div className="kpi-card">
                  <span className="kpi-label">Current Liquid Capital</span>
                  <strong className="kpi-value gold-text">
                    <IconCoin size={18} />
                    {totalGold.toLocaleString()} G
                  </strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Estimated Net Asset Value</span>
                  <strong className="kpi-value">{(totalGold + estimatedBoatValue + estimatedCargoValue).toLocaleString()} G</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Estimated Cargo Value</span>
                  <strong className="kpi-value green-text">{estimatedCargoValue.toLocaleString()} G</strong>
                </div>
              </div>

              {/* Current holdings, not fabricated historical revenue */}
              <section className="ledger-section">
                <h3>Current Holdings</h3>
                <div className="revenue-bars-list">
                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span><IconFish size={15} /> Fishing & Sport Catches</span>
                      <strong>{allCargo.length} fish · {totalCargoWeightKg.toFixed(1)} kg</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-fish" style={{ width: `${allCargo.length > 0 ? 100 : 0}%` }} /></div>
                  </div>

                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span><IconSprout size={15} /> Farming & Harvests</span>
                      <strong>{plantedCount} planted crops</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-farm" style={{ width: `${plantedCount > 0 ? 100 : 0}%` }} /></div>
                  </div>

                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span><IconBoat size={15} /> Owned vessels</span>
                      <strong>{ownedBoats.length}</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-proc" style={{ width: `${ownedBoats.length > 0 ? 100 : 0}%` }} /></div>
                  </div>
                </div>
              </section>

              {/* Explicitly state what this save does not record. */}
              <div className="ledger-two-col">
                <div className="summary-box">
                  <h4>Revenue history</h4>
                  <p><strong>Not recorded in this save</strong></p>
                  <small>Current money is the authoritative balance.</small>
                </div>
                <div className="summary-box">
                  <h4>Operating costs</h4>
                  <p><strong>Not recorded in this save</strong></p>
                  <small>Purchases are reflected immediately in the balance.</small>
                </div>
              </div>
            </div>
          ) : (
            <div className="ledger-logistics-view">
              {/* Asset Hold Grid */}
              <div className="logistics-asset-cards">
                {/* Farm Storage */}
                <div className="asset-card">
                  <div className="asset-header">
                    <IconSprout size={18} />
                    <strong>Starter Homestead Storage</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Planted crops:</span>
                    <strong>{plantedCount}</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Farm plots in use:</span>
                    <strong>{totalFarmPlots}</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-farm" style={{ width: `${plantedCount > 0 ? 100 : 0}%` }} /></div>
                </div>

                {/* Vessel Cargo Hold */}
                <div className="asset-card">
                  <div className="asset-header">
                    <IconBoat size={18} />
                    <strong>{boatDef?.name ?? "Rowboat Hold"}</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Physical Cargo Slots:</span>
                    <strong>{boatCargoSlots.filter(Boolean).length}/{boatCargoSlots.length} Slots Used</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Hold weight:</span>
                    <strong>{boatWeightKg.toFixed(1)} kg</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-fish" style={{ width: `${boatCargoSlots.length > 0 ? (boatCargoSlots.filter(Boolean).length / boatCargoSlots.length) * 100 : 0}%` }} /></div>
                </div>

                {/* Owned vessels */}
                <div className="asset-card">
                  <div className="asset-header">
                    <IconBoat size={18} />
                    <strong>Owned vessels</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Registered boats:</span>
                    <strong>{ownedBoats.length}</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Estimated hull value:</span>
                    <strong>{estimatedBoatValue.toLocaleString()} G</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-trade" style={{ width: `${ownedBoats.length > 0 ? 100 : 0}%` }} /></div>
                </div>
              </div>

              {/* Spatial Vessel Cargo Bay Map */}
              {activeBoat && (
                <section className="vessel-spatial-bay-section">
                  <h3>Vessel Spatial Layout ({boatDef?.name})</h3>
                  <div className="spatial-vessel-diagram">
                    <span className="vessel-bow-label">▲ BOW</span>
                    <div className="vessel-slots-grid">
                      {boatCargoSlots.map((cargo, idx) => (
                        <div key={`slot-${idx}`} className={`vessel-slot-cell ${cargo ? "is-occupied" : "is-empty"}`}>
                          <span className="cell-num">Slot 0{idx + 1}</span>
                          {cargo ? (
                            <div className="cell-cargo-info">
                              <strong>{ContentRegistry.fishSpecies.get(cargo.speciesId)?.name ?? "Fish"}</strong>
                              <span>{cargo.weightKg.toFixed(1)} kg · {Math.round(cargo.freshness)}%</span>
                            </div>
                          ) : (
                            <span className="cell-empty-text">Empty Rack</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <span className="vessel-stern-label">▼ STERN</span>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

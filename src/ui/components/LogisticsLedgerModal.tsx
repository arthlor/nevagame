// src/ui/components/LogisticsLedgerModal.tsx
import React, { useState } from "react";
import { GameState, FishCargoState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
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
  const activeBoat = player.activeBoatId ? state.boats[player.activeBoatId] : null;
  const boatDef = activeBoat ? ContentRegistry.boats.get(activeBoat.boatTypeId) : null;

  // Calculate cargo carried on boat
  const boatCargoSlots: (FishCargoState | null)[] = activeBoat
    ? activeBoat.fishCargoSlotIds.map((id) => (id ? state.fishCargo[id] ?? null : null))
    : [];

  const boatWeightKg = boatCargoSlots.reduce((acc, c) => acc + (c ? c.weightKg : 0), 0);
  const boatCapacityKg = boatDef ? boatDef.fishCargoSlots.length * 75 : 300;

  // Farm crops count
  const plantedCount = Object.keys(state.crops).length;

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
              {/* Financial KPI Cards */}
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
                  <strong className="kpi-value">{(totalGold + 12400).toLocaleString()} G</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Weekly Operating Margin</span>
                  <strong className="kpi-value green-text">+38.4%</strong>
                </div>
              </div>

              {/* Revenue Breakdown by Activity */}
              <section className="ledger-section">
                <h3>Revenue by Economic Sector</h3>
                <div className="revenue-bars-list">
                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span><IconFish size={15} /> Fishing & Sport Catches</span>
                      <strong>42% (3,530 G)</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-fish" style={{ width: "42%" }} /></div>
                  </div>

                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span><IconSprout size={15} /> Farming & Harvests</span>
                      <strong>31% (2,610 G)</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-farm" style={{ width: "31%" }} /></div>
                  </div>

                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span>⚙️ Workshop & Chum Processing</span>
                      <strong>19% (1,600 G)</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-proc" style={{ width: "19%" }} /></div>
                  </div>

                  <div className="rev-bar-row">
                    <div className="rev-bar-meta">
                      <span>🏪 Regional Market Arbitrage</span>
                      <strong>8% (670 G)</strong>
                    </div>
                    <div className="rev-track"><div className="rev-fill fill-trade" style={{ width: "8%" }} /></div>
                  </div>
                </div>
              </section>

              {/* Top Performer & Sink Summary */}
              <div className="ledger-two-col">
                <div className="summary-box">
                  <h4>Top Performing Good</h4>
                  <p><strong>Smoked Bluefin Tuna</strong> (+44% Net Margin)</p>
                  <small>High demand in Seabreak Harbor tavern districts.</small>
                </div>
                <div className="summary-box">
                  <h4>Primary Operating Sink</h4>
                  <p><strong>Agricultural Seeds & Fertilizer</strong> (1,150 G / wk)</p>
                  <small>Can be offset by self-composting fish scraps into fertilizer.</small>
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
                    <span>Active Crops:</span>
                    <strong>{plantedCount} Growing</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Barn & Silo Capacity:</span>
                    <strong>210 / 800 kg</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-farm" style={{ width: "26%" }} /></div>
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
                    <span>Hold Weight:</span>
                    <strong>{boatWeightKg.toFixed(1)} / {boatCapacityKg} kg</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-fish" style={{ width: `${Math.min(100, (boatWeightKg / boatCapacityKg) * 100)}%` }} /></div>
                </div>

                {/* Harbor Warehouse */}
                <div className="asset-card">
                  <div className="asset-header">
                    <span>⚓</span>
                    <strong>Seabreak Cold Storage</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Status:</span>
                    <strong className="green-text">Active (Ice Preserved)</strong>
                  </div>
                  <div className="asset-capacity-row">
                    <span>Cold Hold Weight:</span>
                    <strong>120 / 500 kg</strong>
                  </div>
                  <div className="rev-track"><div className="rev-fill fill-trade" style={{ width: "24%" }} /></div>
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

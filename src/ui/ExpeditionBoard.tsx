// src/ui/ExpeditionBoard.tsx
import React from "react";
import { GameState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { InventoryManager } from "../simulation/inventory/InventoryManager";

interface ExpeditionBoardProps {
  state: GameState;
  onClose: () => void;
}

export const ExpeditionBoard: React.FC<ExpeditionBoardProps> = ({ state, onClose }) => {
  const playerInv = state.inventories[state.player.inventoryId];
  const boats = Object.values(state.boats).sort((a, b) => a.id.localeCompare(b.id));
  const harborMarket = state.markets["market.harbor"];

  const chumCount = InventoryManager.getItemCount(playerInv, "item.chum_bucket");
  const wormCount = InventoryManager.getItemCount(playerInv, "item.bait_worms");
  const iceCount = InventoryManager.getItemCount(playerInv, "item.crushed_ice");

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" style={{ width: "700px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>🗺️ Maritime Expedition Planning Board</span>
          <button className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Column 1: Sea Forecast & Vessel Readiness */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "#FFF", border: "2px solid #C4B5A2", borderRadius: "6px", padding: "12px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "6px" }}>
                🌤️ Meteorological Forecast
              </h4>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div>Current: <b>{state.weather.type.toUpperCase()}</b> ({Math.round(state.weather.temperatureC)}°C)</div>
                <div>Wind Speed: <b>{state.weather.windSpeed.toFixed(1)} m/s</b></div>
                <div>Sea Roughness: <b>{Math.round(state.weather.seaRoughness * 100)}%</b></div>
                <div style={{ color: state.weather.seaRoughness > 0.4 ? "#B84B3D" : "#4CA6B7", fontSize: "11px", marginTop: "4px" }}>
                  {state.weather.seaRoughness > 0.4 ? "⚠️ Rough waves expected offshore." : "✅ Calm seas safe for rowboat."}
                </div>
              </div>
            </div>

            <div style={{ background: "#FFF", border: "2px solid #C4B5A2", borderRadius: "6px", padding: "12px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "6px" }}>
                ⛵ Vessel Readiness
              </h4>
              {boats.length > 0 ? (
                <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {boats.map((boat) => {
                    const definition = ContentRegistry.boats.get(boat.boatTypeId);
                    const cargoCount = boat.fishCargoSlotIds.filter(Boolean).length;
                    return (
                      <div key={boat.id} style={{ borderBottom: "1px solid #E5DED4", paddingBottom: "6px" }}>
                        <div>Vessel: <b>{definition?.name ?? boat.boatTypeId}</b></div>
                        <div>Condition: <b>{boat.durability}%</b></div>
                        <div>Cargo: <b>{cargoCount}/{boat.fishCargoSlotIds.length} fish slots</b></div>
                        <div>Status: <b>{boat.isDocked ? `Docked at ${boat.dockedMarketId === "market.harbor" ? "Harbor" : "market"}` : "At Sea"}</b></div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: "12px", color: "#888" }}>No active vessel registered.</div>
              )}
            </div>
          </div>

          {/* Column 2: Prepared Supplies & Target Demand */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ background: "#FFF", border: "2px solid #C4B5A2", borderRadius: "6px", padding: "12px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "6px" }}>
                🎒 Prepared Fishing Supplies
              </h4>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div>Chum Buckets: <b>{chumCount}</b> (needed to frenzy sport schools)</div>
                <div>Bait Worms: <b>{wormCount}</b></div>
                <div>Crushed Ice: <b>{iceCount}</b></div>
                {chumCount === 0 && (
                  <div style={{ color: "#B84B3D", fontSize: "11px", marginTop: "4px" }}>
                    ⚠️ Warning: You have no Chum Buckets. Mill wheat and mix worms at the workbench first!
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: "#FFF", border: "2px solid #C4B5A2", borderRadius: "6px", padding: "12px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-wood-dark)", marginBottom: "6px" }}>
                📈 Harbor Buyer Demand
              </h4>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {harborMarket &&
                  ["fish.trout", "fish.tuna", "fish.blue_marlin"].map((fId) => {
                    const comm = harborMarket.commodities[fId];
                    const def = ContentRegistry.fishSpecies.get(fId);
                    if (!def || !comm) return null;
                    return (
                      <div key={fId} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{def.name}:</span>
                        <b>{Math.round(comm.demandIndex * 100)}% ({comm.basePrice} G)</b>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="neva-button" onClick={onClose}>
            Close Planner
          </button>
        </div>
      </div>
    </div>
  );
};

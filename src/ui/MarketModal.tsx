// src/ui/MarketModal.tsx
import React from "react";
import { FishCargoState, GameState, MarketId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { calculateFishPrice } from "../simulation/economy/calculateFishValue";
import { calculateCommodityUnitPrice } from "../simulation/economy/calculateCommodityValue";
import { InventoryManager } from "../simulation/inventory/InventoryManager";

interface MarketModalProps {
  state: GameState;
  marketId: MarketId | null;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDiscardFishCargo: (cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onClose: () => void;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  state,
  marketId,
  onSellItem,
  onSellFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onClose
}) => {
  const activeMarketId = marketId;
  const currentMarket = activeMarketId ? state.markets[activeMarketId] : null;
  const marketDef = activeMarketId ? ContentRegistry.markets.get(activeMarketId) : undefined;
  const playerInv = state.inventories[state.player.inventoryId];

  const fishCargoList: FishCargoState[] = Object.values(state.fishCargo).filter((cargo) => {
    if (cargo.location.type === "player") return state.player.carriedFishCargoId === cargo.id;
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const boat = state.boats[cargo.location.containerId];
    return Boolean(activeMarketId && boat?.isDocked && boat.dockedMarketId === activeMarketId);
  });
  const activeContracts = state.contracts.filter((contract) => contract.status === "active");

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" style={{ width: "750px" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>🏪 Maritime & Village Commerce</span>
          <button className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>
            {marketDef?.name ?? "Market"}
          </h3>
          <p style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
            {marketDef?.description}
          </p>

          {/* Commodities Table */}
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Current Market Rates</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", background: "#FFF", borderRadius: "4px", overflow: "hidden" }}>
              <thead>
                <tr style={{ background: "var(--color-wood-warm)", color: "#FFF", textAlign: "left" }}>
                  <th style={{ padding: "6px 10px" }}>Commodity</th>
                  <th style={{ padding: "6px 10px" }}>Base Price</th>
                  <th style={{ padding: "6px 10px" }}>Demand %</th>
                  <th style={{ padding: "6px 10px" }}>Unit Value</th>
                  <th style={{ padding: "6px 10px" }}>Your Stock</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {currentMarket &&
                  Object.values(currentMarket.commodities).map((commodity) => {
                    const itemDef = ContentRegistry.items.get(commodity.itemId);
                    const fishDef = ContentRegistry.fishSpecies.get(commodity.itemId);
                    const name = itemDef ? itemDef.name : fishDef ? fishDef.name : commodity.itemId;

                    const price = calculateCommodityUnitPrice(commodity);
                    const demandPercent = price.demandPercent;
                    const unitPrice = price.unitPrice;
                    const ownedCount = itemDef ? InventoryManager.getItemCount(playerInv, commodity.itemId) : 0;

                    return (
                      <tr key={commodity.itemId} style={{ borderBottom: "1px solid #EEE" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{name}</td>
                        <td style={{ padding: "6px 10px" }}>{commodity.basePrice} G</td>
                        <td style={{ padding: "6px 10px", color: demandPercent > 100 ? "green" : demandPercent < 100 ? "red" : "#555" }}>
                          {demandPercent}%
                        </td>
                        <td style={{ padding: "6px 10px", fontWeight: 700 }}>{unitPrice} G</td>
                        <td style={{ padding: "6px 10px" }}>{ownedCount}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>
                          {ownedCount > 0 && (
                            <button
                              className="neva-button"
                              style={{ padding: "2px 8px", fontSize: "11px" }}
                              onClick={() => activeMarketId && onSellItem(activeMarketId, commodity.itemId, 1)}
                            >
                              Sell 1 ({unitPrice}G)
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {activeContracts.length > 0 && (
            <section style={{ marginBottom: "20px" }} aria-label="Active contracts">
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>Active Deliveries</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeContracts.map((contract) => {
                  const itemDef = ContentRegistry.items.get(contract.targetItemIdOrSpecies);
                  const fishDef = ContentRegistry.fishSpecies.get(contract.targetItemIdOrSpecies);
                  const targetName = itemDef?.name ?? fishDef?.name ?? contract.targetItemIdOrSpecies;
                  const remaining = contract.quantityRequired - contract.quantityFulfilled;
                  const ownedCount = itemDef
                    ? InventoryManager.getItemCount(playerInv, contract.targetItemIdOrSpecies)
                    : 0;
                  const eligibleCargo = fishCargoList.filter((cargo) => {
                    if (cargo.speciesId !== contract.targetItemIdOrSpecies) return false;
                    if (contract.minFreshness !== undefined && cargo.freshness < contract.minFreshness) return false;
                    if (contract.minWeightKg !== undefined && cargo.weightKg < contract.minWeightKg) return false;
                    const qualityOrder = ["common", "fine", "exceptional", "trophy"];
                    return !contract.minQuality || qualityOrder.indexOf(cargo.quality) >= qualityOrder.indexOf(contract.minQuality);
                  });

                  return (
                    <div
                      key={contract.id}
                      style={{ background: "#FFF", border: "2px solid #C4B5A2", borderRadius: "6px", padding: "10px 14px" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{targetName}</div>
                          <div style={{ color: "#555", fontSize: "11px" }}>
                            {contract.quantityFulfilled}/{contract.quantityRequired} delivered · {remaining} remaining · reward {contract.rewardMoney} G
                          </div>
                        </div>
                        {itemDef && ownedCount > 0 && (
                          <button
                            className="neva-button neva-button-teal"
                            style={{ padding: "2px 8px", fontSize: "11px" }}
                            onClick={() => onDeliverContractItems(contract.id, contract.targetItemIdOrSpecies, 1)}
                          >
                            Deliver 1
                          </button>
                        )}
                      </div>
                      {eligibleCargo.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                          {eligibleCargo.map((cargo) => (
                            <button
                              key={cargo.id}
                              className="neva-button neva-button-teal"
                              style={{ padding: "2px 8px", fontSize: "11px" }}
                              onClick={() => onDeliverFishCargo(contract.id, cargo.id)}
                            >
                              Deliver {cargo.weightKg} kg fish
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Physical Fish Cargo Section (Visible when selling at Harbor) */}
          {activeMarketId === "market.harbor" && (
            <div>
              <h3 style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>🎣 Landed Fish Cargo</h3>
              {fishCargoList.length === 0 ? (
                <div style={{ padding: "16px", background: "#FFF", borderRadius: "4px", fontSize: "12px", color: "#888", textAlign: "center" }}>
                  No sport fish currently in boat hold or carried in hands. Land a sport fish on your next expedition!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {fishCargoList.map((cargo) => {
                    const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
                    if (!speciesDef) return null;
                    const commodity = currentMarket?.commodities[cargo.speciesId];
                    const demandIndex = commodity ? commodity.demandIndex : 1.0;
                    const seasonalMod = commodity ? commodity.seasonalModifier : 1.0;

                    const breakdown = calculateFishPrice(
                      speciesDef,
                      cargo.weightKg,
                      cargo.quality,
                      cargo.freshness,
                      demandIndex,
                      seasonalMod
                    );

                    return (
                      <div
                        key={cargo.id}
                        style={{
                          background: "#FFF",
                          border: "2px solid #C4B5A2",
                          borderRadius: "6px",
                          padding: "10px 14px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px" }}>
                            {speciesDef.name} ({cargo.weightKg} kg - {cargo.quality.toUpperCase()})
                          </div>
                          <div style={{ fontSize: "11px", color: "#555" }}>
                            Freshness: <b>{Math.round(cargo.freshness)}%</b> | Demand: <b>{breakdown.demandPercent}%</b>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-wood-dark)" }}>
                            {breakdown.finalPrice} G
                          </span>
                          {cargo.freshness <= 0 || breakdown.finalPrice <= 0 ? (
                            <button
                              className="neva-button neva-button-secondary"
                              onClick={() => onDiscardFishCargo(cargo.id)}
                            >
                              Discard for Scraps
                            </button>
                          ) : (
                            <button
                              className="neva-button neva-button-teal"
                              onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.id)}
                            >
                              Sell Cargo
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="neva-button" onClick={onClose}>
            Done Trading
          </button>
        </div>
      </div>
    </div>
  );
};

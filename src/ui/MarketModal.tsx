// src/ui/MarketModal.tsx
import React, { useState } from "react";
import { FishCargoState, GameState, MarketId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { calculateFishPrice } from "../simulation/economy/calculateFishValue";
import { calculateCommodityUnitPrice } from "../simulation/economy/calculateCommodityValue";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { IconCoin, IconFish, IconSprout, IconWarning } from "./components/HudIcons";

interface MarketModalProps {
  state: GameState;
  marketId: MarketId | null;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
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
  onBuySeed,
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

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const fishCargoList: FishCargoState[] = Object.values(state.fishCargo).filter((cargo) => {
    if (cargo.location.type === "player") return state.player.carriedFishCargoId === cargo.id;
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const boat = state.boats[cargo.location.containerId];
    return Boolean(activeMarketId && boat?.isDocked && boat.dockedMarketId === activeMarketId);
  });
  const activeContracts = state.contracts.filter((contract) => contract.status === "active");

  // Selected commodity or first available
  const commoditiesList = currentMarket ? Object.values(currentMarket.commodities) : [];
  const activeCommodity = selectedItemId
    ? commoditiesList.find((c) => c.itemId === selectedItemId)
    : commoditiesList[0];

  const selectedItemDef = activeCommodity ? ContentRegistry.items.get(activeCommodity.itemId) : null;
  const selectedFishDef = activeCommodity ? ContentRegistry.fishSpecies.get(activeCommodity.itemId) : null;
  const activeName = selectedItemDef?.name ?? selectedFishDef?.name ?? activeCommodity?.itemId ?? "Commodity";

  const activePrice = activeCommodity ? calculateCommodityUnitPrice(activeCommodity) : null;

  const comparisonMarket = activeCommodity
    ? Object.values(state.markets).find((market) => market.id !== activeMarketId && Boolean(market.commodities[activeCommodity.itemId]))
    : undefined;
  const comparisonCommodity = activeCommodity && comparisonMarket
    ? comparisonMarket.commodities[activeCommodity.itemId]
    : undefined;
  const comparisonPrice = comparisonCommodity ? calculateCommodityUnitPrice(comparisonCommodity) : null;
  const priceDelta = activePrice && comparisonPrice ? comparisonPrice.unitPrice - activePrice.unitPrice : null;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="market-arbitrage-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Market and Regional Commerce">
        {/* Header */}
        <header className="market-modal-header">
          <div className="market-header-title-group">
            <span className="market-header-icon">🏪</span>
            <div>
              <h2 className="market-modal-title">{marketDef?.name ?? "Market Trading Post"}</h2>
              <span className="market-modal-desc">{marketDef?.description}</span>
            </div>
          </div>
          <button type="button" className="market-close-btn" onClick={onClose} aria-label="Close market">
            ✕
          </button>
        </header>

        {/* 2-Column Main Trading Surface */}
        <div className="market-modal-grid">
          {/* Left Column: Commodities & Inventory Selling */}
          <section className="market-left-panel">
            {activeMarketId === "market.village" && (
              <div className="market-seeds-section">
                <h3 className="section-title"><IconSprout size={15} /> Starter Crop Seeds</h3>
                <div className="seed-stall-list">
                  {["crop.wheat", "crop.tomato", "crop.potato"].map((cropId) => {
                    const crop = ContentRegistry.crops.get(cropId)!;
                    const seed = ContentRegistry.items.get(crop.seedItemId)!;
                    const owned = InventoryManager.getItemCount(playerInv, seed.id);
                    return (
                      <div className="seed-stall-card" key={cropId}>
                        <div className="seed-card-meta">
                          <strong>{crop.name}</strong>
                          <span>{owned} owned in backpack</span>
                        </div>
                        <button
                          type="button"
                          className="neva-button seed-buy-btn"
                          disabled={state.player.money < seed.baseValue}
                          onClick={() => onBuySeed(activeMarketId, seed.id, 1)}
                        >
                          Buy 1 · {seed.baseValue} G
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Commodities Table */}
            <div className="market-commodities-section">
              <h3 className="section-title">Local Commodity Exchange</h3>
              <div className="commodities-list">
                {commoditiesList.map((commodity) => {
                  const itemDef = ContentRegistry.items.get(commodity.itemId);
                  const fishDef = ContentRegistry.fishSpecies.get(commodity.itemId);
                  const name = itemDef ? itemDef.name : fishDef ? fishDef.name : commodity.itemId;
                  const price = calculateCommodityUnitPrice(commodity);
                  const isSelected = activeCommodity?.itemId === commodity.itemId;
                  const count = itemDef ? InventoryManager.getItemCount(playerInv, commodity.itemId) : 0;

                  return (
                    <div
                      key={commodity.itemId}
                      className={`commodity-row ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setSelectedItemId(commodity.itemId)}
                    >
                      <div className="comm-left">
                        <strong className="comm-name">{name}</strong>
                        <span className="comm-owned">Stock: {count}</span>
                      </div>
                      <div className="comm-right">
                        <span className={`comm-demand ${price.demandPercent > 100 ? "up" : "down"}`}>
                          {price.demandPercent > 100 ? "▲" : "▼"} {price.demandPercent}%
                        </span>
                        <strong className="comm-price">{price.unitPrice} G</strong>
                        {count > 0 && (
                          <button
                            type="button"
                            className="neva-button comm-sell-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              activeMarketId && onSellItem(activeMarketId, commodity.itemId, 1);
                            }}
                          >
                            Sell 1
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Landed Sport Fish Section (Harbor) */}
            {activeMarketId === "market.harbor" && (
              <div className="market-fish-cargo-section">
                <h3 className="section-title"><IconFish size={15} /> Landed Sport Fish Cargo</h3>
                {fishCargoList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>No sport fish in boat hold or carried in hands. Land a sport fish offshore!</span>
                  </div>
                ) : (
                  <div className="fish-cargo-trade-list">
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
                        <div key={cargo.id} className="fish-cargo-card">
                          <div className="cargo-card-meta">
                            <strong>{speciesDef.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                            <span>{cargo.quality.toUpperCase()} · {Math.round(cargo.freshness)}% Fresh</span>
                          </div>
                          <div className="cargo-card-actions">
                            <strong className="cargo-value">{breakdown.finalPrice} G</strong>
                            {cargo.freshness <= 0 || breakdown.finalPrice <= 0 ? (
                              <button
                                type="button"
                                className="neva-button plaque-release-btn"
                                onClick={() => onDiscardFishCargo(cargo.id)}
                              >
                                Scraps
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="neva-button plaque-keep-btn"
                                onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.id)}
                              >
                                Sell Fish
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
          </section>

          {/* Right Column: Regional Pricing Context */}
          <section className="market-right-panel">
            <h3 className="section-title">Regional Pricing Context</h3>

            {activeCommodity && activePrice ? (
              <div className="arbitrage-detail-card">
                <header className="arb-header">
                  <span className="arb-kicker">COMMODITY DETAIL</span>
                  <h4 className="arb-title">{activeName}</h4>
                </header>

                <div className="arb-metric-row">
                  <div className="arb-metric-box">
                    <span className="arb-label">Local Price</span>
                    <strong className="arb-val">{activePrice.unitPrice} G</strong>
                  </div>
                  <div className="arb-metric-box">
                    <span className="arb-label">Local Demand</span>
                    <strong className={`arb-val ${activePrice.demandPercent >= 100 ? "green-text" : ""}`}>
                      {activePrice.demandPercent}%
                    </strong>
                  </div>
                  <div className="arb-metric-box">
                    <span className="arb-label">Seasonal Factor</span>
                    <strong className="arb-val">{activePrice.seasonalModifier.toFixed(2)}×</strong>
                  </div>
                </div>

                <div className="distant-arbitrage-box">
                  <header className="dist-header">
                    <span>🧭 Other Market Comparison</span>
                    {comparisonMarket && <span className="dist-tag">{comparisonMarket.name}</span>}
                  </header>

                  {comparisonPrice && priceDelta !== null ? (
                    <div className="dist-rows">
                      <div className="dist-row">
                        <span>Other market unit price:</span>
                        <strong>{comparisonPrice.unitPrice} G</strong>
                      </div>
                      <div className="dist-row dist-total">
                        <span>Price difference before transport:</span>
                        <strong className={priceDelta >= 0 ? "green-text" : "red-text"}>
                          {priceDelta >= 0 ? `+${priceDelta}` : priceDelta} G
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="no-commodity-selected">
                      <span>No other market currently trades this commodity.</span>
                    </div>
                  )}
                </div>

                <div className="market-decision-tip">
                  <IconWarning size={14} />
                  <span>
                    {comparisonPrice && priceDelta !== null
                      ? "This compares current unit prices only; transport cost and route time are not simulated."
                      : "This save has no cross-market price comparison for the selected commodity."}
                  </span>
                </div>
              </div>
            ) : (
              <div className="no-commodity-selected">
                <span>Select a commodity on the left to analyze regional price arbitrage.</span>
              </div>
            )}

            {/* Active Deliveries */}
            {activeContracts.length > 0 && (
              <div className="market-contracts-sub">
                <h4 className="section-title">Active Contract Orders</h4>
                <div className="active-contracts-list">
                  {activeContracts.map((contract) => {
                    const itemDef = ContentRegistry.items.get(contract.targetItemIdOrSpecies);
                    const fishDef = ContentRegistry.fishSpecies.get(contract.targetItemIdOrSpecies);
                    const targetName = itemDef?.name ?? fishDef?.name ?? contract.targetItemIdOrSpecies;
                    const ownedCount = itemDef ? InventoryManager.getItemCount(playerInv, itemDef.id) : 0;
                    const eligibleCargo = fishCargoList.filter((cargo) => cargo.speciesId === contract.targetItemIdOrSpecies);

                    return (
                      <div key={contract.id} className="contract-mini-card">
                        <div className="contract-mini-header">
                          <strong>Supply {targetName}</strong>
                          <span className="contract-gold"><IconCoin size={12} /> {contract.rewardMoney} G</span>
                        </div>
                        <span className="contract-prog">
                          Progress: {contract.quantityFulfilled} / {contract.quantityRequired} fulfilled
                        </span>
                        <div className="contract-actions-row" style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                          {itemDef && ownedCount > 0 && (
                            <button
                              type="button"
                              className="neva-button comm-sell-btn"
                              onClick={() => onDeliverContractItems(contract.id, itemDef.id, 1)}
                            >
                              Deliver 1 ({ownedCount} in bag)
                            </button>
                          )}
                          {eligibleCargo.length > 0 && (
                            <button
                              type="button"
                              className="neva-button comm-sell-btn"
                              onClick={() => onDeliverFishCargo(contract.id, eligibleCargo[0].id)}
                            >
                              Deliver Fish ({eligibleCargo[0].weightKg.toFixed(1)} kg)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="market-modal-footer">
          <button type="button" className="neva-button" onClick={onClose}>
            Done Trading
          </button>
        </footer>
      </div>
    </div>
  );
};

// src/ui/MarketModal.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FishCargoState, GameState, MarketCommodityState, MarketId } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { isVillageSeedCrop } from "../content/markets";
import { calculateFishPrice } from "../simulation/economy/calculateFishValue";
import { calculateCommodityUnitPrice } from "../simulation/economy/calculateCommodityValue";
import { InventoryManager } from "../simulation/inventory/InventoryManager";
import { IconCoin, IconFish, IconJournal, IconSprout } from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeDivider, ChromePanel, ChromeQuality } from "./chrome/Chrome";
import { playUiSound } from "./audio/uiAudio";
import { MarketDomain } from "../simulation/domains/MarketDomain";
import { contractDeliveryMarketId } from "../content/contracts";

type MarketStallTab = "buy" | "sell" | "hold";

interface MarketModalProps {
  state: GameState;
  marketId: MarketId | null;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyItem?: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDiscardFishCargo: (cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onClose: () => void;
  initialStallTab?: MarketStallTab;
}

function marketShortName(id: string): string {
  return id === "market.harbor" ? "Harbor" : "Village";
}

export const MarketModal: React.FC<MarketModalProps> = ({
  state,
  marketId,
  onSellItem,
  onBuySeed,
  onBuyItem,
  onSellFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onClose,
  initialStallTab = "buy"
}) => {
  const activeMarketId = marketId;
  const currentMarket = activeMarketId ? state.markets[activeMarketId] : null;
  const marketDef = activeMarketId ? ContentRegistry.markets.get(activeMarketId) : undefined;
  const playerInv = state.inventories[state.player.inventoryId];

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [stallTab, setStallTab] = useState<MarketStallTab>(initialStallTab);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectStallTab = (tab: MarketStallTab) => {
    playUiSound("page-turn");
    setStallTab(tab);
  };

  const fishCargoList: FishCargoState[] = Object.values(state.fishCargo).filter((cargo) => {
    if (cargo.location.type === "player") return state.player.carriedFishCargoId === cargo.id;
    if (cargo.location.type !== "boat-hold" && cargo.location.type !== "boat-hook") return false;
    const boat = state.boats[cargo.location.containerId];
    return Boolean(activeMarketId && boat?.isDocked && boat.dockedMarketId === activeMarketId);
  });
  const activeContracts = state.contracts.filter(
    (contract) => contract.status === "active" && contractDeliveryMarketId(contract.type) === activeMarketId
  );

  const ownedSellables = useMemo(() => {
    if (!currentMarket || !playerInv) return [];
    const seen = new Set<string>();
    const rows: { itemId: string; count: number; commodity: MarketCommodityState }[] = [];
    for (const slot of playerInv.slots) {
      const itemId = slot.itemId;
      if (!itemId || seen.has(itemId)) continue;
      const commodity = currentMarket.commodities[itemId];
      if (!commodity) continue;
      const count = InventoryManager.getItemCount(playerInv, itemId);
      if (count <= 0) continue;
      seen.add(itemId);
      rows.push({ itemId, count, commodity });
    }
    return rows;
  }, [playerInv, currentMarket]);

  useEffect(() => {
    if (stallTab !== "sell") return;
    if (!ownedSellables.some((row) => row.itemId === selectedItemId)) {
      setSelectedItemId(ownedSellables[0]?.itemId ?? null);
      setSellQty(1);
    }
  }, [stallTab, ownedSellables, selectedItemId]);

  const selectedOwned =
    ownedSellables.find((row) => row.itemId === selectedItemId) ?? ownedSellables[0] ?? null;

  const selectedItemDef = selectedOwned ? ContentRegistry.items.get(selectedOwned.itemId) : null;
  const ticketName = selectedItemDef?.name ?? selectedOwned?.itemId ?? "Produce";
  const ticketPrice = selectedOwned ? calculateCommodityUnitPrice(selectedOwned.commodity) : null;

  const comparisonMarket = selectedOwned
    ? Object.values(state.markets).find(
        (m) => m.id !== activeMarketId && Boolean(m.commodities[selectedOwned.itemId])
      )
    : undefined;
  const comparisonCommodity =
    selectedOwned && comparisonMarket ? comparisonMarket.commodities[selectedOwned.itemId] : undefined;
  const comparisonPrice = comparisonCommodity ? calculateCommodityUnitPrice(comparisonCommodity) : null;
  const priceDelta =
    ticketPrice && comparisonPrice ? comparisonPrice.unitPrice - ticketPrice.unitPrice : null;

  const ownedCount = selectedOwned?.count ?? 0;
  const clampedQty = ownedCount > 0 ? Math.min(Math.max(sellQty, 1), ownedCount) : 1;
  const liveGold = ticketPrice ? ticketPrice.unitPrice * (ownedCount > 0 ? clampedQty : 0) : 0;

  const totalSellableProduceGold = useMemo(() => {
    if (!playerInv || !currentMarket) return 0;
    let sum = 0;
    for (const slot of playerInv.slots) {
      const qty = slot.quantity ?? 0;
      if (!slot.itemId || qty <= 0) continue;
      const comm = currentMarket.commodities[slot.itemId];
      if (comm && MarketDomain.isBulkSellProduceItem(slot.itemId)) {
        const unit = calculateCommodityUnitPrice(comm).unitPrice;
        sum += unit * qty;
      }
    }
    return sum;
  }, [playerInv, currentMarket]);

  const totalFishCargoGold = useMemo(() => {
    if (!currentMarket || fishCargoList.length === 0) return 0;
    let sum = 0;
    for (const cargo of fishCargoList) {
      const speciesDef = ContentRegistry.fishSpecies.get(cargo.speciesId);
      if (!speciesDef) continue;
      const comm = currentMarket.commodities[cargo.speciesId];
      const demand = comm ? comm.demandIndex : 1.0;
      const seasonal = comm ? comm.seasonalModifier : 1.0;
      const price = calculateFishPrice(speciesDef, cargo.weightKg, cargo.quality, cargo.freshness, demand, seasonal);
      sum += price.finalPrice;
    }
    return sum;
  }, [currentMarket, fishCargoList]);

  const handleSellAllProduce = () => {
    if (!activeMarketId || !playerInv || !currentMarket) return;
    for (const slot of playerInv.slots) {
      const qty = slot.quantity ?? 0;
      if (!slot.itemId || qty <= 0) continue;
      if (currentMarket.commodities[slot.itemId] && MarketDomain.isBulkSellProduceItem(slot.itemId)) {
        onSellItem(activeMarketId, slot.itemId, qty);
      }
    }
  };

  const handleSellAllFishCargo = () => {
    if (!activeMarketId) return;
    for (const cargo of fishCargoList) {
      onSellFishCargo(activeMarketId, cargo.id);
    }
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
        ref={modalRef}
        as="div"
        className="market-trading-modal"
        tone="slate"
        flourish
        corners
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-title"
        tabIndex={-1}
      >
        <header className="market-modal-header">
          <div className="market-header-title-group">
            <span className="market-header-icon" aria-hidden="true">
              <IconCoin size={22} />
            </span>
            <div>
              <h2 id="market-title" className="market-modal-title">
                {marketDef?.name ?? "Guild Trading Post"}
              </h2>
              <span className="market-shopkeep-line">
                {activeMarketId === "market.harbor"
                  ? "The wharfinger eyes your hold. Fair weight, fair gold."
                  : "The grocer wipes the counter. Fresh from the yards, then?"}
              </span>
              <span className="market-modal-desc">{marketDef?.description}</span>
            </div>
          </div>

          <div className="market-purse-badge" data-testid="market-purse">
            <IconCoin size={16} aria-hidden="true" />
            <span>Purse: <strong>{state.player.money.toLocaleString()} G</strong></span>
          </div>

          <ChromeClose onClick={onClose} label="Close trading post" className="market-close-btn" />
        </header>

        <div className="market-stall-tabs mm-ribbon-tabs" role="tablist" aria-label="Stall views" data-testid="market-stall-tabs">
          <button
            type="button"
            role="tab"
            aria-selected={stallTab === "buy"}
            className={`market-stall-tab ${stallTab === "buy" ? "is-active" : ""}`}
            onClick={() => selectStallTab("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={stallTab === "sell"}
            className={`market-stall-tab ${stallTab === "sell" ? "is-active" : ""}`}
            onClick={() => selectStallTab("sell")}
          >
            Sell
          </button>
            {activeMarketId === "market.harbor" && (
            <button
              type="button"
              role="tab"
              aria-selected={stallTab === "hold"}
              className={`market-stall-tab ${stallTab === "hold" ? "is-active" : ""}`}
              onClick={() => selectStallTab("hold")}
            >
              Docked Fish
            </button>
          )}
        </div>

        <ChromeDivider />

        <div className="market-modal-grid">
          <section className="market-left-panel">
            {stallTab === "buy" && activeMarketId === "market.village" && (
              <div className="market-seeds-section">
                <h3 className="section-title">
                  <IconSprout size={15} aria-hidden="true" /> Crop Seeds & Supplies
                </h3>
                <div className="seed-stall-list">
                  {[...ContentRegistry.crops.values()]
                    .filter((crop) => isVillageSeedCrop(crop.id))
                    .slice()
                    .sort((a, b) => a.minimumFarmingXp - b.minimumFarmingXp || a.name.localeCompare(b.name))
                    .map((crop) => {
                      const seed = ContentRegistry.items.get(crop.seedItemId);
                      if (!seed) return null;
                      const owned = InventoryManager.getItemCount(playerInv, seed.id);
                      const locked = state.player.proficiencies.farming < crop.minimumFarmingXp;
                      return (
                        <div className="seed-stall-card" key={crop.id}>
                          <div className="seed-card-meta">
                            <AtlasImage src={atlasForItem(seed.id)} alt="" size={32} />
                            <div>
                              <strong>{crop.name}</strong>
                              <span className="seed-meta-sub">
                                {locked
                                  ? `Locked · ${crop.minimumFarmingXp} Farming XP`
                                  : `${owned} in bag · Yield: ~${crop.baseYield.min}-${crop.baseYield.max}`}
                              </span>
                            </div>
                          </div>
                          <div className="seed-card-actions">
                            <ChromeButton
                              className="seed-buy-btn"
                              soundCue="coins"
                              disabled={locked || state.player.money < seed.baseValue}
                              onClick={() => onBuySeed(activeMarketId, seed.id, 1)}
                            >
                              {locked ? "Locked" : `Buy 1 · ${seed.baseValue} G`}
                            </ChromeButton>
                          </div>
                        </div>
                      );
                    })}
                  {MarketDomain.VILLAGE_SUPPLIES.map((itemId) => {
                    const supply = ContentRegistry.items.get(itemId);
                    if (!supply) return null;
                    const owned = InventoryManager.getItemCount(playerInv, supply.id);
                    return (
                      <div className="seed-stall-card" key={supply.id}>
                        <div className="seed-card-meta">
                          <AtlasImage src={atlasForItem(supply.id)} alt="" size={32} />
                          <div>
                            <strong>{supply.name}</strong>
                            <span className="seed-meta-sub">{owned} in bag · {supply.description}</span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          <ChromeButton
                            className="seed-buy-btn"
                            soundCue="coins"
                            disabled={state.player.money < supply.baseValue}
                            onClick={() => onBuySeed(activeMarketId, supply.id, 1)}
                          >
                            Buy 1 · {supply.baseValue} G
                          </ChromeButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stallTab === "buy" && activeMarketId === "market.harbor" && (
              <div className="market-seeds-section">
                <h3 className="section-title">Harbor Supplies</h3>
                <div className="seed-stall-list">
                  {MarketDomain.HARBOR_BUYABLE.map((itemId) => {
                    const item = ContentRegistry.items.get(itemId);
                    const commodity = currentMarket?.commodities[itemId];
                    if (!item || !commodity) return null;
                    const price = calculateCommodityUnitPrice(commodity);
                    const owned = InventoryManager.getItemCount(playerInv, itemId);
                    return (
                      <div className="seed-stall-card" key={itemId}>
                        <div className="seed-card-meta">
                          <AtlasImage src={atlasForItem(item.id)} alt="" size={32} />
                          <div>
                            <strong>{item.name}</strong>
                            <span className="seed-meta-sub">{owned} in satchel</span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          <ChromeButton
                            className="seed-buy-btn"
                            soundCue="coins"
                            disabled={state.player.money < price.unitPrice}
                            onClick={() => onBuyItem?.(activeMarketId, itemId, 1)}
                          >
                            Buy 1 · {price.unitPrice} G
                          </ChromeButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stallTab === "sell" && (
            <div className="market-commodities-section">
              <div className="market-section-header-row">
                <h3 className="section-title">
                  <IconSprout size={15} aria-hidden="true" /> Your Satchel
                </h3>
                {totalSellableProduceGold > 0 && (
                  <ChromeButton
                    variant="gold"
                    size="sm"
                    soundCue="coins"
                    className="batch-sell-btn-compact"
                    onClick={handleSellAllProduce}
                  >
                    Sell all produce (+{totalSellableProduceGold.toLocaleString()} G)
                  </ChromeButton>
                )}
              </div>
              {ownedSellables.length === 0 ? (
                <div className="no-cargo-card" data-testid="market-sell-empty">
                  Nothing in your satchel that this stall buys.
                </div>
              ) : (
                <div className="commodities-list" data-testid="market-sell-list">
                  {ownedSellables.map((row) => {
                    const itemDef = ContentRegistry.items.get(row.itemId);
                    const name = itemDef?.name ?? row.itemId;
                    const price = calculateCommodityUnitPrice(row.commodity);
                    const isSelected = selectedOwned?.itemId === row.itemId;

                    return (
                      <div
                        key={row.itemId}
                        className={`commodity-row ${isSelected ? "is-selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="commodity-select-button"
                          onClick={() => {
                            playUiSound("click");
                            setSelectedItemId(row.itemId);
                            setSellQty(1);
                          }}
                          aria-label={`Select ${name}`}
                          aria-pressed={isSelected}
                        >
                          <div className="comm-left">
                            <AtlasImage src={atlasForItem(row.itemId)} alt="" size={28} />
                            <div>
                              <strong className="comm-name">{name}</strong>
                              <span className="comm-owned">In bag: {row.count}</span>
                            </div>
                          </div>
                          <div className="comm-right">
                            <span className={`comm-demand ${price.demandPercent >= 100 ? "up" : "down"}`}>
                              {price.demandPercent >= 100 ? "▲" : "▼"} {price.demandPercent}%
                            </span>
                            <strong className="comm-price">{price.unitPrice} G</strong>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {stallTab === "hold" && activeMarketId === "market.harbor" && (
              <div className="market-fish-cargo-section">
                <div className="market-section-header-row">
                  <h3 className="section-title">
                    <IconFish size={15} aria-hidden="true" /> Docked Fish in Boat Hold
                  </h3>
                  {totalFishCargoGold > 0 && (
                    <ChromeButton
                      variant="gold"
                      size="sm"
                      soundCue="coins"
                      className="batch-sell-btn-compact"
                      onClick={handleSellAllFishCargo}
                    >
                      Sell All Fish (+{totalFishCargoGold.toLocaleString()} G)
                    </ChromeButton>
                  )}
                </div>
                {fishCargoList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>No sport fish currently in boat hold or carried in hand.</span>
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
                            <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={36} />
                            <div>
                              <strong>{speciesDef.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                              <div className="cargo-sub-meta">
                                <ChromeQuality quality={cargo.quality} />
                                <span className="cargo-freshness-num">· {Math.round(cargo.freshness)}% Fresh</span>
                              </div>
                            </div>
                          </div>
                          <div className="cargo-card-actions">
                            <strong className="cargo-value">{breakdown.finalPrice} G</strong>
                            {cargo.freshness <= 0 || breakdown.finalPrice <= 0 ? (
                              <ChromeButton
                                className="plaque-release-btn"
                                soundCue="click"
                                onClick={() => onDiscardFishCargo(cargo.id)}
                              >
                                Scraps
                              </ChromeButton>
                            ) : (
                              <ChromeButton
                                variant="gold"
                                soundCue="coins"
                                className="plaque-keep-btn"
                                onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.id)}
                              >
                                Sell Fish
                              </ChromeButton>
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

          <aside className="market-right-panel">
            {stallTab === "sell" ? (
              selectedOwned && ticketPrice ? (
                <div className="market-sell-ticket" data-testid="market-sell-ticket">
                  <h3 className="section-title">Sale ticket</h3>
                  <div className="market-ticket-head">
                    <AtlasImage src={atlasForItem(selectedOwned.itemId)} alt="" size={40} />
                    <div>
                      <strong className="arb-title">{ticketName}</strong>
                      <span className={`comm-demand ${ticketPrice.demandPercent >= 100 ? "up" : "down"}`}>
                        {ticketPrice.demandPercent >= 100 ? "▲" : "▼"} Demand {ticketPrice.demandPercent}%
                      </span>
                    </div>
                  </div>
                  <div className="market-ticket-price">
                    <span>Unit price</span>
                    <strong>{ticketPrice.unitPrice} G</strong>
                  </div>
                  <div className="market-qty-stepper" data-testid="market-sell-qty">
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty <= 1}
                      onClick={() => setSellQty((n) => Math.max(1, n - 1))}
                      aria-label="Fewer"
                    >
                      −
                    </ChromeButton>
                    <span className="market-qty-value">{clampedQty} / {ownedCount}</span>
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty >= ownedCount}
                      onClick={() => setSellQty((n) => Math.min(ownedCount, n + 1))}
                      aria-label="More"
                    >
                      +
                    </ChromeButton>
                  </div>
                  <div className="market-ticket-live">
                    You receive <strong>{liveGold.toLocaleString()} G</strong>
                  </div>
                  {comparisonMarket && priceDelta !== null && (
                    <p className="market-ticket-arb">
                      {marketShortName(comparisonMarket.id)} pays {priceDelta >= 0 ? "+" : ""}
                      {priceDelta} G
                    </p>
                  )}
                  <div className="market-ticket-actions">
                    <ChromeButton
                      variant="gold"
                      soundCue="coins"
                      disabled={!activeMarketId || ownedCount <= 0}
                      onClick={() =>
                        activeMarketId && onSellItem(activeMarketId, selectedOwned.itemId, clampedQty)
                      }
                    >
                      Sell
                    </ChromeButton>
                    <ChromeButton
                      soundCue="coins"
                      disabled={!activeMarketId || ownedCount <= 0}
                      onClick={() =>
                        activeMarketId && onSellItem(activeMarketId, selectedOwned.itemId, ownedCount)
                      }
                    >
                      Sell all of this item
                    </ChromeButton>
                  </div>
                </div>
              ) : (
                <div className="no-commodity-selected">
                  <span>Bring produce this stall prices and pick a row to write a ticket.</span>
                </div>
              )
            ) : (
              <>
                <h3 className="section-title">Market Intelligence</h3>
                <div className="no-commodity-selected">
                  <span>
                    {activeMarketId === "market.harbor"
                      ? "Ice on the left. Docked fish stay on their own tab."
                      : "Seeds and supplies on the left. Sell what you grew from the Sell tab."}
                  </span>
                </div>
              </>
            )}

            {activeContracts.length > 0 && (
              <div className="market-contracts-sub">
                <h4 className="section-title">
                  <IconJournal size={15} aria-hidden="true" /> Royal Guild Contracts
                </h4>
                <div className="active-contracts-list">
                  {activeContracts.map((contract) => {
                    const itemDef = ContentRegistry.items.get(contract.targetItemIdOrSpecies);
                    const fishDef = ContentRegistry.fishSpecies.get(contract.targetItemIdOrSpecies);
                    const targetName = itemDef?.name ?? fishDef?.name ?? contract.targetItemIdOrSpecies;
                    const ownedForContract = itemDef ? InventoryManager.getItemCount(playerInv, itemDef.id) : 0;
                    const eligibleCargo = fishCargoList.filter((cargo) => cargo.speciesId === contract.targetItemIdOrSpecies);

                    return (
                      <div key={contract.id} className="contract-mini-card">
                        <div className="contract-mini-header">
                          <strong>Supply {targetName}</strong>
                          <span className="contract-gold">
                            <IconCoin size={12} aria-hidden="true" /> {contract.rewardMoney} G
                          </span>
                        </div>
                        <span className="contract-prog">
                          Fulfilled: {contract.quantityFulfilled} / {contract.quantityRequired}
                        </span>
                        <div className="contract-actions-row" style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                          {itemDef && ownedForContract > 0 && (
                            <ChromeButton
                              className="comm-sell-btn"
                              onClick={() => onDeliverContractItems(contract.id, itemDef.id, 1)}
                            >
                              Deliver 1 ({ownedForContract} in bag)
                            </ChromeButton>
                          )}
                          {eligibleCargo.length > 0 && (
                            <ChromeButton
                              variant="gold"
                              className="comm-sell-btn"
                              onClick={() => onDeliverFishCargo(contract.id, eligibleCargo[0].id)}
                            >
                              Deliver Fish ({eligibleCargo[0].weightKg.toFixed(1)} kg)
                            </ChromeButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="market-modal-footer">
          <ChromeButton variant="primary" onClick={onClose}>
            Done Trading
          </ChromeButton>
        </footer>
      </ChromePanel>
    </div>
  );
};

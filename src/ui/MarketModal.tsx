import React, { useEffect, useRef, useState } from "react";
import type { MarketId, RodId } from "../simulation/core/types";
import { IconCoin, IconFish, IconJournal, IconRod, IconSprout } from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem, atlasForRod } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeDivider, ChromeQuality } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";
import type { CommodityQuote, MarketBoardDto } from "../simulation/core/contracts";

type MarketLedgerSection = "buy" | "sell" | "hold";

interface MarketModalProps {
  board: MarketBoardDto | null;
  onSellItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onSellAllProduce: (marketId: MarketId) => void;
  onInspectCommodity: (
    marketId: MarketId,
    itemId: string,
    intent?: "buy" | "sell",
    quantity?: number
  ) => CommodityQuote;
  onBuySeed: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyItem: (marketId: MarketId, itemId: string, quantity: number) => void;
  onBuyRod: (marketId: MarketId, rodId: RodId) => void;
  onEquipRod: (marketId: MarketId, rodId: RodId) => void;
  onSellFishCargo: (marketId: MarketId, cargoId: string) => void;
  onSellAllFishCargo: (marketId: MarketId) => void;
  onDiscardFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  onClose: () => void;
  initialSection?: MarketLedgerSection;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  board,
  onSellItem,
  onSellAllProduce,
  onInspectCommodity,
  onBuySeed,
  onBuyItem,
  onBuyRod,
  onEquipRod,
  onSellFishCargo,
  onSellAllFishCargo,
  onDiscardFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onClose,
  initialSection = "buy"
}) => {
  const activeMarketId = board?.marketId ?? null;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [ledgerSection, setLedgerSection] = useState<MarketLedgerSection>(initialSection);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectLedgerSection = (section: MarketLedgerSection) => {
    playUiSound("page-turn");
    setLedgerSection(section);
  };

  const fishCargoList = board?.fishRows ?? [];
  const activeContracts = board?.contractRows ?? [];
  const ownedSellables = board?.sellRows ?? [];

  useEffect(() => {
    if (ledgerSection !== "sell") return;
    if (!ownedSellables.some((row) => row.itemId === selectedItemId)) {
      setSelectedItemId(ownedSellables[0]?.itemId ?? null);
      setSellQty(1);
    }
  }, [ledgerSection, ownedSellables, selectedItemId]);

  const selectedOwned =
    ownedSellables.find((row) => row.itemId === selectedItemId) ?? ownedSellables[0] ?? null;

  const ticketName = selectedOwned?.name ?? "Produce";
  const ownedCount = selectedOwned?.owned ?? 0;
  const clampedQty = ownedCount > 0 ? Math.min(Math.max(sellQty, 1), ownedCount) : 1;
  const ticketPrice = activeMarketId && selectedOwned
    ? onInspectCommodity(activeMarketId, selectedOwned.itemId, "sell", clampedQty)
    : null;

  const liveGold = ticketPrice?.success ? ticketPrice.totalPrice ?? 0 : 0;
  const bulkProduceQuote = board?.bulkProduce ?? { success: false, quantity: 0, lineCount: 0, revenue: 0 };
  const bulkFishQuote = board?.bulkFish ?? { success: false, quantity: 0, lineCount: 0, revenue: 0 };

  const handleSellAllProduce = () => {
    if (activeMarketId) onSellAllProduce(activeMarketId);
  };

  const handleSellAllFishCargo = () => {
    if (activeMarketId) onSellAllFishCargo(activeMarketId);
  };

  if (!board) {
    return (
      <div className="modal-overlay interactive" onClick={onClose}>
        <GameSheet
          ref={modalRef}
          as="div"
          className="market-trading-modal market-unavailable-sheet"
          tone="slate"
          corners
          rivets={false}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="market-unavailable-title"
          tabIndex={-1}
        >
          <header className="market-modal-header">
            <h2 id="market-unavailable-title" className="market-modal-title">The stall is out of reach</h2>
            <ChromeClose onClick={onClose} label="Close market" />
          </header>
          <div className="market-unavailable-state" role="status">
            <IconCoin size={28} aria-hidden="true" />
            <p>Return to the counter to trade.</p>
            <ChromeButton onClick={onClose}>Return to the coast</ChromeButton>
          </div>
        </GameSheet>
      </div>
    );
  }

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="market-trading-modal"
        tone="slate"
        corners
        rivets={false}
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
                {board?.name ?? "Coastal Market"}
              </h2>
              <span className="market-shopkeep-line">
                {activeMarketId === "market.harbor"
                  ? "The wharfinger eyes your hold. Fair weight, fair gold."
                  : "The grocer wipes the counter. Fresh from the yards, then?"}
              </span>
            </div>
          </div>

          <div className="market-purse-badge" data-testid="market-purse">
            <IconCoin size={16} aria-hidden="true" />
            <span>Purse: <strong>{(board?.money ?? 0).toLocaleString()} G</strong></span>
          </div>

          <ChromeClose onClick={onClose} label="Close market" className="market-close-btn" />
        </header>

        <nav className="market-ledger-index" aria-label="Ledger sections" data-testid="market-ledger-index">
          <button
            type="button"
            id="market-section-buy"
            aria-current={ledgerSection === "buy" ? "page" : undefined}
            aria-controls="market-ledger-sheet"
            className={`market-ledger-marker ${ledgerSection === "buy" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("buy")}
          >
            Wares
          </button>
          <button
            type="button"
            id="market-section-sell"
            aria-current={ledgerSection === "sell" ? "page" : undefined}
            aria-controls="market-ledger-sheet"
            className={`market-ledger-marker ${ledgerSection === "sell" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("sell")}
          >
            Your goods
          </button>
          {activeMarketId === "market.harbor" && (
            <button
              type="button"
              id="market-section-hold"
              aria-current={ledgerSection === "hold" ? "page" : undefined}
              aria-controls="market-ledger-sheet"
              className={`market-ledger-marker ${ledgerSection === "hold" ? "is-active" : ""}`}
              onClick={() => selectLedgerSection("hold")}
            >
              Fish hold
            </button>
          )}
        </nav>

        <ChromeDivider ornate={false} />

        <div
          className={`market-modal-grid${ledgerSection !== "sell" ? " is-single" : ""}`}
        >
          <section
            className="market-left-panel"
            id="market-ledger-sheet"
            aria-labelledby={`market-section-${ledgerSection}`}
            tabIndex={0}
          >
            {ledgerSection === "buy" && activeMarketId === "market.village" && (
              <div className="market-seeds-section">
                <h3 className="section-title">
                  <IconSprout size={15} aria-hidden="true" /> Crop Seeds & Supplies
                </h3>
                <div className="seed-stall-list">
                  {(board?.buyRows ?? []).map((row) => {
                    const unitPrice = row.quote.unitPrice ?? 0;
                    return (
                      <div className="seed-stall-card" key={row.itemId} title={row.description}>
                        <div className="seed-card-meta">
                          <AtlasImage src={atlasForItem(row.itemId)} alt="" size={32} />
                          <div>
                            <strong>{row.name}</strong>
                            <span className="seed-meta-sub">
                              {row.locked ? row.blockerReason : `${row.owned} in satchel`}
                            </span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          <ChromeButton
                            size="sm"
                            className="seed-buy-btn"
                            soundCue="coins"
                            disabled={row.disabled}
                            title={row.blockerReason}
                            onClick={() => onBuySeed(activeMarketId, row.itemId, 1)}
                          >
                            {row.blockerReason ?? `Buy 1 · ${unitPrice} G`}
                          </ChromeButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ledgerSection === "buy" && activeMarketId === "market.harbor" && (
              <>
              <div className="market-seeds-section">
                <h3 className="section-title">Harbor Supplies</h3>
                <div className="seed-stall-list">
                  {(board?.buyRows ?? []).map((row) => {
                    return (
                      <div className="seed-stall-card" key={row.itemId} title={row.description}>
                        <div className="seed-card-meta">
                          <AtlasImage src={atlasForItem(row.itemId)} alt="" size={32} />
                          <div>
                            <strong>{row.name}</strong>
                            <span className="seed-meta-sub">{row.owned} in satchel</span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          <ChromeButton
                            size="sm"
                            className="seed-buy-btn"
                            soundCue="coins"
                            disabled={row.disabled}
                            title={row.blockerReason}
                            onClick={() => onBuyItem(activeMarketId, row.itemId, 1)}
                          >
                            {row.blockerReason ?? `Buy 1 · ${row.quote.unitPrice ?? 0} G`}
                          </ChromeButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="market-seeds-section" data-testid="harbor-tackle-shop">
                <h3 className="section-title"><IconFish size={15} aria-hidden="true" /> Tackle</h3>
                <div className="seed-stall-list">
                  {(board?.rodRows ?? []).map((rod) => {
                    const rodSprite = atlasForRod(rod.rodId);
                    return (
                      <div className="seed-stall-card" key={rod.rodId}>
                        <div className="seed-card-meta">
                          {rodSprite ? (
                            <AtlasImage src={rodSprite} alt="" size={28} aria-hidden="true" />
                          ) : (
                            <IconRod size={28} aria-hidden="true" />
                          )}
                          <div>
                            <strong>{rod.name}</strong>
                            <span className="seed-meta-sub">
                              {rod.allowedHabitats.join(" · ")} · up to {rod.maximumCargoClass}
                            </span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          {rod.equipped ? (
                            <ChromeButton size="sm" disabled>Equipped</ChromeButton>
                          ) : rod.owned ? (
                            <ChromeButton
                              size="sm"
                              disabled={!rod.equippable}
                              title={rod.blockerReason}
                              onClick={() => onEquipRod(activeMarketId, rod.rodId)}
                            >
                              {rod.blockerReason ?? "Equip"}
                            </ChromeButton>
                          ) : rod.starter ? (
                            <ChromeButton size="sm" disabled>Starter rod</ChromeButton>
                          ) : (
                            <ChromeButton
                              size="sm"
                              soundCue="coins"
                              disabled={!rod.purchasable}
                              title={rod.blockerReason}
                              onClick={() => onBuyRod(activeMarketId, rod.rodId)}
                            >
                              {rod.blockerReason ?? `Buy & equip · ${rod.costMoney} G`}
                            </ChromeButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </>
            )}

            {ledgerSection === "sell" && (
            <div className="market-commodities-section">
              <div className="market-section-header-row">
                <h3 className="section-title">
                  <IconSprout size={15} aria-hidden="true" /> Your Satchel
                </h3>
                {bulkProduceQuote.success && bulkProduceQuote.revenue > 0 && (
                  <ChromeButton
                    variant="gold"
                    size="sm"
                    soundCue="coins"
                    className="batch-sell-btn-compact"
                    onClick={handleSellAllProduce}
                  >
                    Sell all produce · {bulkProduceQuote.revenue.toLocaleString()} G
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
                    const name = row.name;
                    const price = row.quote;
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
                              <span className="comm-owned">In satchel: {row.owned}</span>
                            </div>
                          </div>
                          <div className="comm-right">
                            <span className={`comm-demand demand-${price?.demandLabel?.toLowerCase() ?? "steady"}`}>
                              {price?.demandLabel ?? "Steady"}
                            </span>
                            <strong className="comm-price">{price?.unitPrice ?? "—"} G</strong>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {ledgerSection === "hold" && activeMarketId === "market.harbor" && (
              <div className="market-fish-cargo-section">
                <div className="market-section-header-row">
                  <h3 className="section-title">
                    <IconFish size={15} aria-hidden="true" /> Fish hold
                  </h3>
                  {bulkFishQuote.success && bulkFishQuote.revenue > 0 && (
                    <ChromeButton
                      variant="gold"
                      size="sm"
                      soundCue="coins"
                      className="batch-sell-btn-compact"
                      onClick={handleSellAllFishCargo}
                    >
                      Sell all fish · {bulkFishQuote.revenue.toLocaleString()} G
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
                      const breakdown = cargo.breakdown;
                      if (!breakdown) {
                        return (
                          <div key={cargo.cargoId} className="fish-cargo-card">
                            <div className="cargo-card-meta">
                              <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={36} />
                              <div>
                                <strong>{cargo.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                                <div className="cargo-sub-meta">
                                  <ChromeQuality quality={cargo.quality} />
                                  <span className="cargo-freshness-num">
                                    · {cargo.spoiled ? "Spoiled" : cargo.reason ?? "Not priced here"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {cargo.spoiled && activeMarketId && (
                              <div className="cargo-card-actions">
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => onDiscardFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  Make scraps
                                </ChromeButton>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={cargo.cargoId} className="fish-cargo-card">
                          <div className="cargo-card-meta">
                            <AtlasImage src={atlasForFish(cargo.speciesId)} alt="" size={36} />
                            <div>
                              <strong>{cargo.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                              <div className="cargo-sub-meta">
                                <ChromeQuality quality={cargo.quality} />
                                <span className="cargo-freshness-num">· {Math.round(cargo.freshness)}% Fresh</span>
                              </div>
                            </div>
                          </div>
                          <dl className="market-fish-breakdown" aria-label="Fish quote breakdown">
                            <div><dt>Base</dt><dd>{breakdown.speciesBasePrice} G</dd></div>
                            <div><dt>Weight</dt><dd>×{breakdown.weightModifier.toFixed(2)}</dd></div>
                            <div><dt>Quality</dt><dd>×{breakdown.qualityModifier.toFixed(2)}</dd></div>
                            <div><dt>Freshness</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                            <div><dt>Demand</dt><dd>{breakdown.demandPercent}%</dd></div>
                          </dl>
                          <div className="cargo-card-actions">
                            <strong className="cargo-value">{breakdown.finalPrice} G</strong>
                            {cargo.spoiled || breakdown.finalPrice <= 0 ? (
                              <ChromeButton
                                className="plaque-release-btn"
                                soundCue="click"
                                onClick={() => activeMarketId && onDiscardFishCargo(activeMarketId, cargo.cargoId)}
                              >
                                Make scraps
                              </ChromeButton>
                            ) : (
                              <ChromeButton
                                variant="gold"
                                soundCue="coins"
                                className="plaque-keep-btn"
                                onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.cargoId)}
                              >
                                Sell fish
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

          {ledgerSection === "sell" && (
          <aside className="market-right-panel">
            {selectedOwned && ticketPrice?.success && ticketPrice.unitPrice != null ? (
                <div className="market-sell-ticket" data-testid="market-sell-ticket">
                  <h3 className="section-title">Sale ticket</h3>
                  <div className="market-ticket-head">
                    <AtlasImage src={atlasForItem(selectedOwned.itemId)} alt="" size={40} />
                    <div>
                      <strong className="arb-title">{ticketName}</strong>
                      <span className={`comm-demand demand-${ticketPrice.demandLabel?.toLowerCase() ?? "steady"}`}>
                        Demand · {ticketPrice.demandLabel ?? "Steady"}
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
                  <span>Bring goods this stall buys, then choose a row for a sale ticket.</span>
                </div>
              )}
          </aside>
          )}
        </div>

        {activeContracts.length > 0 && (
          <section className="market-contracts-footer" aria-labelledby="market-contracts-title">
            <h3 id="market-contracts-title" className="section-title">
              <IconJournal size={15} aria-hidden="true" /> Posted orders
            </h3>
            <div className="active-contracts-list">
              {activeContracts.map((contract) => (
                <article key={contract.contractId} className="contract-mini-card">
                  <div className="contract-mini-header">
                    <strong>Supply {contract.targetName}</strong>
                    <span className="contract-gold">
                      <IconCoin size={12} aria-hidden="true" /> {contract.rewardMoney} G
                    </span>
                  </div>
                  <span className="contract-prog">
                    Fulfilled: {contract.quantityFulfilled} / {contract.quantityRequired}
                  </span>
                  <div className={`contract-readiness${contract.ready ? " is-ready" : " is-blocked"}`}>
                    {contract.ready ? (
                      <strong>Ready</strong>
                    ) : (
                      <ul>
                        {contract.blockerReasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="contract-actions-row">
                    {contract.itemId && contract.deliverableItems > 0 && (
                      <ChromeButton
                        variant="gold"
                        soundCue="stamp"
                        className="comm-sell-btn"
                        onClick={() => onDeliverContractItems(
                          contract.contractId,
                          contract.itemId!,
                          contract.deliverableItems
                        )}
                      >
                        Deliver {contract.deliverableItems} from satchel
                      </ChromeButton>
                    )}
                    {contract.eligibleCargoIds.length > 0 && (
                      <ChromeButton
                        variant="gold"
                        className="comm-sell-btn"
                        onClick={() => onDeliverFishCargo(contract.contractId, contract.eligibleCargoIds[0])}
                      >
                        Deliver fish
                      </ChromeButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="market-modal-footer">
          <ChromeButton onClick={onClose}>
            Leave market
          </ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { MarketId, RodId } from "../simulation/core/types";
import { IconCoin, IconFish, IconJournal, IconRod, IconSprout } from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem, atlasForRod } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeDivider, ChromeQuality } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";
import type { CommodityQuote, MarketBoardDto, MarketDemandTrendDto } from "../simulation/core/contracts";
import { MarketDemandTrend } from "./components/MarketDemandTrend";

type MarketLedgerSection = "buy" | "sell" | "hold";

/** Bulk sales above this gold value require an explicit confirmation step. */
const BULK_CONFIRM_THRESHOLD_G = 200;

const HARBOR_SHOPKEEP_LINES = [
  "The wharfinger eyes your hold. Fair weight, fair gold.",
  "Tide's kind today. Bring what you've caught.",
  "Salt air and honest scales — that's the harbor way.",
  "Good haul? Let's see what the market says.",
  "Another day on the docks. Show me your catch."
];

const VILLAGE_SHOPKEEP_LINES = [
  "The grocer wipes the counter. Fresh from the yards, then?",
  "Morning light, morning trade. What have you brought?",
  "Soil on your boots — must be harvest day.",
  "The shelf won't stock itself. Let's see your yield.",
  "A farmer's work shows in the basket. Show me yours."
];

/**
 * Deterministic day hash (integer avalanche, no Math.random, no sim RNG)
 * so the shopkeep line rotates day to day without touching simulation truth.
 */
const hashGameDay = (day: number): number => {
  let h = (day | 0) ^ 0x9e3779b9;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

const pickShopkeepLine = (marketId: MarketId | null, dayInSeason: number): string => {
  const pool = marketId === "market.harbor" ? HARBOR_SHOPKEEP_LINES : VILLAGE_SHOPKEEP_LINES;
  return pool[hashGameDay(dayInSeason) % pool.length];
};

function SortToggles<T extends string>({ options, activeKey, direction, onSelect, ariaLabel }: {
  options: ReadonlyArray<{ key: T; label: string }>;
  activeKey: T;
  direction: 1 | -1;
  onSelect: (key: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="market-sort-row" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option.key === activeKey;
        return (
          <button
            key={option.key}
            type="button"
            className={`market-sort-btn${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            title={isActive ? `Sorted by ${option.label} (${direction === 1 ? "ascending" : "descending"}). Activate to reverse.` : `Sort by ${option.label}`}
            onClick={() => onSelect(option.key)}
          >
            {option.label}{isActive ? (direction === 1 ? " ↑" : " ↓") : ""}
          </button>
        );
      })}
    </div>
  );
}

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
  onReleaseFishCargo: (marketId: MarketId, cargoId: string) => void;
  onDeliverContractItems: (contractId: string, itemId: string, quantity: number) => void;
  onDeliverFishCargo: (contractId: string, cargoId: string) => void;
  /** Demand outlook for one commodity. Omitted where the host cannot project it. */
  onInspectDemandTrend?: (marketId: MarketId, itemId: string) => MarketDemandTrendDto | null;
  onClose: () => void;
  initialSection?: MarketLedgerSection;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  board,
  onSellItem,
  onSellAllProduce,
  onInspectCommodity,
  onInspectDemandTrend,
  onBuySeed,
  onBuyItem,
  onBuyRod,
  onEquipRod,
  onSellFishCargo,
  onSellAllFishCargo,
  onDiscardFishCargo,
  onReleaseFishCargo,
  onDeliverContractItems,
  onDeliverFishCargo,
  onClose,
  initialSection = "buy"
}) => {
  const activeMarketId = board?.marketId ?? null;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [sellQty, setSellQty] = useState(1);
  const [ledgerSection, setLedgerSection] = useState<MarketLedgerSection>(initialSection);
  const [buySortKey, setBuySortKey] = useState<"name" | "price">("name");
  const [buySortDir, setBuySortDir] = useState<1 | -1>(1);
  const [sellSortKey, setSellSortKey] = useState<"name" | "price" | "quantity">("name");
  const [sellSortDir, setSellSortDir] = useState<1 | -1>(1);
  const [holdSortKey, setHoldSortKey] = useState<"name" | "price">("name");
  const [holdSortDir, setHoldSortDir] = useState<1 | -1>(1);
  const [pendingBulk, setPendingBulk] = useState<"produce" | "fish" | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectLedgerSection = (section: MarketLedgerSection) => {
    playUiSound("page-turn");
    setLedgerSection(section);
  };

  const fishCargoList = board?.fishRows ?? [];
  const activeContracts = board?.contractRows ?? [];
  const ownedSellables = board?.sellRows ?? [];
  const buyRows = board?.buyRows ?? [];

  const sortedBuyRows = useMemo(() => [...buyRows].sort((a, b) => {
    const cmp = buySortKey === "price"
      ? (a.quote.unitPrice ?? 0) - (b.quote.unitPrice ?? 0)
      : a.name.localeCompare(b.name);
    return cmp * buySortDir;
  }), [buyRows, buySortKey, buySortDir]);

  const sortedSellables = useMemo(() => [...ownedSellables].sort((a, b) => {
    let cmp = 0;
    if (sellSortKey === "price") cmp = (a.quote.unitPrice ?? 0) - (b.quote.unitPrice ?? 0);
    else if (sellSortKey === "quantity") cmp = a.owned - b.owned;
    else cmp = a.name.localeCompare(b.name);
    return cmp * sellSortDir;
  }), [ownedSellables, sellSortKey, sellSortDir]);

  const sortedFishCargo = useMemo(() => [...fishCargoList].sort((a, b) => {
    const cmp = holdSortKey === "price"
      ? (a.breakdown?.finalPrice ?? -1) - (b.breakdown?.finalPrice ?? -1)
      : a.name.localeCompare(b.name);
    return cmp * holdSortDir;
  }), [fishCargoList, holdSortKey, holdSortDir]);

  // A pending bulk confirmation never survives a market or section switch.
  useEffect(() => {
    setPendingBulk(null);
  }, [activeMarketId, ledgerSection]);

  useEffect(() => {
    if (ledgerSection !== "sell") return;
    if (!sortedSellables.some((row) => row.itemId === selectedItemId)) {
      setSelectedItemId(sortedSellables[0]?.itemId ?? null);
      setSellQty(1);
    }
  }, [ledgerSection, sortedSellables, selectedItemId]);

  const selectedOwned =
    sortedSellables.find((row) => row.itemId === selectedItemId) ?? sortedSellables[0] ?? null;

  const ticketName = selectedOwned?.name ?? "Produce";
  const ownedCount = selectedOwned?.owned ?? 0;
  const clampedQty = ownedCount > 0 ? Math.min(Math.max(sellQty, 1), ownedCount) : 1;
  const ticketPrice = activeMarketId && selectedOwned
    ? onInspectCommodity(activeMarketId, selectedOwned.itemId, "sell", clampedQty)
    : null;

  const demandTrend = activeMarketId && selectedOwned && onInspectDemandTrend
    ? onInspectDemandTrend(activeMarketId, selectedOwned.itemId)
    : null;

  const liveGold = ticketPrice?.success ? ticketPrice.totalPrice ?? 0 : 0;
  const bulkProduceQuote = board?.bulkProduce ?? { success: false, quantity: 0, lineCount: 0, revenue: 0 };
  const bulkFishQuote = board?.bulkFish ?? { success: false, quantity: 0, lineCount: 0, revenue: 0 };

  const handleSellAllProduce = () => {
    setPendingBulk(null);
    if (activeMarketId) onSellAllProduce(activeMarketId);
  };

  const handleSellAllFishCargo = () => {
    setPendingBulk(null);
    if (activeMarketId) onSellAllFishCargo(activeMarketId);
  };

  /**
   * #11: bulk sales worth more than BULK_CONFIRM_THRESHOLD_G need an armed
   * confirmation popover. Confirmation-only: the sim exposes no reversal
   * callback on these props, so no undo toast is shown (never fake gold).
   */
  const requestBulkSell = (kind: "produce" | "fish", revenue: number, fire: () => void): void => {
    if (revenue > BULK_CONFIRM_THRESHOLD_G && pendingBulk !== kind) {
      playUiSound("click");
      setPendingBulk(kind);
      return;
    }
    setPendingBulk(null);
    fire();
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
                {pickShopkeepLine(activeMarketId, board?.dayInSeason ?? 0)}
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
                <SortToggles
                  ariaLabel="Sort wares"
                  options={[{ key: "name", label: "Name" }, { key: "price", label: "Price" }]}
                  activeKey={buySortKey}
                  direction={buySortDir}
                  onSelect={(key) => {
                    playUiSound("click");
                    if (key === buySortKey) setBuySortDir(buySortDir === 1 ? -1 : 1);
                    else { setBuySortKey(key); setBuySortDir(1); }
                  }}
                />
                <div className="seed-stall-list">
                  {sortedBuyRows.map((row) => {
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
                <SortToggles
                  ariaLabel="Sort harbor supplies"
                  options={[{ key: "name", label: "Name" }, { key: "price", label: "Price" }]}
                  activeKey={buySortKey}
                  direction={buySortDir}
                  onSelect={(key) => {
                    playUiSound("click");
                    if (key === buySortKey) setBuySortDir(buySortDir === 1 ? -1 : 1);
                    else { setBuySortKey(key); setBuySortDir(1); }
                  }}
                />
                <div className="seed-stall-list">
                  {sortedBuyRows.map((row) => {
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
                    aria-expanded={pendingBulk === "produce"}
                    onClick={() => requestBulkSell("produce", bulkProduceQuote.revenue, handleSellAllProduce)}
                  >
                    Sell all produce · {bulkProduceQuote.revenue.toLocaleString()} G
                  </ChromeButton>
                )}
              </div>
              <SortToggles
                ariaLabel="Sort your goods"
                options={[{ key: "name", label: "Name" }, { key: "price", label: "Price" }, { key: "quantity", label: "Qty" }]}
                activeKey={sellSortKey}
                direction={sellSortDir}
                onSelect={(key) => {
                  playUiSound("click");
                  if (key === sellSortKey) setSellSortDir(sellSortDir === 1 ? -1 : 1);
                  else { setSellSortKey(key); setSellSortDir(1); }
                }}
              />
              {pendingBulk === "produce" && (
                <div
                  className="bulk-confirm-popover"
                  role="alertdialog"
                  aria-label={`Confirm bulk produce sale for ${bulkProduceQuote.revenue.toLocaleString()} gold`}
                >
                  <p className="bulk-confirm-text">
                    Sell {bulkProduceQuote.quantity} goods ({bulkProduceQuote.lineCount} lines) for{" "}
                    <strong>{bulkProduceQuote.revenue.toLocaleString()} G</strong>? This cannot be undone.
                  </p>
                  <div className="bulk-confirm-actions">
                    <ChromeButton
                      variant="gold"
                      size="sm"
                      soundCue="coins"
                      onClick={handleSellAllProduce}
                    >
                      Confirm sale
                    </ChromeButton>
                    <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                      Keep goods
                    </ChromeButton>
                  </div>
                </div>
              )}
              {ownedSellables.length === 0 ? (
                <div className="no-cargo-card" data-testid="market-sell-empty">
                  Nothing in your satchel that this stall buys.
                </div>
              ) : (
                <div className="commodities-list" data-testid="market-sell-list">
                  {sortedSellables.map((row) => {
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
                      aria-expanded={pendingBulk === "fish"}
                      onClick={() => requestBulkSell("fish", bulkFishQuote.revenue, handleSellAllFishCargo)}
                    >
                      Sell all fish · {bulkFishQuote.revenue.toLocaleString()} G
                    </ChromeButton>
                  )}
                </div>
                <SortToggles
                  ariaLabel="Sort fish hold"
                  options={[{ key: "name", label: "Name" }, { key: "price", label: "Price" }]}
                  activeKey={holdSortKey}
                  direction={holdSortDir}
                  onSelect={(key) => {
                    playUiSound("click");
                    if (key === holdSortKey) setHoldSortDir(holdSortDir === 1 ? -1 : 1);
                    else { setHoldSortKey(key); setHoldSortDir(1); }
                  }}
                />
                {pendingBulk === "fish" && (
                  <div
                    className="bulk-confirm-popover"
                    role="alertdialog"
                    aria-label={`Confirm bulk fish sale for ${bulkFishQuote.revenue.toLocaleString()} gold`}
                  >
                    <p className="bulk-confirm-text">
                      Sell {bulkFishQuote.quantity} fish ({bulkFishQuote.lineCount} lines) for{" "}
                      <strong>{bulkFishQuote.revenue.toLocaleString()} G</strong>? This cannot be undone.
                    </p>
                    <div className="bulk-confirm-actions">
                      <ChromeButton
                        variant="gold"
                        size="sm"
                        soundCue="coins"
                        onClick={handleSellAllFishCargo}
                      >
                        Confirm sale
                      </ChromeButton>
                      <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                        Keep catch
                      </ChromeButton>
                    </div>
                  </div>
                )}
                {fishCargoList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>No sport fish currently in boat hold or carried in hand.</span>
                  </div>
                ) : (
                  <div className="fish-cargo-trade-list">
                    {sortedFishCargo.map((cargo) => {
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
                                  title="Spoiled fish can be broken down for bait materials"
                                  onClick={() => onDiscardFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  Make scraps
                                </ChromeButton>
                                <p className="scraps-explainer">Spoiled fish can&apos;t be sold — Make scraps breaks it down into bait materials.</p>
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
                              <>
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onDiscardFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  Make scraps
                                </ChromeButton>
                                <p className="scraps-explainer">Spoiled fish can&apos;t be sold — Make scraps breaks it down into bait materials.</p>
                              </>
                            ) : (
                              <>
                                <ChromeButton
                                  variant="gold"
                                  soundCue="coins"
                                  className="plaque-keep-btn"
                                  onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  Sell fish
                                </ChromeButton>
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onReleaseFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  Release
                                </ChromeButton>
                              </>
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
                  {demandTrend && <MarketDemandTrend trend={demandTrend} />}
                  <div className="market-qty-stepper" data-testid="market-sell-qty">
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty <= 1}
                      onClick={(e) => setSellQty((n) => Math.max(1, n - (e.shiftKey ? 10 : 1)))}
                      aria-label="Fewer (Shift+click for −10)"
                      title="−1 (Shift: −10)"
                    >
                      −
                    </ChromeButton>
                    <span className="market-qty-value">
                      <label className="market-qty-direct">
                        <span className="market-qty-sr">Quantity to sell</span>
                        <input
                          type="number"
                          className="market-qty-input"
                          min={1}
                          max={ownedCount}
                          step={1}
                          value={clampedQty}
                          onChange={(event) => {
                            const next = Math.floor(Number(event.target.value));
                            if (!Number.isFinite(next)) return;
                            setSellQty(Math.min(ownedCount, Math.max(1, next)));
                          }}
                          aria-label={`Quantity to sell, 1 to ${ownedCount}`}
                        />
                        <span aria-hidden="true"> / {ownedCount}</span>
                      </label>
                    </span>
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty >= ownedCount}
                      onClick={(e) => setSellQty((n) => Math.min(ownedCount, n + (e.shiftKey ? 10 : 1)))}
                      aria-label="More (Shift+click for +10)"
                      title="+1 (Shift: +10)"
                    >
                      +
                    </ChromeButton>
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn market-qty-max"
                      disabled={clampedQty >= ownedCount}
                      onClick={() => setSellQty(ownedCount)}
                      aria-label="Set to maximum quantity"
                    >
                      Max
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarketId, RodId } from "../simulation/core/types";
import { marketAcceptsFishTradePacks } from "../content/markets";
import { IconCoin, IconFish, IconJournal, IconRod, IconSprout } from "./components/HudIcons";
import { useModalAccessibility } from "./useModalAccessibility";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem, atlasForRod } from "./chrome/uiAtlas";
import { ChromeButton, ChromeClose, ChromeDivider, ChromeQuality } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";
import type { CommodityQuote, MarketBoardDto, MarketDemandTrendDto } from "../simulation/core/contracts";
import { MarketDemandTrend } from "./components/MarketDemandTrend";

type MarketLedgerSection = "buy" | "sell" | "hold" | "trade-packs" | "deliveries";

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

// Keep an empty field editable; transaction controls require a complete quantity.
function useQuantityDraft() {
  const [input, setInput] = useState("1");
  const value = Number(input);
  const valid = input.trim() !== "" && Number.isSafeInteger(value) && value >= 1;
  const setValue = useCallback((next: number | ((previous: number) => number)) => {
    setInput((previous) => String(typeof next === "function" ? next(Number(previous) || 1) : next));
  }, []);
  return { input, setInput, value, setValue, valid };
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
  /** Strikes an untouched order so its slot can post another. Omitted where not offered. */
  onPassContract?: (contractId: string) => void;
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
  onPassContract,
  onClose,
  initialSection = "buy"
}) => {
  const activeMarketId = board?.marketId ?? null;

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const { input: sellInput, setInput: setSellInput, value: sellQty, setValue: setSellQty, valid: sellValid } = useQuantityDraft();
  const [selectedBuyId, setSelectedBuyId] = useState<string | null>(null);
  const { input: buyInput, setInput: setBuyInput, value: buyQty, setValue: setBuyQty, valid: buyValid } = useQuantityDraft();
  const [ledgerSection, setLedgerSection] = useState<MarketLedgerSection>(initialSection);
  const [buySortKey, setBuySortKey] = useState<"name" | "price">("name");
  const [buySortDir, setBuySortDir] = useState<1 | -1>(1);
  const [sellSortKey, setSellSortKey] = useState<"name" | "price" | "quantity">("name");
  const [sellSortDir, setSellSortDir] = useState<1 | -1>(1);
  const [holdSortKey, setHoldSortKey] = useState<"name" | "price">("name");
  const [holdSortDir, setHoldSortDir] = useState<1 | -1>(1);
  // "item" arms the ticket's "Sell all of this item" for the selected stack.
  const [pendingBulk, setPendingBulk] = useState<"produce" | "fish" | "item" | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const selectLedgerSection = (section: MarketLedgerSection) => {
    playUiSound("page-turn");
    setLedgerSection(section);
    setBuyQty(1);
  };

  const fishCargoList = board?.fishRows ?? [];
  const tradePackList = board?.tradePackRows ?? [];
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
  const sortedTradePacks = useMemo(() => [...tradePackList].sort((a, b) => {
    const cmp = holdSortKey === "price"
      ? (a.breakdown?.finalPrice ?? -1) - (b.breakdown?.finalPrice ?? -1)
      : a.name.localeCompare(b.name);
    return cmp * holdSortDir;
  }), [tradePackList, holdSortKey, holdSortDir]);

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

  const selectedBuy = sortedBuyRows.find((row) => row.itemId === selectedBuyId)
    ?? sortedBuyRows.find((row) => !row.locked && !row.blockerReason) ?? sortedBuyRows[0] ?? null;
  const purchaseQuote = activeMarketId && selectedBuy && ledgerSection === "buy" && buyValid
    ? onInspectCommodity(activeMarketId, selectedBuy.itemId, "buy", buyQty) : null;
  const purchaseBlocker = (!buyValid ? "Enter a whole quantity of at least 1." : undefined)
    ?? selectedBuy?.blockerReason
    ?? (!purchaseQuote?.success ? purchaseQuote?.reason ?? "Choose an item" : undefined)
    ?? (purchaseQuote?.available !== undefined && purchaseQuote.available < buyQty ? "Not enough in stock" : undefined)
    ?? (purchaseQuote?.affordable === false ? "Not enough gold" : undefined);
  const purchaseTotal = purchaseQuote?.success ? purchaseQuote.totalPrice : undefined;

  const selectedOwned =
    sortedSellables.find((row) => row.itemId === selectedItemId) ?? sortedSellables[0] ?? null;

  const ticketName = selectedOwned?.name ?? "Produce";
  const ownedCount = selectedOwned?.owned ?? 0;
  // Keep the ticket mounted while a draft is invalid. Quotes require whole
  // quantities; the separate validity guard still blocks the sale itself.
  const clampedQty = ownedCount > 0 && sellValid ? Math.min(sellQty, ownedCount) : 1;
  useEffect(() => {
    setSellQty(1);
    // An armed "sell all of this item" confirms one stack, never the next one.
    setPendingBulk((pending) => (pending === "item" ? null : pending));
  }, [selectedOwned?.itemId, ownedCount, setSellQty]);

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

  // The whole stack is a bulk sale too, and is held to the same threshold.
  const sellAllItemQuote = activeMarketId && selectedOwned && ownedCount > 0
    ? onInspectCommodity(activeMarketId, selectedOwned.itemId, "sell", ownedCount)
    : null;
  const sellAllItemRevenue = sellAllItemQuote?.success ? sellAllItemQuote.totalPrice ?? 0 : 0;
  const handleSellAllOfItem = () => {
    setPendingBulk(null);
    if (activeMarketId && selectedOwned && ownedCount > 0) onSellItem(activeMarketId, selectedOwned.itemId, ownedCount);
  };

  /**
   * #11: bulk sales worth more than BULK_CONFIRM_THRESHOLD_G need an armed
   * confirmation popover. Confirmation-only: the sim exposes no reversal
   * callback on these props, so no undo toast is shown (never fake gold).
   */
  const requestBulkSell = (kind: "produce" | "fish" | "item", revenue: number, fire: () => void): void => {
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
        className="market-trading-modal" data-section={ledgerSection}
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
            Buy
          </button>
          <button
            type="button"
            id="market-section-sell"
            aria-current={ledgerSection === "sell" ? "page" : undefined}
            aria-controls="market-ledger-sheet"
            className={`market-ledger-marker ${ledgerSection === "sell" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("sell")}
          >
            Sell
          </button>
          {fishCargoList.length > 0 ? (
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
          ) : null}
          {marketAcceptsFishTradePacks(activeMarketId) ? (
            <button
              type="button"
              id="market-section-trade-packs"
              aria-current={ledgerSection === "trade-packs" ? "page" : undefined}
              aria-controls="market-ledger-sheet"
              className={`market-ledger-marker ${ledgerSection === "trade-packs" ? "is-active" : ""}`}
              onClick={() => selectLedgerSection("trade-packs")}
            >
              Trade packs{tradePackList.length > 0 ? ` (${tradePackList.length})` : ""}
            </button>
          ) : null}
          <button type="button" id="market-section-deliveries" aria-current={ledgerSection === "deliveries" ? "page" : undefined}
            aria-controls="market-contracts-title" className={`market-ledger-marker ${ledgerSection === "deliveries" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("deliveries")}>Deliveries{activeContracts.length > 0 ? ` (${activeContracts.length})` : ""}</button>
        </nav>

        <ChromeDivider ornate={false} />

        {ledgerSection !== "deliveries" && <div
          className={`market-modal-grid${ledgerSection === "hold" || ledgerSection === "trade-packs" ? " is-single" : ""}`}
        >
          <section
            className="market-left-panel"
            id="market-ledger-sheet"
            aria-labelledby={`market-section-${ledgerSection}`}
            tabIndex={0}
          >
            {ledgerSection === "buy" && (<>
              <div className="market-seeds-section">
                <SortToggles ariaLabel="Sort wares" options={[{ key: "name", label: "Name" }, { key: "price", label: "Price" }]}
                  activeKey={buySortKey} direction={buySortDir} onSelect={(key) => {
                    if (key === buySortKey) setBuySortDir(buySortDir === 1 ? -1 : 1);
                    else { setBuySortKey(key); setBuySortDir(1); }
                  }} />
                <div className="guild-wares-list" aria-label="Items for sale">
                  {sortedBuyRows.map((row) => <button type="button" key={row.itemId}
                    className={`guild-ware-row ${selectedBuy?.itemId === row.itemId ? "is-selected" : ""} ${row.locked ? "is-locked" : ""}`}
                    aria-pressed={selectedBuy?.itemId === row.itemId} aria-label={`Select ${row.name}`}
                    onClick={() => { playUiSound("click"); setSelectedBuyId(row.itemId); setBuyQty(1); }}>
                    <AtlasImage src={atlasForItem(row.itemId)} size={52} aria-hidden="true" />
                    <span><strong>{row.name}</strong><small>{row.blockerReason ?? `${row.owned} in satchel`}</small></span>
                    <strong className="guild-ware-price">{row.quote.unitPrice ?? "—"} G</strong>
                  </button>)}
                  {sortedBuyRows.length === 0 && <p className="no-cargo-card">No wares are available at this counter.</p>}
                </div>
              </div>
              {board.rodRows.length > 0 &&
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
                              onClick={() => onEquipRod(board.marketId, rod.rodId)}
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
                              onClick={() => onBuyRod(board.marketId, rod.rodId)}
                            >
                              {rod.blockerReason ?? `Buy & equip · ${rod.costMoney} G`}
                            </ChromeButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>}
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
                              {row.lots.some((lot) => lot.quality) && (
                                <span className="comm-lots">
                                  {row.lots.map((lot) => (
                                    <span
                                      key={lot.quality ?? "ungraded"}
                                      className={`comm-lot-tag${lot.quality ? ` is-${lot.quality}` : ""}`}
                                    >
                                      {lot.quantity} {lot.quality ?? "ungraded"}
                                    </span>
                                  ))}
                                </span>
                              )}
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

            {ledgerSection === "hold" && (
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
                    <span>No fish cargo currently in boat hold or carried in hand.</span>
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
                          <details className="market-details-disclosure">
                            <summary>Price details</summary>
                          <dl className="market-fish-breakdown" aria-label="Fish quote breakdown">
                            <div><dt>Base</dt><dd>{breakdown.speciesBasePrice} G</dd></div>
                            <div><dt>Weight</dt><dd>×{breakdown.weightModifier.toFixed(2)}</dd></div>
                            <div><dt>Quality</dt><dd>×{breakdown.qualityModifier.toFixed(2)}</dd></div>
                            <div><dt>Freshness</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                            <div><dt>Demand</dt><dd>{breakdown.demandPercent}%</dd></div>
                          </dl>
                          </details>
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

            {ledgerSection === "trade-packs" && (
              <div className="market-fish-cargo-section" data-testid="market-trade-packs">
                <div className="market-section-header-row">
                  <h3 className="section-title">
                    <IconFish size={15} aria-hidden="true" /> Fish trade packs
                  </h3>
                </div>
                <p className="market-section-note">
                  Unload a pack from your boat or carriage, carry it to the counter, and sell it one at a time.
                </p>
                {tradePackList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>No trade pack in hand. Collect one from your boat or carriage, then carry it here.</span>
                  </div>
                ) : (
                  <div className="fish-cargo-trade-list">
                    {sortedTradePacks.map((pack) => {
                      const breakdown = pack.breakdown;
                      return (
                        <div key={pack.cargoId} className="fish-cargo-card">
                          <div className="cargo-card-meta">
                            <AtlasImage src={atlasForFish(pack.speciesId)} alt="" size={36} />
                            <div>
                              <strong>{pack.name} ({pack.weightKg.toFixed(1)} kg)</strong>
                              <div className="cargo-sub-meta">
                                <ChromeQuality quality={pack.quality} />
                                <span className="cargo-freshness-num">
                                  · {pack.spoiled ? "Spoiled" : `${Math.round(pack.freshness)}% Fresh`}
                                </span>
                              </div>
                            </div>
                          </div>
                          {breakdown ? (
                            <details className="market-details-disclosure">
                              <summary>Price details</summary>
                              <dl className="market-fish-breakdown" aria-label="Trade pack quote breakdown">
                                <div><dt>Base</dt><dd>{breakdown.speciesBasePrice} G</dd></div>
                                <div><dt>Weight</dt><dd>×{breakdown.weightModifier.toFixed(2)}</dd></div>
                                <div><dt>Quality</dt><dd>×{breakdown.qualityModifier.toFixed(2)}</dd></div>
                                <div><dt>Freshness</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                                <div><dt>Demand</dt><dd>{breakdown.demandPercent}%</dd></div>
                              </dl>
                            </details>
                          ) : null}
                          <div className="cargo-card-actions">
                            <strong className="cargo-value">{breakdown?.finalPrice ?? "—"} G</strong>
                            {pack.spoiled || !breakdown || breakdown.finalPrice <= 0 ? (
                              <>
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onDiscardFishCargo(activeMarketId, pack.cargoId)}
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
                                  onClick={() => activeMarketId && onSellFishCargo(activeMarketId, pack.cargoId)}
                                >
                                  Sell trade pack
                                </ChromeButton>
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onReleaseFishCargo(activeMarketId, pack.cargoId)}
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

          {ledgerSection === "buy" && <aside className="market-right-panel">
            {selectedBuy && <div className="guild-purchase-ticket" data-testid="market-buy-ticket">
              <div className="guild-ticket-illustration"><AtlasImage src={atlasForItem(selectedBuy.itemId)} size={136} aria-hidden="true" /></div>
              <h3>{selectedBuy.name}</h3><p>{selectedBuy.description}</p>
              <dl className="guild-ticket-facts"><div><dt>Unit price</dt><dd>{purchaseQuote?.unitPrice ?? "—"} G</dd></div>
                <div><dt>In satchel</dt><dd>{selectedBuy.owned}</dd></div></dl>
              <div className="market-qty-stepper" data-testid="market-buy-qty">
                <ChromeButton size="sm" aria-label="Buy fewer" disabled={buyQty <= 1} onClick={() => setBuyQty((n) => Math.max(1, n - 1))}>−</ChromeButton>
                <input type="number" min={1} step={1} value={buyInput} aria-invalid={!buyValid} aria-label="Quantity to buy" className="market-qty-input"
                  onChange={(event) => setBuyInput(event.target.value)} />
                <ChromeButton size="sm" aria-label="Buy more" disabled={buyQty >= Number.MAX_SAFE_INTEGER || (purchaseQuote?.available !== undefined && buyQty >= purchaseQuote.available)}
                  onClick={() => setBuyQty((n) => n + 1)}>+</ChromeButton>
              </div>
              <div className="market-quick-qty-pills">
                <button type="button" className={`market-quick-pill ${buyQty === 1 ? "is-active" : ""}`} onClick={() => setBuyQty(1)}>1</button>
                <button type="button" className={`market-quick-pill ${buyQty === 5 ? "is-active" : ""}`} onClick={() => setBuyQty(5)}>5</button>
                <button type="button" className={`market-quick-pill ${buyQty === 10 ? "is-active" : ""}`} onClick={() => setBuyQty(10)}>10</button>
                {purchaseQuote?.available !== undefined && purchaseQuote.available > 0 && (
                  <button type="button" className={`market-quick-pill ${buyQty === purchaseQuote.available ? "is-active" : ""}`} onClick={() => setBuyQty(purchaseQuote.available!)}>Max</button>
                )}
              </div>
              <div className="guild-purchase-total">Total <strong data-testid="market-buy-total">{purchaseTotal?.toLocaleString() ?? "—"} G</strong></div>
              {purchaseBlocker && <p className="guild-trade-blocker" role="status">{purchaseBlocker}</p>}
              <ChromeButton variant="gold" soundCue="coins" data-testid="market-buy-confirm" disabled={!!purchaseBlocker || purchaseTotal === undefined}
                onClick={() => {
                  if (!activeMarketId || purchaseBlocker) return;
                  if (selectedBuy.kind === "seed") onBuySeed(activeMarketId, selectedBuy.itemId, buyQty);
                  else onBuyItem(activeMarketId, selectedBuy.itemId, buyQty);
                }}>Buy{buyValid ? ` ${buyQty}` : ""}</ChromeButton>
              <span className="guild-ticket-destination">To your satchel</span>
              {purchaseTotal !== undefined && purchaseQuote?.affordable !== false && <p className="guild-remaining-purse">Remaining purse <strong>{(board.money - purchaseTotal).toLocaleString()} G</strong></p>}
            </div>}
          </aside>}

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
                    <span>
                      {ticketPrice.qualityBreakdown && ticketPrice.qualityBreakdown.length > 1
                        ? "Average unit price"
                        : "Unit price"}
                    </span>
                    <strong>{ticketPrice.unitPrice} G</strong>
                  </div>
                  {ticketPrice.qualityBreakdown?.some((line) => line.quality) && (
                    <ul className="market-quality-breakdown" data-testid="market-quality-breakdown">
                      {ticketPrice.qualityBreakdown.map((line) => (
                        <li key={line.quality ?? "ungraded"}>
                          <span>
                            {line.quantity} × {line.quality ?? "ungraded"}
                          </span>
                          <strong>{line.subtotal.toLocaleString()} G</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {demandTrend && <details className="market-details-disclosure"><summary>Demand outlook</summary><MarketDemandTrend trend={demandTrend} /></details>}
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
                          value={sellInput}
                          aria-invalid={!sellValid || sellQty > ownedCount}
                          onChange={(event) => setSellInput(event.target.value)}
                          aria-label={`Quantity to sell, 1 to ${ownedCount}`}
                        />
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
                    <span className="market-qty-total" aria-hidden="true">/ {ownedCount}</span>
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
                  <div className="market-quick-qty-pills">
                    <button type="button" className={`market-quick-pill ${clampedQty === 1 ? "is-active" : ""}`} onClick={() => setSellQty(1)}>1</button>
                    {ownedCount >= 5 && <button type="button" className={`market-quick-pill ${clampedQty === 5 ? "is-active" : ""}`} onClick={() => setSellQty(5)}>5</button>}
                    {ownedCount >= 10 && <button type="button" className={`market-quick-pill ${clampedQty === Math.floor(ownedCount / 2) ? "is-active" : ""}`} onClick={() => setSellQty(Math.floor(ownedCount / 2))}>Half</button>}
                    <button type="button" className={`market-quick-pill ${clampedQty === ownedCount ? "is-active" : ""}`} onClick={() => setSellQty(ownedCount)}>All</button>
                  </div>
                  <div className="market-ticket-live">
                    You receive <strong>{sellValid && sellQty <= ownedCount ? liveGold.toLocaleString() : "—"} G</strong>
                  </div>
                  {(!sellValid || sellQty > ownedCount) && <p className="guild-trade-blocker" role="status">Enter a whole quantity from 1 to {ownedCount}.</p>}
                  <div className="market-ticket-actions">
                    <ChromeButton
                      variant="gold"
                      soundCue="coins"
                      disabled={!activeMarketId || ownedCount <= 0 || !sellValid || sellQty > ownedCount}
                      onClick={() =>
                        activeMarketId && sellValid && sellQty <= ownedCount && onSellItem(activeMarketId, selectedOwned.itemId, clampedQty)
                      }
                    >
                      Sell
                    </ChromeButton>
                    <ChromeButton
                      soundCue="coins"
                      disabled={!activeMarketId || ownedCount <= 0}
                      aria-expanded={pendingBulk === "item"}
                      onClick={() => requestBulkSell("item", sellAllItemRevenue, handleSellAllOfItem)}
                    >
                      Sell all of this item
                    </ChromeButton>
                  </div>
                  {pendingBulk === "item" && (
                    <div
                      className="bulk-confirm-popover"
                      role="alertdialog"
                      aria-label={`Confirm selling every ${ticketName} for ${sellAllItemRevenue.toLocaleString()} gold`}
                    >
                      <p className="bulk-confirm-text">
                        Sell all {ownedCount} {ticketName} for{" "}
                        <strong>{sellAllItemRevenue.toLocaleString()} G</strong>? This cannot be undone.
                      </p>
                      <div className="bulk-confirm-actions">
                        <ChromeButton variant="gold" size="sm" soundCue="coins" onClick={handleSellAllOfItem}>
                          Confirm sale
                        </ChromeButton>
                        <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                          Keep goods
                        </ChromeButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="no-commodity-selected">
                  <span>Bring goods this stall buys, then choose a row for a sale ticket.</span>
                </div>
              )}
          </aside>
          )}
        </div>}

        {ledgerSection === "deliveries" && (
          <section className="market-contracts-footer" aria-labelledby="market-contracts-title">
            <h3 id="market-contracts-title" className="section-title">
              <IconJournal size={15} aria-hidden="true" /> Posted orders
            </h3>
            {activeContracts.length === 0 && <p className="guild-empty-orders">No active orders to deliver at this counter.</p>}
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
                    {/* A promise can be declined before any of it is kept; once
                        goods are delivered it stays until filled or expired. */}
                    {onPassContract && contract.quantityFulfilled === 0 && (
                      <ChromeButton
                        className="comm-pass-btn"
                        soundCue="page-turn"
                        onClick={() => onPassContract(contract.contractId)}
                        title="Strike this order so the board can post another"
                      >
                        Pass on this order
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

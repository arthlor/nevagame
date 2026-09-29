import { tradePackName } from "../i18n/tradePackNames";
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
import { useTranslation } from "../i18n/useTranslation";

type MarketLedgerSection = "buy" | "sell" | "hold" | "trade-packs" | "deliveries";

/** Bulk sales above this gold value require an explicit confirmation step. */
const BULK_CONFIRM_THRESHOLD_G = 200;

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
  const {
    locale,
    getLocalizedItem,
    getLocalizedFish,
    getLocalizedRod,
    getLocalizedMarket,
    getLocalizedShopkeepLine
  } = useTranslation();
  const isTr = locale === "tr";

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
  const purchaseBlocker = (!buyValid ? (isTr ? "En az 1 adet tam sayı girin." : "Enter a whole quantity of at least 1.") : undefined)
    ?? selectedBuy?.blockerReason
    ?? (!purchaseQuote?.success ? purchaseQuote?.reason ?? (isTr ? "Bir eşya seçin" : "Choose an item") : undefined)
    ?? (purchaseQuote?.available !== undefined && purchaseQuote.available < buyQty ? (isTr ? "Stokta yeterli miktar yok" : "Not enough in stock") : undefined)
    ?? (purchaseQuote?.affordable === false ? (isTr ? "Yetersiz altın" : "Not enough gold") : undefined);
  const purchaseTotal = purchaseQuote?.success ? purchaseQuote.totalPrice : undefined;

  const selectedOwned =
    sortedSellables.find((row) => row.itemId === selectedItemId) ?? sortedSellables[0] ?? null;

  const ticketName = selectedOwned ? (getLocalizedItem(selectedOwned.itemId).name ?? selectedOwned.name) : (isTr ? "Mahsul" : "Produce");
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
            <h2 id="market-unavailable-title" className="market-modal-title">{isTr ? "Tezgâh çok uzakta" : "The stall is out of reach"}</h2>
            <ChromeClose onClick={onClose} label={isTr ? "Pazarı kapat" : "Close market"} />
          </header>
          <div className="market-unavailable-state" role="status">
            <IconCoin size={28} aria-hidden="true" />
            <p>{isTr ? "Ticaret yapmak için tezgâha yaklaşın." : "Return to the counter to trade."}</p>
            <ChromeButton onClick={onClose}>{isTr ? "Kıyıya dön" : "Return to the coast"}</ChromeButton>
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
                {getLocalizedMarket(activeMarketId ?? "").name ?? board?.name ?? (isTr ? "Kıyı Pazarı" : "Coastal Market")}
              </h2>
              <span className="market-shopkeep-line">
                {getLocalizedShopkeepLine(activeMarketId, board?.dayInSeason ?? 0)}
              </span>
            </div>
          </div>

          <div className="market-purse-badge" data-testid="market-purse">
            <IconCoin size={16} aria-hidden="true" />
            <span>{isTr ? "Kese:" : "Purse:"} <strong>{(board?.money ?? 0).toLocaleString()} G</strong></span>
          </div>

          <ChromeClose onClick={onClose} label={isTr ? "Pazarı kapat" : "Close market"} className="market-close-btn" />
        </header>

        <nav className="market-ledger-index" aria-label={isTr ? "Pazar sekmeleri" : "Ledger sections"} data-testid="market-ledger-index">
          <button
            type="button"
            id="market-section-buy"
            aria-current={ledgerSection === "buy" ? "page" : undefined}
            aria-controls="market-ledger-sheet"
            className={`market-ledger-marker ${ledgerSection === "buy" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("buy")}
          >
            {isTr ? "Satın Al" : "Buy"}
          </button>
          <button
            type="button"
            id="market-section-sell"
            aria-current={ledgerSection === "sell" ? "page" : undefined}
            aria-controls="market-ledger-sheet"
            className={`market-ledger-marker ${ledgerSection === "sell" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("sell")}
          >
            {isTr ? "Sat" : "Sell"}
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
              {isTr ? "Balık ambarı" : "Fish hold"}
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
              {isTr ? "Ticaret yükleri" : "Trade packs"}{tradePackList.length > 0 ? ` (${tradePackList.length})` : ""}
            </button>
          ) : null}
          <button type="button" id="market-section-deliveries" aria-current={ledgerSection === "deliveries" ? "page" : undefined}
            aria-controls="market-contracts-title" className={`market-ledger-marker ${ledgerSection === "deliveries" ? "is-active" : ""}`}
            onClick={() => selectLedgerSection("deliveries")}>{isTr ? "Teslimatlar" : "Deliveries"}{activeContracts.length > 0 ? ` (${activeContracts.length})` : ""}</button>
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
                <SortToggles
                  ariaLabel={isTr ? "Ürünleri sırala" : "Sort wares"}
                  options={[{ key: "name", label: isTr ? "İsim" : "Name" }, { key: "price", label: isTr ? "Fiyat" : "Price" }]}
                  activeKey={buySortKey} direction={buySortDir} onSelect={(key) => {
                    if (key === buySortKey) setBuySortDir(buySortDir === 1 ? -1 : 1);
                    else { setBuySortKey(key); setBuySortDir(1); }
                  }} />
                <div className="guild-wares-list" aria-label={isTr ? "Satılık eşyalar" : "Items for sale"}>
                  {sortedBuyRows.map((row) => {
                    const buyName = getLocalizedItem(row.itemId).name ?? row.name;
                    return (
                      <button type="button" key={row.itemId}
                        className={`guild-ware-row ${selectedBuy?.itemId === row.itemId ? "is-selected" : ""} ${row.locked ? "is-locked" : ""}`}
                        aria-pressed={selectedBuy?.itemId === row.itemId} aria-label={isTr ? `${buyName} seç` : `Select ${buyName}`}
                        onClick={() => { playUiSound("click"); setSelectedBuyId(row.itemId); setBuyQty(1); }}>
                        <AtlasImage src={atlasForItem(row.itemId)} size={52} aria-hidden="true" />
                        <span><strong>{buyName}</strong><small>{row.blockerReason ?? (isTr ? `${row.owned} heybede` : `${row.owned} in satchel`)}</small></span>
                        <strong className="guild-ware-price">{row.quote.unitPrice ?? "—"} G</strong>
                      </button>
                    );
                  })}
                  {sortedBuyRows.length === 0 && <p className="no-cargo-card">{isTr ? "Bu tezgâhta satılık ürün yok." : "No wares are available at this counter."}</p>}
                </div>
              </div>
              {board.rodRows.length > 0 &&
              <div className="market-seeds-section" data-testid="harbor-tackle-shop">
                <h3 className="section-title"><IconFish size={15} aria-hidden="true" /> {isTr ? "Olta & Takım" : "Tackle"}</h3>
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
                            <strong>{getLocalizedRod(rod.rodId).name ?? rod.name}</strong>
                            <span className="seed-meta-sub">
                              {rod.allowedHabitats.join(" · ")} · {isTr ? `en fazla ${rod.maximumCargoClass}` : `up to ${rod.maximumCargoClass}`}
                            </span>
                          </div>
                        </div>
                        <div className="seed-card-actions">
                          {rod.equipped ? (
                            <ChromeButton size="sm" disabled>{isTr ? "Kuşanıldı" : "Equipped"}</ChromeButton>
                          ) : rod.owned ? (
                            <ChromeButton
                              size="sm"
                              disabled={!rod.equippable}
                              title={rod.blockerReason}
                              onClick={() => onEquipRod(board.marketId, rod.rodId)}
                            >
                              {rod.blockerReason ?? (isTr ? "Kuşan" : "Equip")}
                            </ChromeButton>
                          ) : rod.starter ? (
                            <ChromeButton size="sm" disabled>{isTr ? "Başlangıç oltası" : "Starter rod"}</ChromeButton>
                          ) : (
                            <ChromeButton
                              size="sm"
                              soundCue="coins"
                              disabled={!rod.purchasable}
                              title={rod.blockerReason}
                              onClick={() => onBuyRod(board.marketId, rod.rodId)}
                            >
                              {rod.blockerReason ?? (isTr ? `Satın al & kuşan · ${rod.costMoney} G` : `Buy & equip · ${rod.costMoney} G`)}
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
                  <IconSprout size={15} aria-hidden="true" /> {isTr ? "Heybeniz" : "Your Satchel"}
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
                    {isTr
                      ? `Tüm mahsulü sat · ${bulkProduceQuote.revenue.toLocaleString()} G`
                      : `Sell all produce · ${bulkProduceQuote.revenue.toLocaleString()} G`}
                  </ChromeButton>
                )}
              </div>
              <SortToggles
                ariaLabel={isTr ? "Eşyalarınızı sıralayın" : "Sort your goods"}
                options={[{ key: "name", label: isTr ? "İsim" : "Name" }, { key: "price", label: isTr ? "Fiyat" : "Price" }, { key: "quantity", label: isTr ? "Miktar" : "Qty" }]}
                activeKey={sellSortKey}
                direction={sellSortDir}
                onSelect={(key) => {
                  playUiSound("click");
                  if (key === sellSortKey) setSellSortDir(sellSortDir === 1 ? -1 : 1);
                  else { setSellSortKey(key); setSellSortDir(1); }
                }}
              />
              {ownedSellables.length === 0 ? (
                <div className="no-cargo-card" data-testid="market-sell-empty">
                  {isTr ? "Heybenizde bu tezgâhın satın aldığı bir eşya yok." : "Nothing in your satchel that this stall buys."}
                </div>
              ) : (
                <div className="commodities-list" data-testid="market-sell-list">
                  {sortedSellables.map((row) => {
                    const name = getLocalizedItem(row.itemId).name ?? row.name;
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
                          aria-label={isTr ? `${name} seç` : `Select ${name}`}
                          aria-pressed={isSelected}
                        >
                          <div className="comm-left">
                            <AtlasImage src={atlasForItem(row.itemId)} alt="" size={28} />
                            <div>
                              <strong className="comm-name">{name}</strong>
                              <span className="comm-owned">{isTr ? `Heybede: ${row.owned}` : `In satchel: ${row.owned}`}</span>
                              {row.lots.some((lot) => lot.quality) && (
                                <span className="comm-lots">
                                  {row.lots.map((lot) => (
                                    <span
                                      key={lot.quality ?? "ungraded"}
                                      className={`comm-lot-tag${lot.quality ? ` is-${lot.quality}` : ""}`}
                                    >
                                      {lot.quantity} {lot.quality ?? (isTr ? "derecesiz" : "ungraded")}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="comm-right">
                            <span className={`comm-demand demand-${price?.demandLabel?.toLowerCase() ?? "steady"}`}>
                              {price?.demandLabel ?? (isTr ? "Durgun" : "Steady")}
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
                    <IconFish size={15} aria-hidden="true" /> {isTr ? "Balık ambarı" : "Fish hold"}
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
                      {isTr
                        ? `Tüm balıkları sat · ${bulkFishQuote.revenue.toLocaleString()} G`
                        : `Sell all fish · ${bulkFishQuote.revenue.toLocaleString()} G`}
                    </ChromeButton>
                  )}
                </div>
                <SortToggles
                  ariaLabel={isTr ? "Balık ambarını sırala" : "Sort fish hold"}
                  options={[{ key: "name", label: isTr ? "İsim" : "Name" }, { key: "price", label: isTr ? "Fiyat" : "Price" }]}
                  activeKey={holdSortKey}
                  direction={holdSortDir}
                  onSelect={(key) => {
                    playUiSound("click");
                    if (key === holdSortKey) setHoldSortDir(holdSortDir === 1 ? -1 : 1);
                    else { setHoldSortKey(key); setHoldSortDir(1); }
                  }}
                />
                {fishCargoList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>{isTr ? "Tekne ambarında veya elde taşınan balık yükü yok." : "No fish cargo currently in boat hold or carried in hand."}</span>
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
                                <strong>{getLocalizedFish(cargo.speciesId).name ?? cargo.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                                <div className="cargo-sub-meta">
                                  <ChromeQuality quality={cargo.quality} />
                                  <span className="cargo-freshness-num">
                                    · {cargo.spoiled ? (isTr ? "Bayat" : "Spoiled") : cargo.reason ?? (isTr ? "Burada fiyatlandırılmadı" : "Not priced here")}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {cargo.spoiled && activeMarketId && (
                              <div className="cargo-card-actions">
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  title={isTr ? "Bayat balık yem malzemesine dönüştürülebilir" : "Spoiled fish can be broken down for bait materials"}
                                  onClick={() => onDiscardFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  {isTr ? "Yem yap" : "Make scraps"}
                                </ChromeButton>
                                <p className="scraps-explainer">{isTr ? "Bayat balık satılamaz — Yem yap seçeneği balığı yem malzemesine dönüştürür." : "Spoiled fish can't be sold — Make scraps breaks it down into bait materials."}</p>
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
                              <strong>{getLocalizedFish(cargo.speciesId).name ?? cargo.name} ({cargo.weightKg.toFixed(1)} kg)</strong>
                              <div className="cargo-sub-meta">
                                <ChromeQuality quality={cargo.quality} />
                                <span className="cargo-freshness-num">· {isTr ? `%${Math.round(cargo.freshness)} Taze` : `${Math.round(cargo.freshness)}% Fresh`}</span>
                              </div>
                            </div>
                          </div>
                          <details className="market-details-disclosure">
                            <summary>{isTr ? "Fiyat detayları" : "Price details"}</summary>
                          <dl className="market-fish-breakdown" aria-label={isTr ? "Balık fiyat dökümü" : "Fish quote breakdown"}>
                            <div><dt>{isTr ? "Taban" : "Base"}</dt><dd>{breakdown.speciesBasePrice} G</dd></div>
                            <div><dt>{isTr ? "Ağırlık" : "Weight"}</dt><dd>×{breakdown.weightModifier.toFixed(2)}</dd></div>
                            <div><dt>{isTr ? "Kalite" : "Quality"}</dt><dd>×{breakdown.qualityModifier.toFixed(2)}</dd></div>
                            <div><dt>{isTr ? "Tazelik" : "Freshness"}</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                            <div><dt>{isTr ? "Talep" : "Demand"}</dt><dd>{breakdown.demandPercent}%</dd></div>
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
                                  {isTr ? "Yem yap" : "Make scraps"}
                                </ChromeButton>
                                <p className="scraps-explainer">{isTr ? "Bayat balık satılamaz — Yem yap seçeneği balığı yem malzemesine dönüştürür." : "Spoiled fish can't be sold — Make scraps breaks it down into bait materials."}</p>
                              </>
                            ) : (
                              <>
                                <ChromeButton
                                  variant="gold"
                                  soundCue="coins"
                                  className="plaque-keep-btn"
                                  onClick={() => activeMarketId && onSellFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  {isTr ? "Balığı sat" : "Sell fish"}
                                </ChromeButton>
                                <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onReleaseFishCargo(activeMarketId, cargo.cargoId)}
                                >
                                  {isTr ? "Salıver" : "Release"}
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
                    <IconFish size={15} aria-hidden="true" /> {isTr ? "Ticaret yükleri" : "Trade packs"}
                  </h3>
                </div>
                <p className="market-section-note">
                  {isTr ? "Yükü teknenizden veya arabanızdan indirin, tezgâha taşıyın ve tek tek satın." : "Unload a pack from your boat or carriage, carry it to the counter, and sell it one at a time."}
                </p>
                {tradePackList.length === 0 ? (
                  <div className="no-cargo-card">
                    <span>{isTr ? "Elde ticaret yükü yok. Teknenizden veya arabanızdan bir yük alıp buraya taşıyın." : "No trade pack in hand. Collect one from your boat or carriage, then carry it here."}</span>
                  </div>
                ) : (
                  <div className="fish-cargo-trade-list">
                    {sortedTradePacks.map((pack) => {
                      const breakdown = pack.breakdown;
                      return (
                        <div key={pack.cargoId} className="fish-cargo-card">
                          <div className="cargo-card-meta">
                            <AtlasImage src={pack.kind === "farm" ? atlasForItem(pack.itemId) : atlasForFish(pack.speciesId)} alt="" size={36} />
                            <div>
                              <strong>{pack.tradePackId ? tradePackName(pack.tradePackId, pack.name, isTr ? "tr" : "en") : (pack.kind === "farm" ? getLocalizedItem(pack.itemId ?? "").name : getLocalizedFish(pack.speciesId).name) ?? pack.name} ({pack.weightKg.toFixed(1)} kg)</strong>
                              <div className="cargo-sub-meta">
                                <ChromeQuality quality={pack.quality} />
                                <span className="cargo-freshness-num">
                                  · {pack.spoiled ? (isTr ? "Bozulmuş" : "Spoiled") : pack.kind === "farm" ? (isTr ? `Durum %${Math.round(pack.freshness)}` : `${Math.round(pack.freshness)}% condition`) : (isTr ? `%${Math.round(pack.freshness)} Taze` : `${Math.round(pack.freshness)}% Fresh`)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {breakdown ? (
                            <details className="market-details-disclosure">
                              <summary>{isTr ? "Fiyat detayları" : "Price details"}</summary>
                              {"kind" in breakdown ? (
                                <dl className="market-fish-breakdown" aria-label={isTr ? "Çiftlik yükü fiyat dökümü" : "Farm pack quote breakdown"}>
                                  <div><dt>{isTr ? "Malzeme adedi" : "Enclosed units"}</dt><dd>{breakdown.quantity}</dd></div>
                                  <div><dt>{breakdown.demandModifier === undefined ? (isTr ? "Kalite ve talebe göre" : "Graded market value") : (isTr ? "Paketin taban değeri" : "Pack base value")}</dt><dd>{breakdown.wholesaleValue} G</dd></div>
                                  {breakdown.demandModifier !== undefined && <><div><dt>{isTr ? "Talep" : "Demand"}</dt><dd>×{breakdown.demandModifier.toFixed(2)}</dd></div>
                                    <div><dt>{isTr ? "Malzeme kalitesi" : "Ingredient quality"}</dt><dd>×{breakdown.qualityModifier?.toFixed(2)}</dd></div></>}
                                  <div><dt>{isTr ? "Paketleme" : "Packing"}</dt><dd>×{breakdown.packingModifier.toFixed(2)}</dd></div>
                                  <div><dt>{isTr ? "Rota" : "Route"} · {(breakdown.routeMeters / 1000).toFixed(1)} km</dt><dd>×{breakdown.routeModifier.toFixed(2)}</dd></div>
                                  <div><dt>{isTr ? "Yöresel ürün" : "Regional specialty"}</dt><dd>×{breakdown.specialtyModifier.toFixed(2)}</dd></div>
                                  <div><dt>{isTr ? "Ticaret TP" : "Trading XP"}</dt><dd>+{breakdown.tradingXp}</dd></div>
                                  <div><dt>{isTr ? "Durum" : "Condition"}</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                                </dl>
                              ) : (
                              <dl className="market-fish-breakdown" aria-label={isTr ? "Ticaret yükü fiyat dökümü" : "Trade pack quote breakdown"}>
                                <div><dt>{isTr ? "Taban" : "Base"}</dt><dd>{breakdown.speciesBasePrice} G</dd></div>
                                <div><dt>{isTr ? "Ağırlık" : "Weight"}</dt><dd>×{breakdown.weightModifier.toFixed(2)}</dd></div>
                                <div><dt>{isTr ? "Kalite" : "Quality"}</dt><dd>×{breakdown.qualityModifier.toFixed(2)}</dd></div>
                                <div><dt>{isTr ? "Tazelik" : "Freshness"}</dt><dd>×{breakdown.freshnessModifier.toFixed(2)}</dd></div>
                                <div><dt>{isTr ? "Talep" : "Demand"}</dt><dd>{breakdown.demandPercent}%</dd></div>
                              </dl>
                              )}
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
                                  {pack.kind === "farm" ? (pack.canRecoverPlantMatter ? (isTr ? "Bitki artığına dönüştür" : "Recover plant matter") : (isTr ? "Yükü at" : "Discard shipment")) : (isTr ? "Yem yap" : "Make scraps")}
                                </ChromeButton>
                                <p className="scraps-explainer">{pack.kind === "farm" ? (pack.canRecoverPlantMatter ? (isTr ? "Bozulmuş yük satılamaz. Kompost için bitki artığı alabilirsin." : "Spoiled harvest cannot be sold. Recover plant matter for compost.") : (isTr ? "Yük atılır; paketleme ücreti ve malzemeler geri verilmez." : "Discarding removes the shipment. Materials and packing fees are not returned.")) : (isTr ? "Bayat balık satılamaz — Yem yap seçeneği balığı yem malzemesine dönüştürür." : "Spoiled fish can't be sold — Make scraps breaks it down into bait materials.")}</p>
                              </>
                            ) : (
                              <>
                                <ChromeButton
                                  variant="gold"
                                  soundCue="coins"
                                  className="plaque-keep-btn"
                                  onClick={() => activeMarketId && onSellFishCargo(activeMarketId, pack.cargoId)}
                                >
                                  {isTr ? "Ticaret yükünü sat" : "Sell trade pack"}
                                </ChromeButton>
                                {pack.kind !== "farm" && <ChromeButton
                                  className="plaque-release-btn"
                                  soundCue="click"
                                  onClick={() => activeMarketId && onReleaseFishCargo(activeMarketId, pack.cargoId)}
                                >
                                  {isTr ? "Salıver" : "Release"}
                                </ChromeButton>}
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
              <h3>{getLocalizedItem(selectedBuy.itemId).name ?? selectedBuy.name}</h3><p>{getLocalizedItem(selectedBuy.itemId).description ?? selectedBuy.description}</p>
              <dl className="guild-ticket-facts"><div><dt>{isTr ? "Birim fiyat" : "Unit price"}</dt><dd>{purchaseQuote?.unitPrice ?? "—"} G</dd></div>
                <div><dt>{isTr ? "Çantada" : "In satchel"}</dt><dd>{selectedBuy.owned}</dd></div></dl>
              <div className="market-qty-stepper" data-testid="market-buy-qty">
                <ChromeButton size="sm" aria-label={isTr ? "Daha az al" : "Buy fewer"} disabled={buyQty <= 1} onClick={() => setBuyQty((n) => Math.max(1, n - 1))}>−</ChromeButton>
                <input type="number" min={1} step={1} value={buyInput} aria-invalid={!buyValid} aria-label={isTr ? "Satın alınacak miktar" : "Quantity to buy"} className="market-qty-input"
                  onChange={(event) => setBuyInput(event.target.value)} />
                <ChromeButton size="sm" aria-label={isTr ? "Daha fazla al" : "Buy more"} disabled={buyQty >= Number.MAX_SAFE_INTEGER || (purchaseQuote?.available !== undefined && buyQty >= purchaseQuote.available)}
                  onClick={() => setBuyQty((n) => n + 1)}>+</ChromeButton>
              </div>
              <div className="market-quick-qty-pills">
                <button type="button" className={`market-quick-pill ${buyQty === 1 ? "is-active" : ""}`} onClick={() => setBuyQty(1)}>1</button>
                <button type="button" className={`market-quick-pill ${buyQty === 5 ? "is-active" : ""}`} onClick={() => setBuyQty(5)}>5</button>
                <button type="button" className={`market-quick-pill ${buyQty === 10 ? "is-active" : ""}`} onClick={() => setBuyQty(10)}>10</button>
                {purchaseQuote?.available !== undefined && purchaseQuote.available > 0 && (
                  <button type="button" className={`market-quick-pill ${buyQty === purchaseQuote.available ? "is-active" : ""}`} onClick={() => setBuyQty(purchaseQuote.available!)}>{isTr ? "Maks" : "Max"}</button>
                )}
              </div>
              <div className="guild-purchase-total">{isTr ? "Toplam" : "Total"} <strong data-testid="market-buy-total">{purchaseTotal?.toLocaleString() ?? "—"} G</strong></div>
              {purchaseBlocker && <p className="guild-trade-blocker" role="status">{purchaseBlocker}</p>}
              <span className="guild-ticket-destination">{isTr ? "Çantana gider" : "To your satchel"}</span>
              {purchaseTotal !== undefined && purchaseQuote?.affordable !== false && <p className="guild-remaining-purse">{isTr ? "Kalan bütçe" : "Remaining purse"} <strong>{(board.money - purchaseTotal).toLocaleString()} G</strong></p>}
            </div>}
          </aside>}

          {ledgerSection === "sell" && (
          <aside className="market-right-panel">
            {selectedOwned && ticketPrice?.success && ticketPrice.unitPrice != null ? (
                <div className="market-sell-ticket" data-testid="market-sell-ticket">
                  <h3 className="section-title">{isTr ? "Satış pusulası" : "Sale ticket"}</h3>
                  <div className="market-ticket-head">
                    <AtlasImage src={atlasForItem(selectedOwned.itemId)} alt="" size={40} />
                    <div>
                      <strong className="arb-title">{ticketName}</strong>
                      <span className={`comm-demand demand-${ticketPrice.demandLabel?.toLowerCase() ?? "steady"}`}>
                        {isTr ? "Talep · " : "Demand · "}
                        {isTr
                          ? (ticketPrice.demandLabel?.toLowerCase() === "high" ? "Yüksek"
                            : ticketPrice.demandLabel?.toLowerCase() === "low" ? "Düşük"
                            : ticketPrice.demandLabel?.toLowerCase() === "glut" ? "Bolluk"
                            : ticketPrice.demandLabel?.toLowerCase() === "surge" ? "Fırlama"
                            : "Durgun")
                          : (ticketPrice.demandLabel ?? "Steady")}
                      </span>
                    </div>
                  </div>
                  <div className="market-ticket-price">
                    <span>
                      {ticketPrice.qualityBreakdown && ticketPrice.qualityBreakdown.length > 1
                        ? (isTr ? "Ortalama birim fiyat" : "Average unit price")
                        : (isTr ? "Birim fiyat" : "Unit price")}
                    </span>
                    <strong>{ticketPrice.unitPrice} G</strong>
                  </div>
                  {ticketPrice.qualityBreakdown?.some((line) => line.quality) && (
                    <ul className="market-quality-breakdown" data-testid="market-quality-breakdown">
                      {ticketPrice.qualityBreakdown.map((line) => (
                        <li key={line.quality ?? "ungraded"}>
                          <span>
                            {line.quantity} × {line.quality ? (isTr && line.quality === "common" ? "olağan" : isTr && line.quality === "fine" ? "seçme" : isTr && line.quality === "exceptional" ? "nadir" : line.quality) : (isTr ? "derecelendirilmemiş" : "ungraded")}
                          </span>
                          <strong>{line.subtotal.toLocaleString()} G</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {demandTrend && <details className="market-details-disclosure"><summary>{isTr ? "Talep görünümü" : "Demand outlook"}</summary><MarketDemandTrend trend={demandTrend} /></details>}
                  <div className="market-qty-stepper" data-testid="market-sell-qty">
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty <= 1}
                      onClick={(e) => setSellQty((n) => Math.max(1, n - (e.shiftKey ? 10 : 1)))}
                      aria-label={isTr ? "Daha az (Shift+tık ile −10)" : "Fewer (Shift+click for −10)"}
                      title={isTr ? "−1 (Shift: −10)" : "−1 (Shift: −10)"}
                    >
                      −
                    </ChromeButton>
                    <span className="market-qty-value">
                      <label className="market-qty-direct">
                        <span className="market-qty-sr">{isTr ? "Satılacak miktar" : "Quantity to sell"}</span>
                        <input
                          type="number"
                          className="market-qty-input"
                          min={1}
                          max={ownedCount}
                          step={1}
                          value={sellInput}
                          aria-invalid={!sellValid || sellQty > ownedCount}
                          onChange={(event) => setSellInput(event.target.value)}
                          aria-label={isTr ? `Satılacak miktar, 1 ila ${ownedCount}` : `Quantity to sell, 1 to ${ownedCount}`}
                        />
                      </label>
                    </span>
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn"
                      disabled={clampedQty >= ownedCount}
                      onClick={(e) => setSellQty((n) => Math.min(ownedCount, n + (e.shiftKey ? 10 : 1)))}
                      aria-label={isTr ? "Daha fazla (Shift+tık ile +10)" : "More (Shift+click for +10)"}
                      title={isTr ? "+1 (Shift: +10)" : "+1 (Shift: +10)"}
                    >
                      +
                    </ChromeButton>
                    <span className="market-qty-total" aria-hidden="true">/ {ownedCount}</span>
                    <ChromeButton
                      size="sm"
                      className="market-qty-btn market-qty-max"
                      disabled={clampedQty >= ownedCount}
                      onClick={() => setSellQty(ownedCount)}
                      aria-label={isTr ? "Azami miktara ayarla" : "Set to maximum quantity"}
                    >
                      {isTr ? "Maks" : "Max"}
                    </ChromeButton>
                  </div>
                  <div className="market-quick-qty-pills">
                    <button type="button" className={`market-quick-pill ${clampedQty === 1 ? "is-active" : ""}`} onClick={() => setSellQty(1)}>1</button>
                    {ownedCount >= 5 && <button type="button" className={`market-quick-pill ${clampedQty === 5 ? "is-active" : ""}`} onClick={() => setSellQty(5)}>5</button>}
                    {ownedCount >= 10 && <button type="button" className={`market-quick-pill ${clampedQty === Math.floor(ownedCount / 2) ? "is-active" : ""}`} onClick={() => setSellQty(Math.floor(ownedCount / 2))}>{isTr ? "Yarısı" : "Half"}</button>}
                    <button type="button" className={`market-quick-pill ${clampedQty === ownedCount ? "is-active" : ""}`} onClick={() => setSellQty(ownedCount)}>{isTr ? "Tümü" : "All"}</button>
                  </div>
                  <div className="market-ticket-live">
                    {isTr ? "Eline geçecek" : "You receive"} <strong>{sellValid && sellQty <= ownedCount ? liveGold.toLocaleString() : "—"} G</strong>
                  </div>
                  {(!sellValid || sellQty > ownedCount) && <p className="guild-trade-blocker" role="status">{isTr ? `1 ile ${ownedCount} arasında bir tam sayı girin.` : `Enter a whole quantity from 1 to ${ownedCount}.`}</p>}
                </div>
              ) : (
                <div className="no-commodity-selected">
                  <span>{isTr ? "Bu tezgâhın aldığı malları getir, sonra satış pusulası için bir sıra seç." : "Bring goods this stall buys, then choose a row for a sale ticket."}</span>
                </div>
              )}
          </aside>
          )}
        </div>}

        {ledgerSection === "deliveries" && (
          <section className="market-contracts-footer" aria-labelledby="market-contracts-title">
            <h3 id="market-contracts-title" className="section-title">
              <IconJournal size={15} aria-hidden="true" /> {isTr ? "Asılı siparişler" : "Posted orders"}
            </h3>
            {activeContracts.length > 0 && (
              <>
                <p className="contract-prog">{isTr ? "Değerli teslimatlar nihai ödemeyi ilan edilen ödülün üzerine çıkarabilir." : "Valuable deliveries can raise the final payout above the posted reward."}</p>
                <p className="contract-prog">{isTr ? `Dokunulmamış bir siparişi es geçmek ${activeContracts[0].passWaitLabel} oyun saati alır. Diğer süreler ve balık tazeliği akmaya devam eder.` : `Passing an untouched order takes ${activeContracts[0].passWaitLabel} game time. Other deadlines and catch freshness keep moving.`}</p>
              </>
            )}
            {activeContracts.length === 0 && <p className="guild-empty-orders">{isTr ? "Bu tezgâha teslim edilecek aktif sipariş yok." : "No active orders to deliver at this counter."}</p>}
            <div className="active-contracts-list">
              {activeContracts.map((contract) => (
                <article key={contract.contractId} className="contract-mini-card">
                  <div className="contract-mini-header">
                    <strong>{isTr ? `Tedarik et: ${contract.targetName}` : `Supply ${contract.targetName}`}</strong>
                    <span className="contract-gold">
                      <IconCoin size={12} aria-hidden="true" /> {isTr ? `En az ${contract.currentCompletionFloorMoney} G` : `At least ${contract.currentCompletionFloorMoney} G`}
                    </span>
                  </div>
                  <span className="contract-prog">
                    {isTr ? "Yerine getirilen:" : "Fulfilled:"} {contract.quantityFulfilled} / {contract.quantityRequired}
                  </span>
                  <span className="contract-prog">
                    {isTr ? "Tamamlanınca:" : "On completion:"} {contract.rewardSkillXp.xp} {contract.rewardSkillXp.skill} XP
                  </span>
                  <span className="contract-prog">
                    {[...contract.requirementLabels, contract.deadlineLabel].join(" · ")}
                  </span>
                  <div className={`contract-readiness${contract.ready ? " is-ready" : " is-blocked"}`}>
                    {contract.ready ? (
                      <strong>{isTr ? "Hazır" : "Ready"}</strong>
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
                        {isTr ? `Çantadan ${contract.deliverableItems} adet teslim et` : `Deliver ${contract.deliverableItems} from satchel`}
                      </ChromeButton>
                    )}
                    {contract.eligibleCargoIds.length > 0 && (
                      <ChromeButton
                        variant="gold"
                        className="comm-sell-btn"
                        onClick={() => onDeliverFishCargo(contract.contractId, contract.eligibleCargoIds[0])}
                      >
                        {contract.itemId ? (isTr ? "Paketi teslim et" : "Deliver pack") : (isTr ? "Balığı teslim et" : "Deliver fish")}
                      </ChromeButton>
                    )}
                    {/* A promise can be declined before any of it is kept; once
                        goods are delivered it stays until filled or expired. */}
                    {onPassContract && contract.quantityFulfilled === 0 && (
                      <ChromeButton
                        className="comm-pass-btn"
                        soundCue="page-turn"
                        onClick={() => onPassContract(contract.contractId)}
                        title={isTr ? `Yeni bir ilan için ${contract.passWaitLabel} oyun süresi bekle` : `Wait ${contract.passWaitLabel} of game time for a replacement notice`}
                      >
                        {isTr ? `Es geç · ${contract.passWaitLabel} oyun vakti bekle` : `Pass · wait ${contract.passWaitLabel} game time`}
                      </ChromeButton>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <footer className="market-modal-footer">
          {pendingBulk === "produce" && (
            <div
              className="bulk-confirm-popover"
              role="alertdialog"
              aria-label={isTr ? `${bulkProduceQuote.revenue.toLocaleString()} altın karşılığında toplu mahsul satışını onayla` : `Confirm bulk produce sale for ${bulkProduceQuote.revenue.toLocaleString()} gold`}
            >
              <p className="bulk-confirm-text">
                {isTr
                  ? `${bulkProduceQuote.quantity} adet ürünü (${bulkProduceQuote.lineCount} çeşit) ${bulkProduceQuote.revenue.toLocaleString()} G karşılığında satmak istiyor musunuz? Bu işlem geri alınamaz.`
                  : `Sell ${bulkProduceQuote.quantity} goods (${bulkProduceQuote.lineCount} lines) for ${bulkProduceQuote.revenue.toLocaleString()} G? This cannot be undone.`}
              </p>
              <div className="bulk-confirm-actions">
                <ChromeButton
                  variant="gold"
                  size="sm"
                  soundCue="coins"
                  onClick={handleSellAllProduce}
                >
                  {isTr ? "Satışı onayla" : "Confirm sale"}
                </ChromeButton>
                <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                  {isTr ? "Vazgeç" : "Keep goods"}
                </ChromeButton>
              </div>
            </div>
          )}
          {pendingBulk === "fish" && (
            <div
              className="bulk-confirm-popover"
              role="alertdialog"
              aria-label={isTr ? `${bulkFishQuote.revenue.toLocaleString()} altın karşılığında toplu balık satışını onayla` : `Confirm bulk fish sale for ${bulkFishQuote.revenue.toLocaleString()} gold`}
            >
              <p className="bulk-confirm-text">
                {isTr
                  ? `${bulkFishQuote.quantity} balığı (${bulkFishQuote.lineCount} çeşit) ${bulkFishQuote.revenue.toLocaleString()} G karşılığında satmak istiyor musunuz? Bu işlem geri alınamaz.`
                  : `Sell ${bulkFishQuote.quantity} fish (${bulkFishQuote.lineCount} lines) for ${bulkFishQuote.revenue.toLocaleString()} G? This cannot be undone.`}
              </p>
              <div className="bulk-confirm-actions">
                <ChromeButton
                  variant="gold"
                  size="sm"
                  soundCue="coins"
                  onClick={handleSellAllFishCargo}
                >
                  {isTr ? "Satışı onayla" : "Confirm sale"}
                </ChromeButton>
                <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                  {isTr ? "Avı sakla" : "Keep catch"}
                </ChromeButton>
              </div>
            </div>
          )}
          {pendingBulk === "item" && (
            <div
              className="bulk-confirm-popover"
              role="alertdialog"
              aria-label={isTr ? `Tüm ${ticketName} ürünlerini ${sellAllItemRevenue.toLocaleString()} altına satmayı onayla` : `Confirm selling every ${ticketName} for ${sellAllItemRevenue.toLocaleString()} gold`}
            >
              <p className="bulk-confirm-text">
                {isTr ? (
                  <>Tüm {ownedCount} adet {ticketName} ürününü <strong>{sellAllItemRevenue.toLocaleString()} G</strong> karşılığında satmak istiyor musun? Bu işlem geri alınamaz.</>
                ) : (
                  <>Sell all {ownedCount} {ticketName} for <strong>{sellAllItemRevenue.toLocaleString()} G</strong>? This cannot be undone.</>
                )}
              </p>
              <div className="bulk-confirm-actions">
                <ChromeButton variant="gold" size="sm" soundCue="coins" onClick={handleSellAllOfItem}>
                  {isTr ? "Satışı onayla" : "Confirm sale"}
                </ChromeButton>
                <ChromeButton size="sm" onClick={() => setPendingBulk(null)}>
                  {isTr ? "Malları tut" : "Keep goods"}
                </ChromeButton>
              </div>
            </div>
          )}
          {!pendingBulk && ledgerSection === "buy" && selectedBuy && (
            <div className="market-footer-trade">
              <span className="market-footer-summary">{getLocalizedItem(selectedBuy.itemId).name ?? selectedBuy.name} · {purchaseTotal?.toLocaleString() ?? "—"} G</span>
              <ChromeButton variant="gold" soundCue="coins" data-testid="market-buy-confirm" disabled={!!purchaseBlocker || purchaseTotal === undefined}
                onClick={() => {
                  if (!activeMarketId || purchaseBlocker) return;
                  if (selectedBuy.kind === "seed") onBuySeed(activeMarketId, selectedBuy.itemId, buyQty);
                  else onBuyItem(activeMarketId, selectedBuy.itemId, buyQty);
                }}>{isTr ? `Satın al${buyValid ? ` ${buyQty}` : ""}` : `Buy${buyValid ? ` ${buyQty}` : ""}`}</ChromeButton>
            </div>
          )}
          {!pendingBulk && ledgerSection === "sell" && selectedOwned && ticketPrice?.success && ticketPrice.unitPrice != null && (
            <div className="market-footer-trade">
              <span className="market-footer-summary">{ticketName} · {sellValid && sellQty <= ownedCount ? liveGold.toLocaleString() : "—"} G</span>
              <div className="market-ticket-actions">
                <ChromeButton
                  variant="gold"
                  soundCue="coins"
                  disabled={!activeMarketId || ownedCount <= 0 || !sellValid || sellQty > ownedCount}
                  onClick={() =>
                    activeMarketId && sellValid && sellQty <= ownedCount && onSellItem(activeMarketId, selectedOwned.itemId, clampedQty)
                  }
                >
                  {isTr ? "Sat" : "Sell"}
                </ChromeButton>
                <ChromeButton
                  soundCue="coins"
                  disabled={!activeMarketId || ownedCount <= 0}
                  aria-expanded={pendingBulk === "item"}
                  onClick={() => requestBulkSell("item", sellAllItemRevenue, handleSellAllOfItem)}
                >
                  {isTr ? "Bu ürünün tümünü sat" : "Sell all of this item"}
                </ChromeButton>
              </div>
            </div>
          )}
          <ChromeButton onClick={onClose}>
            {isTr ? "Pazardan ayrıl" : "Leave market"}
          </ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

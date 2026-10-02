import React, { useEffect, useRef, useState } from "react";
import type { InteractionResult, ItemInspectionDto, SatchelDto } from "../simulation/core/contracts";
import { ItemInspectCard } from "./components/ItemInspectCard";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForCropQuality, atlasForFish, atlasForItem, qualitySpriteKey } from "./chrome/uiAtlas";
import {
  ChromeButton,
  ChromeClose,
  ChromeDivider,
  ChromeAlert
} from "./chrome/Chrome";
import { IconFish, IconPack, IconSatchel, IconSprout, IconTools } from "./components/HudIcons";
import { GameSheet, ItemSlot } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";
import { useTranslation } from "../i18n/useTranslation";
import { TR_ITEMS } from "../i18n/locales/tr/items";
import { TR_CROPS } from "../i18n/locales/tr/crops";
import { TR_FISH } from "../i18n/locales/tr/fish";
import { qualityLabel } from "../i18n/itemText";

interface InventoryModalProps {
  satchel: SatchelDto;
  onClose: () => void;
  onSelectPlantCrop: (cropId: string) => void;
  onInspectPlanting: (cropId: string) => { valid: boolean; reason?: string };
  /** Rich card data for one item. Absent in contexts that do not inspect. */
  onInspectItem?: (itemId: string) => ItemInspectionDto | null;
  /** Tidies the satchel in the simulation and returns whether it changed. */
  onSortSatchel?: () => { success: boolean; reason?: string };
  /** Eats an edible provision; the simulation owns the Work grant and limits. */
  onConsumeItem?: (itemId: string) => InteractionResult;
  /**
   * Destroys one held lot at the player's explicit request. Absent in
   * contexts that do not offer a discard path, so no slot becomes draggable
   * and no Discard control renders without a real simulation command behind it.
   */
  onDiscardItem?: (
    itemId: string,
    quantity: number,
    quality: SatchelDto["slots"][number]["quality"]
  ) => InteractionResult;
}

/**
 * The item's own sprite, or a neutral bundle when the atlas has no cell for it
 * yet. Never another item's icon: identity must not be borrowed.
 */
const CropGradeMark: React.FC<{ quality: string; size?: number; labelled?: boolean }> = ({
  quality,
  size = 16,
  labelled = false
}) => {
  const { locale } = useTranslation();
  const key = qualitySpriteKey(quality);
  return (
    <span className={`crop-grade-mark crop-grade-mark--${key}`} data-testid="crop-grade-mark" data-quality={key}>
      <AtlasImage src={atlasForCropQuality(quality)} size={size} alt="" />
      {labelled && <span>{qualityLabel(quality, locale)}</span>}
    </span>
  );
};

const SatchelItemIcon: React.FC<{ itemId: string; size: number; className?: string }> = ({ itemId, size, className }) => {
  const sprite = atlasForItem(itemId) ?? atlasForFish(itemId);
  if (sprite) return <AtlasImage src={sprite} alt="" size={size} className={className} />;
  return (
    <span className={`${className ?? ""} slot-item-icon--fallback`.trim()} data-testid="item-icon-fallback" aria-hidden="true">
      <IconPack size={Math.round(size * 0.7)} />
    </span>
  );
};

type InventoryCategory = "all" | "farming" | "fishing" | "supplies";

/** An armed discard must still refer to the exact lot the player saw. */
export function satchelLotKey(slot: SatchelDto["slots"][number] | null | undefined): string | null {
  return slot?.itemId && slot.quantity > 0
    ? `${slot.index}:${slot.itemId}:${slot.quality ?? ""}:${slot.quantity}`
    : null;
}

/**
 * Whether a slot survives the search box. Matching runs over the item name, its
 * category label and the crop a seed grows, so "wheat" finds both the seed and
 * the grain. An empty slot never matches: a searched grid shows results only.
 */
export function matchesSatchelSearch(
  slot: Pick<SatchelDto["slots"][number], "itemId" | "name" | "categoryLabel" | "cropName">,
  rawQuery: string,
  locale = "en"
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase(locale);
  if (query.length === 0) return true;
  if (!slot.itemId) return false;
  return `${slot.name} ${slot.categoryLabel ?? ""} ${slot.cropName ?? ""}`
    .toLocaleLowerCase(locale)
    .includes(query);
}

/** Footer hint shows only for the first few satchel opens (per browser). */
const SATCHEL_TIP_STORAGE_KEY = "neva:satchel-footer-tip-opens";
const SATCHEL_TIP_MAX_OPENS = 3;

const readSatchelTipOpens = (): number => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return SATCHEL_TIP_MAX_OPENS;
    return Number(window.localStorage.getItem(SATCHEL_TIP_STORAGE_KEY) ?? 0) || 0;
  } catch {
    return SATCHEL_TIP_MAX_OPENS;
  }
};

export const InventoryModal: React.FC<InventoryModalProps> = ({
  satchel,
  onClose,
  onSelectPlantCrop,
  onInspectPlanting,
  onInspectItem,
  onSortSatchel,
  onConsumeItem,
  onDiscardItem
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortNotice, setSortNotice] = useState<string | null>(null);
  const [discardNotice, setDiscardNotice] = useState<string | null>(null);
  /**
   * The exact lot the player armed for destruction, if any. Keyed by slot
   * identity rather than a boolean so the GameApp's per-frame satchel DTO (and
   * any selection, filter or quantity change) cannot leave a stale arm behind,
   * while an unchanged lot keeps its armed state across those re-renders.
   */
  const [discardArmedKey, setDiscardArmedKey] = useState<string | null>(null);
  const [draggingLot, setDraggingLot] = useState<{ index: number; key: string } | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<InventoryCategory>("all");
  const { t, locale, translateReason } = useTranslation();
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(() => {
    const firstOccupied = satchel.slots.findIndex((slot) => slot.itemId !== null && slot.quantity > 0);
    return firstOccupied >= 0 ? firstOccupied : null;
  });
  const [showFooterTip, setShowFooterTip] = useState<boolean>(() => readSatchelTipOpens() < SATCHEL_TIP_MAX_OPENS);

  const modalRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  // #19: count satchel opens; the footer hint survives only the first 3.
  useEffect(() => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      const opens = Number(window.localStorage.getItem(SATCHEL_TIP_STORAGE_KEY) ?? 0) || 0;
      window.localStorage.setItem(SATCHEL_TIP_STORAGE_KEY, String(opens + 1));
      setShowFooterTip(opens < SATCHEL_TIP_MAX_OPENS);
    } catch {
      // Private-mode storage failure: leave the default visibility as-is.
    }
  }, []);

  // Localize display fields only; lot identity and commands retain canonical IDs.
  const allSlots = locale === "tr" ? satchel.slots.map((slot) => ({
    ...slot,
    name: slot.itemId ? (TR_ITEMS[slot.itemId]?.name ?? TR_FISH[slot.itemId]?.name ?? slot.name) : slot.name,
    cropName: slot.cropId ? (TR_CROPS[slot.cropId]?.name ?? slot.cropName) : slot.cropName
  })) : satchel.slots;
  const selectedSlot = selectedSlotIndex !== null ? allSlots[selectedSlotIndex] ?? null : null;
  const selectedLotKey = satchelLotKey(selectedSlot);
  const discardArmed = selectedLotKey !== null && discardArmedKey === selectedLotKey;
  const planting = selectedSlot?.cropId ? onInspectPlanting(selectedSlot.cropId) : null;

  // #18: fixed sockets keep the grid stable while a filter is active, so
  // non-matching occupied slots stay dimmed but are not selectable. Pointer
  // and keyboard selection therefore agree instead of silently snapping back.
  // Query and category filter state
  const query = searchTerm.trim().toLowerCase();
  const isFilterActive = activeCategory !== "all" || query.length > 0;

  const isSlotMatch = (slot: SatchelDto["slots"][number]): boolean => {
    if (!slot.itemId) return false;
    if (!matchesSatchelSearch(slot, searchTerm, locale)) return false;
    if (activeCategory === "all") return true;
    return slot.inventoryCategory === activeCategory;
  };

  // Occupied slots that match the active filter
  const matchingEntries = allSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isSlotMatch(slot));

  // #16: arrow-key navigation moves over active matching slots only
  const navigableEntries = matchingEntries.filter(
    ({ slot }) => slot.quantity > 0
  );

  useEffect(() => {
    if (navigableEntries.length > 0) {
      if (!navigableEntries.some(({ index }) => index === selectedSlotIndex)) {
        setSelectedSlotIndex(navigableEntries[0].index);
      }
    } else {
      setSelectedSlotIndex(null);
    }
  }, [searchTerm, activeCategory, satchel, selectedSlotIndex, locale]);

  const selectedInspection = selectedSlot?.itemId ? onInspectItem?.(selectedSlot.itemId) : null;

  const handleSortSatchel = (): void => {
    const result = onSortSatchel?.();
    if (!result) return;
    playUiSound(result.success ? "confirm" : "error");
    // The satchel is re-read from the simulation on the next render, so the
    // notice is the only thing this component has to hold onto.
    setSortNotice(result.success ? (locale === "tr" ? "Heybe düzenlendi" : "Satchel tidied") : translateReason(result.reason) || (locale === "tr" ? "Düzenlenecek bir şey yok" : "Nothing to tidy"));
    setSelectedSlotIndex(null);
  };

  const handlePlantSelected = (): void => {
    if (selectedSlot?.cropId) {
      onSelectPlantCrop(selectedSlot.cropId);
      onClose();
    }
  };

  const handleConsumeSelected = (): void => {
    if (selectedSlot?.itemId) onConsumeItem?.(selectedSlot.itemId);
  };

  /**
   * Destroys one slot's whole lot through the simulation. Both the drag-out
   * gesture and the inspector's armed Discard land here, so the two paths can
   * never disagree about what was destroyed.
   */
  const discardSlot = (index: number, expectedKey: string | null): void => {
    setDraggingLot(null);
    setDiscardArmedKey(null);
    const slotToDiscard = allSlots[index];
    if (!expectedKey || satchelLotKey(slotToDiscard) !== expectedKey) {
      setDiscardNotice(locale === "tr" ? "Heybe değişti. Eşyayı yeniden seç." : "Satchel changed. Select the item again.");
      return;
    }
    if (!slotToDiscard?.itemId || slotToDiscard.quantity <= 0) return;
    const result = onDiscardItem?.(slotToDiscard.itemId, slotToDiscard.quantity, slotToDiscard.quality);
    if (!result) return;
    playUiSound(result.success ? "confirm" : "error");
    setDiscardNotice(
      result.success
        ? (locale === "tr" ? `${slotToDiscard.quantity} adet ${slotToDiscard.name} atıldı` : `Discarded ${slotToDiscard.quantity} ${slotToDiscard.name}`)
        : translateReason(result.reason) || (locale === "tr" ? "Bu atılamaz" : "Could not discard that")
    );
    if (result.success) setSelectedSlotIndex(null);
  };

  /**
   * The grid wraps, so the column count has to come from the rendered layout
   * rather than a hard-coded constant that would desync from the CSS.
   */
  const columnsInGrid = (): number => {
    const grid = gridRef.current;
    if (!grid) return 4;
    const cells = Array.from(grid.children) as HTMLElement[];
    if (cells.length === 0) return 4;
    const firstTop = cells[0].offsetTop;
    const columns = cells.filter((cell) => cell.offsetTop === firstTop).length;
    return Math.max(1, columns);
  };

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (navigableEntries.length === 0) return;
    const columns = columnsInGrid();
    const pos = Math.max(
      0,
      navigableEntries.findIndex((entry) => entry.index === selectedSlotIndex)
    );
    let nextPos = pos;

    switch (event.key) {
      case "ArrowRight": nextPos = Math.min(navigableEntries.length - 1, pos + 1); break;
      case "ArrowLeft": nextPos = Math.max(0, pos - 1); break;
      case "ArrowDown": nextPos = Math.min(navigableEntries.length - 1, pos + columns); break;
      case "ArrowUp": nextPos = Math.max(0, pos - columns); break;
      case "Home": nextPos = 0; break;
      case "End": nextPos = navigableEntries.length - 1; break;
      default: return;
    }

    event.preventDefault();
    event.stopPropagation();
    const next = navigableEntries[nextPos];
    if (!next || next.index === selectedSlotIndex) return;

    setSelectedSlotIndex(next.index);
    document.getElementById(`inventory-slot-${next.index}`)?.focus();
  };

  const selectCategory = (category: InventoryCategory): void => {
    playUiSound("page-turn");
    setActiveCategory(category);
    const firstRelevant = allSlots.findIndex((slot) =>
      slot.itemId !== null && (category === "all" || slot.inventoryCategory === category)
    );
    setSelectedSlotIndex(firstRelevant >= 0 ? firstRelevant : null);
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <GameSheet
        ref={modalRef}
        as="div"
        className="neva-panel modal-content inventory-satchel-modal"
        tone="slate"
        corners
        rivets={false}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-header-title-group inventory-header-meta">
            <span id="inventory-title" className="modal-heading-with-mark">
              <IconSatchel size={22} aria-hidden="true" /> {t("satchel.title")}
            </span>
            {/* One capacity readout. The meter beneath said the same thing and
                was already hidden under the Guildcraft skin. */}
            <span className="inventory-capacity-pill" data-testid="inventory-capacity">
              {satchel.occupiedSlots} / {satchel.totalSlots} {locale === "tr" ? "Göz" : "Slots"}
            </span>
          </div>

          <ChromeClose onClick={onClose} label={t("common.close")} />
        </header>

        <div className="inventory-nav-bar">
          <div className="inventory-category-tabs mm-ribbon-tabs" role="tablist" aria-label={locale === "tr" ? "Eşya kategorileri" : "Item categories"} onKeyDown={handleTabListKeyDown}>
            <button
              type="button"
              id="inventory-tab-all"
              role="tab"
              aria-selected={activeCategory === "all"}
              aria-controls="inventory-items"
              tabIndex={activeCategory === "all" ? 0 : -1}
              className={`inventory-tab-btn ${activeCategory === "all" ? "is-active" : ""}`}
              onClick={() => selectCategory("all")}
            >
              {t("satchel.filterAll")}
            </button>
            <button
              type="button"
              id="inventory-tab-farming"
              role="tab"
              aria-selected={activeCategory === "farming"}
              aria-controls="inventory-items"
              tabIndex={activeCategory === "farming" ? 0 : -1}
              className={`inventory-tab-btn ${activeCategory === "farming" ? "is-active" : ""}`}
              onClick={() => selectCategory("farming")}
            >
              <IconSprout size={14} aria-hidden="true" /> {locale === "tr" ? "Tarla" : "Field"}
            </button>
            <button
              type="button"
              id="inventory-tab-fishing"
              role="tab"
              aria-selected={activeCategory === "fishing"}
              aria-controls="inventory-items"
              tabIndex={activeCategory === "fishing" ? 0 : -1}
              className={`inventory-tab-btn ${activeCategory === "fishing" ? "is-active" : ""}`}
              onClick={() => selectCategory("fishing")}
            >
              <IconFish size={14} aria-hidden="true" /> {t("satchel.filterFish")}
            </button>
            <button
              type="button"
              id="inventory-tab-supplies"
              role="tab"
              aria-selected={activeCategory === "supplies"}
              aria-controls="inventory-items"
              tabIndex={activeCategory === "supplies" ? 0 : -1}
              className={`inventory-tab-btn ${activeCategory === "supplies" ? "is-active" : ""}`}
              onClick={() => selectCategory("supplies")}
            >
              <IconTools size={14} aria-hidden="true" /> {locale === "tr" ? "Malzeme" : "Supplies"}
            </button>
          </div>

          <div className="inventory-toolbar">
            <ChromeButton
              className={`inventory-organize-btn${organizeOpen ? " is-active" : ""}`}
              soundCue="click"
              data-testid="inventory-organize"
              aria-expanded={organizeOpen}
              aria-controls="inventory-organize-tools"
              onClick={() => setOrganizeOpen((open) => !open)}
            >
              {locale === "tr" ? "Düzenle" : "Organize"}
            </ChromeButton>
          </div>
        </div>

        <div
          id="inventory-organize-tools"
          className="inventory-organize-tools"
          hidden={!organizeOpen}
        >
          <label className="inventory-search" htmlFor="inventory-search-input">
            <span className="inventory-search-label">{locale === "tr" ? "Ara" : "Search"}</span>
            <input
              id="inventory-search-input"
              type="search"
              enterKeyHint="search"
              className="inventory-search-input"
              data-testid="inventory-search"
              placeholder={locale === "tr" ? "Heybede ara..." : "Find in satchel"}
              value={searchTerm}
              autoComplete="off"
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          {onSortSatchel && (
            <ChromeButton
              className="inventory-sort-btn"
              soundCue="click"
              data-testid="inventory-sort"
              aria-label={locale === "tr" ? "Heybeyi düzenle: yığınları birleştir ve türe göre sırala" : "Tidy the satchel: merge stacks and group by kind"}
              onClick={handleSortSatchel}
            >
              {locale === "tr" ? "Toparla" : "Tidy"}
            </ChromeButton>
          )}
        </div>
        {sortNotice && (
          <p className="inventory-sort-notice" role="status" data-testid="inventory-sort-notice">
            {sortNotice}
          </p>
        )}

        <ChromeDivider ornate={false} />

        <div className="modal-body inventory-body">
          <div className="inventory-grid-wrap">
            {isFilterActive && (
              <div className="inventory-filter-banner" role="status">
                <span className="inventory-filter-status">
                  {matchingEntries.length === 0
                    ? (locale === "tr" ? "Eşleşen eşya yok." : "No matching items.")
                    : locale === "tr"
                    ? `${matchingEntries.length} eşya${query ? ` “${searchTerm.trim()}” ile eşleşiyor` : " bu bölümde"}`
                    : `${matchingEntries.length} ${matchingEntries.length === 1 ? "item" : "items"}${query ? ` matching “${searchTerm.trim()}”` : " in this section"}`}
                </span>
                {(query || matchingEntries.length === 0) && (
                  <button
                    type="button"
                    className="inventory-clear-search-btn"
                    onClick={() => {
                      setSearchTerm("");
                      if (matchingEntries.length === 0) setActiveCategory("all");
                      // The recovery button disappears once its filter clears.
                      // Keep keyboard focus in the search or category control.
                      modalRef.current?.querySelector<HTMLElement>(
                        organizeOpen ? "#inventory-search-input" : "#inventory-tab-all"
                      )?.focus();
                    }}
                    aria-label={matchingEntries.length === 0
                      ? (locale === "tr" ? "Tüm eşyaları göster" : "Show all items")
                      : (locale === "tr" ? "Aramayı temizle" : "Clear search")}
                  >
                    {matchingEntries.length === 0
                      ? (locale === "tr" ? "Tümü" : "Show all")
                      : (locale === "tr" ? "Temizle" : "Clear")}
                  </button>
                )}
              </div>
            )}
            <div
              className="inventory-grid"
              id="inventory-items"
              ref={gridRef}
              role="listbox"
              aria-label={isFilterActive
                ? (locale === "tr"
                    ? `Heybe eşyaları, ${activeCategory} kategorisinde ${matchingEntries.length} eşleşme`
                    : `Satchel items, ${matchingEntries.length} matching in ${activeCategory}`)
                : (locale === "tr" ? "Heybe eşyaları" : "Satchel items")}
              aria-labelledby={`inventory-tab-${activeCategory}`}
              onKeyDown={handleGridKeyDown}
            >
              {allSlots.map((slot, index) => {
                const isSelected = selectedSlotIndex === index;
                if (!slot.itemId) {
                  return (
                    <ItemSlot
                      key={`empty-${index}`}
                      id={`inventory-slot-${index}`}
                      className={`inventory-slot is-empty-structural${isFilterActive ? " is-dimmed" : ""}`}
                      role="option"
                      aria-selected={false}
                      aria-disabled="true"
                      tabIndex={-1}
                      label={locale === "tr" ? "Boş göz" : "Empty slot"}
                    />
                  );
                }

                const isMatch = !isFilterActive || isSlotMatch(slot);
                const isSelectable = isMatch;
                const canDragToDiscard = isSelectable && Boolean(onDiscardItem);

                return (
                  <ItemSlot
                    key={`${slot.itemId}-${index}`}
                    id={`inventory-slot-${index}`}
                    className={`inventory-slot${isMatch ? " is-match" : " is-dimmed"}`}
                    filled
                    selected={isSelectable && isSelected}
                    quantity={slot.quantity > 1 ? slot.quantity : undefined}
                    badge={slot.quality ? <CropGradeMark quality={slot.quality} /> : undefined}
                    onSelect={isSelectable ? () => setSelectedSlotIndex(index) : undefined}
                    draggable={canDragToDiscard}
                    onDragStart={canDragToDiscard
                      ? (event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", slot.itemId ?? "");
                          const key = satchelLotKey(slot);
                          if (key) setDraggingLot({ index, key });
                        }
                      : undefined}
                    onDragEnd={canDragToDiscard ? () => setDraggingLot(null) : undefined}
                    label={isSelectable
                      ? (locale === "tr"
                          ? `${slot.name}, ${slot.quality ? `${qualityLabel(slot.quality, locale)} kalite, ` : ""}adet ${slot.quantity}${canDragToDiscard ? ", atmak için dışarı sürükle" : ""}`
                          : `${slot.name}, ${slot.quality ? `${slot.quality} quality, ` : ""}count ${slot.quantity}${canDragToDiscard ? ", drag out to destroy" : ""}`)
                      : (locale === "tr"
                          ? `${slot.name}, etkin filtre nedeniyle gizli`
                          : `${slot.name}, hidden by the active filter`)}
                    role="option"
                    aria-selected={isSelectable && isSelected}
                    aria-disabled={isSelectable ? undefined : "true"}
                    tabIndex={isSelectable && isSelected ? 0 : -1}
                  >
                    <SatchelItemIcon itemId={slot.itemId} size={28} className="slot-item-icon" />
                  </ItemSlot>
                );
              })}
            </div>
          </div>

          {(!isFilterActive || matchingEntries.length > 0) && <div className="inventory-details-card" aria-live="polite">
            {selectedSlot?.itemId ? (
              <>
                <div className="details-header">
                  <div className="details-icon-well">
                    <SatchelItemIcon itemId={selectedSlot.itemId} size={40} />
                  </div>
                  <h3 className="details-name">{selectedSlot.name}</h3>
                </div>

                <div
                  className="inventory-selected-strip"
                  aria-label={selectedSlot.quality
                    ? (locale === "tr"
                        ? `${qualityLabel(selectedSlot.quality, locale)} kalite, adet ${selectedSlot.quantity}`
                        : `${selectedSlot.quality}, count ${selectedSlot.quantity}`)
                    : (locale === "tr" ? `Adet ${selectedSlot.quantity}` : `Count ${selectedSlot.quantity}`)}
                >
                  {selectedSlot.quality && <CropGradeMark quality={selectedSlot.quality} size={20} labelled />}
                  {selectedSlot.quality && <span className="inventory-selected-sep" aria-hidden="true">·</span>}
                  <strong>{selectedSlot.quantity}</strong>
                </div>

                {selectedSlot.description && (
                  <p className="details-description">
                    {locale === "tr" && TR_ITEMS[selectedSlot.itemId]?.description
                      ? TR_ITEMS[selectedSlot.itemId].description
                      : selectedSlot.description}
                  </p>
                )}

                {selectedSlot.cropId && planting?.valid && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-plant-action-btn"
                      data-testid="inventory-plant-action"
                      onClick={handlePlantSelected}
                    >
                      <IconSprout size={16} aria-hidden="true" /> {locale === "tr" ? `${selectedSlot.cropName ?? selectedSlot.name} Ek` : `Plant ${selectedSlot.cropName ?? selectedSlot.name}`}
                    </ChromeButton>
                  </div>
                )}

                {selectedSlot.cropId && planting && !planting.valid && (
                  <ChromeAlert tone="caution" className="inventory-plant-blocker">
                    {translateReason(planting.reason) || (locale === "tr" ? "Buraya ekim yapılamaz" : "Planting is not available here")}
                  </ChromeAlert>
                )}

                {onConsumeItem && selectedInspection?.provisions && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-consume-action-btn"
                      data-testid="inventory-consume-action"
                      disabled={!selectedInspection.provisions.edible}
                      onClick={handleConsumeSelected}
                    >
                      {locale === "tr" ? `Ye · ${selectedInspection.provisions.restoresWork} Emek tazeler` : `Eat · restores ${selectedInspection.provisions.restoresWork} Work`}
                    </ChromeButton>
                    {!selectedInspection.provisions.edible && (
                      <ChromeAlert tone="caution" className="inventory-consume-blocker">
                        {translateReason(selectedInspection.provisions.blockerReason) || (locale === "tr" ? "Bunu şu an yiyemezsin" : "You cannot eat that right now")}
                      </ChromeAlert>
                    )}
                  </div>
                )}

                {/* Agronomy and other numbers are for players who go looking;
                    the default view answers "what is this and what is it for". */}
                {selectedInspection && (
                  <details className="inventory-item-details" data-testid="inventory-item-details">
                    <summary>{locale === "tr" ? "Ayrıntılar" : "Details"}</summary>
                    <ItemInspectCard item={selectedInspection} detailsOnly />
                  </details>
                )}

                {onDiscardItem && (
                  <div className="inventory-action-block inventory-discard-block">
                    {discardArmed ? (
                      <ChromeButton
                        variant="danger"
                        soundCue="click"
                        className="inventory-discard-confirm"
                        data-testid="inventory-discard-confirm"
                        aria-label={locale === "tr" ? `${selectedSlot.quantity} adet ${selectedSlot.name} imha et` : `Destroy ${selectedSlot.quantity} ${selectedSlot.name}`}
                        aria-describedby="inventory-discard-warning"
                        onClick={() => discardSlot(selectedSlot.index, discardArmedKey)}
                      >
                        {locale === "tr" ? `${selectedSlot.quantity} adet imha et` : `Destroy ${selectedSlot.quantity}`}
                      </ChromeButton>
                    ) : (
                      <ChromeButton
                        variant="ghost"
                        soundCue="click"
                        className="inventory-discard-action"
                        data-testid="inventory-discard-action"
                        onClick={() => setDiscardArmedKey(selectedLotKey)}
                      >
                        {locale === "tr" ? (selectedSlot.quantity > 1 ? `${selectedSlot.quantity} adet at` : "Eşyayı at") : `Discard ${selectedSlot.quantity > 1 ? `stack of ${selectedSlot.quantity}` : "item"}`}
                      </ChromeButton>
                    )}
                    {discardArmed && <ChromeButton variant="ghost" onClick={() => setDiscardArmedKey(null)}>{locale === "tr" ? "Vazgeç" : "Cancel"}</ChromeButton>}
                    {discardArmed && (
                      <p id="inventory-discard-warning" className="inventory-discard-hint">
                        {locale === "tr" ? "Geri alınamaz." : "Cannot be undone."}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="details-placeholder is-category-empty">
                <div className="details-placeholder-icon">
                  {activeCategory === "farming" ? (
                    <IconSprout size={36} aria-hidden="true" />
                  ) : activeCategory === "fishing" ? (
                    <IconFish size={36} aria-hidden="true" />
                  ) : activeCategory === "supplies" ? (
                    <IconTools size={36} aria-hidden="true" />
                  ) : (
                    <IconSatchel size={36} aria-hidden="true" />
                  )}
                </div>
                <h3 className="details-placeholder-title">
                  {query
                    ? (locale === "tr" ? "Aramaya Uygun Eşya Bulunamadı" : "No Search Matches")
                    : activeCategory === "farming"
                    ? (locale === "tr" ? "Tarla Eşyası Yok" : "No Field Items")
                    : activeCategory === "fishing"
                    ? (locale === "tr" ? "Balıkçılık Malzemesi Yok" : "No Fishing Goods")
                    : activeCategory === "supplies"
                    ? (locale === "tr" ? "Malzeme Yok" : "No Supplies")
                    : (locale === "tr" ? "Bir eşya seç" : "Choose an item")}
                </h3>
                <p className="details-placeholder-desc">
                  {query
                    ? (locale === "tr" ? `“${searchTerm.trim()}” ile eşleşen bir şey bulunamadı.` : `No items match “${searchTerm.trim()}”. Clear search to view your satchel.`)
                    : activeCategory === "farming"
                    ? (locale === "tr" ? "Şu an heybende tohum, gübre ya da hasat ürünü yok." : "No seeds, fertilizer, or harvest crops carried right now.")
                    : activeCategory === "fishing"
                    ? (locale === "tr" ? "Şu an heybende yem ya da balık yok." : "No bait, lures, or fish carried right now.")
                    : activeCategory === "supplies"
                    ? (locale === "tr" ? "Şu an heybende zanaat malzemesi veya alet yok." : "No crafting materials, provisions, or tools carried right now.")
                    : (locale === "tr" ? "Ayrıntılarını görmek için heybenden dolu bir göze tıkla." : "Select an occupied slot in your satchel to inspect details.")}
                </p>
                {isFilterActive && (
                  <button
                    type="button"
                    className="inventory-reset-filter-btn"
                    onClick={() => {
                      setActiveCategory("all");
                      setSearchTerm("");
                    }}
                  >
                    {locale === "tr" ? "Tüm Eşyaları Göster" : "View All Items"}
                  </button>
                )}
              </div>
            )}
          </div>}
        </div>

        {discardNotice && (
          <p className="inventory-sort-notice" role="status" data-testid="inventory-discard-notice">
            {discardNotice}
          </p>
        )}

        {draggingLot !== null && onDiscardItem && (
          <div
            className="inventory-discard-zone"
            data-testid="inventory-discard-zone"
            aria-hidden="true"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              discardSlot(draggingLot.index, draggingLot.key);
            }}
          >
            <span className="inventory-discard-zone-label">{locale === "tr" ? "İmha etmek için bırak" : "Release to destroy"}</span>
          </div>
        )}

        <footer className="modal-footer">
          {showFooterTip && (
            <span className="satchel-footer-tip" data-testid="satchel-footer-tip">
              {locale === "tr"
                ? "Yön tuşları gözler arasında dolaşır · Enter eşyayı seçer"
                : "Arrow keys move through slots · Enter selects an item"}
            </span>
          )}
          <ChromeButton onClick={onClose}>{locale === "tr" ? "Kapat" : "Close"}</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

import React, { useEffect, useRef, useState } from "react";
import type { InteractionResult, ItemInspectionDto, SatchelDto } from "../simulation/core/contracts";
import { ItemInspectCard } from "./components/ItemInspectCard";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "./chrome/uiAtlas";
import {
  ChromeButton,
  ChromeClose,
  ChromeDivider,
  ChromeAlert
} from "./chrome/Chrome";
import { IconFish, IconSatchel, IconSprout, IconTools } from "./components/HudIcons";
import { GameSheet, ItemSlot } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";

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
}

type InventoryCategory = "all" | "farming" | "fishing" | "supplies";

/**
 * Whether a slot survives the search box. Matching runs over the item name, its
 * category label and the crop a seed grows, so "wheat" finds both the seed and
 * the grain. An empty slot never matches: a searched grid shows results only.
 */
export function matchesSatchelSearch(
  slot: Pick<SatchelDto["slots"][number], "itemId" | "name" | "categoryLabel" | "cropName">,
  rawQuery: string
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return true;
  if (!slot.itemId) return false;
  return `${slot.name} ${slot.categoryLabel ?? ""} ${slot.cropName ?? ""}`
    .toLowerCase()
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
  onConsumeItem
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortNotice, setSortNotice] = useState<string | null>(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<InventoryCategory>("all");
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

  const allSlots = satchel.slots;
  const selectedSlot = selectedSlotIndex !== null ? allSlots[selectedSlotIndex] ?? null : null;
  const planting = selectedSlot?.cropId ? onInspectPlanting(selectedSlot.cropId) : null;

  // #18: fixed sockets keep the grid stable while a filter is active, so
  // non-matching occupied slots stay dimmed but are not selectable. Pointer
  // and keyboard selection therefore agree instead of silently snapping back.
  // Query and category filter state
  const query = searchTerm.trim().toLowerCase();
  const isFilterActive = activeCategory !== "all" || query.length > 0;

  const isSlotMatch = (slot: SatchelDto["slots"][number]): boolean => {
    if (!slot.itemId) return false;
    if (!matchesSatchelSearch(slot, searchTerm)) return false;
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
  }, [searchTerm, activeCategory, satchel, selectedSlotIndex]);

  const selectedInspection = selectedSlot?.itemId ? onInspectItem?.(selectedSlot.itemId) : null;

  const handleSortSatchel = (): void => {
    const result = onSortSatchel?.();
    if (!result) return;
    playUiSound(result.success ? "confirm" : "click");
    // The satchel is re-read from the simulation on the next render, so the
    // notice is the only thing this component has to hold onto.
    setSortNotice(result.success ? "Satchel tidied" : result.reason ?? "Nothing to tidy");
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
              <IconSatchel size={22} aria-hidden="true" /> Satchel
            </span>
            {/* One capacity readout. The meter beneath said the same thing and
                was already hidden under the Guildcraft skin. */}
            <span className="inventory-capacity-pill" data-testid="inventory-capacity">
              {satchel.occupiedSlots} / {satchel.totalSlots} Slots
            </span>
          </div>

          <ChromeClose onClick={onClose} label="Close satchel" />
        </header>

        <div className="inventory-nav-bar">
          <div className="inventory-category-tabs mm-ribbon-tabs" role="tablist" aria-label="Item categories" onKeyDown={handleTabListKeyDown}>
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
              All
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
              <IconSprout size={14} aria-hidden="true" /> Field
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
              <IconFish size={14} aria-hidden="true" /> Fishing
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
              <IconTools size={14} aria-hidden="true" /> Supplies
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
              Organize
            </ChromeButton>
          </div>
        </div>

        <div
          id="inventory-organize-tools"
          className="inventory-organize-tools"
          hidden={!organizeOpen}
        >
          <label className="inventory-search" htmlFor="inventory-search-input">
            <span className="inventory-search-label">Search</span>
            <input
              id="inventory-search-input"
              type="search"
              className="inventory-search-input"
              data-testid="inventory-search"
              placeholder="Find in satchel"
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
              aria-label="Tidy the satchel: merge stacks and group by kind"
              onClick={handleSortSatchel}
            >
              Tidy
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
                  {`${matchingEntries.length} ${matchingEntries.length === 1 ? "item" : "items"}${query ? ` matching “${searchTerm.trim()}”` : " in this section"}`}
                </span>
                {query && (
                  <button
                    type="button"
                    className="inventory-clear-search-btn"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
            {isFilterActive && matchingEntries.length === 0 && (
              <p className="guild-empty-search" role="status">
                {query ? "No items match your search. Try another name or clear the search." : "Your satchel has nothing in this section yet."}
              </p>
            )}
            <div
              className="inventory-grid"
              id="inventory-items"
              ref={gridRef}
              role="listbox"
              aria-label={isFilterActive ? `Satchel items, ${matchingEntries.length} matching in ${activeCategory}` : "Satchel items"}
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
                      label="Empty slot"
                    />
                  );
                }

                const isMatch = !isFilterActive || isSlotMatch(slot);
                const isSelectable = isMatch;

                return (
                  <ItemSlot
                    key={`${slot.itemId}-${index}`}
                    id={`inventory-slot-${index}`}
                    className={`inventory-slot${isMatch ? " is-match" : " is-dimmed"}`}
                    filled
                    selected={isSelectable && isSelected}
                    quantity={slot.quantity > 1 ? slot.quantity : undefined}
                    onSelect={isSelectable ? () => setSelectedSlotIndex(index) : undefined}
                    label={isSelectable
                      ? `${slot.name}, count ${slot.quantity}`
                      : `${slot.name}, hidden by the active filter`}
                    role="option"
                    aria-selected={isSelectable && isSelected}
                    aria-disabled={isSelectable ? undefined : "true"}
                    tabIndex={isSelectable && isSelected ? 0 : -1}
                  >
                    <AtlasImage
                      src={atlasForItem(slot.itemId) ?? atlasForFish(slot.itemId)}
                      alt=""
                      size={40}
                      className="slot-item-icon"
                    />
                  </ItemSlot>
                );
              })}
            </div>
          </div>

          <div className="inventory-details-card" aria-live="polite">
            {selectedSlot?.itemId ? (
              <>
                <div className="details-header">
                  <div className="details-icon-well">
                    <AtlasImage
                      src={atlasForItem(selectedSlot.itemId) ?? atlasForFish(selectedSlot.itemId)}
                      alt=""
                      size={54}
                    />
                  </div>
                  <div>
                    <h3 className="details-name">{selectedSlot.name}</h3>
                    {selectedSlot.categoryLabel && (
                      <span className="details-category-tag">{selectedSlot.categoryLabel.toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="inventory-selected-strip">
                  <span>{selectedSlot.categoryLabel ?? "item"}</span>
                  <strong>{selectedSlot.quantity} carried</strong>
                </div>

                {selectedSlot.cropId && planting?.valid && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-plant-action-btn"
                      data-testid="inventory-plant-action"
                      onClick={handlePlantSelected}
                    >
                      <IconSprout size={16} aria-hidden="true" /> Plant {selectedSlot.cropName ?? selectedSlot.name}
                    </ChromeButton>
                  </div>
                )}
                {selectedSlot.cropId && planting && !planting.valid && (
                  <ChromeAlert tone="caution" className="inventory-plant-blocker">
                    {planting.reason ?? "Planting is not available here"}
                  </ChromeAlert>
                )}

                {selectedInspection?.provisions && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-consume-action-btn"
                      data-testid="inventory-consume-action"
                      disabled={!selectedInspection.provisions.edible}
                      onClick={handleConsumeSelected}
                    >
                      Eat · restores {selectedInspection.provisions.restoresWork} Work
                    </ChromeButton>
                    {!selectedInspection.provisions.edible && (
                      <ChromeAlert tone="caution" className="inventory-consume-blocker">
                        {selectedInspection.provisions.blockerReason ?? "You cannot eat that right now"}
                      </ChromeAlert>
                    )}
                  </div>
                )}

                {selectedSlot.description && <p className="details-description">{selectedSlot.description}</p>}

                {/* Agronomy and other numbers are for players who go looking;
                    the default view answers "what is this and what is it for". */}
                {selectedInspection && (
                  <details className="inventory-item-details" data-testid="inventory-item-details">
                    <summary>Details</summary>
                    <ItemInspectCard item={selectedInspection} detailsOnly />
                  </details>
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
                    ? "No Search Matches"
                    : activeCategory === "farming"
                    ? "No Field Items"
                    : activeCategory === "fishing"
                    ? "No Fishing Goods"
                    : activeCategory === "supplies"
                    ? "No Supplies"
                    : "Choose an item"}
                </h3>
                <p className="details-placeholder-desc">
                  {query
                    ? `No items match “${searchTerm.trim()}”. Clear search to view your satchel.`
                    : activeCategory === "farming"
                    ? "No seeds, fertilizer, or harvest crops carried right now."
                    : activeCategory === "fishing"
                    ? "No bait, lures, or fish carried right now."
                    : activeCategory === "supplies"
                    ? "No crafting materials, provisions, or tools carried right now."
                    : "Select an occupied slot in your satchel to inspect details."}
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
                    View All Items
                  </button>
                )}
              </div>
            )}
          </div>
        </div>


        <footer className="modal-footer">
          {showFooterTip && (
            <span className="satchel-footer-tip" data-testid="satchel-footer-tip">Arrow keys move through slots · Enter selects an item</span>
          )}
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

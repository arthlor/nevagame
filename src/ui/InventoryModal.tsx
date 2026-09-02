import React, { useRef, useState } from "react";
import type { SatchelDto } from "../simulation/core/contracts";
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
import { GameSheet, ItemSlot, Meter } from "./coastal/CoastalUI";
import { playUiSound } from "./audio/uiAudio";

interface InventoryModalProps {
  satchel: SatchelDto;
  onClose: () => void;
  onSelectPlantCrop: (cropId: string) => void;
  onInspectPlanting: (cropId: string) => { valid: boolean; reason?: string };
}

type InventoryCategory = "all" | "farming" | "fishing" | "supplies";

export const InventoryModal: React.FC<InventoryModalProps> = ({ satchel, onClose, onSelectPlantCrop, onInspectPlanting }) => {
  const [activeCategory, setActiveCategory] = useState<InventoryCategory>("all");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(() => {
    const firstOccupied = satchel.slots.findIndex((slot) => slot.itemId !== null && slot.quantity > 0);
    return firstOccupied >= 0 ? firstOccupied : null;
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const allSlots = satchel.slots;
  const selectedSlot = selectedSlotIndex !== null ? allSlots[selectedSlotIndex] ?? null : null;
  const planting = selectedSlot?.cropId ? onInspectPlanting(selectedSlot.cropId) : null;

  const handlePlantSelected = (): void => {
    if (selectedSlot?.cropId) {
      onSelectPlantCrop(selectedSlot.cropId);
      onClose();
    }
  };

  /**
   * The grid wraps, so the column count has to come from the rendered layout
   * rather than a hard-coded constant that would desync from the CSS.
   */
  const columnsInGrid = (): number => {
    const grid = gridRef.current;
    if (!grid) return 1;
    const cells = Array.from(grid.children) as HTMLElement[];
    if (cells.length === 0) return 1;
    const firstTop = cells[0].offsetTop;
    const columns = cells.filter((cell) => cell.offsetTop === firstTop).length;
    return Math.max(1, columns);
  };

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const total = allSlots.length;
    if (total === 0) return;
    const columns = columnsInGrid();
    const current = selectedSlotIndex ?? 0;
    let next = current;

    switch (event.key) {
      case "ArrowRight": next = Math.min(total - 1, current + 1); break;
      case "ArrowLeft": next = Math.max(0, current - 1); break;
      case "ArrowDown": next = Math.min(total - 1, current + columns); break;
      case "ArrowUp": next = Math.max(0, current - columns); break;
      case "Home": next = 0; break;
      case "End": next = total - 1; break;
      default: return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (next === selectedSlotIndex) return;
    setSelectedSlotIndex(next);
    (gridRef.current?.children[next] as HTMLElement | undefined)?.focus();
  };

  const selectCategory = (category: InventoryCategory): void => {
    playUiSound("page-turn");
    setActiveCategory(category);
    const firstRelevant = allSlots.findIndex((slot) =>
      slot.itemId !== null && (category === "all" || slot.inventoryCategory === category)
    );
    setSelectedSlotIndex(firstRelevant >= 0 ? firstRelevant : null);
  };

  const isSlotMatchingCategory = (slot: SatchelDto["slots"][number]): boolean => {
    if (activeCategory === "all") return true;
    return slot.inventoryCategory === activeCategory;
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
            <span className="inventory-capacity-pill" data-testid="inventory-capacity">
              {satchel.occupiedSlots} / {satchel.totalSlots} Slots
            </span>
          </div>

          <Meter
            className="inventory-capacity-meter"
            label="Satchel capacity"
            value={satchel.occupiedSlots}
            max={Math.max(1, satchel.totalSlots)}
            showLabel={false}
            valueText={`${satchel.occupiedSlots} / ${satchel.totalSlots}`}
            variant="gold"
          />

          <ChromeClose onClick={onClose} label="Close satchel" />
        </header>

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

        <ChromeDivider ornate={false} />

        <div className="modal-body inventory-body">
          <div className="inventory-grid-wrap">
            {/* A flat list of cells is a listbox, not a grid: role="grid"
                without rows is an incomplete structure for screen readers. */}
            <div
              className="inventory-grid"
              id="inventory-items"
              ref={gridRef}
              role="listbox"
              aria-label="Satchel items"
              aria-labelledby={`inventory-tab-${activeCategory}`}
              onKeyDown={handleGridKeyDown}
            >
              {allSlots.map((slot, index) => {
                const isSelected = selectedSlotIndex === index;
                const isMatching = isSlotMatchingCategory(slot);
                if (!slot.itemId) {
                  return (
                    <ItemSlot
                      key={`empty-${index}`}
                      id={`inventory-slot-${index}`}
                      className="inventory-slot"
                      role="option"
                      aria-selected={isSelected}
                      selected={isSelected}
                      onSelect={() => setSelectedSlotIndex(index)}
                      tabIndex={selectedSlotIndex === index || (selectedSlotIndex === null && index === 0) ? 0 : -1}
                      label="Empty slot"
                    />
                  );
                }

                return (
                  <ItemSlot
                    key={`${slot.itemId}-${index}`}
                    id={`inventory-slot-${index}`}
                    className={`inventory-slot ${!isMatching ? "is-dimmed" : ""}`}
                    filled
                    selected={isSelected}
                    quantity={slot.quantity > 1 ? slot.quantity : undefined}
                    onSelect={() => setSelectedSlotIndex(index)}
                    label={`${slot.name}, count ${slot.quantity}`}
                    title={`${slot.name} — ${slot.quantity}`}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={isSelected ? 0 : -1}
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

          <div className="inventory-details-card">
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
                  {selectedSlot.isFish && <span>Market value depends on the catch and current demand</span>}
                </div>

                {selectedSlot.description && <p className="details-description">{selectedSlot.description}</p>}

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
              </>
            ) : (
              <div className="details-placeholder">
                <IconSatchel size={36} aria-hidden="true" className="placeholder-icon" />
                <p>{activeCategory === "all" ? "Choose an item." : "Nothing in this part of the satchel."}</p>
              </div>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <span className="satchel-footer-tip">Arrow keys move through slots · Esc closes</span>
          <ChromeButton onClick={onClose}>Close</ChromeButton>
        </footer>
      </GameSheet>
    </div>
  );
};

// src/ui/InventoryModal.tsx
import React, { useMemo, useRef, useState } from "react";
import { GameState, InventorySlot } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { useModalAccessibility } from "./useModalAccessibility";
import { handleTabListKeyDown } from "./useTabListKeyboard";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "./chrome/uiAtlas";
import {
  ChromeButton,
  ChromeClose,
  ChromeDivider,
  ChromeMeter,
  ChromePanel,
  ChromeSlot
} from "./chrome/Chrome";
import { IconBackpack, IconCoin, IconFish, IconSprout, IconTools } from "./components/HudIcons";
import { playUiSound } from "./audio/uiAudio";

interface InventoryModalProps {
  state: GameState;
  onClose: () => void;
  onSelectPlantCrop: (cropId: string) => void;
}

type InventoryCategory = "all" | "farming" | "fishing" | "supplies";

export const InventoryModal: React.FC<InventoryModalProps> = ({ state, onClose, onSelectPlantCrop }) => {
  const playerInv = state.inventories[state.player.inventoryId];
  const [activeCategory, setActiveCategory] = useState<InventoryCategory>("all");
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(() => {
    const firstOccupied = playerInv?.slots.findIndex((slot) => slot.itemId !== null && (slot.quantity ?? 0) > 0) ?? -1;
    return firstOccupied >= 0 ? firstOccupied : null;
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useModalAccessibility(modalRef, onClose);

  const allSlots = playerInv?.slots ?? [];
  const totalSlots = allSlots.length;
  const occupiedSlots = useMemo(() => {
    return allSlots.filter((s) => s.itemId !== null && (s.quantity ?? 0) > 0).length;
  }, [allSlots]);

  const selectedSlot: InventorySlot | null =
    selectedSlotIndex !== null && playerInv ? playerInv.slots[selectedSlotIndex] : null;
  const selectedItemDef =
    selectedSlot && selectedSlot.itemId ? ContentRegistry.items.get(selectedSlot.itemId) : null;
  const selectedFishDef =
    selectedSlot && selectedSlot.itemId ? ContentRegistry.fishSpecies.get(selectedSlot.itemId) : null;
  const selectedName = selectedItemDef?.name ?? selectedFishDef?.name ?? selectedSlot?.itemId ?? "";
  // Landed fish sit in the satchel as their own species entries. Falling back
  // to a flat 10 G quoted an invented price for every one of them.
  const selectedBaseValue = selectedItemDef?.baseValue ?? selectedFishDef?.baseMarketValue ?? null;
  const totalStackValue =
    selectedBaseValue == null ? null : selectedBaseValue * (selectedSlot?.quantity ?? 0);

  const selectedCrop = selectedSlot?.itemId
    ? Array.from(ContentRegistry.crops.values()).find((crop) => crop.seedItemId === selectedSlot.itemId)
    : undefined;

  const handlePlantSelected = (): void => {
    if (selectedCrop) {
      onSelectPlantCrop(selectedCrop.id);
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
  };

  const isSlotMatchingCategory = (slot: InventorySlot): boolean => {
    if (activeCategory === "all") return true;
    if (!slot.itemId) return false;
    const itemDef = ContentRegistry.items.get(slot.itemId);
    if (!itemDef) return false;

    if (activeCategory === "farming") {
      return itemDef.category === "seed" || itemDef.category === "produce" || itemDef.category === "grain" || itemDef.category === "fertilizer";
    }
    if (activeCategory === "fishing") {
      return itemDef.category === "bait" || itemDef.category === "fishing-supply" || slot.itemId.startsWith("fish.");
    }
    if (activeCategory === "supplies") {
      return itemDef.category === "crafting-material" || itemDef.category === "fuel" || itemDef.category === "ice" || itemDef.category === "processed-food" || itemDef.category === "misc";
    }
    return true;
  };

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <ChromePanel
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
              <IconBackpack size={22} aria-hidden="true" /> Guild Satchel
            </span>
            <span className="inventory-capacity-pill" data-testid="inventory-capacity">
              {occupiedSlots} / {totalSlots} Slots
            </span>
          </div>

          <ChromeMeter
            className="inventory-capacity-meter"
            label="Satchel capacity"
            value={occupiedSlots}
            max={Math.max(1, totalSlots)}
            showLabel={false}
            valueText={`${occupiedSlots} / ${totalSlots}`}
            variant="gold"
          />

          <ChromeClose onClick={onClose} label="Close satchel" />
        </header>

        <div className="inventory-category-tabs mm-ribbon-tabs" role="tablist" aria-label="Item categories" onKeyDown={handleTabListKeyDown}>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "all"}
            className={`inventory-tab-btn ${activeCategory === "all" ? "is-active" : ""}`}
            onClick={() => selectCategory("all")}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "farming"}
            className={`inventory-tab-btn ${activeCategory === "farming" ? "is-active" : ""}`}
            onClick={() => selectCategory("farming")}
          >
            <IconSprout size={14} aria-hidden="true" /> Farming
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "fishing"}
            className={`inventory-tab-btn ${activeCategory === "fishing" ? "is-active" : ""}`}
            onClick={() => selectCategory("fishing")}
          >
            <IconFish size={14} aria-hidden="true" /> Fish
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === "supplies"}
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
              ref={gridRef}
              role="listbox"
              aria-label="Backpack items"
              onKeyDown={handleGridKeyDown}
            >
              {allSlots.map((slot, index) => {
                const isSelected = selectedSlotIndex === index;
                const isMatching = isSlotMatchingCategory(slot);
                if (!slot.itemId) {
                  return (
                    <ChromeSlot
                      key={`empty-${index}`}
                      id={`inventory-slot-${index}`}
                      className="inventory-slot"
                      role="option"
                      aria-selected={false}
                      // Roving tabindex: one stop into the grid, arrows inside.
                      tabIndex={selectedSlotIndex === index ? 0 : -1}
                      label="Empty slot"
                    />
                  );
                }

                const item = ContentRegistry.items.get(slot.itemId);
                const fish = ContentRegistry.fishSpecies.get(slot.itemId);
                const name = item ? item.name : fish ? fish.name : slot.itemId;
                const qty = slot.quantity ?? 0;

                return (
                  <ChromeSlot
                    key={`${slot.itemId}-${index}`}
                    id={`inventory-slot-${index}`}
                    className={`inventory-slot ${!isMatching ? "is-dimmed" : ""}`}
                    filled
                    selected={isSelected}
                    quantity={qty > 1 ? qty : undefined}
                    onSelect={() => setSelectedSlotIndex(index)}
                    label={`${name}, count ${qty}`}
                    title={`${name} — ${qty}`}
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
                  </ChromeSlot>
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
                    <h3 className="details-name">{selectedName}</h3>
                    {selectedItemDef && (
                      <span className="details-category-tag">{selectedItemDef.category.toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <div className="inventory-inspection-badges" aria-label="Item value">
                  <span className="inventory-value-badge">Qty {selectedSlot.quantity}</span>
                  {selectedBaseValue != null && (
                    <span className="inventory-value-badge">
                      <IconCoin size={12} aria-hidden="true" /> {selectedBaseValue} G
                    </span>
                  )}
                  {totalStackValue != null && (
                    <span className="inventory-value-badge">Stack {totalStackValue} G</span>
                  )}
                </div>

                <div className="details-stats-list">
                  <div className="details-stat-row">
                    <span>Stack Quantity:</span>
                    <strong>{selectedSlot.quantity}</strong>
                  </div>
                  <div className="details-stat-row">
                    <span>Base Value:</span>
                    <span>{selectedBaseValue == null ? "Not traded" : `${selectedBaseValue} G`}</span>
                  </div>
                  <div className="details-stat-row">
                    <span>Total Stack Worth:</span>
                    <strong className="details-gold-value">
                      {totalStackValue == null ? "—" : `${totalStackValue} G`}
                    </strong>
                  </div>
                  {selectedFishDef && (
                    <div className="details-stat-row">
                      <span>Market note:</span>
                      <span>Sells for more by weight, quality and freshness</span>
                    </div>
                  )}
                </div>

                {selectedItemDef && <p className="details-description">{selectedItemDef.description}</p>}

                {selectedCrop && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-plant-action-btn"
                      data-testid="inventory-plant-action"
                      onClick={handlePlantSelected}
                    >
                      <IconSprout size={16} aria-hidden="true" /> Plant {selectedCrop.name}
                    </ChromeButton>
                    <span className="inventory-action-hint">Arms tool slot 2 and closes the satchel</span>
                  </div>
                )}
              </>
            ) : (
              <div className="details-placeholder">
                <IconBackpack size={36} aria-hidden="true" className="placeholder-icon" />
                <p>Select an item to see its details.</p>
              </div>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <span className="satchel-footer-tip">
            Click an item to inspect · Plant crops directly on prepared soil
          </span>
          <ChromeButton onClick={onClose}>Close Satchel</ChromeButton>
        </footer>
      </ChromePanel>
    </div>
  );
};

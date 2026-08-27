// src/ui/InventoryModal.tsx
import React, { useMemo, useRef, useState } from "react";
import { GameState, InventorySlot } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { useModalAccessibility } from "./useModalAccessibility";
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
  const selectedBaseValue = selectedItemDef?.baseValue ?? 10;
  const totalStackValue = selectedBaseValue * (selectedSlot?.quantity ?? 0);

  const selectedCrop = selectedSlot?.itemId
    ? Array.from(ContentRegistry.crops.values()).find((crop) => crop.seedItemId === selectedSlot.itemId)
    : undefined;
  const isStarterCrop = selectedCrop
    ? ["crop.wheat", "crop.tomato", "crop.potato"].includes(selectedCrop.id)
    : false;

  const handlePlantSelected = (): void => {
    if (selectedCrop) {
      onSelectPlantCrop(selectedCrop.id);
      onClose();
    }
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
        flourish
        corners
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

        <div className="inventory-category-tabs mm-ribbon-tabs" role="tablist" aria-label="Item categories">
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

        <ChromeDivider />

        <div className="modal-body inventory-body">
          <div className="inventory-grid-wrap">
            <div className="inventory-grid" role="grid" aria-label="Backpack items">
              {allSlots.map((slot, index) => {
                const isSelected = selectedSlotIndex === index;
                const isMatching = isSlotMatchingCategory(slot);
                if (!slot.itemId) {
                  return (
                    <ChromeSlot
                      key={`empty-${index}`}
                      className="inventory-slot"
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
                    className={`inventory-slot ${!isMatching ? "is-dimmed" : ""}`}
                    filled
                    selected={isSelected}
                    quantity={qty > 1 ? qty : undefined}
                    onSelect={() => setSelectedSlotIndex(index)}
                    label={`${name}, count ${qty}`}
                    role="gridcell"
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
                  <span className="inventory-value-badge">
                    <IconCoin size={12} aria-hidden="true" /> {selectedBaseValue} G
                  </span>
                  <span className="inventory-value-badge">Stack {totalStackValue} G</span>
                </div>

                <div className="details-stats-list">
                  <div className="details-stat-row">
                    <span>Stack Quantity:</span>
                    <strong>{selectedSlot.quantity}</strong>
                  </div>
                  <div className="details-stat-row">
                    <span>Base Value:</span>
                    <span>{selectedBaseValue} G</span>
                  </div>
                  <div className="details-stat-row">
                    <span>Total Stack Worth:</span>
                    <strong className="details-gold-value">{totalStackValue} G</strong>
                  </div>
                </div>

                {selectedItemDef && <p className="details-description">{selectedItemDef.description}</p>}

                {selectedCrop && isStarterCrop && (
                  <div className="inventory-action-block">
                    <ChromeButton
                      variant="gold"
                      soundCue="confirm"
                      className="inventory-plant-action-btn"
                      onClick={handlePlantSelected}
                    >
                      <IconSprout size={16} aria-hidden="true" /> Plant {selectedCrop.name}
                    </ChromeButton>
                  </div>
                )}

                {selectedCrop && !isStarterCrop && (
                  <div className="inventory-unavailable-note">
                    Not currently stocked for the starter farm.
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

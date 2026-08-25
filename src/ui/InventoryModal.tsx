// src/ui/InventoryModal.tsx
import React, { useState } from "react";
import { GameState, InventorySlot } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";

interface InventoryModalProps {
  state: GameState;
  onClose: () => void;
  onSelectPlantCrop: (cropId: string) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ state, onClose, onSelectPlantCrop }) => {
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const playerInv = state.inventories[state.player.inventoryId];

  const selectedSlot: InventorySlot | null =
    selectedSlotIndex !== null && playerInv ? playerInv.slots[selectedSlotIndex] : null;
  const selectedItemDef =
    selectedSlot && selectedSlot.itemId ? ContentRegistry.items.get(selectedSlot.itemId) : null;
  const selectedCrop = selectedSlot?.itemId
    ? Array.from(ContentRegistry.crops.values()).find((crop) => crop.seedItemId === selectedSlot.itemId)
    : undefined;
  const isStarterCrop = selectedCrop
    ? ["crop.wheat", "crop.tomato", "crop.potato"].includes(selectedCrop.id)
    : false;

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" style={{ width: "min(700px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>🎒 Backpack Inventory</span>
          <button type="button" className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", gap: "16px" }}>
          {/* Inventory Grid */}
          <div style={{ flex: 1 }}>
            <div className="inventory-grid">
              {playerInv ? (
                playerInv.slots.map((slot, idx) => {
                  const itemDef = slot.itemId ? ContentRegistry.items.get(slot.itemId) : null;
                  const isSelected = selectedSlotIndex === idx;

                  return (
                    <div
                      key={idx}
                      className={`inventory-slot ${isSelected ? "selected" : ""} ${!itemDef ? "is-empty" : ""}`}
                      onClick={() => setSelectedSlotIndex(idx)}
                    >
                      {itemDef ? (
                        <>
                          <div className="slot-item-name">{itemDef.name}</div>
                          <div className="slot-quantity">{slot.quantity}×</div>
                        </>
                      ) : (
                        <div className="slot-empty-label">Empty</div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "var(--color-text-muted)" }}>Inventory not found</div>
              )}
            </div>
          </div>

          {/* Item Details Panel */}
          <div className="inventory-details-card">
            {selectedItemDef && selectedSlot ? (
              <>
                <div className="details-title">
                  {selectedItemDef.name}
                </div>
                <div className="details-category">
                  Category: {selectedItemDef.category}
                </div>
                <div className="details-description">
                  {selectedItemDef.description}
                </div>
                <div className="details-stats">
                  <div className="details-stat-row">
                    <span>Quantity:</span>
                    <strong>{selectedSlot.quantity}</strong>
                  </div>
                  <div className="details-stat-row">
                    <span>Base Value:</span>
                    <strong style={{ color: "var(--color-accent-gold)" }}>{selectedItemDef.baseValue} G</strong>
                  </div>
                </div>
                {selectedCrop && isStarterCrop && (
                  <button
                    type="button"
                    className="neva-button neva-button-primary"
                    style={{ marginTop: "auto" }}
                    onClick={() => {
                      onSelectPlantCrop(selectedCrop.id);
                      onClose();
                    }}
                  >
                    Plant {selectedCrop.name}
                  </button>
                )}
                {selectedCrop && !isStarterCrop && (
                  <div className="inventory-unavailable-note">Not stocked for the starter farm yet.</div>
                )}
              </>
            ) : (
              <div className="details-placeholder">
                Select an item from your backpack to inspect details.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="neva-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

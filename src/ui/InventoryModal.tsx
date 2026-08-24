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

  return (
    <div className="modal-overlay interactive" onClick={onClose}>
      <div className="neva-panel modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>🎒 Backpack Inventory</span>
          <button className="neva-button neva-button-secondary" style={{ padding: "2px 8px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", gap: "16px" }}>
          {/* Inventory Grid */}
          <div style={{ flex: 1 }}>
            <div className="inventory-grid">
              {playerInv.slots.map((slot, idx) => {
                const itemDef = slot.itemId ? ContentRegistry.items.get(slot.itemId) : null;
                const isSelected = selectedSlotIndex === idx;

                return (
                  <div
                    key={idx}
                    className={`inventory-slot ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedSlotIndex(idx)}
                  >
                    {itemDef ? (
                      <>
                        <div className="slot-item-name">{itemDef.name}</div>
                        <div className="slot-quantity">{slot.quantity}</div>
                      </>
                    ) : (
                      <div style={{ color: "#AAA", fontSize: "11px" }}>Empty</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Item Details Panel */}
          <div
            style={{
              width: "220px",
              background: "#FFF",
              border: "2px solid #C4B5A2",
              borderRadius: "6px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
          >
            {selectedItemDef && selectedSlot ? (
              <>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--color-wood-dark)" }}>
                  {selectedItemDef.name}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-accent-teal)", textTransform: "uppercase" }}>
                  Category: {selectedItemDef.category}
                </div>
                <div style={{ fontSize: "12px", color: "#555", flex: 1 }}>
                  {selectedItemDef.description}
                </div>
                <div style={{ borderTop: "1px solid #EEE", paddingTop: "6px", fontSize: "12px" }}>
                  <div>Quantity: <b>{selectedSlot.quantity}</b></div>
                  <div>Base Value: <b>{selectedItemDef.baseValue} G</b></div>
                </div>
                {selectedCrop && (
                  <button
                    className="neva-button neva-button-teal"
                    onClick={() => {
                      onSelectPlantCrop(selectedCrop.id);
                      onClose();
                    }}
                  >
                    Plant {selectedCrop.name}
                  </button>
                )}
              </>
            ) : (
              <div style={{ color: "#888", fontSize: "13px", textAlign: "center", marginTop: "40px" }}>
                Select an item from your backpack to inspect details.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="neva-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

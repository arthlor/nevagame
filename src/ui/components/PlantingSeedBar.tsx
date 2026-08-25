// src/ui/components/PlantingSeedBar.tsx
import React from "react";
import { GameState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../../simulation/inventory/InventoryManager";
import { IconSprout } from "./HudIcons";

interface PlantingSeedBarProps {
  state: GameState;
  selectedCropId: string | null;
  onSelectCrop: (cropId: string) => void;
  onCancel: () => void;
}

export const PlantingSeedBar: React.FC<PlantingSeedBarProps> = ({
  state,
  selectedCropId,
  onSelectCrop,
  onCancel
}) => {
  const playerInv = state.inventories[state.player.inventoryId];
  if (!playerInv) return null;

  // Find all seed items player owns
  const availableSeeds = Array.from(ContentRegistry.crops.values()).map((crop) => {
    const seedItem = ContentRegistry.items.get(crop.seedItemId);
    const count = seedItem ? InventoryManager.getItemCount(playerInv, seedItem.id) : 0;
    return {
      crop,
      count
    };
  }).filter((entry) => entry.count > 0);

  const selectedCrop = selectedCropId ? ContentRegistry.crops.get(selectedCropId) : availableSeeds[0]?.crop;

  return (
    <div className="planting-dock interactive" role="toolbar" aria-label="Seed planting toolbar">
      <div className="planting-dock-shell">
        <header className="planting-dock-header">
          <div className="planting-header-left">
            <IconSprout size={16} />
            <span className="planting-header-title">PLANT SEEDS</span>
          </div>
          <div className="planting-header-hints">
            <button type="button" className="neva-button neva-button-secondary" style={{ padding: "2px 8px", fontSize: "11px" }} onClick={onCancel} title="Cancel Planting (ESC)">
              ✕ Cancel
            </button>
            <span className="planting-hint-chip"><kbd>LMB</kbd> Plant</span>
          </div>
        </header>

        <div className="planting-seeds-row">
          {availableSeeds.length === 0 ? (
            <div className="planting-no-seeds">
              <span>No seeds in backpack. Purchase seeds at the Village Market.</span>
            </div>
          ) : (
            availableSeeds.map(({ crop, count }) => {
              const isSelected = selectedCrop?.id === crop.id;
              return (
                <button
                  key={crop.id}
                  type="button"
                  className={`planting-seed-card ${isSelected ? "is-selected" : ""}`}
                  onClick={() => onSelectCrop(crop.id)}
                >
                  <span className="seed-name">{crop.name}</span>
                  <span className="seed-count">{count}×</span>
                </button>
              );
            })
          )}
        </div>

        {selectedCrop && (
          <footer className="planting-dock-meta">
            <div className="planting-meta-group">
              <span className="meta-label">Selected:</span>
              <strong className="meta-value">{selectedCrop.name}</strong>
            </div>
            <div className="planting-meta-group">
              <span className="meta-label">Est. Growth:</span>
              <span className="meta-value">{Math.round(selectedCrop.baseGrowthMinutes / 60)}h</span>
            </div>
            <div className="planting-meta-group">
              <span className="meta-label">Est. Yield:</span>
              <span className="meta-value">{selectedCrop.baseYield.min}–{selectedCrop.baseYield.max} units</span>
            </div>
            <div className="planting-meta-group">
              <span className="meta-label">Preferred Climate:</span>
              <span className="meta-value">{selectedCrop.preferredClimates.join(", ")}</span>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
};

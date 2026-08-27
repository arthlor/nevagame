// src/ui/components/PlantingSeedBar.tsx
import React from "react";
import { GameState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { InventoryManager } from "../../simulation/inventory/InventoryManager";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForSeedItem } from "../chrome/uiAtlas";
import { ChromeButton, ChromeKeycap, ChromePanel, ChromeSlot } from "../chrome/Chrome";

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

  const availableSeeds = Array.from(ContentRegistry.crops.values()).map((crop) => {
    const seedItem = ContentRegistry.items.get(crop.seedItemId);
    const count = seedItem ? InventoryManager.getItemCount(playerInv, seedItem.id) : 0;
    return {
      crop,
      count
    };
  }).filter((entry) => entry.count > 0);

  const selectedCrop = selectedCropId ? ContentRegistry.crops.get(selectedCropId) : availableSeeds[0]?.crop;

  if (availableSeeds.length === 0) {
    return (
      <div className="planting-dock interactive" role="status" aria-label="No seeds">
        <p className="planting-no-seeds chrome-panel chrome-panel--slate" data-testid="planting-empty">No seeds in backpack.</p>
      </div>
    );
  }

  return (
    <div className="planting-dock interactive" role="toolbar" aria-label="Choose a seed">
      <ChromePanel tone="slate" flourish corners className="planting-dock-shell" data-testid="planting-seed-dock">
        <div className="planting-seeds-row">
          {availableSeeds.map(({ crop, count }) => {
            const isSelected = selectedCrop?.id === crop.id;
            return (
              <ChromeSlot
                key={crop.id}
                filled
                quantity={count}
                selected={isSelected}
                className={`planting-seed-card ${isSelected ? "is-selected" : ""}`}
                soundCue="cloth"
                onSelect={() => onSelectCrop(crop.id)}
                label={`${crop.name}, ${count} seeds`}
              >
                <AtlasImage src={atlasForSeedItem(crop.seedItemId)} alt="" size={28} />
              </ChromeSlot>
            );
          })}
          <div className="planting-dock-actions">
            <ChromeButton onClick={onCancel} title="Cancel Planting (ESC)">
              Cancel
            </ChromeButton>
            <span className="planting-hint-chip"><ChromeKeycap keyName="LMB" /> Place</span>
          </div>
        </div>

        {selectedCrop && (
          <footer className="planting-dock-meta">
            <strong className="meta-value">{selectedCrop.name}</strong>
            <span className="meta-value">Likes: {selectedCrop.preferredClimates.join(", ")}</span>
          </footer>
        )}
      </ChromePanel>
    </div>
  );
};

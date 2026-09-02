import React from "react";
import type { SeedBeltDto } from "../../simulation/core/contracts";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForSeedItem } from "../chrome/uiAtlas";
import { ChromeButton } from "../chrome/Chrome";
import { GameSheet, ItemSlot, KeyHint, Notice } from "../coastal/CoastalUI";

interface PlantingSeedBarProps {
  seedBelt: SeedBeltDto;
  selectedCropId: string | null;
  onSelectCrop: (cropId: string) => void;
  onCancel: () => void;
}

export const PlantingSeedBar: React.FC<PlantingSeedBarProps> = ({
  seedBelt,
  selectedCropId,
  onSelectCrop,
  onCancel
}) => {
  const availableSeeds = seedBelt.seeds;
  const selectedCrop = availableSeeds.find((seed) => seed.cropId === selectedCropId) ?? availableSeeds[0];

  if (availableSeeds.length === 0) {
    return (
      <div className="planting-dock interactive" aria-label="No seeds">
        <GameSheet family="ink" tone="slate" corners className="planting-dock-shell planting-dock-empty">
          <Notice urgency="caution" className="planting-no-seeds" data-testid="planting-empty">
            No seeds in the satchel.
          </Notice>
          <ChromeButton onClick={onCancel}>Cancel planting</ChromeButton>
        </GameSheet>
      </div>
    );
  }

  return (
    <div className="planting-dock interactive" role="toolbar" aria-label="Choose a seed">
      <GameSheet family="ink" tone="slate" corners className="planting-dock-shell" data-testid="planting-seed-dock">
        <div className="planting-seeds-row">
          {availableSeeds.map((seed) => {
            const isSelected = selectedCrop?.cropId === seed.cropId;
            return (
              <ItemSlot
                key={seed.cropId}
                filled
                quantity={seed.count}
                selected={isSelected}
                className={`planting-seed-card ${isSelected ? "is-selected" : ""}`}
                soundCue="cloth"
                onSelect={() => onSelectCrop(seed.cropId)}
                label={`${seed.name}, ${seed.count} seeds`}
              >
                <AtlasImage src={atlasForSeedItem(seed.seedItemId)} alt="" size={28} />
              </ItemSlot>
            );
          })}
          <div className="planting-dock-actions">
            <ChromeButton onClick={onCancel} title="Cancel Planting (ESC)">
              Cancel
            </ChromeButton>
            <span className="planting-hint-chip"><KeyHint keyName="LMB" /> Place</span>
          </div>
        </div>

        {selectedCrop && (
          <footer className="planting-dock-meta">
            <strong className="meta-value">{selectedCrop.name}</strong>
            <span className="meta-value">Likes: {selectedCrop.preferredClimates.join(", ")}</span>
          </footer>
        )}
      </GameSheet>
    </div>
  );
};

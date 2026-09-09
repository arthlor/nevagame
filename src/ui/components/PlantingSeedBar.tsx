import { IconSprout} from "./HudIcons";
import React, { useEffect, useRef } from "react";
import type { SeedBeltDto } from "../../simulation/core/contracts";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForSeedItem } from "../chrome/uiAtlas";
import { ChromeButton } from "../chrome/Chrome";
import { GameSheet, ItemSlot, KeyHint, Notice } from "../coastal/CoastalUI";

export interface PlantingSeedBarProps {
  seedBelt: SeedBeltDto;
  selectedCropId: string | null;
  onSelectCrop: (cropId: string) => void;
  onCancel: () => void;
  currentSeason?: string;
  className?: string;
}

/** Resolve both browser key values and the physical digit code used by tests/controllers. */
export function plantingSeedHotkeyIndex(event: Pick<KeyboardEvent, "key" | "code">): number | null {
  const keyDigit = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : null;
  if (keyDigit !== null) return keyDigit;
  const codeMatch = /^Digit([1-9])$/.exec(event.code);
  return codeMatch ? Number(codeMatch[1]) - 1 : null;
}

export const PlantingSeedBar: React.FC<PlantingSeedBarProps> = ({
  seedBelt,
  selectedCropId,
  onSelectCrop,
  onCancel,
  currentSeason = "spring",
  className = ""
}) => {
  const availableSeeds = seedBelt.seeds;
  const selectedCrop = availableSeeds.find((seed) => seed.cropId === selectedCropId) ?? availableSeeds[0];
  const availableSeedsRef = useRef(availableSeeds);
  const onSelectCropRef = useRef(onSelectCrop);
  const onCancelRef = useRef(onCancel);
  availableSeedsRef.current = availableSeeds;
  onSelectCropRef.current = onSelectCrop;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      const seedIndex = plantingSeedHotkeyIndex(e);
      const seed = seedIndex === null ? undefined : availableSeedsRef.current[seedIndex];
      if (seed) {
        e.preventDefault();
        e.stopPropagation();
        onSelectCropRef.current(seed.cropId);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  if (availableSeeds.length === 0) {
    return (
      <div className={`planting-dock interactive ${className}`.trim()} aria-label="No seeds">
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
    <div
      className={`planting-dock interactive ${className}`.trim()}
      role="toolbar"
      aria-label="Choose a seed to plant"
      data-testid="planting-seed-dock"
    >
      <GameSheet family="ink" tone="slate" corners className="planting-dock-shell">
        <div className="planting-dock-header-row">
          <span className="planting-dock-title"><IconSprout size={13} aria-hidden="true" /> Seed Belt</span>
          <span className="planting-current-season-badge">
            Season: <strong>{currentSeason}</strong>
          </span>
        </div>

        <div className="planting-seeds-row">
          {availableSeeds.map((seed, index) => {
            const isSelected = selectedCrop?.cropId === seed.cropId;
            const hotkey = index < 9 ? `${index + 1}` : null;

            return (
              <div key={seed.cropId} className="planting-seed-item-wrapper">
                <ItemSlot
                  filled
                  quantity={seed.count}
                  selected={isSelected}
                  className={`planting-seed-card ${isSelected ? "is-selected" : ""}`}
                  soundCue="cloth"
                  onSelect={() => onSelectCrop(seed.cropId)}
                  label={`${seed.name}, ${seed.count} seeds${hotkey ? `, hotkey ${hotkey}` : ""}`}
                  title={`${seed.name} (${seed.count})${hotkey ? ` [${hotkey}]` : ""}`}
                >
                  {hotkey && (
                    <span className="seed-hotkey-badge" aria-hidden="true">
                      {hotkey}
                    </span>
                  )}
                  <AtlasImage src={atlasForSeedItem(seed.seedItemId)} alt="" size={28} />
                </ItemSlot>
              </div>
            );
          })}

          <div className="planting-dock-actions">
            <ChromeButton onClick={onCancel} title="Cancel Planting (ESC)">
              Cancel
            </ChromeButton>
            <span className="planting-hint-chip">
              <KeyHint keyName="LMB" /> Place
            </span>
          </div>
        </div>

        {selectedCrop && (
          <footer className="planting-dock-meta">
            <div className="planting-meta-left">
              <strong className="meta-value selected-crop-name">{selectedCrop.name}</strong>
            </div>

            <div className="planting-meta-right">
              <span className="meta-soil-hint">
                <IconSprout size={12} aria-hidden="true" /> Thrives in {selectedCrop.preferredClimates.map((climate) => climate.replace(/^climate\./, "").replace(/[-_]/g, " ")).join(", ") || "any climate"}
              </span>
            </div>
          </footer>
        )}
      </GameSheet>
    </div>
  );
};

import React, { useEffect, useRef } from "react";
import type { CropPlacementResult, SeedBeltDto, WorkCostQuote } from "../../simulation/core/contracts";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForSeedItem } from "../chrome/uiAtlas";
import { ChromeButton } from "../chrome/Chrome";
import { GameSheet, ItemSlot, Notice } from "../coastal/CoastalUI";
import { useTranslation } from "../../i18n/useTranslation";

export interface PlantingSeedBarProps {
  seedBelt: SeedBeltDto;
  selectedCropId: string | null;
  selectedCropName?: string | null;
  placementPreview?: CropPlacementResult | null;
  plantingWork?: WorkCostQuote | null;
  onSelectCrop: (cropId: string) => void;
  onCancel: () => void;
  currentSeason?: string;
  className?: string;
}

const SEASON_TR: Record<string, string> = {
  spring: "İlkbahar",
  summer: "Yaz",
  autumn: "Sonbahar",
  winter: "Kış"
};

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
  selectedCropName = null,
  placementPreview = null,
  plantingWork = null,
  onSelectCrop,
  onCancel,
  currentSeason = "spring",
  className = ""
}) => {
  const { locale, getLocalizedCrop, translateReason } = useTranslation();
  const isTr = locale === "tr";

  const availableSeeds = seedBelt.seeds;
  const selectedCrop = availableSeeds.find((seed) => seed.cropId === selectedCropId) ?? null;
  const exhaustedName = !selectedCrop && selectedCropId ? selectedCropName : null;
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
      <div className={`planting-dock interactive ${className}`.trim()} aria-label={isTr ? "Tohum yok" : "No seeds"}>
        <GameSheet family="ink" tone="slate" corners className="planting-dock-shell planting-dock-empty">
          <Notice urgency="caution" className="planting-no-seeds" data-testid="planting-empty">
            {isTr ? "Heybede hiç tohum yok." : "No seeds in the satchel."}
          </Notice>
          <ChromeButton onClick={onCancel}>
            {isTr ? "Ekimden vazgeç" : "Cancel planting"}
          </ChromeButton>
        </GameSheet>
      </div>
    );
  }

  const seasonDisplay = isTr ? (SEASON_TR[currentSeason.toLowerCase()] ?? currentSeason) : currentSeason;
  const ready = Boolean(placementPreview?.valid && plantingWork?.affordable !== false && selectedCrop);
  const feedback = !selectedCrop
    ? (isTr ? "Tohum seçin" : "Select seed")
    : plantingWork?.affordable === false
      ? (isTr ? `Yetersiz Emek (${plantingWork.cost} gerekli)` : `Need ${plantingWork.cost} Work`)
      : ready
        ? (plantingWork ? `${plantingWork.cost} ${isTr ? "Emek" : "Work"}` : (isTr ? "Hazır" : "Ready to plant"))
        : (plantingFeedback(placementPreview, isTr) ?? translateReason(placementPreview?.reason))
          || (isTr ? "Toprağı işaret edin" : "Point at soil");

  return (
    <div
      className={`planting-dock interactive ${className}`.trim()}
      role="toolbar"
      aria-label={isTr ? "Ekmek için bir tohum seçin" : "Choose a seed to plant"}
      data-testid="planting-seed-dock"
    >
      <span className="planting-current-season-badge">
        <strong>{seasonDisplay}</strong>
      </span>
      <span className="hint-touch sr-only">{isTr ? "Yerleştir" : "Place"}</span>

      <div
        className={`planting-placement-status ${ready ? "is-ready" : placementPreview ? "is-blocked" : "is-aiming"}`}
        role="status"
        aria-live="polite"
        data-testid="planting-placement-status"
      >
        <span className="planting-status-icon" aria-hidden="true">{ready ? "✓" : placementPreview ? "×" : "◎"}</span>
        <span className="planting-status-text">{feedback}</span>
      </div>

      <GameSheet family="ink" tone="slate" corners className="planting-dock-shell">
        <div className="planting-seed-options">
          {availableSeeds.map((seed, index) => {
            const isSelected = selectedCropId === seed.cropId;
            const hotkey = index < 9 ? `${index + 1}` : null;
            const localizedName = (isTr ? getLocalizedCrop(seed.cropId).name : null) || seed.name;
            const climates = seed.preferredClimates
              .map((climate) => climate.replace(/^climate\./, "").replace(/[-_]/g, " "))
              .join(", ") || (isTr ? "herhangi bir iklim" : "any climate");
            const slotTitle = `${localizedName} (${seed.count})${hotkey ? ` [${hotkey}]` : ""} · ${isTr ? "İklim:" : "Thrives in"} ${climates}`;

            return (
              <div key={seed.cropId} className="planting-seed-item-wrapper">
                <ItemSlot
                  filled
                  quantity={seed.count}
                  selected={isSelected}
                  className={`planting-seed-card ${isSelected ? "is-selected" : ""}`}
                  soundCue="cloth"
                  onSelect={() => onSelectCrop(seed.cropId)}
                  label={slotTitle}
                  title={slotTitle}
                >
                  {hotkey && (
                    <span className="seed-hotkey-badge" aria-hidden="true">
                      {hotkey}
                    </span>
                  )}
                  <AtlasImage src={atlasForSeedItem(seed.seedItemId)} alt="" size={28} />
                </ItemSlot>
                <span className="sr-only">
                  {localizedName} · {isTr ? "İklim:" : "Thrives in"} {climates}
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="planting-cancel-btn"
          onClick={onCancel}
          title={isTr ? "Ekimden Vazgeç (ESC)" : "Cancel Planting (ESC)"}
          aria-label={isTr ? "Ekimden Vazgeç (ESC)" : "Cancel Planting (ESC)"}
        >
          <span aria-hidden="true">✕</span>
          <span className="sr-only">{isTr ? "Vazgeç" : "Cancel Planting (ESC)"}</span>
        </button>
      </GameSheet>

      {exhaustedName && (
        <p className="planting-out-of-seeds sr-only" role="status" data-testid="planting-out-of-seeds">
          {isTr
            ? `${exhaustedName} tohumu bitti. Başka bir ürün seç.`
            : `Out of ${exhaustedName} seeds. Choose another crop.`}
        </p>
      )}
    </div>
  );
};

function plantingFeedback(preview: CropPlacementResult | null, isTr: boolean): string | null {
  switch (preview?.reasonCode) {
    case "too-far": return isTr ? "Ekim alanına yaklaşın." : "Move closer to this bed.";
    case "overlaps-crop": return isTr ? "Diğer bitkinin çevresinde yer bırakın." : "Leave space around the other crop.";
    case "invalid-surface":
    case "outside-farm": return isTr ? "Hazırlanmış toprağın içinde kalmalı." : "Must be inside prepared soil.";
    case "farm-capacity": return isTr ? "Tarla dolu." : "This farm is full.";
    case "structure-clearance": return isTr ? "Yapıların çevresinde yer bırakın." : "Leave room around buildings.";
    case "no-seed": return isTr ? "Bu tohum bitti." : "Out of these seeds.";
    default: return null;
  }
}


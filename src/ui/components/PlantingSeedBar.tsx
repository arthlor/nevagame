import { IconSprout, IconSnowflake, IconWateringCan} from "./HudIcons";
import React from "react";
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

// Maps crop growth seasons and soil preferences
const CROP_SEASON_MAP: Record<string, { seasons: string[]; soilHint: string; moisturePref: string }> = {
  "crop.wheat": {
    seasons: ["spring", "summer", "autumn"],
    soilHint: "Coastal loam · Low nutrient depletion",
    moisturePref: "Moderate moisture (15–20%)"
  },
  "crop.barley": {
    seasons: ["spring", "autumn"],
    soilHint: "Well-drained soil · Fast maturation",
    moisturePref: "Light moisture (15%)"
  },
  "crop.corn": {
    seasons: ["summer"],
    soilHint: "Rich fertile loam · High compost feeder",
    moisturePref: "High moisture (25–30%)"
  },
  "crop.tomato": {
    seasons: ["spring", "summer"],
    soilHint: "Temperate clay loam · Regular irrigation",
    moisturePref: "Moderate moisture (20%)"
  },
  "crop.potato": {
    seasons: ["spring", "autumn", "winter"],
    soilHint: "Sandy soil · Hardy tuber growth",
    moisturePref: "Low moisture (12%)"
  },
  "crop.carrot": {
    seasons: ["autumn", "winter", "spring"],
    soilHint: "Deep loose topsoil · Cold resistant",
    moisturePref: "Even moisture (18%)"
  },
  "crop.flax": {
    seasons: ["spring", "summer"],
    soilHint: "Temperate loam · Moderate nutrient feeder",
    moisturePref: "Regular moisture (20%)"
  },
  "crop.apple_tree": {
    seasons: ["spring", "autumn"],
    soilHint: "Deep orchard soil · Long-term regrowing tree",
    moisturePref: "Light moisture (10%)"
  },
  "crop.sunflower": {
    seasons: ["summer"],
    soilHint: "Sunny loam · Drought tolerant taproot",
    moisturePref: "Moderate moisture (15%)"
  },
  "crop.olive_tree": {
    seasons: ["summer", "autumn"],
    soilHint: "Warm terraced grove · Resilient regrowing tree",
    moisturePref: "Low moisture (8%)"
  }
};

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

  const seasonNormalized = currentSeason.toLowerCase();
  const selectedCropMeta = selectedCrop ? CROP_SEASON_MAP[selectedCrop.cropId] : null;
  const isSelectedInSeason = selectedCropMeta
    ? selectedCropMeta.seasons.includes(seasonNormalized)
    : true;

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
            const meta = CROP_SEASON_MAP[seed.cropId];
            const inSeason = meta ? meta.seasons.includes(seasonNormalized) : true;
            const hotkey = index < 9 ? `${index + 1}` : null;

            return (
              <div key={seed.cropId} className="planting-seed-item-wrapper">
                <ItemSlot
                  filled
                  quantity={seed.count}
                  selected={isSelected}
                  className={`planting-seed-card ${isSelected ? "is-selected" : ""} ${
                    inSeason ? "is-in-season" : "is-out-of-season"
                  }`}
                  soundCue="cloth"
                  onSelect={() => onSelectCrop(seed.cropId)}
                  label={`${seed.name}, ${seed.count} seeds${hotkey ? `, hotkey ${hotkey}` : ""}, ${inSeason ? "In season" : "Out of season"}`}
                  title={`${seed.name} (${seed.count})${hotkey ? ` [${hotkey}]` : ""} — ${inSeason ? "In season" : "Out of season: Growth penalty"}`}
                >
                  {hotkey && (
                    <span className="seed-hotkey-badge" aria-hidden="true">
                      {hotkey}
                    </span>
                  )}
                  <AtlasImage src={atlasForSeedItem(seed.seedItemId)} alt="" size={28} />
                  {/* Seasonal compatibility icon chip */}
                  <span
                    className={`seed-season-indicator ${inSeason ? "in-season" : "out-of-season"}`}
                    title={inSeason ? "In season: standard growth" : "Out of season: growth slowed"}
                    aria-hidden="true"
                  >
                    {inSeason ? "In season" : <IconSnowflake size={11} />}
                  </span>
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
              <span className={`meta-season-tag ${isSelectedInSeason ? "is-optimal" : "is-suboptimal"}`}>
                {isSelectedInSeason
                  ? <><IconSprout size={12} aria-hidden="true" /> Favorable Season</>
                  : <><IconSnowflake size={12} aria-hidden="true" /> Out of Season (Growth Slowed)</>}
              </span>
            </div>

            <div className="planting-meta-right">
              <span className="meta-soil-hint" title="Soil Suitability">
                <><IconSprout size={12} aria-hidden="true" />{` ${selectedCropMeta?.soilHint ?? `Likes: ${selectedCrop.preferredClimates.join(", ")}`}`}</>
              </span>
              {selectedCropMeta?.moisturePref && (
                <span className="meta-moisture-hint" title="Water Needs">
                  <><IconWateringCan size={12} aria-hidden="true" />{` ${selectedCropMeta.moisturePref}`}</>
                </span>
              )}
            </div>
          </footer>
        )}
      </GameSheet>
    </div>
  );
};

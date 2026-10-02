import { handleTabListKeyDown } from "../useTabListKeyboard";
import React, { useMemo, useState } from "react";
import type { AlmanacDto } from "../../simulation/core/contracts";
import { IconFish, IconSprout, IconStar } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ContentRegistry } from "../../content/ContentRegistry";
import { formatCompactDuration } from "./formatCompactDuration";
import { useTranslation } from "../../i18n/useTranslation";
import { qualityLabel } from "../../i18n/itemText";

interface AlmanacPageProps {
  almanac: AlmanacDto;
}

type AlmanacStrand = "fish" | "crops";

/** Growth time reads better as the days and hours a player actually waits. */
export const formatAlmanacDuration = formatCompactDuration;

/**
 * Water need is a rate, so it is banded rather than shown as a bare number.
 * `referenceMax` lets the almanac band authored crops (8–25/hour) against the
 * thirstiest one instead of the raw 0–100 scale, which no crop reaches.
 */
export function waterNeedLabel(waterNeed: number, referenceMax = 100, isTr = false): string {
  const scaled = (waterNeed / Math.max(1, referenceMax)) * 100;
  if (scaled >= 60) return isTr ? "Çok Susuz" : "Thirsty";
  if (scaled >= 35) return isTr ? "Dengeli" : "Steady";
  return isTr ? "Kanaatkâr" : "Hardy";
}

const HABITAT_LABELS_TR: Record<string, string> = {
  River: "Nehir",
  Lake: "Göl",
  Coast: "Kıyı",
  Offshore: "Açık Deniz",
  "Unknown waters": "Bilinmeyen sular"
};

const SEASON_LABELS_TR: Record<string, string> = {
  Spring: "İlkbahar",
  Summer: "Yaz",
  Autumn: "Sonbahar",
  Winter: "Kış",
  "All year": "Tüm yıl"
};

const TIME_WINDOW_LABELS_TR: Record<string, string> = {
  Dawn: "Şafak",
  Day: "Gündüz",
  Dusk: "Alacakaranlık",
  Night: "Gece",
  "Any hour": "Günün her saati"
};

const ROD_CLASS_LABELS_TR: Record<string, string> = {
  Willow: "Söğüt",
  River: "Nehir",
  "Heavy Sport": "Ağır Av",
  Offshore: "Açık Deniz"
};

const RARITY_LABELS_TR: Record<string, string> = {
  Common: "Yaygın",
  Uncommon: "Seyrek",
  Rare: "Nadir",
  Exceptional: "Kusursuz",
  Legendary: "Efsanevi"
};

const CLIMATE_LABELS_TR: Record<string, string> = {
  Temperate: "Ilıman",
  Arid: "Kurak",
  Humid: "Nemli",
  Warm: "Sıcak",
  Cool: "Serin",
  "Any ground": "Her toprak"
};

function translateJoinedLabels(label: string, dict: Record<string, string>): string {
  return label
    .split(" · ")
    .map((part) => dict[part.trim()] ?? part.trim())
    .join(" · ");
}

function formatJoinedLabels(label: string, dict?: Record<string, string>): string {
  return label
    .split(" · ")
    .map((part) => {
      const trimmed = part.trim();
      return dict ? (dict[trimmed] ?? trimmed) : trimmed;
    })
    .join(", ");
}

function formatAvailability(label: string, isTr: boolean): string {
  if (isTr) {
    if (label === "Strong run now" || label === "Strong run") return "Bol akın";
    if (label === "Scarce this season" || label === "Scarce") return "Kıt";
    if (label === "No current run" || label === "No run") return "Akın yok";
    const match = label.match(/Returns in (\w+)/);
    if (match) {
      const s = SEASON_LABELS_TR[match[1]] ?? match[1];
      return `${s} mevsiminde`;
    }
    return label;
  }
  if (label === "Strong run now") return "Strong run";
  if (label === "Scarce this season") return "Scarce";
  if (label === "No current run") return "No run";
  const match = label.match(/Returns in (\w+)/);
  if (match) {
    return `In ${match[1]}`;
  }
  return label;
}

export const AlmanacPage: React.FC<AlmanacPageProps> = React.memo(({ almanac }) => {
  const [strand, setStrand] = useState<AlmanacStrand>("fish");
  const [search, setSearch] = useState("");
  const { locale, getLocalizedFish, getLocalizedCrop } = useTranslation();
  const isTr = locale === "tr";

  const selectStrand = (next: AlmanacStrand, tab: HTMLElement) => {
    if (next === strand) return;
    setStrand(next);
    setSearch("");
    const pages = tab.closest<HTMLElement>(".journal-open-pages");
    if (pages) pages.scrollTop = 0;
  };

  const query = search.trim().toLocaleLowerCase(locale);
  // Thirstiest authored crop is the band ceiling; the 25 floor keeps a sane
  // scale if the registry is not ready (e.g. an isolated component test).
  const maxCropWaterNeed = useMemo(
    () => Math.max(25, ...[...ContentRegistry.crops.values()].map((crop) => crop.waterNeed)),
    []
  );
  const fish = useMemo(
    () =>
      almanac.fish.filter(
        (entry) => {
          if (query.length === 0) return true;
          const locName = isTr ? getLocalizedFish(entry.speciesId).name : "";
          const labels = isTr
            ? `${translateJoinedLabels(entry.habitatsLabel, HABITAT_LABELS_TR)} ${translateJoinedLabels(entry.seasonsLabel, SEASON_LABELS_TR)}`
            : "";
          return `${entry.name} ${locName} ${entry.habitatsLabel} ${entry.seasonsLabel} ${labels}`.toLocaleLowerCase(locale).includes(query);
        }
      ),
    [almanac.fish, query, isTr, locale, getLocalizedFish]
  );
  const crops = useMemo(
    () =>
      almanac.crops.filter(
        (entry) => {
          if (query.length === 0) return true;
          const locName = isTr ? getLocalizedCrop(entry.cropId).name : "";
          const climates = isTr ? translateJoinedLabels(entry.climatesLabel, CLIMATE_LABELS_TR) : "";
          return `${entry.name} ${locName} ${entry.climatesLabel} ${climates}`.toLocaleLowerCase(locale).includes(query);
        }
      ),
    [almanac.crops, query, isTr, locale, getLocalizedCrop]
  );

  return (
    <section className="journal-page journal-almanac-page" aria-label={isTr ? "Kıyı Almanakı" : "Coastal Almanac"}>
      <header className="almanac-header">
        <div className="almanac-strand-tabs" role="tablist" aria-label={isTr ? "Almanak bölümleri" : "Almanac strands"} onKeyDown={handleTabListKeyDown}>
          <button
            type="button"
            id="almanac-strand-tab-fish"
            role="tab"
            aria-selected={strand === "fish"}
            aria-controls="almanac-strand-panel-fish"
            tabIndex={strand === "fish" ? 0 : -1}
            className={`almanac-strand-btn${strand === "fish" ? " is-active" : ""}`}
            data-testid="almanac-strand-fish"
            onClick={(event) => selectStrand("fish", event.currentTarget)}
          >
            <IconFish size={14} aria-hidden="true" /> {isTr ? "Balık" : "Fish"}
            <span
              className="almanac-progress"
              data-testid="almanac-fish-progress"
              aria-label={isTr ? `${almanac.totalFish} balıktan ${almanac.discoveredFish} tanesi kaydedildi` : `${almanac.discoveredFish} of ${almanac.totalFish} fish recorded`}
            >
              {`${almanac.discoveredFish}/${almanac.totalFish}`}
            </span>
          </button>
          <button
            type="button"
            id="almanac-strand-tab-crops"
            role="tab"
            aria-selected={strand === "crops"}
            aria-controls="almanac-strand-panel-crops"
            tabIndex={strand === "crops" ? 0 : -1}
            className={`almanac-strand-btn${strand === "crops" ? " is-active" : ""}`}
            data-testid="almanac-strand-crops"
            onClick={(event) => selectStrand("crops", event.currentTarget)}
          >
            <IconSprout size={14} aria-hidden="true" /> {isTr ? "Mahsul" : "Crops"}
            <span
              className="almanac-progress"
              data-testid="almanac-crop-progress"
              aria-label={isTr ? `${almanac.totalCrops} mahsulden ${almanac.discoveredCrops} tanesi kaydedildi` : `${almanac.discoveredCrops} of ${almanac.totalCrops} crops recorded`}
            >
              {`${almanac.discoveredCrops}/${almanac.totalCrops}`}
            </span>
          </button>
        </div>
        <label className="almanac-search" htmlFor="almanac-search-input">
          <span className="almanac-search-label">{isTr ? "Ara" : "Search"}</span>
          <input
            id="almanac-search-input"
            type="search"
            className="almanac-search-input"
            data-testid="almanac-search"
            placeholder={strand === "fish" ? (isTr ? "Tür, su, mevsim" : "Species, water, season") : (isTr ? "Mahsul veya iklim" : "Crop or climate")}
            value={search}
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>

      {query.length > 0 && (
        <p className="almanac-search-results" role="status">
          {strand === "fish"
            ? (isTr
                ? `${fish.length} balık bulundu`
                : `${fish.length} fish found`)
            : (isTr
                ? `${crops.length} mahsul bulundu`
                : `${crops.length} crops found`)}
        </p>
      )}

      {strand === "fish" ? (
        <div
          id="almanac-strand-panel-fish"
          role="tabpanel"
          aria-labelledby="almanac-strand-tab-fish"
          tabIndex={0}
          className="almanac-tabpanel"
        >
          <ul className="almanac-list" data-testid="almanac-fish-list">
            {fish.length === 0 && <li className="almanac-empty">{isTr ? "Almanakta eşleşen kayıt bulunamadı." : "Nothing in the almanac matches that."}</li>}
            {fish.map((entry) => {
              const displayName = isTr ? getLocalizedFish(entry.speciesId).name : entry.name;
              const displayRarity = isTr ? (RARITY_LABELS_TR[entry.rarityLabel] ?? entry.rarityLabel) : entry.rarityLabel;
              const displayHabitats = isTr ? formatJoinedLabels(entry.habitatsLabel, HABITAT_LABELS_TR) : formatJoinedLabels(entry.habitatsLabel);
              const displaySeasons = isTr
                ? (entry.seasonsLabel === "All year" ? "Tüm yıl" : formatJoinedLabels(entry.seasonsLabel, SEASON_LABELS_TR))
                : (entry.seasonsLabel === "All year" ? "All year" : formatJoinedLabels(entry.seasonsLabel));
              const displayAvailability = formatAvailability(entry.seasonAvailabilityLabel, isTr);
              const displayRuns = isTr ? (entry.timeWindowsLabel === "Any hour" ? "Günün her saati" : formatJoinedLabels(entry.timeWindowsLabel, TIME_WINDOW_LABELS_TR)) : (entry.timeWindowsLabel === "Any hour" ? "Any hour" : formatJoinedLabels(entry.timeWindowsLabel));
              const displayRod = isTr ? (ROD_CLASS_LABELS_TR[entry.rodClassLabel] ?? entry.rodClassLabel) : entry.rodClassLabel;

              return (
                <li
                  key={entry.speciesId}
                  className={`almanac-entry${entry.discovered ? " is-discovered" : " is-unrecorded"}`}
                  data-testid="almanac-fish-entry"
                  data-discovered={entry.discovered ? "true" : "false"}
                >
                  <span className="almanac-entry-sprite">
                    <AtlasImage src={atlasForFish(entry.speciesId)} alt="" size={28} />
                  </span>
                  <div className="almanac-entry-body">
                    <div className="almanac-entry-head">
                      <strong>{displayName}</strong>
                      <div className="almanac-entry-badges">
                        <span className="almanac-rarity">{displayRarity}</span>
                        {entry.isSportFish && <span className="almanac-sport-tag">{isTr ? "Büyük Av" : "Sport"}</span>}
                      </div>
                    </div>
                    <dl className="almanac-facts">
                      <div><dt>{isTr ? "Sular" : "Waters"}</dt><dd>{displayHabitats}</dd></div>
                      <div><dt>{isTr ? "Şimdi" : "Now"}</dt><dd>{displayAvailability}</dd></div>
                      <div><dt>{isTr ? "Akın vakti" : "Runs"}</dt><dd>{displayRuns}</dd></div>
                      <div><dt>{isTr ? "Olta" : "Rod"}</dt><dd>{displayRod}</dd></div>
                    </dl>
                    <details className="almanac-entry-details">
                      <summary aria-label={isTr ? `${displayName} ayrıntıları` : `Details for ${displayName}`}>{isTr ? "Ayrıntılar" : "Details"}</summary>
                      <dl className="almanac-facts">
                        <div><dt>{isTr ? "Mevsim" : "Season"}</dt><dd>{displaySeasons}</dd></div>
                        <div>
                          <dt>{isTr ? "Ağırlık" : "Weight"}</dt>
                          <dd>{`${entry.weightKg.min.toFixed(1)}–${entry.weightKg.max.toFixed(1)} kg`}</dd>
                        </div>
                        <div><dt>{isTr ? "Değer" : "Value"}</dt><dd>{`${entry.baseMarketValue} G`}</dd></div>
                      </dl>
                    </details>
                    {/* A personal record only exists once the species has been met. */}
                    {entry.discovered ? (
                      <p className="almanac-personal" data-testid="almanac-personal-record">
                        <IconStar size={11} filled={true} aria-hidden="true" />
                        {isTr
                          ? ` Avlandı: ${entry.caughtCount}${entry.bestWeightKg !== null ? ` · rekor ${entry.bestWeightKg.toFixed(1)} kg` : ""}`
                          : ` Landed ${entry.caughtCount}${entry.bestWeightKg !== null ? ` · best ${entry.bestWeightKg.toFixed(1)} kg` : ""}`}
                      </p>
                    ) : (
                      <p className="almanac-personal is-unrecorded">{isTr ? "Henüz yakalanmadı" : "Not yet landed"}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div
          id="almanac-strand-panel-crops"
          role="tabpanel"
          aria-labelledby="almanac-strand-tab-crops"
          tabIndex={0}
          className="almanac-tabpanel"
        >
          <ul className="almanac-list" data-testid="almanac-crop-list">
            {crops.length === 0 && <li className="almanac-empty">{isTr ? "Almanakta eşleşen kayıt bulunamadı." : "Nothing in the almanac matches that."}</li>}
            {crops.map((entry) => {
              const displayName = isTr ? getLocalizedCrop(entry.cropId).name : entry.name;
              const displayClimates = isTr ? (entry.climatesLabel === "Any ground" ? "Her toprak" : formatJoinedLabels(entry.climatesLabel, CLIMATE_LABELS_TR)) : (entry.climatesLabel === "Any ground" ? "Any ground" : formatJoinedLabels(entry.climatesLabel));

              return (
                <li
                  key={entry.cropId}
                  className={`almanac-entry${entry.discovered ? " is-discovered" : " is-unrecorded"}`}
                  data-testid="almanac-crop-entry"
                  data-discovered={entry.discovered ? "true" : "false"}
                >
                  <span className="almanac-entry-sprite">
                    <IconSprout size={24} aria-hidden="true" />
                  </span>
                  <div className="almanac-entry-body">
                    <div className="almanac-entry-head">
                      <strong>{displayName}</strong>
                      {entry.regrows && (
                        <div className="almanac-entry-badges">
                          <span className="almanac-sport-tag">{isTr ? "Yeniden Verir" : "Regrows"}</span>
                        </div>
                      )}
                    </div>
                    <dl className="almanac-facts">
                      <div><dt>{isTr ? "Toprak" : "Ground"}</dt><dd>{displayClimates}</dd></div>
                      <div><dt>{isTr ? "Büyüme" : "Grows in"}</dt><dd>{formatAlmanacDuration(entry.growthMinutes, locale)}</dd></div>
                      <div><dt>{isTr ? "Su ihtiyacı" : "Water"}</dt><dd>{waterNeedLabel(entry.waterNeed, maxCropWaterNeed, isTr)}</dd></div>
                      <div>
                        <dt>{isTr ? "Verim" : "Yield"}</dt>
                        <dd>
                          {entry.yieldMin === entry.yieldMax
                            ? `${entry.yieldMin}`
                            : `${entry.yieldMin}–${entry.yieldMax}`}
                        </dd>
                      </div>
                    </dl>
                    {entry.discovered ? (
                      <p className="almanac-personal" data-testid="almanac-personal-record">
                        <IconStar size={11} filled={true} aria-hidden="true" />
                        {isTr
                          ? ` Hasat: ${entry.harvestedCount}${entry.bestQuality ? ` · en iyi ${qualityLabel(entry.bestQuality, locale)}` : ""}`
                          : ` Harvested ${entry.harvestedCount}${entry.bestQuality && ` · best ${entry.bestQuality}`}`}
                      </p>
                    ) : (
                      <p className="almanac-personal is-unrecorded">{isTr ? "Henüz ekilmedi" : "Not yet grown"}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
});

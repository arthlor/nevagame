import { handleTabListKeyDown } from "../useTabListKeyboard";
import React, { useMemo, useState } from "react";
import type { AlmanacDto } from "../../simulation/core/contracts";
import { IconFish, IconSprout, IconStar } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ContentRegistry } from "../../content/ContentRegistry";
import { formatCompactDuration } from "./formatCompactDuration";

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
export function waterNeedLabel(waterNeed: number, referenceMax = 100): string {
  const scaled = (waterNeed / Math.max(1, referenceMax)) * 100;
  if (scaled >= 60) return "Thirsty";
  if (scaled >= 35) return "Steady";
  return "Hardy";
}

export const AlmanacPage: React.FC<AlmanacPageProps> = ({ almanac }) => {
  const [strand, setStrand] = useState<AlmanacStrand>("fish");
  const [search, setSearch] = useState("");

  const selectStrand = (next: AlmanacStrand, tab: HTMLElement) => {
    if (next === strand) return;
    setStrand(next);
    setSearch("");
    const pages = tab.closest<HTMLElement>(".journal-open-pages");
    if (pages) pages.scrollTop = 0;
  };

  const query = search.trim().toLowerCase();
  // Thirstiest authored crop is the band ceiling; the 25 floor keeps a sane
  // scale if the registry is not ready (e.g. an isolated component test).
  const maxCropWaterNeed = useMemo(
    () => Math.max(25, ...[...ContentRegistry.crops.values()].map((crop) => crop.waterNeed)),
    []
  );
  const fish = useMemo(
    () =>
      almanac.fish.filter(
        (entry) =>
          query.length === 0
          || `${entry.name} ${entry.habitatsLabel} ${entry.seasonsLabel}`.toLowerCase().includes(query)
      ),
    [almanac.fish, query]
  );
  const crops = useMemo(
    () =>
      almanac.crops.filter(
        (entry) =>
          query.length === 0
          || `${entry.name} ${entry.climatesLabel}`.toLowerCase().includes(query)
      ),
    [almanac.crops, query]
  );

  return (
    <section className="journal-page journal-almanac-page" aria-label="Coastal Almanac">
      <header className="almanac-header">
        <div className="almanac-strand-tabs" role="tablist" aria-label="Almanac strands" onKeyDown={handleTabListKeyDown}>
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
            <IconFish size={14} aria-hidden="true" /> Fish
            <span className="almanac-progress" data-testid="almanac-fish-progress" aria-label={`${almanac.discoveredFish} of ${almanac.totalFish} fish recorded`}>
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
            <IconSprout size={14} aria-hidden="true" /> Crops
            <span className="almanac-progress" data-testid="almanac-crop-progress" aria-label={`${almanac.discoveredCrops} of ${almanac.totalCrops} crops recorded`}>
              {`${almanac.discoveredCrops}/${almanac.totalCrops}`}
            </span>
          </button>
        </div>
        <label className="almanac-search" htmlFor="almanac-search-input">
          <span className="almanac-search-label">Search</span>
          <input
            id="almanac-search-input"
            type="search"
            className="almanac-search-input"
            data-testid="almanac-search"
            placeholder={strand === "fish" ? "Species, water, season" : "Crop or climate"}
            value={search}
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>

      {query.length > 0 && (
        <p className="almanac-search-results" role="status">
          {strand === "fish"
            ? `${fish.length} of ${almanac.fish.length} fish match “${search.trim()}”`
            : `${crops.length} of ${almanac.crops.length} crops match “${search.trim()}”`}
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
            {fish.length === 0 && <li className="almanac-empty">Nothing in the almanac matches that.</li>}
            {fish.map((entry) => (
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
                    <strong>{entry.name}</strong>
                    <span className="almanac-rarity">{entry.rarityLabel}</span>
                    {entry.isSportFish && <span className="almanac-sport-tag">Sport</span>}
                  </div>
                  <dl className="almanac-facts">
                    <div><dt>Waters</dt><dd>{entry.habitatsLabel}</dd></div>
                    <div><dt>Season</dt><dd>{entry.seasonsLabel}</dd></div>
                    <div><dt>Current season</dt><dd>{entry.seasonAvailabilityLabel}</dd></div>
                    <div><dt>Runs</dt><dd>{entry.timeWindowsLabel}</dd></div>
                    <div><dt>Rod</dt><dd>{entry.rodClassLabel}</dd></div>
                    <div>
                      <dt>Weight</dt>
                      <dd>{`${entry.weightKg.min.toFixed(1)}–${entry.weightKg.max.toFixed(1)} kg`}</dd>
                    </div>
                    <div><dt>Value</dt><dd>{`${entry.baseMarketValue} G`}</dd></div>
                  </dl>
                  {/* A personal record only exists once the species has been met. */}
                  {entry.discovered ? (
                    <p className="almanac-personal" data-testid="almanac-personal-record">
                      <IconStar size={11} aria-hidden="true" />
                      {` Landed ${entry.caughtCount}`}
                      {entry.bestWeightKg !== null && ` · best ${entry.bestWeightKg.toFixed(1)} kg`}
                    </p>
                  ) : (
                    <p className="almanac-personal is-unrecorded">Not yet landed</p>
                  )}
                </div>
              </li>
            ))}
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
            {crops.length === 0 && <li className="almanac-empty">Nothing in the almanac matches that.</li>}
            {crops.map((entry) => (
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
                    <strong>{entry.name}</strong>
                    {entry.regrows && <span className="almanac-sport-tag">Regrows</span>}
                  </div>
                  <dl className="almanac-facts">
                    <div><dt>Ground</dt><dd>{entry.climatesLabel}</dd></div>
                    <div><dt>Grows in</dt><dd>{formatAlmanacDuration(entry.growthMinutes)}</dd></div>
                    <div><dt>Water</dt><dd>{`${waterNeedLabel(entry.waterNeed, maxCropWaterNeed)} (${entry.waterNeed})`}</dd></div>
                    <div>
                      <dt>Yield</dt>
                      <dd>
                        {entry.yieldMin === entry.yieldMax
                          ? `${entry.yieldMin}`
                          : `${entry.yieldMin}–${entry.yieldMax}`}
                      </dd>
                    </div>
                  </dl>
                  {entry.discovered ? (
                    <p className="almanac-personal" data-testid="almanac-personal-record">
                      <IconStar size={11} aria-hidden="true" />
                      {` Harvested ${entry.harvestedCount}`}
                      {entry.bestQuality && ` · best ${entry.bestQuality}`}
                    </p>
                  ) : (
                    <p className="almanac-personal is-unrecorded">Not yet grown</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

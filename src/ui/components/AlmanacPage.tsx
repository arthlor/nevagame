import React, { useMemo, useState } from "react";
import type { AlmanacDto } from "../../simulation/core/contracts";
import { IconFish, IconSprout, IconStar } from "./HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";

interface AlmanacPageProps {
  almanac: AlmanacDto;
}

type AlmanacStrand = "fish" | "crops";

/** Growth time reads better as the days and hours a player actually waits. */
export function formatAlmanacDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes)}m`;
}

/** Water need is a rate, so it is banded rather than shown as a bare number. */
export function waterNeedLabel(waterNeed: number): string {
  if (waterNeed >= 60) return "Thirsty";
  if (waterNeed >= 35) return "Steady";
  return "Hardy";
}

export const AlmanacPage: React.FC<AlmanacPageProps> = ({ almanac }) => {
  const [strand, setStrand] = useState<AlmanacStrand>("fish");
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
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
        <div className="almanac-strand-tabs" role="tablist" aria-label="Almanac strands">
          <button
            type="button"
            role="tab"
            aria-selected={strand === "fish"}
            tabIndex={strand === "fish" ? 0 : -1}
            className={`almanac-strand-btn${strand === "fish" ? " is-active" : ""}`}
            data-testid="almanac-strand-fish"
            onClick={() => setStrand("fish")}
          >
            <IconFish size={14} aria-hidden="true" /> Fish
            <span className="almanac-progress" data-testid="almanac-fish-progress">
              {`${almanac.discoveredFish}/${almanac.totalFish}`}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={strand === "crops"}
            tabIndex={strand === "crops" ? 0 : -1}
            className={`almanac-strand-btn${strand === "crops" ? " is-active" : ""}`}
            data-testid="almanac-strand-crops"
            onClick={() => setStrand("crops")}
          >
            <IconSprout size={14} aria-hidden="true" /> Crops
            <span className="almanac-progress" data-testid="almanac-crop-progress">
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
            placeholder="Species, water, season"
            value={search}
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>

      {strand === "fish" ? (
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
      ) : (
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
                  <div><dt>Water</dt><dd>{`${waterNeedLabel(entry.waterNeed)} (${entry.waterNeed})`}</dd></div>
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
      )}
    </section>
  );
};

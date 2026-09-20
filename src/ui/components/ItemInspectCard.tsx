import React, { useEffect, useState } from "react";
import type { ItemInspectionDto } from "../../simulation/core/contracts";
import { freshnessTone } from "../../simulation/fishing/freshnessBands";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish, atlasForItem } from "../chrome/uiAtlas";
import { formatCompactDuration } from "./formatCompactDuration";

interface ItemInspectCardProps {
  item: ItemInspectionDto;
  detailsOnly?: boolean;
  /** Cursor position to float beside. Omit to render the card in flow. */
  anchor?: { x: number; y: number } | null;
}

const CARD_WIDTH = 248;
const CARD_MARGIN = 12;
/** Kept clear of the cursor so the card never sits under the pointer itself. */
const CURSOR_OFFSET = 16;

/** Hours of open carry left, from the storage multiplier the simulation applies. */
export function freshnessToneFor(percent: number): "good" | "caution" | "danger" {
  return FRESHNESS_TONE_CLASS[freshnessTone(percent)];
}

/** The card's CSS vocabulary for the shared freshness band. */
const FRESHNESS_TONE_CLASS = { fresh: "good", medium: "caution", stale: "danger" } as const;

/** Growth minutes read better as the days and hours a player actually waits. */
export const formatGrowthDuration = formatCompactDuration;

const CLIMATE_LABEL = (climate: string): string =>
  climate.replace(/^climate\./, "").replace(/[-_]/g, " ");

export const ItemInspectCard: React.FC<ItemInspectCardProps> = ({ item, anchor = null, detailsOnly = false }) => {
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const read = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  // Flip the card to the other side of the cursor rather than let it run off
  // the edge, and clamp vertically so a tall card stays fully readable.
  const floatStyle: React.CSSProperties | undefined = (() => {
    if (!anchor || !viewport) return undefined;
    const overflowsRight = anchor.x + CURSOR_OFFSET + CARD_WIDTH > viewport.w - CARD_MARGIN;
    const left = overflowsRight
      ? Math.max(CARD_MARGIN, anchor.x - CURSOR_OFFSET - CARD_WIDTH)
      : anchor.x + CURSOR_OFFSET;
    return {
      position: "fixed",
      left: `${Math.round(left)}px`,
      top: `${Math.round(Math.max(CARD_MARGIN, Math.min(viewport.h - CARD_MARGIN, anchor.y)))}px`,
      width: `${CARD_WIDTH}px`
    };
  })();

  const rarityTier = item.rarity?.tier ?? "plain";
  const sprite = atlasForItem(item.itemId) ?? atlasForFish(item.itemId);

  return (
    <aside
      className={`item-inspect-card rarity--${rarityTier}${anchor ? " is-floating" : ""}`}
      style={floatStyle}
      role={anchor ? "tooltip" : "region"}
      aria-label={anchor ? undefined : "Item facts"}
      data-testid="item-inspect-card"
      data-rarity={rarityTier}
      data-floating={anchor ? "true" : "false"}
    >
      {!detailsOnly && <header className="item-inspect-head">
        <span className="item-inspect-sprite">
          <AtlasImage src={sprite} alt="" size={34} />
        </span>
        <span className="item-inspect-titles">
          <strong className="item-inspect-name">{item.name}</strong>
          <span className="item-inspect-sub">
            <span className="item-inspect-category">{item.categoryLabel}</span>
            {item.rarity && (
              <span className="item-inspect-rarity" data-testid="item-inspect-rarity">
                {item.rarity.label}
              </span>
            )}
          </span>
        </span>
      </header>}

      <dl className="item-inspect-stats">
        <div>
          <dt>Base value</dt>
          <dd data-testid="item-inspect-value">{`${item.baseValue.toLocaleString()} G`}</dd>
        </div>
        <div>
          <dt>Stacks to</dt>
          <dd>{item.stackLimit}</dd>
        </div>
      </dl>

      {item.freshness && (
        <section className="item-inspect-freshness" data-testid="item-inspect-freshness">
          <div className="item-inspect-freshness-head">
            <span>Freshness</span>
            <strong data-tone={freshnessToneFor(item.freshness.percent)}>
              {`${item.freshness.percent}% · ${item.freshness.label}`}
            </strong>
          </div>
          <div
            className={`item-inspect-freshness-track tone-${freshnessToneFor(item.freshness.percent)}`}
            aria-hidden="true"
          >
            <span
              className="item-inspect-freshness-fill"
              style={{ width: `${item.freshness.percent}%` }}
            />
          </div>
          {/* Storage is the lever the player controls, so it is named with the
              rate it applies rather than left implicit. */}
          <span className="item-inspect-freshness-note">
            {`${item.freshness.storageLabel} · spoils at ${item.freshness.decayRate.toFixed(2)}×`}
          </span>
        </section>
      )}

      {item.agronomy && (
        <section className="item-inspect-agronomy" data-testid="item-inspect-agronomy">
          <h4>{item.agronomy.cropName}</h4>
          <dl className="item-inspect-agronomy-grid">
            <div>
              <dt>Water need</dt>
              <dd>{item.agronomy.waterNeed}</dd>
            </div>
            <div>
              <dt>Grows in</dt>
              <dd>{formatGrowthDuration(item.agronomy.growthMinutes)}</dd>
            </div>
            <div>
              <dt>Yield</dt>
              <dd>
                {item.agronomy.yieldMin === item.agronomy.yieldMax
                  ? `${item.agronomy.yieldMin}`
                  : `${item.agronomy.yieldMin}–${item.agronomy.yieldMax}`}
              </dd>
            </div>
            <div>
              <dt>Soil cost</dt>
              <dd>{item.agronomy.fertilityCost}</dd>
            </div>
          </dl>
          {item.agronomy.preferredClimates.length > 0 && (
            <p className="item-inspect-climates">
              <span>Thrives in</span>
              {item.agronomy.preferredClimates.map((climate) => (
                <span key={climate} className="item-inspect-climate-chip">
                  {CLIMATE_LABEL(climate)}
                </span>
              ))}
            </p>
          )}
          {item.agronomy.regrows && (
            <p className="item-inspect-regrow">
              {item.agronomy.regrowMinutes
                ? `Regrows every ${formatGrowthDuration(item.agronomy.regrowMinutes)}`
                : "Regrows after harvest"}
            </p>
          )}
        </section>
      )}

      {!detailsOnly && item.loreText && <p className="item-inspect-lore">{item.loreText}</p>}
    </aside>
  );
};

import React, { useState } from "react";
import {
  CHRONICLE_FILTERS,
  CHRONICLE_FILTER_LABEL,
  type ChronicleEntry,
  type ChronicleFilter
} from "../notifications";
import { playUiSound } from "../audio/uiAudio";
import { handleTabListKeyDown } from "../useTabListKeyboard";
import { useTranslation } from "../../i18n/useTranslation";

interface CoastalChronicleProps {
  entries: readonly ChronicleEntry[];
  activeFilter: ChronicleFilter;
  onSelectFilter: (filter: ChronicleFilter) => void;
}

/** Rows shown while expanded; the rest stay in the log for the folio. */
export const CHRONICLE_VISIBLE_ROWS = 6;

/**
 * In-world clock time of an entry. The log reads as the day's record, so it is
 * stamped with the game's hour rather than how long the tab has been open.
 */
export function formatChronicleTime(gameMinute: number): string {
  if (!Number.isFinite(gameMinute) || gameMinute < 0) return "--:--";
  const minuteOfDay = Math.floor(gameMinute) % 1440;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const getChronicleFilterLabel = (filter: ChronicleFilter, isTr: boolean): string => {
  if (!isTr) return CHRONICLE_FILTER_LABEL[filter];
  switch (filter) {
    case "all": return "Tümü";
    case "trade": return "Ticaret";
    case "field": return "Tarla ve Deniz";
    case "story": return "Hikâye";
    default: return CHRONICLE_FILTER_LABEL[filter];
  }
};

export const CoastalChronicle: React.FC<CoastalChronicleProps> = ({
  entries,
  activeFilter,
  onSelectFilter
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const [expanded, setExpanded] = useState(true);

  const visible = entries.filter((entry) => activeFilter === "all" || entry.category === activeFilter)
    .slice(0, CHRONICLE_VISIBLE_ROWS);

  return (
    <section
      className={`coastal-chronicle${expanded ? " is-expanded" : " is-collapsed"}`}
      data-testid="coastal-chronicle"
      data-expanded={expanded ? "true" : "false"}
      aria-label={isTr ? "Kıyı vakanüvisi" : "Coastal chronicle"}
    >
      <button
        type="button"
        className="chronicle-toggle"
        data-testid="chronicle-toggle"
        aria-expanded={expanded}
        aria-controls="chronicle-feed"
        onClick={() => {
          playUiSound("click");
          setExpanded((previous) => !previous);
        }}
      >
        <span className="chronicle-toggle-caret" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span className="chronicle-toggle-label">{isTr ? "Vakanüvis" : "Chronicle"}</span>
        <span className="chronicle-toggle-count" data-testid="chronicle-count">{entries.length}</span>
      </button>

      {expanded && (
        <>
          <div className="chronicle-filters" role="tablist" aria-label={isTr ? "Kayıt başlıkları" : "Chronicle strands"} onKeyDown={handleTabListKeyDown}>
            {CHRONICLE_FILTERS.map((filter) => (
              <button
                type="button"
                key={filter}
                role="tab"
                aria-selected={activeFilter === filter}
                tabIndex={activeFilter === filter ? 0 : -1}
                className={`chronicle-filter-btn${activeFilter === filter ? " is-active" : ""}`}
                data-testid={`chronicle-filter-${filter}`}
                onClick={() => {
                  playUiSound("click");
                  onSelectFilter(filter);
                }}
              >
                {getChronicleFilterLabel(filter, isTr)}
              </button>
            ))}
          </div>

          <ol className="chronicle-feed" id="chronicle-feed" data-testid="chronicle-feed">
            {visible.length === 0 ? (
              <li className="chronicle-empty">
                {activeFilter === "all"
                  ? (isTr ? "Bugün henüz bir kayıt düşülmedi." : "Nothing logged yet today.")
                  : (isTr ? `${getChronicleFilterLabel(activeFilter, isTr)} altında henüz bir kayıt yok.` : `Nothing under ${CHRONICLE_FILTER_LABEL[activeFilter]} yet.`)}
              </li>
            ) : (
              visible.map((entry) => (
                <li
                  key={entry.id}
                  className={`chronicle-row tone-${entry.tone}`}
                  data-testid="chronicle-row"
                  data-category={entry.category}
                >
                  <span className="chronicle-row-time">{formatChronicleTime(entry.gameMinute)}</span>
                  <span className="chronicle-row-text">{entry.text}</span>
                  {entry.count > 1 && (
                    <span className="chronicle-row-count">{`x${entry.count}`}</span>
                  )}
                </li>
              ))
            )}
          </ol>
        </>
      )}
    </section>
  );
};

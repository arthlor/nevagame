import React, { useEffect, useRef, useState } from "react";
import {
  CHRONICLE_FILTERS,
  CHRONICLE_FILTER_LABEL,
  type ChronicleEntry,
  type ChronicleFilter
} from "../notifications";
import { playUiSound } from "../audio/uiAudio";

interface CoastalChronicleProps {
  entries: readonly ChronicleEntry[];
  activeFilter: ChronicleFilter;
  onSelectFilter: (filter: ChronicleFilter) => void;
  /** Milliseconds of quiet before the feed folds itself away. */
  autoCollapseMs?: number;
}

export const CHRONICLE_AUTO_COLLAPSE_MS = 12000;
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

export const CoastalChronicle: React.FC<CoastalChronicleProps> = ({
  entries,
  activeFilter,
  onSelectFilter,
  autoCollapseMs = CHRONICLE_AUTO_COLLAPSE_MS
}) => {
  const [expanded, setExpanded] = useState(false);
  const [held, setHeld] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Auto-collapse keeps the corner quiet during play, but never folds the feed
  // away while the player is actually reading it.
  useEffect(() => {
    if (!expanded || held) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setExpanded(false), autoCollapseMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [expanded, held, autoCollapseMs, entries.length]);

  const visible = entries.slice(0, CHRONICLE_VISIBLE_ROWS);

  return (
    <section
      className={`coastal-chronicle${expanded ? " is-expanded" : " is-collapsed"}`}
      data-testid="coastal-chronicle"
      data-expanded={expanded ? "true" : "false"}
      data-held={held ? "true" : "false"}
      aria-label="Coastal chronicle"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
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
        <span className="chronicle-toggle-label">Chronicle</span>
        <span className="chronicle-toggle-count" data-testid="chronicle-count">{entries.length}</span>
      </button>

      {expanded && (
        <>
          <div className="chronicle-filters" role="tablist" aria-label="Chronicle strands">
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
                {CHRONICLE_FILTER_LABEL[filter]}
              </button>
            ))}
          </div>

          <ol className="chronicle-feed" id="chronicle-feed" data-testid="chronicle-feed">
            {visible.length === 0 ? (
              <li className="chronicle-empty">
                {activeFilter === "all"
                  ? "Nothing logged yet today."
                  : `Nothing under ${CHRONICLE_FILTER_LABEL[activeFilter]} yet.`}
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

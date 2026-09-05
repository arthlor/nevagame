import React, { useEffect, useMemo, useRef, useState } from "react";
import { IconAnchor, IconRod, IconSprout, IconWaves, IconSparkle} from "./HudIcons";
import { ChromeClose } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";

export type HintCategory = "boating" | "angling" | "farming" | "weather" | "general";

export interface ContextualHintCardProps {
  hintId: string;
  title: string;
  message: string;
  category?: HintCategory;
  icon?: string;
  onDismiss: (hintId: string) => void;
  /** When false, Escape is left for an open modal instead of dismissing this card. */
  captureEscape?: boolean;
  className?: string;
}

/** Dismiss budget scales with reading length: 40ms per character. */
export const HINT_DISMISS_PER_CHAR_MS = 40;
/** Floor so even a one-line nudge stays readable. */
export const HINT_DISMISS_MIN_MS = 5000;
/** Cap so a long hint never lingers. */
export const HINT_DISMISS_MAX_MS = 15000;

/** Visible duration for a hint, scaled to its message length. */
export function hintVisibleMs(message: string): number {
  return Math.min(
    HINT_DISMISS_MAX_MS,
    Math.max(HINT_DISMISS_MIN_MS, message.length * HINT_DISMISS_PER_CHAR_MS)
  );
}

const CATEGORY_META: Record<HintCategory, { label: string; icon: string }> = {
  boating: { label: "NAVIGATION", icon: "anchor" },
  angling: { label: "ANGLING", icon: "rod" },
  farming: { label: "AGRONOMY", icon: "sprout" },
  weather: { label: "WEATHER", icon: "waves" },
  general: { label: "DISCOVERY", icon: "sparkle" }
};

export function inferHintCategory(hintId: string): HintCategory {
  if (hintId.includes("boat") || hintId.includes("maritime") || hintId.includes("navigation")) return "boating";
  if (hintId.includes("fishing") || hintId.includes("cargo") || hintId.includes("angling")) return "angling";
  if (hintId.includes("farm") || hintId.includes("work") || hintId.includes("crop") || hintId.includes("processing")) return "farming";
  if (hintId.includes("weather") || hintId.includes("season") || hintId.includes("storm") || hintId.includes("fog")) return "weather";
  return "general";
}

/** Category insignia, drawn rather than glyphed. */
const HintCategoryMark: React.FC<{ name: string }> = ({ name }) => {
  if (name === "anchor") return <IconAnchor size={16} />;
  if (name === "rod") return <IconRod size={16} />;
  if (name === "sprout") return <IconSprout size={16} />;
  if (name === "waves") return <IconWaves size={16} />;
  return <IconSparkle size={16} />;
};

export const ContextualHintCard: React.FC<ContextualHintCardProps> = ({
  hintId,
  title,
  message,
  category,
  icon,
  onDismiss,
  captureEscape = true,
  className = ""
}) => {
  const [visible, setVisible] = useState(true);
  const [held, setHeld] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const resolvedCategory = category ?? inferHintCategory(hintId);
  const categoryMeta = CATEGORY_META[resolvedCategory] ?? CATEGORY_META.general;
  const displayIcon = icon ?? categoryMeta.icon;

  const visibleMs = useMemo(() => hintVisibleMs(message), [message]);

  useEffect(() => {
    setVisible(true);
    if (held) return;
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current(hintId);
    }, visibleMs);

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !captureEscape) return;
      event.preventDefault();
      event.stopPropagation();
      setVisible(false);
      onDismissRef.current(hintId);
    };

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [hintId, captureEscape, held, visibleMs]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(hintId);
  };

  if (!visible) return null;

  return (
    <GameSheet
      family="ink"
      className={`contextual-hint-card interactive hint-category--${resolvedCategory} ${className}`.trim()}
      tone="slate"
      corners
      role="status"
      aria-live="polite"
      tabIndex={0}
      data-testid="contextual-hint"
      data-category={resolvedCategory}
      data-held={held ? "true" : "false"}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || (captureEscape && e.key === "Escape")) {
          e.preventDefault();
          e.stopPropagation();
          handleDismiss();
        }
      }}
    >
      <div className="hint-card-icon" aria-hidden="true">
        <HintCategoryMark name={displayIcon} />
      </div>
      <div className="hint-card-body">
        <div className="hint-card-meta-row">
          <span className="hint-category-badge">{categoryMeta.label}</span>
          <span className="hint-card-esc-badge">
            <kbd>[Esc]</kbd> Dismiss
          </span>
        </div>
        <strong className="hint-card-title">{title}</strong>
        <p className="hint-card-message">{message}</p>
      </div>
      <ChromeClose
        className="hint-card-close-btn"
        label="Dismiss hint"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
      />
      <div className="hint-card-progress" aria-hidden="true">
        <div
          key={hintId}
          className="hint-card-progress-fill"
          style={{
            animationDuration: `${visibleMs}ms`,
            animationPlayState: held ? "paused" : "running"
          }}
        />
      </div>
    </GameSheet>
  );
};

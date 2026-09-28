import React from "react";
import { AtlasImage } from "./AtlasImage";
import { qualitySpriteKey, UI_QUALITY } from "./uiAtlas";
import { playAcceptedUiDing } from "../audio/uiAudio";
import { FiligreeCornerTL, FiligreeCornerBR } from "../HudDecorations";

type PanelTag = "div" | "aside" | "section" | "header" | "article" | "nav" | "footer";

export type ChromeTone = "slate" | "timber" | "scroll" | "dock" | "ghost" | "plaque";

export interface ChromePanelProps extends React.HTMLAttributes<HTMLElement> {
  as?: PanelTag;
  /** Slate glass, Timber wood, Aged scroll, Docked HUD, or Minimal ghost. */
  tone?: ChromeTone;
  flourish?: boolean;
  corners?: boolean;
  rivets?: boolean;
  seal?: boolean;
  ribbon?: string;
}

export const ChromePanel = React.forwardRef<HTMLElement, ChromePanelProps>(
  (
    {
      as: Tag = "div",
      flourish = false,
      corners = false,
      rivets,
      seal = false,
      ribbon,
      tone = "slate",
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    // plaque maps to slate for backward compatibility while retaining class
    const resolvedTone = tone === "plaque" ? "slate" : tone;
    const showRivets = rivets === true;
    const showFlourish = flourish === true;

    return (
      <Tag
        ref={ref as React.Ref<HTMLDivElement>}
        className={`chrome-panel chrome-panel--${resolvedTone} ${tone === "plaque" ? "chrome-panel--plaque" : ""}${
          showFlourish ? " chrome-panel--flourish" : ""
        }${corners ? " chrome-panel--corners" : ""}${seal ? " chrome-panel--sealed" : ""} ${className}`.trim()}
        {...rest}
      >
        {ribbon && (
          <div className="chrome-ribbon-banner" aria-hidden="true">
            <span>{ribbon}</span>
          </div>
        )}
        {showRivets && (
          <>
            <span className="chrome-rivet chrome-rivet--tl" aria-hidden="true" />
            <span className="chrome-rivet chrome-rivet--tr" aria-hidden="true" />
            <span className="chrome-rivet chrome-rivet--bl" aria-hidden="true" />
            <span className="chrome-rivet chrome-rivet--br" aria-hidden="true" />
          </>
        )}
        {showFlourish && (
          <>
            <span className="chrome-flourish chrome-flourish--tl" aria-hidden="true">
              <FiligreeCornerTL size={28} />
            </span>
            <span className="chrome-flourish chrome-flourish--br" aria-hidden="true">
              <FiligreeCornerBR size={28} />
            </span>
          </>
        )}
        {seal && (
          <span className="chrome-wax-seal" aria-hidden="true">
            <AtlasImage src={UI_QUALITY.iridium} size={32} />
          </span>
        )}
        {children}
      </Tag>
    );
  }
);
ChromePanel.displayName = "ChromePanel";

export const ChromeWaxSeal: React.FC<{ insignia?: string; className?: string }> = ({ insignia, className = "" }) => (
  <span className={`chrome-wax-seal ${className}`.trim()} aria-hidden="true">
    <AtlasImage src={UI_QUALITY.iridium} size={32} />
    {insignia && <span className="chrome-wax-insignia">{insignia}</span>}
  </span>
);

export const ChromeRibbon: React.FC<{ label: string; className?: string }> = ({ label, className = "" }) => (
  <div className={`chrome-ribbon-banner ${className}`.trim()} aria-hidden="true">
    <span>{label}</span>
  </div>
);

export interface ChromeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "gold" | "danger" | "ghost" | "teal";
  soundCue?: string;
  size?: "sm" | "md" | "lg";
}

export const ChromeButton = React.forwardRef<HTMLButtonElement, ChromeButtonProps>(
  ({ variant = "secondary", soundCue = "click", size = "md", className = "", type = "button", onClick, children, ...rest }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!rest.disabled) {
        playAcceptedUiDing(e.currentTarget, soundCue);
      }
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type={type}
        className={`neva-button neva-button-${variant} neva-button--${size} ${className}`.trim()}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
ChromeButton.displayName = "ChromeButton";

export const ChromeClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; soundCue?: string }
>(({ label = "Close", soundCue = "click", className = "", onClick, ...rest }, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!rest.disabled) {
      playAcceptedUiDing(e.currentTarget, soundCue);
    }
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`chrome-close ${className}`.trim()}
      aria-label={label}
      onClick={handleClick}
      {...rest}
    >
      <span className="chrome-close-mark" aria-hidden="true">
        ×
      </span>
    </button>
  );
});
ChromeClose.displayName = "ChromeClose";

export const ChromeKeycap: React.FC<{
  children?: React.ReactNode;
  keyName?: string;
  className?: string;
  glow?: boolean;
}> = ({ children, keyName, className = "", glow = false }) => (
  <span className={`hud-keycap-badge chrome-keycap ${glow ? "is-glowing" : ""} ${className}`.trim()}>
    {children ?? keyName}
  </span>
);

export const ChromeDivider: React.FC<{ className?: string; ornate?: boolean }> = ({ className = "", ornate = true }) => (
  <div className={`chrome-divider ${ornate ? "chrome-divider--ornate" : ""} ${className}`.trim()} aria-hidden="true">
    <span />
    <i />
    <span />
  </div>
);

export interface ChromeMeterProps {
  label: string;
  value: number;
  max: number;
  valueText?: string;
  fill?: "labor" | "sprint" | "hull" | "fishing" | "danger" | "gold" | "stamina";
  variant?: "labor" | "sprint" | "hull" | "fishing" | "danger" | "gold" | "stamina";
  icon?: React.ReactNode;
  className?: string;
  orientation?: "horizontal" | "vertical";
  showLabel?: boolean;
  showValue?: boolean;
}

export const ChromeMeter: React.FC<ChromeMeterProps & React.HTMLAttributes<HTMLDivElement>> = ({
  label,
  value,
  max,
  valueText,
  fill,
  variant,
  icon,
  className = "",
  orientation = "horizontal",
  showLabel = true,
  showValue = true,
  ...rest
}) => {
  const resolvedFill = fill ?? variant ?? "fishing";
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const readout = valueText ?? `${Math.round(value)} / ${Math.round(max)}`;
  const compact = !showLabel && !showValue;
  const variantClass = variant && variant !== resolvedFill ? ` chrome-meter--${variant}` : "";
  return (
    <div
      className={`chrome-meter chrome-meter--${resolvedFill}${variantClass} chrome-meter--${orientation}${
        compact ? " chrome-meter--icon" : ""
      } ${className}`.trim()}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={readout}
      {...rest}
    >
      {(icon || showLabel || showValue) && (
        <div className="chrome-meter-head">
          {icon}
          {showLabel && <span className="chrome-meter-label">{label}</span>}
          {showValue && <span className="chrome-meter-value">{readout}</span>}
        </div>
      )}
      <div className="chrome-meter-track" aria-hidden="true">
        <span style={orientation === "vertical" ? { height: `${percent}%` } : { width: `${percent}%` }} />
      </div>
    </div>
  );
};

/** Metal and pip count per tier; the pips carry the tier without relying on colour. */
const QUALITY_MEDALLION = {
  normal: { pips: 1, light: "#d9a36a", mid: "#9a6334", dark: "#5a3518" },
  silver: { pips: 2, light: "#f1f3f4", mid: "#a9b0b6", dark: "#5d646b" },
  gold: { pips: 3, light: "#ffe29a", mid: "#d49a2a", dark: "#7a4f0c" },
  iridium: { pips: 4, light: "#e9d5ff", mid: "#a47ad6", dark: "#4f2f78" }
} as const;

const PIP_LAYOUT: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  1: [[12, 12]],
  2: [[8.6, 12], [15.4, 12]],
  3: [[12, 8.4], [8.4, 14.6], [15.6, 14.6]],
  4: [[12, 7.6], [7.6, 12], [16.4, 12], [12, 16.4]]
};

/**
 * Item-neutral quality medallion. Quality is a badge over the item's own icon,
 * so it never carries a motif (such as a fish) that could read as identity.
 */
export const QualityMedallion: React.FC<{ quality?: string | null; size?: number }> = ({ quality, size = 20 }) => {
  const key = qualitySpriteKey(quality);
  const tier = QUALITY_MEDALLION[key];
  const id = React.useId().replace(/:/g, "");
  return (
    <svg className={`atlas-image chrome-quality-medallion chrome-quality-medallion--${key}`} width={size} height={size}
      viewBox="0 0 24 24" aria-hidden="true" data-quality-pips={tier.pips}>
      <defs>
        <radialGradient id={`${id}-face`} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor={tier.light} />
          <stop offset="60%" stopColor={tier.mid} />
          <stop offset="100%" stopColor={tier.dark} />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tier.light} />
          <stop offset="100%" stopColor={tier.dark} />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12.6" r="11" fill="rgba(20,12,4,0.45)" />
      <circle cx="12" cy="12" r="11" fill={`url(#${id}-rim)`} />
      <circle cx="12" cy="12" r="8.6" fill={`url(#${id}-face)`} stroke={tier.dark} strokeWidth="0.8" />
      <path d="M5.2 9.4a7.4 7.4 0 0 1 13.6 0" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" strokeLinecap="round" />
      {PIP_LAYOUT[tier.pips].map(([cx, cy], index) => (
        <path key={index} d={`M${cx} ${cy - 2.3}L${cx + 2.3} ${cy}L${cx} ${cy + 2.3}L${cx - 2.3} ${cy}Z`}
          fill={tier.light} stroke={tier.dark} strokeWidth="0.7" strokeLinejoin="round" />
      ))}
    </svg>
  );
};

export const ChromeQuality: React.FC<{ quality?: string | null; className?: string; showLabel?: boolean }> = ({
  quality = "normal",
  className = "",
  showLabel = true
}) => {
  const key = qualitySpriteKey(quality);
  const label = quality || key;
  return (
    <span className={`chrome-quality chrome-quality--${key} ${className}`.trim()} title={`${label} quality`}
      data-testid="quality-badge" data-quality={key}>
      <QualityMedallion quality={quality} />
      {showLabel && <span>{label}</span>}
    </span>
  );
};

export const ChromeAlert: React.FC<{
  tone?: "caution" | "danger" | "success" | "info";
  children: React.ReactNode;
  className?: string;
}> = ({ tone = "caution", children, className = "" }) => (
  <div className={`chrome-alert chrome-alert--${tone} ${className}`.trim()} role="status">
    {children}
  </div>
);

export interface ChromeSlotProps extends React.HTMLAttributes<HTMLElement> {
  filled?: boolean;
  quantity?: number | null;
  selected?: boolean;
  slotNumber?: number | string;
  badge?: React.ReactNode;
  rarity?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLElement>) => void;
  onSelect?: () => void;
  label?: string;
  soundCue?: string;
}

export const ChromeSlot: React.FC<ChromeSlotProps> = ({
  filled = false,
  quantity,
  selected = false,
  slotNumber,
  badge,
  rarity,
  className = "",
  children,
  onClick,
  onSelect,
  label,
  soundCue = "click",
  ...rest
}) => {
  const classNames = `chrome-slot ${filled ? "is-filled" : "is-empty"} ${
    selected ? "is-selected" : ""
  } ${rarity ? `chrome-slot--${rarity}` : ""} ${className}`.trim();

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    playAcceptedUiDing(e.currentTarget, soundCue);
    onClick?.(e);
    onSelect?.();
  };

  const body = (
    <>
      {slotNumber != null && <span className="chrome-slot-num">{slotNumber}</span>}
      {children}
      {filled && quantity != null && <span className="chrome-slot-qty">{quantity}</span>}
      {badge && <span className="chrome-slot-badge">{badge}</span>}
    </>
  );

  if (onClick || onSelect) {
    return (
      <button
        type="button"
        className={classNames}
        onClick={handleClick}
        aria-label={label}
        aria-pressed={selected}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={classNames} aria-label={label} {...rest}>
      {body}
    </div>
  );
};

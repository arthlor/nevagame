import React from "react";
import { AtlasImage } from "./AtlasImage";
import { atlasForQuality, qualitySpriteKey, UI_QUALITY } from "./uiAtlas";
import { playUiSound } from "../audio/uiAudio";
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
        playUiSound(soundCue);
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
      playUiSound(soundCue);
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

export const ChromeQuality: React.FC<{ quality?: string | null; className?: string; showLabel?: boolean }> = ({
  quality = "normal",
  className = "",
  showLabel = true
}) => {
  const key = qualitySpriteKey(quality);
  const label = quality || key;
  return (
    <span className={`chrome-quality chrome-quality--${key} ${className}`.trim()} title={`${label} quality`}>
      <AtlasImage src={atlasForQuality(quality)} alt="" size={20} />
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
    playUiSound(soundCue);
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

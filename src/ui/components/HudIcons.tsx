// src/ui/components/HudIcons.tsx
import React from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_MENU, UI_STATUS, UI_TIME, UI_TOOLS, UI_WEATHER, UI_WORLD } from "../chrome/uiAtlas";

export interface IconProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
  title?: string;
}

const AtlasIcon: React.FC<IconProps & { src: string }> = ({ src, size = 18, className, ...rest }) => (
  <AtlasImage src={src} size={size} className={`hud-atlas-icon ${className ?? ""}`.trim()} {...rest} />
);

export const IconCoin: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.coin} size={20} {...props} />;
export const IconEnergy: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.labor} size={18} {...props} />;
export const IconWarning: React.FC<IconProps> = (props) => <AtlasIcon src={UI_STATUS.warning} size={16} {...props} />;

export const IconSatchel: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.backpack} size={18} {...props} />;
export const IconJournal: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.journal} size={16} {...props} />;
export const IconLedger: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.ledger} size={16} {...props} />;
export const IconCompass: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.compass} size={16} {...props} />;
export const IconExpedition: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.expedition} size={16} {...props} />;
export const IconMenu: React.FC<IconProps> = (props) => <AtlasIcon src={UI_MENU.menu} size={16} {...props} />;

export const IconSprout: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.sprout} size={18} {...props} />;
export const IconFish: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.fish} size={18} {...props} />;
export const IconBoat: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WORLD.boat} size={18} {...props} />;

export const IconSun: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.sun} size={18} {...props} />;
export const IconMoon: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.moon} size={18} {...props} />;
export const IconDawn: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.dawn} size={18} {...props} />;
export const IconDusk: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TIME.dusk} size={18} {...props} />;
export const IconWeatherClear: React.FC<IconProps> = (props) => <IconSun {...props} />;
export const IconWeatherOvercast: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.overcast} size={18} {...props} />;
export const IconWeatherLightRain: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER["light-rain"]} size={18} {...props} />;
export const IconWeatherRain: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.rain} size={18} {...props} />;
export const IconWeatherStorm: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.storm} size={18} {...props} />;
export const IconWeatherFog: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.fog} size={18} {...props} />;
export const IconThermometer: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.thermometer} size={16} {...props} />;
export const IconWind: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.wind} size={16} {...props} />;
export const IconWave: React.FC<IconProps> = (props) => <AtlasIcon src={UI_WEATHER.wave} size={16} {...props} />;

export const IconHoe: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.hoe} size={24} {...props} />;
export const IconAxe: React.FC<IconProps> = (props) => <IconHoe {...props} />;
export const IconWateringCan: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.watering_can} size={24} {...props} />;
export const IconBait: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.bait} size={24} {...props} />;
export const IconRod: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.rod} size={24} {...props} />;
export const IconPickaxe: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.pickaxe} size={24} {...props} />;
export const IconBasket: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.basket} size={24} {...props} />;
export const IconTools: React.FC<IconProps> = (props) => <AtlasIcon src={UI_TOOLS.hoe} size={24} {...props} />;

/* ==========================================================================
   INLINE SVG MARKS
   The packed UI atlas is generated from authored art, so subjects it does not
   carry are drawn here instead of reaching for an emoji glyph. All of these
   inherit `currentColor` so they take the tone of whatever chip or row holds
   them, and none of them carry their own colour.
   ========================================================================== */

const Svg: React.FC<IconProps & { children: React.ReactNode; viewBox?: string }> = ({
  size = 16,
  className,
  children,
  viewBox = "0 0 16 16",
  title,
  ...rest
}) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill="none"
    className={`hud-svg-icon ${className ?? ""}`.trim()}
    role={title ? "img" : undefined}
    aria-hidden={title ? undefined : "true"}
    focusable="false"
    {...rest}
  >
    {title && <title>{title}</title>}
    {children}
  </svg>
);

/** Map pin, for objective and delivery locations. */
export const IconPin: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path
      d="M8 1.6c-2.4 0-4.3 1.9-4.3 4.3 0 3.1 4.3 8.5 4.3 8.5s4.3-5.4 4.3-8.5c0-2.4-1.9-4.3-4.3-4.3Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="5.9" r="1.6" fill="currentColor" />
  </Svg>
);

/** Crate, for a physical trade pack carried on the back. */
export const IconPack: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M2.2 5.1 8 2.2l5.8 2.9v5.8L8 13.8l-5.8-2.9V5.1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M2.2 5.1 8 8l5.8-2.9M8 8v5.8" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
  </Svg>
);

/** Anchor, for harbours and moorings. */
export const IconAnchor: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <circle cx="8" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M8 4.6v9M4.8 7h6.4M2.6 9.6a5.4 5.4 0 0 0 10.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </Svg>
);

/** Lighthouse, for discovered landmarks. */
export const IconLandmark: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M6.2 6h3.6l1 8H5.2l1-8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M6.6 3.2h2.8V6H6.6V3.2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M4 4.4 6.6 3.2M12 4.4 9.4 3.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Four-point spark, for records and first-time discoveries. */
export const IconSparkle: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M8 1.6c.5 3.3 1.1 3.9 4.4 4.4-3.3.5-3.9 1.1-4.4 4.4-.5-3.3-1.1-3.9-4.4-4.4 3.3-.5 3.9-1.1 4.4-4.4Z" fill="currentColor" />
    <path d="M12.4 10.4c.25 1.5.5 1.75 2 2-1.5.25-1.75.5-2 2-.25-1.5-.5-1.75-2-2 1.5-.25 1.75-.5 2-2Z" fill="currentColor" opacity="0.75" />
  </Svg>
);

/** Transom hook, for cargo hung outside the hold. */
export const IconHook: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M8 2v5.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8 7.2a3.2 3.2 0 1 0 3.2 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M6.3 3.1 8 1.6l1.7 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </Svg>
);

/** Snowflake, for an iced hold that slows spoilage. */
export const IconSnowflake: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path
      d="M8 1.8v12.4M2.6 4.9l10.8 6.2M13.4 4.9 2.6 11.1"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
    <path
      d="M6.4 3.1 8 4.6l1.6-1.5M6.4 12.9 8 11.4l1.6 1.5"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </Svg>
);

/** Quality star. `filled` marks an earned point, hollow an unearned one. */
export const IconStar: React.FC<IconProps & { filled?: boolean }> = ({ filled = true, ...props }) => (
  <Svg {...props}>
    <path
      d="M8 1.9 9.9 6l4.4.5-3.3 3 .9 4.4L8 11.7l-3.9 2.2.9-4.4-3.3-3L6.1 6 8 1.9Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </Svg>
);

/** Padlock, for a panel the player has not unlocked yet. */
export const IconLock: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <rect x="3.4" y="7" width="9.2" height="6.6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </Svg>
);

/** Folded chart, for the nautical map. */
export const IconMap: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path d="M2 4.2 6 2.6v9.2L2 13.4V4.2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d="M6 2.6 10 4.2v9.2L6 11.8V2.6Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    <path d="M10 4.2 14 2.6v9.2L10 13.4V4.2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
  </Svg>
);

/** Cresting wave, for open-water markers and sea state. */
export const IconWaves: React.FC<IconProps> = (props) => (
  <Svg {...props}>
    <path
      d="M1.6 6.2c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 3.2-1.6M1.6 9.6c1.6-1.6 3.2-1.6 4.8 0s3.2 1.6 4.8 0 3.2-1.6 3.2-1.6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </Svg>
);

/**
 * Maps a simulation-supplied semantic icon id to its mark. DTOs name the
 * subject; choosing how it is drawn stays here in the presentation layer.
 */
export const HUD_ICON_BY_ID = {
  pin: IconPin,
  sprout: IconSprout,
  anchor: IconAnchor,
  coin: IconCoin,
  landmark: IconLandmark,
  waves: IconWaves,
  fish: IconFish,
  pack: IconPack,
  sparkle: IconSparkle,
  rain: IconWeatherLightRain,
  sun: IconSun,
  moon: IconMoon,
  warning: IconWarning,
  energy: IconEnergy,
  satchel: IconSatchel,
  boat: IconBoat
} as const satisfies Record<string, React.FC<IconProps>>;

export type HudIconName = keyof typeof HUD_ICON_BY_ID;

/** Renders a semantic icon id, falling back to the neutral pin. */
export const HudIcon: React.FC<IconProps & { name: string }> = ({ name, ...props }) => {
  const Mark = HUD_ICON_BY_ID[name as HudIconName] ?? IconPin;
  return <Mark {...props} />;
};

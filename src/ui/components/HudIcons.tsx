// src/ui/components/HudIcons.tsx
import React from "react";

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

/**
 * Embossed Golden Coin (Reference Top-Right Purse)
 */
export const IconCoin: React.FC<IconProps> = ({ size = 20, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Outer gold rim */}
    <circle cx="16" cy="16" r="14" fill="#C9943B" stroke="#7A5220" strokeWidth="1.6" />
    {/* Inner raised face */}
    <circle cx="16" cy="16" r="11" fill="#E8B854" stroke="#9A6B28" strokeWidth="1.2" />
    <circle cx="15.5" cy="15.5" r="10" fill="#F4CA6C" />
    {/* Dotted inner trim */}
    <circle cx="16" cy="16" r="8.5" stroke="#9A6B28" strokeWidth="1" strokeDasharray="2 1.8" />
    {/* Embossed Tree / Wheat / Emblem */}
    <path
      d="M16 9V23M16 12L12 16M16 12L20 16M16 15L13 19M16 15L19 19"
      stroke="#7A5220"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Golden Energy / Work Lightning (Reference Top-Right Work)
 */
export const IconEnergy: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M13.5 2L4 13.5H12L10.5 22L20 10.5H12L13.5 2Z"
      fill="#E5A638"
      stroke="#7A5220"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path
      d="M12.5 4.5L6.5 12.5H11.5L10.5 18.5L16.5 10.5H11.5L12.5 4.5Z"
      fill="#FFDF6D"
    />
  </svg>
);

/**
 * Handcrafted Leather Backpack (Reference Top-Right Bag)
 */
export const IconBackpack: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className} {...props}>
    {/* Top handle loop */}
    <path d="M10 6C10 4 11.5 3 14 3C16.5 3 18 4 18 6" stroke="#52351E" strokeWidth="1.6" strokeLinecap="round" />
    {/* Main leather body */}
    <rect x="5" y="6" width="18" height="19" rx="4" fill="#8C5832" stroke="#4A2E18" strokeWidth="1.6" />
    {/* Front pouch */}
    <rect x="7" y="13" width="14" height="10" rx="2.5" fill="#A86F42" stroke="#4A2E18" strokeWidth="1.4" />
    {/* Flap */}
    <path
      d="M5 10C5 7.5 7 6 14 6C21 6 23 7.5 23 10L21 14C19 15 9 15 7 14L5 10Z"
      fill="#6E4222"
      stroke="#4A2E18"
      strokeWidth="1.4"
    />
    {/* Straps and golden buckles */}
    <line x1="9" y1="6" x2="9" y2="23" stroke="#52351E" strokeWidth="1.2" />
    <line x1="19" y1="6" x2="19" y2="23" stroke="#52351E" strokeWidth="1.2" />
    <rect x="8" y="14" width="2" height="3" rx="0.5" fill="#E5B958" stroke="#7A5220" strokeWidth="0.8" />
    <rect x="18" y="14" width="2" height="3" rx="0.5" fill="#E5B958" stroke="#7A5220" strokeWidth="0.8" />
  </svg>
);

/**
 * Journal Book with Ribbon Bookmark (Reference Top-Right Navigation)
 */
export const IconJournal: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M5 3.5C5 2.67 5.67 2 6.5 2H19.5V20H6.5C5.67 20 5 19.33 5 18.5V3.5Z"
      fill="#7B4E2B"
      stroke="#452812"
      strokeWidth="1.5"
    />
    <path d="M7 2H19V20H7C6 20 5 19.2 5 18V4C5 2.8 6 2 7 2Z" fill="#96633B" />
    {/* Pages stack edge */}
    <rect x="18" y="3" width="3" height="16" fill="#F4EEDD" stroke="#452812" strokeWidth="0.8" />
    {/* Ribbon bookmark */}
    <path d="M11 2V12L13.5 10.5L16 12V2H11Z" fill="#C95B48" stroke="#7A2C20" strokeWidth="0.8" />
  </svg>
);

/**
 * Ledger Scroll (Reference Top-Right Navigation)
 */
export const IconLedger: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <rect x="4" y="3" width="16" height="18" rx="2" fill="#F4EEDD" stroke="#7A5A35" strokeWidth="1.5" />
    <line x1="7" y1="7" x2="17" y2="7" stroke="#8C6E4A" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7" y1="11" x2="14" y2="11" stroke="#8C6E4A" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="7" y1="15" x2="11" y2="15" stroke="#8C6E4A" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M15 14L17 16L21 12" stroke="#4E8C58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Compass (Reference Map Action)
 */
export const IconCompass: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <circle cx="12" cy="12" r="10" fill="#E8B854" stroke="#7A5220" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="8" fill="#F8F4E6" stroke="#9A6B28" strokeWidth="0.8" />
    {/* Needle */}
    <polygon points="12,5 14.5,12 12,10.5 9.5,12" fill="#C8503C" stroke="#7A2218" strokeWidth="0.8" />
    <polygon points="12,19 14.5,12 12,13.5 9.5,12" fill="#4B6678" stroke="#253540" strokeWidth="0.8" />
    <circle cx="12" cy="12" r="1.5" fill="#DDA845" stroke="#7A5220" strokeWidth="0.8" />
  </svg>
);

/**
 * Expedition Compass Star
 */
export const IconExpedition: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <polygon points="12,2 14.5,9.5 22,12 14.5,14.5 12,22 9.5,14.5 2,12 9.5,9.5" fill="#4A8C84" stroke="#204A44" strokeWidth="1.2" />
    <polygon points="12,6 13.5,10.5 18,12 13.5,13.5 12,18 10.5,13.5 6,12 10.5,10.5" fill="#6FB6AD" />
    <circle cx="12" cy="12" r="2.5" fill="#E8B854" stroke="#7A5220" strokeWidth="0.8" />
  </svg>
);

/**
 * Wooden/Brass Cog Menu (Reference Top-Right ESC Menu)
 */
export const IconMenu: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      fill="#8C5832"
      stroke="#4A2E18"
      strokeWidth="1.2"
    />
    <path
      d="M19.4 13C19.45 12.67 19.5 12.34 19.5 12C19.5 11.66 19.45 11.33 19.4 11L21.54 9.33C21.73 9.18 21.78 8.91 21.66 8.69L19.66 5.23C19.54 5.01 19.27 4.93 19.05 5.01L16.53 6.03C16 5.62 15.43 5.29 14.8 5.03L14.42 2.35C14.39 2.11 14.18 1.93 13.94 1.93H9.94C9.7 1.93 9.49 2.11 9.46 2.35L9.08 5.03C8.45 5.29 7.88 5.63 7.35 6.03L4.83 5.01C4.61 4.92 4.34 5.01 4.22 5.23L2.22 8.69C2.1 8.91 2.15 9.18 2.34 9.33L4.48 11C4.43 11.33 4.38 11.67 4.38 12C4.38 12.33 4.43 12.67 4.48 13L2.34 14.67C2.15 14.82 2.1 15.09 2.22 15.31L4.22 18.77C4.34 18.99 4.61 19.08 4.83 18.99L7.35 17.97C7.88 18.38 8.45 18.71 9.08 18.97L9.46 21.65C9.49 21.89 9.7 22.07 9.94 22.07H13.94C14.18 22.07 14.39 21.89 14.42 21.65L14.8 18.97C15.43 18.71 16 18.38 16.53 17.97L19.05 18.99C19.27 19.08 19.54 18.99 19.66 18.77L21.66 15.31C21.78 15.09 21.73 14.82 21.54 14.67L19.4 13Z"
      fill="#D6A658"
      stroke="#7A5220"
      strokeWidth="1.2"
    />
  </svg>
);

/**
 * Sprout Calendar Badge (Reference Top-Left Season)
 */
export const IconSprout: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    {/* Stem */}
    <path d="M12 21V10C12 10 12 5 7 5" stroke="#4E6B32" strokeWidth="2.2" strokeLinecap="round" />
    {/* Left Leaf */}
    <path
      d="M7 5C7 5 3 6.5 3 11C3 14.5 7 13.5 7 5Z"
      fill="#7EA854"
      stroke="#3A5222"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    {/* Right Leaf */}
    <path
      d="M12 10C12 10 15 7.5 19 8C21 11.5 18 15 12 14"
      fill="#8EBE62"
      stroke="#3A5222"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Sun Time Icon (Reference Top-Left Clock)
 */
export const IconSun: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <circle cx="12" cy="12" r="5" fill="#F4C34D" stroke="#A86E18" strokeWidth="1.5" />
    <path
      d="M12 2V5M12 19V22M2 12H5M19 12H22M4.93 4.93L7.05 7.05M16.95 16.95L19.07 19.07M4.93 19.07L7.05 16.95M16.95 7.05L19.07 4.93"
      stroke="#D6942A"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const IconMoon: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M20.5 13.5C19.5 17.5 15.5 20.5 11 20.5C5.75 20.5 1.5 16.25 1.5 11C1.5 6.5 4.5 2.5 8.5 1.5C7.5 3.5 7 5.5 7 8C7 13.5 11.5 18 17 18C19.5 18 21.5 17.5 23.5 16.5C22.5 15.5 21.5 14.5 20.5 13.5Z"
      fill="#A8BDD2"
      stroke="#5A748A"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <circle cx="9" cy="10" r="1" fill="#FFF8EB" />
    <circle cx="13" cy="14" r="1.5" fill="#FFF8EB" />
  </svg>
);

export const IconDawn: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M12 3V7M5 8L8 10M19 8L16 10" stroke="#E5A638" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 19H22" stroke="#8C5832" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 19C6 15.6863 8.68629 13 12 13C15.3137 13 18 15.6863 18 19" fill="#E8B854" stroke="#A86E18" strokeWidth="1.5" />
  </svg>
);

export const IconDusk: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M12 11V7M5 10L8 8M19 10L16 8" stroke="#C85B38" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 19H22" stroke="#6E4222" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 19C6 15.6863 8.68629 13 12 13C15.3137 13 18 15.6863 18 19" fill="#D66B42" stroke="#8C3518" strokeWidth="1.5" />
  </svg>
);

export const IconWeatherClear: React.FC<IconProps> = (props) => <IconSun {...props} />;

export const IconWeatherOvercast: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M18 18H6.5C4 18 2 16 2 13.5C2 11.2 3.6 9.3 5.8 9C6.4 5.6 9.4 3 13 3C17.2 3 20.6 6.2 21 10.4C22.2 11.2 23 12.5 23 14C23 16.2 21.2 18 19 18H18Z"
      fill="#C5CCD4"
      stroke="#6E7B88"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const IconWeatherLightRain: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M17 14H6.5C4.5 14 3 12.5 3 10.5C3 8.7 4.3 7.2 6 7C6.5 4.5 8.7 2.5 11.5 2.5C14.8 2.5 17.5 5 17.8 8.2C18.8 8.8 19.5 9.8 19.5 11C19.5 12.7 18.2 14 16.5 14H17Z"
      fill="#B0BCC8"
      stroke="#607080"
      strokeWidth="1.3"
    />
    <line x1="8" y1="16" x2="6.5" y2="19.5" stroke="#4A8C84" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="13" y1="16" x2="11.5" y2="19.5" stroke="#4A8C84" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconWeatherRain: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M17 13H6.5C4.5 13 3 11.5 3 9.5C3 7.7 4.3 6.2 6 6C6.5 3.5 8.7 1.5 11.5 1.5C14.8 1.5 17.5 4 17.8 7.2C18.8 7.8 19.5 8.8 19.5 10C19.5 11.7 18.2 13 16.5 13H17Z"
      fill="#98AAB8"
      stroke="#4C5D6E"
      strokeWidth="1.3"
    />
    <line x1="7" y1="15" x2="5" y2="20" stroke="#3A7B8C" strokeWidth="2" strokeLinecap="round" />
    <line x1="11" y1="15" x2="9" y2="20" stroke="#3A7B8C" strokeWidth="2" strokeLinecap="round" />
    <line x1="15" y1="15" x2="13" y2="20" stroke="#3A7B8C" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconWeatherStorm: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M17 12H6.5C4.5 12 3 10.5 3 8.5C3 6.7 4.3 5.2 6 5C6.5 2.5 8.7 0.5 11.5 0.5C14.8 0.5 17.5 3 17.8 6.2C18.8 6.8 19.5 7.8 19.5 9C19.5 10.7 18.2 12 16.5 12H17Z"
      fill="#6E7E8E"
      stroke="#354350"
      strokeWidth="1.3"
    />
    <polygon points="12,11 8,16 11,16 10,21 15,15 12,15" fill="#E8B854" stroke="#8C5818" strokeWidth="1" strokeLinejoin="round" />
  </svg>
);

export const IconWeatherFog: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M4 7H20M2 11H22M5 15H19M7 19H17" stroke="#9AB0BE" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/**
 * Thermometer (Reference Top-Left Temperature)
 */
export const IconThermometer: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    {/* Outer glass tube */}
    <path
      d="M10 5C10 3.34 11.34 2 13 2C14.66 2 16 3.34 16 5V13.3C17.2 14.2 18 15.8 18 17.5C18 20.5 15.5 23 12.5 23C9.5 23 7 20.5 7 17.5C7 15.8 7.8 14.2 9 13.3V5H10Z"
      fill="#F5EEDB"
      stroke="#7A5220"
      strokeWidth="1.5"
    />
    {/* Red mercury bulb & column */}
    <circle cx="12.5" cy="17.5" r="3.5" fill="#C8503C" />
    <path d="M12.5 7V17.5" stroke="#C8503C" strokeWidth="2.2" strokeLinecap="round" />
    {/* Scale tick marks */}
    <line x1="16" y1="6" x2="18" y2="6" stroke="#7A5220" strokeWidth="1" strokeLinecap="round" />
    <line x1="16" y1="9" x2="18" y2="9" stroke="#7A5220" strokeWidth="1" strokeLinecap="round" />
    <line x1="16" y1="12" x2="18" y2="12" stroke="#7A5220" strokeWidth="1" strokeLinecap="round" />
  </svg>
);

/**
 * Wind Gusts (Reference Top-Left Wind)
 */
export const IconWind: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M3 8H14C15.66 8 17 6.66 17 5C17 3.34 15.66 2 14 2C12.34 2 11 3.34 11 5M2 13H18C19.66 13 21 14.34 21 16C21 17.66 19.66 19 18 19C16.34 19 15 17.66 15 16M4 18H10C11.1 18 12 17.1 12 16"
      stroke="#4A8C84"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Wave / Tide / Sea Swell
 */
export const IconWave: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M2 12C5 8 7 8 10 12C13 16 15 16 18 12C20 9.3 21.5 9.3 23 11M2 17C5 13 7 13 10 17C13 21 15 21 18 17C20 14.3 21.5 14.3 23 16"
      stroke="#3F7B8C"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Fish
 */
export const IconFish: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path
      d="M2 12C5 6 15 6 20 12C15 18 5 18 2 12Z"
      fill="#4E8C84"
      stroke="#204A44"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <polygon points="18,12 23,7 23,17" fill="#4E8C84" stroke="#204A44" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="7" cy="11" r="1.5" fill="#FFF8EB" stroke="#204A44" strokeWidth="0.8" />
  </svg>
);

/**
 * Boat / Coastal Skiff
 */
export const IconBoat: React.FC<IconProps> = ({ size = 18, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    {/* Wooden Hull */}
    <path d="M3 16L5 21H19L21 16H3Z" fill="#8C5832" stroke="#4A2E18" strokeWidth="1.5" strokeLinejoin="round" />
    {/* Mast & Sail */}
    <line x1="12" y1="3" x2="12" y2="16" stroke="#4A2E18" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 4L19 11H12V4Z" fill="#F5EEDB" stroke="#7A5220" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M12 6L6 12H12V6Z" fill="#E8B854" stroke="#7A5220" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

/**
 * Warning Plaque
 */
export const IconWarning: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <polygon points="12,3 2,20 22,20" fill="#E5A638" stroke="#7A5220" strokeWidth="1.6" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="14" stroke="#3A2412" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1.2" fill="#3A2412" />
  </svg>
);

/* ==========================================================================
   QUICKBAR TOOL ICONS (Matching reference illustrated cozy style)
   ========================================================================== */

/**
 * Tool 1: Woodcutting Axe / Farming Hoe (Reference Slot 1)
 */
export const IconAxe: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Wooden Handle */}
    <path
      d="M7 26L23 8"
      stroke="#8C5832"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path
      d="M6.5 26.5L8.5 24.5"
      stroke="#5A3518"
      strokeWidth="3.6"
      strokeLinecap="round"
    />
    {/* Axe Blade Head */}
    <path
      d="M21 7C22 5 25 5 28 6C29 10 27 15 23 15L20 12L21 7Z"
      fill="#A8BDD2"
      stroke="#4A657A"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Polished Blade Edge Highlight */}
    <path d="M28 6C29 10 27 15 23 15" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const IconHoe: React.FC<IconProps> = (props) => <IconAxe {...props} />;

/**
 * Tool 2: Handcrafted Watering Can (Reference Slot 2)
 */
export const IconWateringCan: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Can Reservoir */}
    <rect x="8" y="13" width="13" height="12" rx="3" fill="#4E8C84" stroke="#204A44" strokeWidth="1.5" />
    {/* Brass Top Rim */}
    <ellipse cx="14.5" cy="13" rx="6.5" ry="2.5" fill="#6EB8AE" stroke="#204A44" strokeWidth="1.2" />
    {/* Spout */}
    <path d="M21 18L27 13" stroke="#4E8C84" strokeWidth="3" strokeLinecap="round" />
    {/* Spout Rose / Sprinkler Head */}
    <path d="M26 11L28.5 14.5" stroke="#E8B854" strokeWidth="2.5" strokeLinecap="round" />
    {/* Arch Handle */}
    <path
      d="M10 13C10 7 19 7 19 13"
      stroke="#7A5220"
      strokeWidth="2.2"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

/**
 * Tool 3: Pickaxe / Mattock (Reference Slot 3)
 */
export const IconPickaxe: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Handle */}
    <path d="M7 26L24 7" stroke="#8C5832" strokeWidth="3.2" strokeLinecap="round" />
    {/* Curved Pick Head */}
    <path
      d="M17 5C22 7 28 13 29 17L26 16C23 12 19 8 15 8L17 5Z"
      fill="#A8BDD2"
      stroke="#4A657A"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path
      d="M17 5C14 7 10 12 9 15L12 15C14 12 17 9 20 8L17 5Z"
      fill="#8B9EA8"
      stroke="#4A657A"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Tool 4: Bait / Fishing Hand Net (Reference Slot 4)
 */
export const IconBait: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Wooden Net Handle & Hoop */}
    <path d="M9 25L17 17" stroke="#8C5832" strokeWidth="3" strokeLinecap="round" />
    <circle cx="21" cy="12" r="7" stroke="#6E4222" strokeWidth="2" fill="none" />
    {/* Mesh Net Bag */}
    <path
      d="M15 15C16 23 26 23 27 15"
      fill="#E8F1F2"
      fillOpacity="0.4"
      stroke="#5A8C88"
      strokeWidth="1.2"
      strokeDasharray="2 2"
    />
    <line x1="17" y1="13" x2="25" y2="13" stroke="#5A8C88" strokeWidth="1" strokeDasharray="2 2" />
    <line x1="19" y1="17" x2="23" y2="17" stroke="#5A8C88" strokeWidth="1" strokeDasharray="2 2" />
  </svg>
);

/**
 * Tool 5: Fishing Rod with Reel (Reference Slot 5)
 */
export const IconRod: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Bamboo Rod Blank */}
    <path d="M6 26C12 21 21 14 27 6" stroke="#8C5832" strokeWidth="2.8" strokeLinecap="round" />
    {/* Reel Seat & Brass Reel */}
    <circle cx="9" cy="22" r="3" fill="#E8B854" stroke="#7A5220" strokeWidth="1.2" />
    {/* Line Guides & Arching Monofilament */}
    <path d="M27 6C29 11 28 20 22 24" stroke="#4A8C84" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    <circle cx="22" cy="24" r="1.5" fill="#C8503C" />
  </svg>
);

/**
 * Harvest / Foraging Basket (Reference Slot 5 alternative)
 */
export const IconBasket: React.FC<IconProps> = ({ size = 24, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} {...props}>
    {/* Woven Basket Handle */}
    <path d="M10 16C10 9 22 9 22 16" stroke="#6E4222" strokeWidth="2" strokeLinecap="round" fill="none" />
    {/* Vegetables / Fruit inside */}
    <circle cx="13" cy="14" r="3.5" fill="#C8503C" />
    <circle cx="19" cy="14" r="3.5" fill="#7EA854" />
    <circle cx="16" cy="12.5" r="3" fill="#E8B854" />
    {/* Woven Basket Body */}
    <path
      d="M7 16H25L23 26H9L7 16Z"
      fill="#A87242"
      stroke="#5A3518"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <line x1="8.5" y1="21" x2="23.5" y2="21" stroke="#5A3518" strokeWidth="1.2" />
    <line x1="12" y1="16" x2="11" y2="26" stroke="#5A3518" strokeWidth="1.2" />
    <line x1="16" y1="16" x2="16" y2="26" stroke="#5A3518" strokeWidth="1.2" />
    <line x1="20" y1="16" x2="21" y2="26" stroke="#5A3518" strokeWidth="1.2" />
  </svg>
);

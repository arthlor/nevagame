// src/ui/components/HudIcons.tsx
import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const IconCoin: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <circle cx="12" cy="12" r="10" fill="#F5B041" stroke="#B8783F" strokeWidth="2" />
    <circle cx="12" cy="12" r="7" stroke="#8D5D36" strokeWidth="1.5" strokeDasharray="3 2" />
    <path d="M12 7v10M9.5 9.5h4.5a1.5 1.5 0 0 1 0 3h-4a1.5 1.5 0 0 0 0 3h5" stroke="#563825" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconEnergy: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#E8A838" stroke="#B8783F" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const IconBackpack: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M7 6V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="4" y="6" width="16" height="15" rx="3" fill="#8D5D36" stroke="#563825" strokeWidth="2" />
    <rect x="7" y="10" width="10" height="7" rx="2" fill="#B8783F" stroke="#563825" strokeWidth="1.5" />
    <line x1="12" y1="12" x2="12" y2="15" stroke="#F6F1E3" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconJournal: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="#8D5D36" stroke="#563825" strokeWidth="2" />
    <line x1="8" y1="7" x2="16" y2="7" stroke="#F6F1E3" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="11" x2="14" y2="11" stroke="#F6F1E3" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const IconExpedition: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <polygon points="12,2 15,9 22,12 15,15 12,22 9,15 2,12 9,9" fill="#3F8D8C" stroke="#235B5B" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="#F5B041" />
  </svg>
);

export const IconMenu: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <rect x="3" y="5" width="18" height="3" rx="1.5" fill="currentColor" />
    <rect x="3" y="11" width="18" height="3" rx="1.5" fill="currentColor" />
    <rect x="3" y="17" width="18" height="3" rx="1.5" fill="currentColor" />
  </svg>
);

export const IconSun: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <circle cx="12" cy="12" r="5" fill="#F5B041" stroke="#D59B45" strokeWidth="1.5" />
    <path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="#F5B041" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconMoon: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="#9FBAD3" stroke="#688EA8" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="8" cy="12" r="1" fill="#F6F1E3" />
    <circle cx="12" cy="15" r="1.5" fill="#F6F1E3" />
  </svg>
);

export const IconDawn: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M12 2v6M4.93 4.93l4.24 4.24M19.07 4.93l-4.24 4.24" stroke="#F5B041" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 18h20M4 22h16" stroke="#D59B45" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 18a6 6 0 0 1 12 0" fill="#E8A838" stroke="#B8783F" strokeWidth="1.5" />
  </svg>
);

export const IconDusk: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M12 10v6M4.93 13.07l4.24-4.24M19.07 13.07l-4.24-4.24" stroke="#D57A52" strokeWidth="2" strokeLinecap="round" />
    <path d="M2 18h20M4 22h16" stroke="#8D5D36" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 18a6 6 0 0 1 12 0" fill="#B94F36" stroke="#8D5D36" strokeWidth="1.5" />
  </svg>
);

export const IconWeatherClear: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <IconSun size={size} className={className} {...props} />
);

export const IconWeatherOvercast: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M17.5 19H6.5A4.5 4.5 0 0 1 6.5 10c.2 0 .4 0 .6.04A6 6 0 0 1 18.5 12a4.5 4.5 0 0 1-1 7z" fill="#B8C4CC" stroke="#7A8A96" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const IconWeatherLightRain: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M16 14H7a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 2A3.5 3.5 0 0 1 16 14z" fill="#A4B8C4" stroke="#688EA8" strokeWidth="1.5" />
    <line x1="8" y1="17" x2="7" y2="20" stroke="#3F8D8C" strokeWidth="2" strokeLinecap="round" />
    <line x1="13" y1="17" x2="12" y2="20" stroke="#3F8D8C" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconWeatherRain: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M17 13H6a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 2A3.5 3.5 0 0 1 17 13z" fill="#889DAA" stroke="#566C7A" strokeWidth="1.5" />
    <line x1="8" y1="16" x2="6" y2="21" stroke="#3F8D8C" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="16" x2="10" y2="21" stroke="#3F8D8C" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="16" x2="14" y2="21" stroke="#3F8D8C" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconWeatherStorm: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M17 12H6a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 2A3.5 3.5 0 0 1 17 12z" fill="#586976" stroke="#37434C" strokeWidth="1.5" />
    <path d="M13 13l-3 5h4l-2 5" stroke="#F5B041" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const IconWeatherFog: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M4 8h16M2 12h20M5 16h14M7 20h10" stroke="#A8BCC8" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconWind: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCompass: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
    <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="#B94F36" stroke="#8D5D36" strokeWidth="1" />
  </svg>
);

export const IconFish: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M2 12c4-6 13-6 18 0-5 6-14 6-18 0z" fill="#3F8D8C" stroke="#235B5B" strokeWidth="1.5" />
    <polygon points="18,12 23,8 23,16" fill="#3F8D8C" stroke="#235B5B" strokeWidth="1.5" />
    <circle cx="7" cy="11" r="1.5" fill="#F6F1E3" />
  </svg>
);

export const IconBoat: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M3 15l2 6h14l2-6H3z" fill="#8D5D36" stroke="#563825" strokeWidth="1.5" />
    <path d="M12 3v12M12 4l7 7h-7" fill="#F6F1E3" stroke="#8D5D36" strokeWidth="1.5" />
  </svg>
);

export const IconSprout: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M12 21v-8M7 8a5 5 0 0 1 5 5 5 5 0 0 1-5 5M12 13a5 5 0 0 1 5-5 5 5 0 0 1 5 5" stroke="#667A3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#829C4C" />
  </svg>
);

export const IconWarning: React.FC<IconProps> = ({ size = 16, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#D59B45" stroke="#8D5D36" strokeWidth="1.5" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="#2C2218" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17" r="1" fill="#2C2218" />
  </svg>
);

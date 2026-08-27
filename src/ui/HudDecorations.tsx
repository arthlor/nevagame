// src/ui/HudDecorations.tsx
import React from "react";
import { ChromeKeycap } from "./chrome/Chrome";

/**
 * Ornate Gold Filigree Corner - Top Left
 */
export const FiligreeCornerTL: React.FC<{ className?: string; size?: number; color?: string }> = ({
  className = "hud-filigree-tl",
  size = 32,
  color = "#d4af37"
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 36 36"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`hud-filigree-corner hud-filigree-corner--tl ${className}`.trim()}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="mm-gold-grad-tl" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff2be" />
        <stop offset="45%" stopColor={color} />
        <stop offset="100%" stopColor="#8a6714" />
      </linearGradient>
      <filter id="mm-glow-tl" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.6" />
      </filter>
    </defs>
    <g filter="url(#mm-glow-tl)">
      {/* Outer corner frame bracket */}
      <path
        d="M2 22V5C2 3.34315 3.34315 2 5 2H22"
        stroke="url(#mm-gold-grad-tl)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Inner fine accent bracket */}
      <path
        d="M6 16V8C6 6.89543 6.89543 6 8 6H16"
        stroke="url(#mm-gold-grad-tl)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeOpacity="0.85"
      />
      {/* Acanthus / Vine scrollwork */}
      <path
        d="M2 2C7 7 10 12 9 19C8.5 22.5 5 24 3 21C1.5 18.5 4 15 8 15C13 15 15 9 15 3C15 1 12 1 10 3"
        stroke="url(#mm-gold-grad-tl)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Central flourish leaf */}
      <path
        d="M4 4C8 8 14 10 19 9C22.5 8.5 24 5 21 3C18.5 1.5 15 4 15 8"
        stroke="url(#mm-gold-grad-tl)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Corner Rivet Diamond */}
      <polygon points="5,2 7,4 5,6 3,4" fill="#fff5cc" stroke="#6a4c10" strokeWidth="0.8" />
    </g>
  </svg>
);

/**
 * Ornate Gold Filigree Corner - Top Right
 */
export const FiligreeCornerTR: React.FC<{ className?: string; size?: number; color?: string }> = ({
  className = "hud-filigree-tr",
  size = 32,
  color = "#d4af37"
}) => (
  <div style={{ transform: "scaleX(-1)", display: "inline-block", width: size, height: size }}>
    <FiligreeCornerTL className={className} size={size} color={color} />
  </div>
);

/**
 * Ornate Gold Filigree Corner - Bottom Left
 */
export const FiligreeCornerBL: React.FC<{ className?: string; size?: number; color?: string }> = ({
  className = "hud-filigree-bl",
  size = 32,
  color = "#d4af37"
}) => (
  <div style={{ transform: "scaleY(-1)", display: "inline-block", width: size, height: size }}>
    <FiligreeCornerTL className={className} size={size} color={color} />
  </div>
);

/**
 * Ornate Gold Filigree Corner - Bottom Right
 */
export const FiligreeCornerBR: React.FC<{ className?: string; size?: number; color?: string }> = ({
  className = "hud-filigree-br",
  size = 32,
  color = "#d4af37"
}) => (
  <div style={{ transform: "scale(-1, -1)", display: "inline-block", width: size, height: size }}>
    <FiligreeCornerTL className={className} size={size} color={color} />
  </div>
);

/**
 * Ornate Brass Divider with central filigree crest and fading diamond lines
 */
export const OrnateBrassDivider: React.FC<{ className?: string; color?: string }> = ({
  className = "hud-ornate-brass-divider",
  color = "#d4af37"
}) => (
  <div className={`chrome-divider-ornate-wrap ${className}`.trim()} aria-hidden="true" style={{ width: "100%", margin: "8px 0" }}>
    <svg width="100%" height="12" viewBox="0 0 240 12" preserveAspectRatio="none" fill="none">
      <defs>
        <linearGradient id="mm-div-grad-left" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="60%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="mm-div-grad-right" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="40%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Left rule line */}
      <line x1="0" y1="6" x2="105" y2="6" stroke="url(#mm-div-grad-left)" strokeWidth="1.2" />
      <line x1="30" y1="8" x2="100" y2="8" stroke="url(#mm-div-grad-left)" strokeWidth="0.6" strokeDasharray="3 3" />

      {/* Center Ornate Diamond & Wing Motif */}
      <g transform="translate(120, 6)">
        {/* Diamond frame */}
        <polygon points="0,-5 6,0 0,5 -6,0" fill="#1b120c" stroke={color} strokeWidth="1.4" />
        {/* Inner gold diamond */}
        <polygon points="0,-2.5 3,0 0,2.5 -3,0" fill="#f0dd9a" />
        {/* Left wing scroll */}
        <path d="M-6,0 C-9,-3 -13,-2 -15,0 C-13,2 -9,1 -6,0" fill={color} opacity="0.85" />
        <circle cx="-16" cy="0" r="1" fill={color} />
        {/* Right wing scroll */}
        <path d="M6,0 C9,-3 13,-2 15,0 C13,2 9,1 6,0" fill={color} opacity="0.85" />
        <circle cx="16" cy="0" r="1" fill={color} />
      </g>

      {/* Right rule line */}
      <line x1="135" y1="6" x2="240" y2="6" stroke="url(#mm-div-grad-right)" strokeWidth="1.2" />
      <line x1="140" y1="8" x2="210" y2="8" stroke="url(#mm-div-grad-right)" strokeWidth="0.6" strokeDasharray="3 3" />
    </svg>
  </div>
);

/**
 * Celestial Sun/Moon Time Dial with compass rose and brass rim
 */
export const CelestialTimeDial: React.FC<{
  className?: string;
  size?: number;
  rotation?: number;
  isNight?: boolean;
}> = ({
  className = "hud-celestial-dial",
  size = 48,
  rotation = 0,
  isNight = false
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 54 54"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`hud-celestial-dial-svg ${className}`.trim()}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="mm-celestial-bg" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor={isNight ? "#121b2d" : "#243a5e"} />
        <stop offset="70%" stopColor={isNight ? "#080c16" : "#131f33"} />
        <stop offset="100%" stopColor="#0a0d14" />
      </radialGradient>
      <linearGradient id="mm-dial-rim" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff4c2" />
        <stop offset="35%" stopColor="#d4af37" />
        <stop offset="75%" stopColor="#8a6714" />
        <stop offset="100%" stopColor="#3d2a07" />
      </linearGradient>
      <linearGradient id="mm-dial-sun" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff8db" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
    </defs>

    {/* Outer Timber Bezel */}
    <circle cx="27" cy="27" r="26" fill="#1b120c" stroke="#382214" strokeWidth="1.5" />

    {/* Brass Filigree Rim */}
    <circle cx="27" cy="27" r="24" stroke="url(#mm-dial-rim)" strokeWidth="1.8" />
    <circle cx="27" cy="27" r="22" stroke="#684c10" strokeWidth="0.8" strokeDasharray="1.5 2.5" />

    {/* Sky Basin Plate */}
    <circle cx="27" cy="27" r="20.5" fill="url(#mm-celestial-bg)" />

    {/* Rotating Celestial Body Disk */}
    <g transform={`rotate(${rotation} 27 27)`}>
      {/* Sun on Top */}
      <g transform="translate(27, 13)">
        {/* Sun rays */}
        <line x1="0" y1="-7" x2="0" y2="-4" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="5" y1="-5" x2="3" y2="-3" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7" y1="0" x2="4" y2="0" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="5" y1="5" x2="3" y2="3" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="0" y1="7" x2="0" y2="4" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="-5" y1="5" x2="-3" y2="3" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="-7" y1="0" x2="-4" y2="0" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="-5" y1="-5" x2="-3" y2="-3" stroke="#fcd34d" strokeWidth="1.2" strokeLinecap="round" />
        {/* Sun Core */}
        <circle cx="0" cy="0" r="3.6" fill="url(#mm-dial-sun)" stroke="#92400e" strokeWidth="0.6" />
      </g>

      {/* Moon on Bottom */}
      <g transform="translate(27, 41)">
        <path
          d="M-3,-4 C-1,-4 3,-2 3,2 C3,6 -1,8 -3,8 C1,7 4,4 4,2 C4,-1 1,-3 -3,-4 Z"
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="0.6"
        />
        {/* Stars */}
        <circle cx="5" cy="-2" r="0.75" fill="#f8fafc" />
        <circle cx="-5" cy="4" r="0.6" fill="#f8fafc" />
      </g>
    </g>

    {/* Center Pivot Boss */}
    <circle cx="27" cy="27" r="2.8" fill="url(#mm-dial-rim)" stroke="#1b120c" strokeWidth="0.8" />
    <circle cx="27" cy="27" r="1" fill="#fff9db" />
  </svg>
);

/**
 * Ornate Medallion Coin Purse icon badge
 */
export const MedallionPurse: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-medallion-purse",
  size = 28
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`hud-medallion-purse-svg ${className}`.trim()}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="mm-purse-gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fff3bf" />
        <stop offset="45%" stopColor="#d4af37" />
        <stop offset="100%" stopColor="#7a5510" />
      </linearGradient>
      <linearGradient id="mm-purse-leather" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#4a2e1b" />
        <stop offset="100%" stopColor="#24140a" />
      </linearGradient>
    </defs>

    {/* Shadow */}
    <ellipse cx="16" cy="28" rx="10" ry="2.5" fill="rgba(0,0,0,0.5)" />

    {/* Leather Pouch Body */}
    <path
      d="M8 14C8 22 10 27 16 27C22 27 24 22 24 14C24 10 21 8 16 8C11 8 8 10 8 14Z"
      fill="url(#mm-purse-leather)"
      stroke="#1b1008"
      strokeWidth="1.2"
    />

    {/* Gold Filigree Band / Cinch Tie */}
    <path d="M10 11C12 12.5 20 12.5 22 11" stroke="url(#mm-purse-gold)" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="16" cy="11.5" r="2.2" fill="url(#mm-purse-gold)" stroke="#573c09" strokeWidth="0.8" />

    {/* Front Gold Coin Relief Medallion */}
    <circle cx="16" cy="19" r="4.5" fill="url(#mm-purse-gold)" stroke="#573c09" strokeWidth="1" />
    <path d="M15 17.5L16 16.5L17 17.5V20.5L16 21.5L15 20.5V17.5Z" fill="#fff5cc" />
  </svg>
);

/**
 * Tactile 3D Stone/Brass Embossed Keycap Badge
 */
export const EmbossedKeycap: React.FC<{ keyName: string; className?: string; glow?: boolean }> = ({
  keyName,
  className = "",
  glow = false
}) => (
  <span className={`hud-embossed-keycap ${glow ? "is-glowing" : ""} ${className}`.trim()}>
    <span className="hud-embossed-keycap__inner">{keyName}</span>
  </span>
);

/* Backward compatibility aliases and legacy components */
export const CornerLeafSprout: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-corner-leaf",
  size = 28
}) => <FiligreeCornerTL className={className} size={size} />;

export const CornerRopeKnot: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-corner-rope",
  size = 28
}) => <FiligreeCornerBR className={className} size={size} />;

export const OrnateDivider: React.FC<{ className?: string }> = ({ className = "hud-ornate-divider" }) => (
  <OrnateBrassDivider className={className} />
);

export const KeycapBadge: React.FC<{ keyName: string; className?: string }> = ({
  keyName,
  className = ""
}) => <ChromeKeycap keyName={keyName} className={className} />;

export const CompassDial: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-compass-dial",
  size = 42
}) => <CelestialTimeDial className={className} size={size} />;

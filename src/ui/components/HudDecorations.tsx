// src/ui/components/HudDecorations.tsx
import React from "react";

/**
 * Top-left decorative corner with leaf sprouts and golden fastener
 */
export const CornerLeafSprout: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-corner-leaf",
  size = 28
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Stem */}
    <path
      d="M16 28C16 20 18 14 26 10M16 20C12 16 8 15 4 16M17 15C15 10 11 6 6 5"
      stroke="#4E6B32"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    {/* Leaf 1 (Top Left) */}
    <path
      d="M6 5C6 5 8 1.5 13 3C15 7 11 11 6 5Z"
      fill="#7EA854"
      stroke="#3A5222"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path d="M7 5C9 4 11 5 12 5" stroke="#9BC868" strokeWidth="0.8" strokeLinecap="round" />
    {/* Leaf 2 (Mid Left) */}
    <path
      d="M4 16C4 16 3 11 8 11C11 14 9 18 4 16Z"
      fill="#6B9644"
      stroke="#3A5222"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    {/* Golden Rivet / Accent */}
    <circle cx="16" cy="16" r="3.2" fill="#DDA845" stroke="#7A5220" strokeWidth="1.2" />
    <circle cx="15.2" cy="15.2" r="1" fill="#FFF2B2" />
  </svg>
);

/**
 * Bottom-right (or corner) decorative rope knot with golden binding
 */
export const CornerRopeKnot: React.FC<{ className?: string; size?: number }> = ({
  className = "hud-corner-rope",
  size = 28
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Twisted rope loop around frame corner */}
    <path
      d="M8 26C14 28 26 26 26 18C26 10 20 8 16 8C12 8 8 12 8 18C8 24 16 28 24 24"
      stroke="#A37848"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 26C14 28 26 26 26 18C26 10 20 8 16 8C12 8 8 12 8 18C8 24 16 28 24 24"
      stroke="#D6A66A"
      strokeWidth="1.6"
      strokeDasharray="2 2"
      strokeLinecap="round"
    />
    {/* Brass Binding Ring */}
    <rect
      x="13"
      y="15"
      width="7"
      height="4"
      rx="1.5"
      transform="rotate(-30 13 15)"
      fill="#E5B958"
      stroke="#7A5220"
      strokeWidth="1"
    />
    {/* Mini sprout near rope */}
    <path
      d="M25 10C27 7 30 8 30 11C28 13 25 12 25 10Z"
      fill="#7EA854"
      stroke="#3A5222"
      strokeWidth="0.9"
    />
  </svg>
);

/**
 * Ornate horizontal line divider with center diamond flourish
 */
export const OrnateDivider: React.FC<{ className?: string }> = ({ className = "hud-ornate-divider" }) => (
  <div className={className} aria-hidden="true">
    <svg width="100%" height="6" viewBox="0 0 200 6" preserveAspectRatio="none" fill="none">
      <line x1="0" y1="3" x2="90" y2="3" stroke="#C4B396" strokeWidth="1" strokeDasharray="3 2" />
      <path d="M96 3L100 0.5L104 3L100 5.5L96 3Z" fill="#B38B4D" stroke="#7A5424" strokeWidth="0.8" />
      <circle cx="92" cy="3" r="1" fill="#7A5424" />
      <circle cx="108" cy="3" r="1" fill="#7A5424" />
      <line x1="110" y1="3" x2="200" y2="3" stroke="#C4B396" strokeWidth="1" strokeDasharray="3 2" />
    </svg>
  </div>
);

/**
 * Embossed golden keycap badge
 */
export const KeycapBadge: React.FC<{ keyName: string; className?: string }> = ({
  keyName,
  className = "hud-keycap-badge"
}) => (
  <span className={className}>
    {keyName}
  </span>
);

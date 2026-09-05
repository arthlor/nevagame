import React from "react";
import {
  ChromeKeycap,
  ChromeMeter,
  ChromePanel,
  ChromeSlot,
  type ChromeMeterProps,
  type ChromePanelProps,
  type ChromeSlotProps
} from "../chrome/Chrome";

/**
 * Every surface in the game is the same dark instrument panel by default. The
 * paper variant used to be the default, which split the interface in two: a
 * slate HUD in front of a cream folio. `physical` is still available for a
 * surface that genuinely wants to read as paper, but nothing gets it by
 * accident.
 */
export const GameSheet = React.forwardRef<HTMLElement, ChromePanelProps & {
  family?: "physical" | "ink";
}>(({ family = "ink", className = "", ...props }, ref) => (
  <ChromePanel
    ref={ref}
    className={`game-sheet game-sheet--${family} ${className}`.trim()}
    {...props}
  />
));
GameSheet.displayName = "GameSheet";

export const HudCluster: React.FC<React.HTMLAttributes<HTMLElement> & {
  edge?: "top-left" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}> = ({ edge, className = "", children, ...props }) => (
  <section
    className={`hud-cluster ${edge ? `hud-cluster--${edge}` : ""} ${className}`.trim()}
    {...props}
  >
    {children}
  </section>
);

export const ItemSlot: React.FC<ChromeSlotProps> = (props) => <ChromeSlot {...props} />;
export const Meter: React.FC<ChromeMeterProps & React.HTMLAttributes<HTMLDivElement>> = (props) => (
  <ChromeMeter {...props} />
);
export const KeyHint = ChromeKeycap;

export const Notice: React.FC<React.HTMLAttributes<HTMLDivElement> & {
  urgency?: "info" | "success" | "caution" | "danger";
}> = ({ urgency = "info", className = "", children, ...props }) => (
  <div className={`coastal-notice coastal-notice--${urgency} ${className}`.trim()} role="status" {...props}>
    {children}
  </div>
);

import React, { useEffect, useRef, useState } from "react";
import { IconCompass } from "./components/HudIcons";
import { ChromeClose } from "./chrome/Chrome";
import { GameSheet } from "./coastal/CoastalUI";

export interface ContextualHintCardProps {
  hintId: string;
  title: string;
  message: string;
  icon?: string;
  onDismiss: (hintId: string) => void;
  /** When false, Escape is left for an open modal instead of dismissing this card. */
  captureEscape?: boolean;
}

/** Long enough to read a three-line hint without rushing. */
const HINT_VISIBLE_MS = 9000;

export const ContextualHintCard: React.FC<ContextualHintCardProps> = ({
  hintId,
  title,
  message,
  icon = "✦",
  onDismiss,
  captureEscape = true
}) => {
  const [visible, setVisible] = useState(true);
  // A hint is shown once and never returns, so the countdown holds while the
  // player is reading it rather than expiring mid-sentence.
  const [held, setHeld] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setVisible(true);
    if (held) return;
    // GameApp renders once per frame, so the callback must not be a timer dependency.
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current(hintId);
    }, HINT_VISIBLE_MS);

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
  }, [hintId, captureEscape, held]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(hintId);
  };

  if (!visible) return null;

  return (
    <GameSheet
      family="ink"
      className="contextual-hint-card interactive"
      tone="slate"
      corners
      role="status"
      tabIndex={0}
      data-testid="contextual-hint"
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
        {icon === "✦" ? <IconCompass size={16} /> : icon}
      </div>
      <div className="hint-card-body">
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
    </GameSheet>
  );
};

// src/ui/ContextualHintCard.tsx
import React, { useEffect, useRef, useState } from "react";
import { IconCompass } from "./components/HudIcons";
import { ChromeClose, ChromePanel } from "./chrome/Chrome";
import { playUiSound } from "./audio/uiAudio";

export interface ContextualHintCardProps {
  hintId: string;
  title: string;
  message: string;
  icon?: string;
  onDismiss: (hintId: string) => void;
}

export const ContextualHintCard: React.FC<ContextualHintCardProps> = ({
  hintId,
  title,
  message,
  icon = "✦",
  onDismiss
}) => {
  const [visible, setVisible] = useState(true);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    setVisible(true);
    playUiSound("open");
    // GameApp renders once per frame, so the callback must not be a timer dependency.
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismissRef.current(hintId);
    }, 7000);

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
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
  }, [hintId]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(hintId);
  };

  if (!visible) return null;

  return (
    <ChromePanel
      className="contextual-hint-card interactive"
      tone="slate"
      flourish
      corners
      role="status"
      tabIndex={0}
      data-testid="contextual-hint"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
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
        <strong className="hint-card-title">Hint · {title}</strong>
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
    </ChromePanel>
  );
};

// src/ui/ContextualHintCard.tsx
import React, { useEffect, useState } from "react";

export interface ContextualHintCardProps {
  hintId: string;
  title: string;
  message: string;
  icon?: string;
  onDismiss: (hintId: string) => void;
  /** When false, Escape is left for an open modal instead of dismissing this card. */
  captureEscape?: boolean;
}

export const ContextualHintCard: React.FC<ContextualHintCardProps> = ({
  hintId,
  title,
  message,
  icon = "💡",
  onDismiss,
  captureEscape = true
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Auto fade after 7 seconds
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss(hintId);
    }, 7000);

    return () => clearTimeout(timer);
  }, [hintId, onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss(hintId);
  };

  if (!visible) return null;

  return (
    <div
      className="contextual-hint-card interactive"
      onClick={handleDismiss}
      role="status"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || (captureEscape && e.key === "Escape")) {
          e.preventDefault();
          handleDismiss();
        }
      }}
    >
      <div className="hint-card-icon">{icon}</div>
      <div className="hint-card-body">
        <strong className="hint-card-title">{title}</strong>
        <p className="hint-card-message">{message}</p>
      </div>
      <button
        type="button"
        className="hint-card-close-btn"
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        aria-label="Dismiss hint"
      >
        ✕
      </button>
    </div>
  );
};

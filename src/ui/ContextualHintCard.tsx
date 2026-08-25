// src/ui/ContextualHintCard.tsx
import React, { useEffect, useState } from "react";

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
  icon = "💡",
  onDismiss
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
    <div className="contextual-hint-card" onClick={handleDismiss} role="status">
      <div className="hint-card-icon">{icon}</div>
      <div className="hint-card-body">
        <strong className="hint-card-title">{title}</strong>
        <p className="hint-card-message">{message}</p>
      </div>
      <button
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

// src/ui/components/NoticeStack.tsx
import React from "react";
import type { Notice, NoticeTone } from "../notifications";
import { IconCoin, IconWarning, type IconProps } from "./HudIcons";

export interface NoticeStackProps {
  notices: readonly Notice[];
}

const TONE_ICON: Partial<Record<NoticeTone, React.FC<IconProps>>> = {
  warning: IconWarning,
  danger: IconWarning,
  reward: IconCoin
};

/**
 * The live region is mounted unconditionally. Assistive technology only
 * announces changes inside a region that already existed, so a container that
 * appears together with its first message is silently skipped.
 */
export const NoticeStack: React.FC<NoticeStackProps> = ({ notices }) => (
  <aside
    className="hud-toast-container"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    data-testid="notice-stack"
    data-notice-count={notices.length}
  >
    {notices.map((notice) => {
      const Icon = TONE_ICON[notice.tone];
      return (
        <div
          key={notice.id}
          className={`hud-toast-pill hud-toast-pill--${notice.tone}`}
          data-testid="toast"
          data-tone={notice.tone}
        >
          {Icon && (
            <span className="toast-tone-icon" aria-hidden="true">
              <Icon size={14} aria-hidden="true" />
            </span>
          )}
          <span className="toast-message-text">{notice.text}</span>
          {notice.count > 1 && (
            <span className="toast-repeat-badge" aria-label={`repeated ${notice.count} times`}>
              {`x${notice.count}`}
            </span>
          )}
        </div>
      );
    })}
  </aside>
);

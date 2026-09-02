import React from "react";
import { NOTICE_TONE_PRIORITY, type Notice, type NoticeTone } from "../notifications";
import { IconCoin, IconWarning, type IconProps } from "./HudIcons";
import { Notice as CoastalNotice } from "../coastal/CoastalUI";

export interface NoticeStackProps {
  notices: readonly Notice[];
}

const TONE_ICON: Partial<Record<NoticeTone, React.FC<IconProps>>> = {
  warning: IconWarning,
  danger: IconWarning,
  reward: IconCoin
};

// Keep the live region mounted so assistive technology observes its first update.
export const NoticeStack: React.FC<NoticeStackProps> = ({ notices }) => {
  const visible = [...notices]
    .sort((a, b) => NOTICE_TONE_PRIORITY[a.tone] - NOTICE_TONE_PRIORITY[b.tone] || b.createdMs - a.createdMs)
    .slice(0, 2);
  return <aside
    className="hud-toast-container"
    role="status"
    aria-live="polite"
    aria-atomic="false"
    data-testid="notice-stack"
    data-notice-count={visible.length}
  >
    {visible.map((notice) => {
      const Icon = TONE_ICON[notice.tone];
      const urgency = notice.tone === "danger"
        ? "danger"
        : notice.tone === "warning"
          ? "caution"
          : notice.tone === "success" || notice.tone === "reward"
            ? "success"
            : "info";
      return (
        <CoastalNotice
          key={notice.id}
          urgency={urgency}
          className={`hud-toast-pill hud-toast-pill--${notice.tone}`}
          role="presentation"
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
        </CoastalNotice>
      );
    })}
  </aside>;
};

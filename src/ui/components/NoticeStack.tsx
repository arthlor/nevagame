import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NOTICE_EXIT_MS,
  NOTICE_MAX_VISIBLE,
  NOTICE_TONE_PRIORITY,
  type Notice,
  type NoticeDelta,
  type NoticeTone
} from "../notifications";
import { IconCoin, IconWarning, type IconProps, IconEnergy} from "./HudIcons";
import { Notice as CoastalNotice } from "../coastal/CoastalUI";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForCrop, atlasForFish } from "../chrome/uiAtlas";

export interface NoticeStackProps {
  notices: readonly Notice[];
  className?: string;
}

const TONE_ICON: Partial<Record<NoticeTone, React.FC<IconProps>>> = {
  warning: IconWarning,
  danger: IconWarning,
  reward: IconCoin
};

/**
 * Parses informal text strings like "+3 Winter Carrot" or "-12 Work"
 * into a structured NoticeDelta if not explicitly provided.
 */
function parseNoticeText(text: string): NoticeDelta | null {
  const laborMatch = text.match(/^([+-]\d+)\s+Work(?:\s*\((.*)\))?$/i);
  if (laborMatch) {
    const amount = parseInt(laborMatch[1], 10);
    const context = laborMatch[2] ? ` (${laborMatch[2]})` : "";
    return {
      kind: "labor",
      amount,
      label: `Work${context}`
    };
  }

  const deltaMatch = text.match(/^([+-]\d+)\s+(.+)$/);
  if (deltaMatch) {
    const amount = parseInt(deltaMatch[1], 10);
    const label = deltaMatch[2].trim();
    if (label.toLowerCase().endsWith("g") || label.toLowerCase().endsWith("gold")) {
      return { kind: "money", amount, label };
    }
    return { kind: "item", amount, label };
  }

  return null;
}

export const NoticeStack: React.FC<NoticeStackProps> = ({ notices, className = "" }) => {
  const visible = useMemo(
    () =>
      [...notices]
        .sort(
          (a, b) =>
            NOTICE_TONE_PRIORITY[a.tone] - NOTICE_TONE_PRIORITY[b.tone] ||
            b.createdMs - a.createdMs
        )
        .slice(0, NOTICE_MAX_VISIBLE),
    [notices]
  );

  const [leaving, setLeaving] = useState<readonly Notice[]>([]);
  const prevById = useRef(new Map<number, Notice>());
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const current = new Map(visible.map((notice) => [notice.id, notice] as const));
    const gone: Notice[] = [];
    for (const [id, notice] of prevById.current) {
      if (!current.has(id) && !timers.current.has(id)) gone.push(notice);
    }
    for (const id of current.keys()) {
      const timer = timers.current.get(id);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.current.delete(id);
        setLeaving((prior) => prior.filter((notice) => notice.id !== id));
      }
    }
    if (gone.length > 0) {
      setLeaving((prior) => {
        const known = new Set(prior.map((notice) => notice.id));
        return [...prior, ...gone.filter((notice) => !known.has(notice.id))];
      });
      for (const notice of gone) {
        const timer = window.setTimeout(() => {
          timers.current.delete(notice.id);
          setLeaving((prior) => prior.filter((entry) => entry.id !== notice.id));
        }, NOTICE_EXIT_MS);
        timers.current.set(notice.id, timer);
      }
    }
    prevById.current = current;
  }, [visible]);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    []
  );

  const renderNoticeBody = (notice: Notice) => {
    const delta = notice.delta ?? parseNoticeText(notice.text);
    if (delta) {
      const isPositive = delta.amount >= 0;
      const sign = isPositive ? "+" : "";
      const spriteSrc = delta.itemId
        ? atlasForCrop(delta.itemId) ?? atlasForFish(delta.itemId)
        : undefined;

      return (
        <div
          className={`toast-delta-layout delta-kind--${delta.kind}`}
          data-delta-kind={delta.kind}
        >
          <span
            className={`toast-delta-badge ${
              isPositive ? "delta-positive" : "delta-negative"
            }`}
          >
            {`${sign}${delta.amount}`}
          </span>
          {spriteSrc ? (
            <span className="toast-item-sprite">
              <AtlasImage src={spriteSrc} alt="" size={18} />
            </span>
          ) : delta.kind === "labor" ? (
            <span className="toast-labor-spark" aria-hidden="true">
              <IconEnergy size={12} />
            </span>
          ) : delta.kind === "money" ? (
            <IconCoin size={14} className="toast-money-coin" aria-hidden="true" />
          ) : null}
          <span className="toast-message-text">{delta.label}</span>
        </div>
      );
    }

    return <span className="toast-message-text">{notice.text}</span>;
  };

  return (
    <aside
      className={`hud-toast-container ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-atomic="false"
      data-testid="notice-stack"
      data-notice-count={visible.length}
    >
      {visible.map((notice) => {
        const Icon = TONE_ICON[notice.tone];
        const urgency =
          notice.tone === "danger"
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
            {renderNoticeBody(notice)}
            {notice.count > 1 && (
              <span
                className="toast-repeat-badge"
                aria-label={`repeated ${notice.count} times`}
              >
                {`x${notice.count}`}
              </span>
            )}
          </CoastalNotice>
        );
      })}
      {leaving
        .filter((notice) => !visible.some((entry) => entry.id === notice.id))
        .map((notice) => {
          const Icon = TONE_ICON[notice.tone];
          const urgency =
            notice.tone === "danger"
              ? "danger"
              : notice.tone === "warning"
                ? "caution"
                : notice.tone === "success" || notice.tone === "reward"
                  ? "success"
                  : "info";
          return (
            <CoastalNotice
              key={`leaving-${notice.id}`}
              urgency={urgency}
              className={`hud-toast-pill hud-toast-pill--${notice.tone} is-exiting`}
              role="presentation"
              aria-hidden="true"
              data-testid="toast"
              data-tone={notice.tone}
            >
              {Icon && (
                <span className="toast-tone-icon" aria-hidden="true">
                  <Icon size={14} aria-hidden="true" />
                </span>
              )}
              {renderNoticeBody(notice)}
              {notice.count > 1 && (
                <span className="toast-repeat-badge" aria-hidden="true">
                  {`x${notice.count}`}
                </span>
              )}
            </CoastalNotice>
          );
        })}
    </aside>
  );
};

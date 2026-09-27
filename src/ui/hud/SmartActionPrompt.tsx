import { villageTradeTextTr } from "../../i18n/villageTradeText";
import React, { useMemo } from "react";
import { KeyHint } from "../coastal/CoastalUI";
import { IconEnergy } from "../components/HudIcons";
import { useTranslation } from "../../i18n/useTranslation";
import { ContentRegistry } from "../../content/ContentRegistry";
import { TR_CROPS } from "../../i18n/locales/tr/crops";
import { TR_ITEMS } from "../../i18n/locales/tr/items";
import { TR_NPCS } from "../../i18n/locales/tr/npcs";

export interface SmartActionPromptProps {
  promptText: string | null;
  toastMessage?: string | null;
  touchChrome?: boolean;
  currentWork?: number;
  className?: string;
}

interface ParsedPromptStructure {
  rawKey: string | null;
  verb: string;
  target: string;
  laborCost: number | null;
  detail: string | null;
  cleanLabel: string;
  fullLabel: string;
}

const KNOWN_VERBS = new Set([
  "harvest",
  "till",
  "water",
  "plant",
  "fertilize",
  "weed",
  "board",
  "dock",
  "fish",
  "cast",
  "reel",
  "slack",
  "talk",
  "open",
  "inspect",
  "collect",
  "buy",
  "sell",
  "deliver",
  "interact",
  "release",
  "chum",
  "hook",
  "enter",
  "mount",
  "dismount",
  "ride",
  "steer",
  "moor",
  "unmoor",
  "rest",
  "repair",
  "tow"
]);

const TR_VERBS: Record<string, string> = {
  harvest: "Hasat Et",
  till: "Çapala",
  water: "Sula",
  plant: "Ek",
  fertilize: "Gübrele",
  weed: "Yabani Otları Temizle",
  board: "Bin",
  dock: "Yanaş",
  fish: "Balık Tut",
  cast: "Savur",
  reel: "Sar",
  slack: "Boşluk Ver",
  talk: "Konuş",
  open: "Aç",
  inspect: "İncele",
  collect: "Topla",
  buy: "Satın Al",
  sell: "Sat",
  deliver: "Teslim Et",
  interact: "Etkileş",
  release: "Sal",
  chum: "Yemle",
  hook: "Kancala",
  enter: "Gir",
  mount: "Bin",
  dismount: "İn",
  ride: "Sür",
  steer: "Yön Ver",
  moor: "Bağla",
  unmoor: "Palamarı Çöz",
  rest: "Dinlen",
  repair: "Onar",
  tow: "Çektir"
};

function translateTargetTr(target: string): string {
  if (!target) return target;
  const lower = target.toLowerCase();
  for (const [id, crop] of ContentRegistry.crops.entries()) {
    if (crop.name.toLowerCase() === lower) {
      return TR_CROPS[id]?.name ?? crop.name;
    }
  }
  for (const [id, item] of ContentRegistry.items.entries()) {
    if (item.name.toLowerCase() === lower) {
      return TR_ITEMS[id]?.name ?? item.name;
    }
  }
  for (const [id, npc] of ContentRegistry.npcs.entries()) {
    if (npc.name.toLowerCase() === lower) {
      return TR_NPCS[id]?.name ?? npc.name;
    }
  }
  if (lower === "soil") return "Toprak";
  if (lower === "ground") return "Toprak";
  if (lower === "water") return "Su";
  if (lower === "field") return "Tarla";
  return target;
}

function parseStructuredPrompt(
  text: string | null,
  toastMessage?: string | null
): ParsedPromptStructure | null {
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();
  if (toastMessage && trimmed === toastMessage.trim()) {
    return null;
  }
  if (trimmed.startsWith("Equipped:") || trimmed.startsWith("Saved")) {
    return null;
  }

  // 1. Extract bracketed keycap, e.g. "[E] Harvest Carrot" or "[Space] Hook"
  let rawKey: string | null = "E";
  let rest = trimmed;

  const keyMatch = trimmed.match(/^\[(.*?)\]\s*(.*)$/);
  const rightClickMatch = trimmed.match(/^Right-click\s*(?:to\s*)?/i);
  if (keyMatch) {
    rawKey = keyMatch[1].split("/")[0]?.trim() || keyMatch[1];
    rest = keyMatch[2];
  } else if (rightClickMatch) {
    rawKey = "RMB";
    rest = trimmed.replace(/^Right-click\s*(?:to\s*)?/i, "");
  }

  // 2. Labor cost badge: "(-5 Work)", "(5 Work)" or "-5 Work" at the end, or a
  // "· 8 Work" / "· ~8 Work" segment anywhere — crop prompts read
  // "Harvest Carrot · 8 Work · Right-click inspect", so the cost is not last.
  // A shortfall line ("Need 8 Work") is a requirement, not a cost, and is left alone.
  const WORK_COST = /\s*(?:\(\s*-?|·\s*~?-?|-)\s*(\d+)\s*Work\)?\s*(?=·|$)/i;
  let laborCost: number | null = null;
  const workMatch = rest.match(WORK_COST);
  if (workMatch) {
    laborCost = Number.parseInt(workMatch[1], 10);
  }

  // Strip the cost text so it is not duplicated in, or mangled into, the label.
  let sanitized = rest
    .replace(WORK_COST, "")
    .replace(/^\s*·\s*|\s*·\s*$/g, "")
    .trim();

  // 3. Separate detail if present (e.g. "working · 6h left · ready 14:00")
  let detail: string | null = null;
  let mainAction = sanitized;
  if (sanitized.includes("·")) {
    const parts = sanitized.split("·").map((p) => p.trim()).filter(Boolean);
    mainAction = parts[0] ?? "";
    if (parts.length > 1) {
      detail = parts.slice(1).join(" · ");
    }
  }

  // 4. Distinguish verb and target entity
  const words = mainAction.split(/\s+/).filter(Boolean);
  let verb = "";
  let target = "";

  if (words.length > 1 && KNOWN_VERBS.has(words[0].toLowerCase())) {
    verb = words[0];
    target = words.slice(1).join(" ");
  } else if (words.length > 2 && KNOWN_VERBS.has(`${words[0]} ${words[1]}`.toLowerCase())) {
    verb = `${words[0]} ${words[1]}`;
    target = words.slice(2).join(" ");
  } else if (words.length === 1 && KNOWN_VERBS.has(words[0].toLowerCase())) {
    verb = words[0];
    target = "";
  } else {
    verb = "";
    target = mainAction;
  }

  const cleanLabel = verb && target ? `${verb} ${target}` : (verb || target || mainAction);
  const fullLabel = detail ? `${cleanLabel} · ${detail}` : cleanLabel;

  return {
    rawKey,
    verb,
    target,
    laborCost,
    detail,
    cleanLabel,
    fullLabel
  };
}

/**
 * Instruction segments that only make sense with a mouse or keyboard. Touch
 * prompts come from the same world text the desktop HUD uses, so a detail like
 * "Right-click inspect" would otherwise read as a dead instruction on a phone.
 */
const DESKTOP_ONLY_HINT = /\b(?:right-click|left-click|double-click|lmb|rmb|esc|escape|ctrl|cmd|f2)\b/i;

function stripDesktopHints(detail: string | null): string | null {
  if (!detail) return null;
  const kept = detail
    .split("·")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !DESKTOP_ONLY_HINT.test(part));
  return kept.length > 0 ? kept.join(" · ") : null;
}

export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({
  promptText,
  toastMessage = null,
  touchChrome = false,
  currentWork,
  className = ""
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";

  const parsed = useMemo(
    () => parseStructuredPrompt(promptText, toastMessage),
    [promptText, toastMessage]
  );

  if (!parsed) return null;

  const rawDetail = touchChrome ? stripDesktopHints(parsed.detail) : parsed.detail;
  const detail = isTr && rawDetail ? villageTradeTextTr(rawDetail) : rawDetail;

  const isInsufficient =
    currentWork !== undefined &&
    parsed.laborCost != null &&
    currentWork < parsed.laborCost;

  const displayVerb = isTr ? (TR_VERBS[parsed.verb.toLowerCase()] ?? parsed.verb) : parsed.verb;
  const displayTarget = isTr ? villageTradeTextTr(translateTargetTr(parsed.target)) : parsed.target;
  const translatedCleanLabel = isTr
    ? (displayVerb && displayTarget ? `${displayTarget} ${displayVerb}` : (displayVerb || displayTarget || parsed.cleanLabel))
    : parsed.cleanLabel;

  const displayCleanLabel = isTr ? villageTradeTextTr(translatedCleanLabel) : translatedCleanLabel;
  const accessibleLabel = detail ? `${displayCleanLabel} · ${detail}` : displayCleanLabel;

  return (
    <div
      className={`smart-action-prompt interaction-prompt ${isInsufficient ? "is-insufficient" : ""} ${className}`.trim()}
      role="status"
      data-testid="context-prompt"
      aria-label={accessibleLabel}
    >
      <div className="prompt-content-row banner-content-row">
        {/* Primary Keycap */}
        {!touchChrome && parsed.rawKey && (
          <span className="prompt-keycap-slot">
            <KeyHint keyName={parsed.rawKey} />
          </span>
        )}

        {/* Action description text */}
        <span className="banner-text prompt-action-description">
          {displayVerb ? (
            isTr ? (
              <>
                {displayTarget ? (
                  <>
                    <span className="prompt-target">{displayTarget}</span>
                    {" "}
                  </>
                ) : null}
                <strong className="prompt-verb">{displayVerb}</strong>
              </>
            ) : (
              <>
                <strong className="prompt-verb">{displayVerb}</strong>
                {displayTarget ? (
                  <>
                    {" "}
                    <span className="prompt-target">{displayTarget}</span>
                  </>
                ) : null}
              </>
            )
          ) : (
            <span className="prompt-target">{displayCleanLabel}</span>
          )}
          {detail && <span className="prompt-detail"> · {detail}</span>}
        </span>

        {/* Labor Cost Badge */}
        {parsed.laborCost != null && (
          <div
            className={`prompt-labor-badge ${isInsufficient ? "is-insufficient" : ""}`.trim()}
            title={
              isInsufficient
                ? (isTr
                    ? `Yetersiz Emek Kapasitesi (${parsed.laborCost} Emek gerekiyor, elinde ${currentWork} var)`
                    : `Insufficient Work Capacity (Requires ${parsed.laborCost} Work, you have ${currentWork})`)
                : (isTr
                    ? `${parsed.laborCost} Emek gerektirir`
                    : `Requires ${parsed.laborCost} Labor / Work Capacity`)
            }
            data-testid="prompt-labor-cost"
          >
            <IconEnergy size={13} aria-hidden="true" />
            <span className="prompt-labor-cost-value">{`-${parsed.laborCost} ${isTr ? "Emek" : "Work"}`}</span>
          </div>
        )}
      </div>
    </div>
  );
};

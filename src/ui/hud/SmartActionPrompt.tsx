import React, { useMemo } from "react";
import { KeyHint } from "../coastal/CoastalUI";
import { IconEnergy } from "../components/HudIcons";

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
  "release"
]);

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
  if (keyMatch) {
    rawKey = keyMatch[1].split("/")[0]?.trim() || keyMatch[1];
    rest = keyMatch[2];
  }

  // 2. Check for labor cost badge anchored at the end of prompt, e.g. "(-5 Work)" or "(5 Work)" or "-5 Work" or "· 8 Work"
  let laborCost: number | null = null;
  const workMatch = rest.match(/(?:[\(\·]\s*-?|-)\s*(\d+)\s*Work\)?\s*$/i);
  if (workMatch) {
    laborCost = Number.parseInt(workMatch[1], 10);
  }

  // Sanitize description text by stripping out the trailing labor cost text to prevent duplication or mangling entity names
  let sanitized = rest
    .replace(/\s*(?:[\(\·]\s*-?|-)\s*\d+\s*Work\)?\s*$/i, "")
    .replace(/\s*·\s*$/, "")
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

export const SmartActionPrompt: React.FC<SmartActionPromptProps> = ({
  promptText,
  toastMessage = null,
  touchChrome = false,
  currentWork,
  className = ""
}) => {
  const parsed = useMemo(
    () => parseStructuredPrompt(promptText, toastMessage),
    [promptText, toastMessage]
  );

  if (!parsed) return null;

  const isInsufficient =
    currentWork !== undefined &&
    parsed.laborCost != null &&
    currentWork < parsed.laborCost;

  return (
    <div
      className={`smart-action-prompt interaction-prompt ${isInsufficient ? "is-insufficient" : ""} ${className}`.trim()}
      role="status"
      data-testid="context-prompt"
      aria-label={parsed.fullLabel}
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
          {parsed.verb ? (
            <>
              <strong className="prompt-verb">{parsed.verb}</strong>
              {parsed.target ? (
                <>
                  {" "}
                  <span className="prompt-target">{parsed.target}</span>
                </>
              ) : null}
            </>
          ) : (
            <span className="prompt-target">{parsed.cleanLabel}</span>
          )}
          {parsed.detail && <span className="prompt-detail"> · {parsed.detail}</span>}
        </span>

        {/* Labor Cost Badge */}
        {parsed.laborCost != null && (
          <div
            className={`prompt-labor-badge ${isInsufficient ? "is-insufficient" : ""}`.trim()}
            title={
              isInsufficient
                ? `Insufficient Work Capacity (Requires ${parsed.laborCost} Work, you have ${currentWork})`
                : `Requires ${parsed.laborCost} Labor / Work Capacity`
            }
            data-testid="prompt-labor-cost"
          >
            <IconEnergy size={13} aria-hidden="true" />
            <span className="prompt-labor-cost-value">{`-${parsed.laborCost} Work`}</span>
          </div>
        )}
      </div>
    </div>
  );
};

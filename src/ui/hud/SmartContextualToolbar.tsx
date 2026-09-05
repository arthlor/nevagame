import React from "react";
import type { ContextualHotbarSlotDto, ContextualStanceId } from "../../simulation/core/contracts";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_ACTION, UI_MENU, UI_STATUS, UI_SUPPLIES, UI_TOOLS, UI_WORLD } from "../chrome/uiAtlas";
import { UI_TIDEBOOK } from "../chrome/uiAtlas.generated";
import { playUiSound } from "../audio/uiAudio";

export interface SmartContextualToolbarProps {
  stance: ContextualStanceId;
  hotbar: readonly ContextualHotbarSlotDto[];
  activeSlot: number;
  onSelectSlot?: (slot: number) => void;
  className?: string;
}

const STANCE_LABELS: Record<ContextualStanceId, string> = {
  agronomy: "Agronomy", angling: "Angling", maritime: "Maritime", explorer: "Explorer"
};

function toolPainting(icon: ContextualHotbarSlotDto["icon"]): string {
  switch (icon) {
    case "hoe": return UI_TIDEBOOK.hoe;
    case "seeds": return UI_TIDEBOOK.seeds;
    case "water": return UI_TIDEBOOK.water;
    case "rod": return UI_TIDEBOOK.rod;
    case "harvest": return UI_TIDEBOOK.harvest;
    case "satchel": return UI_TIDEBOOK.satchel;
    case "map": return UI_TIDEBOOK.map;
    case "journal": return UI_TIDEBOOK.journal;
    case "fertilizer": return UI_SUPPLIES["item.basic_fertilizer"];
    case "lure": return UI_SUPPLIES["item.basic_lure"];
    case "bait": return UI_TOOLS.bait;
    case "fish": return UI_WORLD.fish;
    case "stow": return UI_ACTION.pickup;
    case "fuel": return UI_SUPPLIES["item.boat_fuel"];
    case "hold": return UI_MENU.ledger;
    case "rations": return UI_STATUS.labor;
    case "lantern": return UI_MENU.expedition;
    default: return UI_WORLD.boat;
  }
}

export const SmartContextualToolbar: React.FC<SmartContextualToolbarProps> = ({
  stance, hotbar, activeSlot, onSelectSlot, className = ""
}) => {
  const currentSlot = hotbar.find((slot) => slot.slot === activeSlot) ?? null;
  return (
    <div className={`smart-contextual-toolbar tidebook-tool-belt interactive ${className}`.trim()}
      role="toolbar" aria-label={`${STANCE_LABELS[stance] ?? STANCE_LABELS.explorer} Stance quickbar`} data-testid="smart-contextual-toolbar">
      <div className="tidebook-tool-slots" role="group" aria-label="Tool slots">
        {hotbar.map((slot) => {
          const selected = slot.slot === activeSlot;
          const slotName = slot.icon === "seeds" ? `${slot.name} (Seeds)` : slot.name;
          return (
            <button key={slot.slot} type="button"
              className={`tidebook-tool-slot ${selected ? "is-active" : ""} ${slot.ready ? "" : "is-unavailable"}`}
              aria-label={`${slotName}, ${slot.detail}, slot ${slot.slot}`}
              title={`${slotName} — ${slot.detail} (${slot.shortcutKey})`}
              aria-pressed={selected} data-testid={`tool-slot-${slot.slot}`} data-ready={slot.ready}
              onClick={() => { playUiSound("click"); onSelectSlot?.(slot.slot); }}>
              <span className="tidebook-slot-number">{slot.shortcutKey}</span>
              <AtlasImage src={toolPainting(slot.icon)} className={`tidebook-tool-painting tidebook-tool-painting--${slot.icon}`} aria-hidden="true" />
              {slot.quantity != null && <span className="tidebook-tool-count">{slot.quantity > 99 ? "99+" : slot.quantity}</span>}
              {slot.meter && (
                <span className={`tidebook-slot-meter ${slot.meter.danger ? "is-danger" : ""}`}
                  title={`${slot.meter.label ?? "Level"}: ${slot.meter.percent}%`}>
                  <span style={{ width: `${Math.max(0, Math.min(100, slot.meter.percent))}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {currentSlot && (
        <div className="tidebook-tool-readout" style={{ "--selected-slot": activeSlot - 1 } as React.CSSProperties} aria-live="polite">
          <strong>{currentSlot.name}</strong>
          <span className="tidebook-tool-detail">{currentSlot.detail}</span>
        </div>
      )}
    </div>
  );
};

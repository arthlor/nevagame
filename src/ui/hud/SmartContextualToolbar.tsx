import React from "react";
import type { ContextualHotbarSlotDto, ContextualStanceId } from "../../simulation/core/contracts";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_ACTION, UI_MENU, UI_STATUS, UI_SUPPLIES, UI_TOOLS, UI_WORLD } from "../chrome/uiAtlas";
import { UI_TIDEBOOK } from "../chrome/uiAtlas.generated";
import { GuildcraftArt } from "./GuildcraftArt";
import { playUiSound } from "../audio/uiAudio";

export interface SmartContextualToolbarProps {
  stance: ContextualStanceId;
  hotbar: readonly ContextualHotbarSlotDto[];
  activeSlot: number;
  onSelectSlot?: (slot: number) => void;
  /**
   * Bumped by the game whenever the belt should show itself unprompted — a
   * stance change, or a tool the world swapped in on the player's behalf.
   */
  revealToken?: number;
  /** Touch has no hover, and every socket must stay tappable. */
  alwaysExpanded?: boolean;
  className?: string;
}

const STANCE_LABELS: Record<ContextualStanceId, string> = {
  agronomy: "Agronomy", angling: "Angling", maritime: "Maritime", explorer: "Explorer"
};

/**
 * How long the rank stays fanned out after the last nudge.
 *
 * The belt also opens on first mount. Give a new player long enough to scan
 * all five tools and their number keys before it folds down to the active
 * socket; 1.4 seconds was shorter than a comfortable first read.
 */
const COLLAPSE_DELAY_MS = 3200;

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
    case "helm": return UI_WORLD.boat;
    case "hold": return UI_MENU.ledger;
    case "rations": return UI_STATUS.labor;
    case "lantern": return UI_MENU.expedition;
    default: return UI_WORLD.boat;
  }
}

export const SmartContextualToolbar: React.FC<SmartContextualToolbarProps> = ({
  stance, hotbar, activeSlot, onSelectSlot, revealToken = 0, alwaysExpanded = false, className = ""
}) => {
  const [nudge, setNudge] = React.useState(0);
  const [pointerInside, setPointerInside] = React.useState(false);
  const [focusInside, setFocusInside] = React.useState(false);

  // Any nudge — a stance change, a keypress, an auto-equip — reopens the rank
  // for a moment and then lets it fold away on its own.
  React.useEffect(() => {
    if (alwaysExpanded) return;
    if (nudge === 0) return;
    const timeout = window.setTimeout(() => setNudge(0), COLLAPSE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [nudge, alwaysExpanded]);

  React.useEffect(() => {
    setNudge((count) => count + 1);
  }, [revealToken, stance, activeSlot]);

  if (hotbar.length === 0) return null;

  // Two degrees of openness. The rank fans out for any nudge, including ones
  // the player did not ask for; the nameplate only appears while they are
  // deliberately browsing the belt, because it sits over the action prompt.
  const browsing = pointerInside || focusInside;
  const expanded = alwaysExpanded || browsing || nudge > 0;
  const currentSlot = hotbar.find((slot) => slot.slot === activeSlot) ?? null;
  // Collapsed, the belt shows the tool in hand. Nothing on this belt equipped
  // still leaves a socket standing so the dock is never an empty frame — but
  // it is not named, because naming it would claim it was drawn.
  const restingSlot = currentSlot ?? hotbar[0];

  return (
    <div
      className={[
        "smart-contextual-toolbar", "guild-tool-belt", "interactive",
        expanded ? "is-expanded" : "is-collapsed",
        browsing ? "is-browsing" : "",
        className
      ].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={`${STANCE_LABELS[stance] ?? STANCE_LABELS.explorer} Stance quickbar`}
      aria-expanded={expanded}
      data-testid="smart-contextual-toolbar"
      data-stance={stance}
      data-expanded={expanded}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false);
      }}
      onWheel={() => setNudge((count) => count + 1)}
    >
      <div className="guild-tool-slots" role="group" aria-label="Tool slots">
        {hotbar.map((slot) => {
          const selected = slot.slot === activeSlot;
          const resting = slot.slot === restingSlot.slot;
          const slotName = slot.icon === "seeds" ? `${slot.name} (Seeds)` : slot.name;
          return (
            <button key={slot.slot} type="button"
              className={[
                "guild-tool-slot",
                selected ? "is-active" : "",
                slot.ready ? "" : "is-unavailable",
                slot.active ? "is-armed" : "",
                resting ? "is-resting" : ""
              ].filter(Boolean).join(" ")}
              aria-label={`${slotName}, ${slot.detail}, slot ${slot.slot}`}
              title={`${slotName} — ${slot.detail} (${slot.shortcutKey})`}
              aria-pressed={selected}
              // Collapsed, only the socket you can actually see takes a tab
              // stop. Landing on it focuses the belt, which fans out the rest.
              tabIndex={expanded || resting ? 0 : -1}
              data-testid={`tool-slot-${slot.slot}`} data-ready={slot.ready}
              onClick={() => { playUiSound("click"); setNudge((count) => count + 1); onSelectSlot?.(slot.slot); }}>
              <GuildcraftArt art={selected ? "slot-selected" : "slot"} className="guild-slot-frame" />
              {slot.active && <GuildcraftArt art="ring" className="guild-slot-armed-ring" />}
              <span className="guild-slot-number">{slot.shortcutKey}</span>
              <AtlasImage src={toolPainting(slot.icon)} className={`guild-tool-painting guild-tool-painting--${slot.icon}`} aria-hidden="true" />
              {slot.quantity != null && <span className="guild-tool-count">{slot.quantity > 99 ? "99+" : slot.quantity}</span>}
            </button>
          );
        })}
      </div>
      {currentSlot && (
        <div className="guild-tool-readout" aria-live="polite">
          <strong>{currentSlot.name}</strong>
          <span className="guild-tool-detail">{currentSlot.detail}</span>
        </div>
      )}
    </div>
  );
};

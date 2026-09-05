import React, { useEffect, useRef, useState } from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_MENU } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";
import { TidebookArt } from "./TidebookArt";

export type ActiveModal = "inventory" | "market" | "journal" | "ledger" | "map" | "expedition" | "pause" | "dialogue";

export interface MicroMenuPurseBarProps {
  money: number;
  capacity: { satchelUsed: number; satchelMax: number; cargoUsed: number; cargoMax: number };
  expeditionUnlocked?: boolean;
  onOpenModal: (modal: ActiveModal) => void;
  className?: string;
}

export const TidebookPurse: React.FC<{ money: number }> = ({ money }) => {
  const previous = useRef(money);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    const difference = money - previous.current;
    previous.current = money;
    if (difference === 0) return;
    setDelta(difference);
    const timeout = window.setTimeout(() => setDelta(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [money]);
  return (
    <div className="tidebook-purse" aria-label={`Purse: ${money.toLocaleString()} gold`} data-testid="hud-gold-purse">
      <span className="tidebook-gold">{money.toLocaleString()} G</span>
      {delta != null && <span className={`tidebook-gold-delta ${delta > 0 ? "is-gain" : "is-spend"}`} role="status">
        {delta > 0 ? "+" : ""}{delta.toLocaleString()} G
      </span>}
    </div>
  );
};

export const MicroMenuPurseBar: React.FC<MicroMenuPurseBarProps> = ({
  capacity, expeditionUnlocked = false, onOpenModal, className = ""
}) => {
  const handleAction = (modal: ActiveModal) => { playUiSound("open"); onOpenModal(modal); };
  const full = capacity.satchelUsed >= capacity.satchelMax;
  const nearlyFull = capacity.satchelUsed >= capacity.satchelMax * 0.9;
  return (
    <div className={`micro-menu-purse-bar tidebook-utilities interactive ${className}`.trim()}
      data-testid="micro-menu-purse-bar" role="region" aria-label="Capacities and system menu">
      <nav className="tidebook-secondary-menu" aria-label="Additional panels">
        <button type="button" onClick={() => handleAction("ledger")} title="Hold & Stores (L)"
          aria-label="Open fleet hold and warehouse ledger" data-testid="micro-btn-ledger">
          <AtlasImage src={UI_MENU.ledger} size={18} aria-hidden="true" /><span>L</span>
          {capacity.cargoUsed > 0 && <span data-testid="cargo-capacity-badge">{capacity.cargoUsed}/{capacity.cargoMax}</span>}
        </button>
        <button type="button" onClick={() => handleAction("expedition")} disabled={!expeditionUnlocked}
          title={expeditionUnlocked ? "Expedition Board (P)" : "Expeditions — explore more of Neva to unlock"}
          aria-label="Open expedition planner" data-testid="micro-btn-expeditions">
          <AtlasImage src={UI_MENU.expedition} size={18} aria-hidden="true" /><span>P</span>
        </button>
        <button type="button" className="tidebook-menu-button" onClick={() => handleAction("pause")} title="Open game menu (Esc)"
          aria-label="Open game menu (Esc)" data-testid="micro-btn-menu">
          <AtlasImage src={UI_MENU.menu} size={18} aria-hidden="true" /><span>Esc</span>
        </button>
      </nav>
      <nav className="tidebook-utility-tabs" role="toolbar" aria-label="Quick panel access">
        <button type="button" className={`tidebook-utility-tab ${full ? "is-full" : nearlyFull ? "is-warning" : ""}`}
          onClick={() => handleAction("inventory")} title={`Satchel: ${capacity.satchelUsed} of ${capacity.satchelMax} slots (I)`}
          aria-label="Open satchel inventory" data-testid="micro-btn-satchel">
          <TidebookArt art="satchel" className="tidebook-utility-painting" />
          <span className="tidebook-utility-key" data-testid="satchel-capacity-badge">{capacity.satchelUsed}/{capacity.satchelMax}</span>
        </button>
        <button type="button" className="tidebook-utility-tab" onClick={() => handleAction("journal")}
          title="Field Journal & Quests (J)" aria-label="Open field journal and quests" data-testid="micro-btn-journal">
          <TidebookArt art="journal" className="tidebook-utility-painting" />
          <span className="tidebook-utility-key">J</span>
        </button>
        <button type="button" className="tidebook-utility-tab" onClick={() => handleAction("map")}
          title="Nautical Chart (M)" aria-label="Open nautical chart" data-testid="micro-btn-map">
          <TidebookArt art="map" className="tidebook-utility-painting" />
          <span className="tidebook-utility-key">M</span>
        </button>
      </nav>
    </div>
  );
};

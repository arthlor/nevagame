import React, { useEffect, useRef, useState } from "react";
import { AtlasImage } from "../chrome/AtlasImage";
import { UI_MENU, UI_STATUS } from "../chrome/uiAtlas";
import { playUiSound } from "../audio/uiAudio";
import { TidebookArt } from "./TidebookArt";
import { GuildcraftArt } from "./GuildcraftArt";
import type { ActiveModal } from "../../app/ModeController";

export type { ActiveModal } from "../../app/ModeController";

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
    <div className="guild-purse" aria-label={`Purse: ${money.toLocaleString()} gold`} data-testid="hud-gold-purse">
      <AtlasImage src={UI_STATUS.coin} size={20} aria-hidden="true" /><span className="guild-gold">{money.toLocaleString()} G</span>
      {delta != null && <span className={`guild-gold-delta ${delta > 0 ? "is-gain" : "is-spend"}`} role="status">
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
  const items: Array<{ id: ActiveModal; label: string; key: string; art: string; test: string }> = [
    { id: "inventory", label: "Open satchel inventory", key: "I", art: UI_MENU.backpack, test: "satchel" },
    { id: "journal", label: "Open field journal and quests", key: "J", art: UI_MENU.journal, test: "journal" },
    { id: "map", label: "Open nautical chart", key: "M", art: UI_MENU.compass, test: "map" },
    { id: "ledger", label: "Open fleet hold and warehouse ledger", key: "L", art: UI_MENU.ledger, test: "ledger" },
    ...(expeditionUnlocked ? [{ id: "expedition" as const, label: "Open expedition planner", key: "P", art: UI_MENU.expedition, test: "expeditions" }] : []),
    { id: "pause", label: "Open game menu (Esc)", key: "Esc", art: UI_MENU.menu, test: "menu" }
  ];
  return <nav className={`micro-menu-purse-bar guild-utilities interactive ${className}`}
    data-testid="micro-menu-purse-bar" aria-label="Capacities and system menu">
    {items.map((item) => <button type="button" key={item.id}
      className={`guild-utility ${item.id === "pause" ? "guild-menu-button" : ""} ${item.id === "inventory" && full ? "is-full" : item.id === "inventory" && nearlyFull ? "is-warning" : ""}`}
      onClick={() => handleAction(item.id)} aria-label={item.label}
      title={`${item.label} (${item.key})`} data-testid={`micro-btn-${item.test}`}>
      <GuildcraftArt art="ring" className="guild-utility-rim" />
      {item.id === "inventory" || item.id === "journal" || item.id === "map"
        ? <TidebookArt art={item.id === "inventory" ? "satchel" : item.id} className="guild-utility-painting" />
        : <AtlasImage src={item.art} className="guild-utility-painting" aria-hidden="true" />}
      {item.id === "inventory" && <span className="guild-capacity" data-testid="satchel-capacity-badge">{capacity.satchelUsed}/{capacity.satchelMax}</span>}
      {item.id === "ledger" && capacity.cargoUsed > 0 && <span className="guild-capacity" data-testid="cargo-capacity-badge">{capacity.cargoUsed}/{capacity.cargoMax}</span>}
      <span className="guild-utility-key">{item.key}</span>
    </button>)}
  </nav>;
};

import React from "react";
import type { HudStatusChipDto, WorldHudDto } from "../../simulation/core/contracts";
import { HudIcon } from "../components/HudIcons";
import { Meter } from "../coastal/CoastalUI";
import { GuildcraftArt } from "./GuildcraftArt";

export interface PlayerUnitFrameProps {
  work: WorldHudDto["work"];
  sprint: WorldHudDto["sprint"];
  statusEffects?: readonly HudStatusChipDto[];
  onOpenCharacterSheet?: () => void;
  className?: string;
}

export const PlayerUnitFrame: React.FC<PlayerUnitFrameProps> = ({
  work, sprint, statusEffects = [], onOpenCharacterSheet, className = ""
}) => {
  const workCurrent = Math.round(work.current);
  const workMaximum = Math.round(work.maximum);
  const sprintCurrent = sprint ? Math.round(sprint.current) : 0;
  const sprintMaximum = sprint ? Math.round(sprint.maximum) : 0;

  return (
  <div className={`player-unit-frame guild-vitals ${className}`} role="region"
    aria-label="Player unit status" data-testid="player-unit-frame">
    <button type="button" className="guild-profile" title="Open Character & Gear (C)"
      aria-label="Player profile and crest" onClick={onOpenCharacterSheet}>
      <GuildcraftArt art="portrait" className="guild-profile-painting" />
      <GuildcraftArt art="ring" className="guild-profile-rim" />
      <GuildcraftArt art="seal" className="guild-profile-seal" />
    </button>
    <span className="guild-player-name">Wayfarer</span>
    <div className={`guild-vital-bar guild-work ${work.exhausted ? "is-exhausted" : work.recharging ? "is-recharging" : ""}`}>
      <Meter className="guild-vital-meter" label="Work" value={workCurrent} max={workMaximum}
        showLabel={false} showValue={false} fill={work.exhausted ? "danger" : "gold"}
        valueText={work.exhausted ? `${workCurrent} of ${workMaximum} — exhausted, recovering` : undefined} />
      <GuildcraftArt art="meter" className="guild-vital-rim" />
      <span className="guild-vital-readout">Work <strong>{workCurrent} / {workMaximum}</strong></span>
    </div>
    {sprint && <div className={`guild-vital-bar guild-sprint ${sprint.exhausted ? "is-exhausted" : ""}`}>
      <Meter className="guild-vital-meter" label="Sprint" value={sprintCurrent} max={sprintMaximum}
        valueText={sprint.exhausted ? "Winded — stamina recovering" : undefined}
        showLabel={false} showValue={false} fill={sprint.exhausted ? "danger" : "sprint"}
        data-testid="sprint-stamina" />
      <GuildcraftArt art="meter" className="guild-vital-rim" />
      <span className="guild-vital-readout">{sprint.exhausted
        ? <>Sprint <span data-testid="sprint-stamina-winded" role="status">Winded</span></>
        : <>Sprint <strong>{sprintCurrent} / {sprintMaximum}</strong></>}</span>
    </div>}
    {statusEffects.length > 0 && <div className="guild-status-effects" aria-label="Active status effects">
      {statusEffects.map((chip) => <span key={chip.id} className={`guild-status-effect status-chip--${chip.type}`}
        title={`${chip.label}: ${chip.description}`} data-testid={`status-chip-${chip.id}`}>
        <HudIcon name={chip.icon} size={14} /><span>{chip.label}</span>
      </span>)}
    </div>}
  </div>
  );
};

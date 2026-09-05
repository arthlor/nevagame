import React from "react";
import type { HudStatusChipDto, WorldHudDto } from "../../simulation/core/contracts";
import { HudIcon } from "../components/HudIcons";
import { Meter } from "../coastal/CoastalUI";
import { TidebookArt } from "./TidebookArt";

export interface PlayerUnitFrameProps {
  work: WorldHudDto["work"];
  sprint: WorldHudDto["sprint"];
  statusEffects?: readonly HudStatusChipDto[];
  onOpenCharacterSheet?: () => void;
  className?: string;
}

export const PlayerUnitFrame: React.FC<PlayerUnitFrameProps> = ({
  work, sprint, statusEffects = [], onOpenCharacterSheet, className = ""
}) => (
  <div className={`player-unit-frame tidebook-vitals ${className}`.trim()} role="region"
    aria-label="Player unit status" data-testid="player-unit-frame">
    <button type="button" className="tidebook-wheat-profile" title="Open your field journal"
      aria-label="Player profile and crest" onClick={onOpenCharacterSheet}><TidebookArt art="journal" /></button>
    <div className={`tidebook-vital-row tidebook-work ${work.exhausted ? "is-exhausted" : ""}`}>
      <span className="tidebook-vital-label">Work</span>
      <Meter className={`tidebook-vital-meter ${work.recharging ? "is-recharging" : ""}`}
        label="Work" title={work.exhausted ? "Exhausted — Work is recovering" : `Work ${work.current} of ${work.maximum}`}
        value={work.current} max={work.maximum} showLabel={false} showValue={false}
        fill={work.exhausted ? "danger" : "gold"} />
      <span className="tidebook-work-value">{work.current} / {work.maximum}</span>
    </div>
    {sprint && (
      <div className={`tidebook-vital-row tidebook-sprint ${sprint.exhausted ? "is-exhausted" : ""}`}>
        <span className="tidebook-vital-label">Sprint</span>
        <Meter className="tidebook-vital-meter" label="Sprint" value={sprint.current} max={sprint.maximum}
          valueText={sprint.exhausted ? "Winded — stamina recovering" : undefined}
          showLabel={false} showValue={false} fill={sprint.exhausted ? "danger" : "sprint"}
          data-testid="sprint-stamina" />
        {sprint.exhausted && <span className="tidebook-winded" data-testid="sprint-stamina-winded" role="status">Winded</span>}
      </div>
    )}
    {statusEffects.length > 0 && (
      <div className="tidebook-status-effects" role="status" aria-label="Active status effects">
        {statusEffects.map((chip) => (
          <span key={chip.id} className={`tidebook-status-effect status-chip--${chip.type}`}
            title={`${chip.label}: ${chip.description}`} data-testid={`status-chip-${chip.id}`}>
            <HudIcon name={chip.icon} size={12} /><span>{chip.label}</span>
          </span>
        ))}
      </div>
    )}
  </div>
);

import React, { useEffect, useRef, useState } from "react";
import type { HudStatusChipDto, WorldHudDto } from "../../simulation/core/contracts";
import { HudIcon } from "../components/HudIcons";
import { Meter } from "../coastal/CoastalUI";
import { GuildcraftArt } from "./GuildcraftArt";
import { translateStatusChip } from "../../i18n/statusChipsTr";
import { useTranslation } from "../../i18n/useTranslation";

export interface PlayerUnitFrameProps {
  work: WorldHudDto["work"];
  sprint: WorldHudDto["sprint"];
  mount?: WorldHudDto["mount"];
  statusEffects?: readonly HudStatusChipDto[];
  onOpenCharacterSheet?: () => void;
  className?: string;
}

export const PlayerUnitFrame: React.FC<PlayerUnitFrameProps> = React.memo<PlayerUnitFrameProps>(({
  work, sprint, mount, statusEffects = [], onOpenCharacterSheet, className = ""
}) => {
  const { t, locale } = useTranslation();
  const workCurrent = Math.round(work.current);
  const workMaximum = Math.round(work.maximum);
  const sprintCurrent = sprint ? Math.round(sprint.current) : 0;
  const sprintMaximum = sprint ? Math.round(sprint.maximum) : 0;
  const mountCurrent = mount ? Math.round(mount.current) : 0;
  const mountMaximum = mount ? Math.round(mount.maximum) : 0;

  // A Work change pulses the pool bar so an earned shift or a paid action is
  // legible on the HUD itself, not only in a toast. Presentation-only state.
  const previousWork = useRef(workCurrent);
  const [workPulse, setWorkPulse] = useState<"" | "is-gaining" | "is-spending">("");
  useEffect(() => {
    const before = previousWork.current;
    previousWork.current = workCurrent;
    if (workCurrent === before) return;
    setWorkPulse(workCurrent > before ? "is-gaining" : "is-spending");
    const timer = window.setTimeout(() => setWorkPulse(""), 700);
    return () => window.clearTimeout(timer);
  }, [workCurrent]);

  return (
  <div className={`player-unit-frame guild-vitals ${className}`} role="region"
    aria-label={locale === "tr" ? "Oyuncu durumu" : "Player unit status"} data-testid="player-unit-frame">
    <button type="button" className="guild-profile" title={locale === "tr" ? "Karakter ve Donanımı Aç (C)" : "Open Character & Gear (C)"}
      aria-label={locale === "tr" ? "Karakter ve donanımı aç" : "Open character and gear"} onClick={onOpenCharacterSheet}>
      <GuildcraftArt art="portrait" className="guild-profile-painting" />
      <GuildcraftArt art="ring" className="guild-profile-rim" />
      <GuildcraftArt art="seal" className="guild-profile-seal" />
    </button>
    <div className={`guild-vital-bar guild-work ${work.exhausted ? "is-exhausted" : ""}${workPulse ? ` ${workPulse}` : ""}`}>
      <Meter className="guild-vital-meter" label={t("hud.workCapacity")} value={workCurrent} max={workMaximum}
        showLabel={false} showValue={false} fill={work.exhausted ? "danger" : "gold"}
        valueText={work.exhausted ? `${workCurrent} / ${workMaximum} — ${locale === "tr" ? "dinlen, yemek ye ya da emek kazan" : "rest, eat, or work to recover"}` : undefined} />
      <GuildcraftArt art="meter" className="guild-vital-rim" />
      <span className="guild-vital-readout"><span className="guild-vital-label">{t("hud.workCapacity")}</span> <strong>{workCurrent} / {workMaximum}</strong>
        {work.earnCap != null && <em className="guild-work-earned" data-testid="work-earned-today">
          {" "}+{work.earnedToday ?? 0}/{work.earnCap} {locale === "tr" ? "bugün" : "today"}
        </em>}
      </span>
    </div>
    {sprint && (() => {
      const isFull = sprintCurrent >= sprintMaximum && !sprint.exhausted;
      return (
        <div className={`guild-vital-bar guild-sprint ${sprint.exhausted ? "is-exhausted" : ""}${isFull ? " is-auto-hidden" : ""}`}>
          <Meter className="guild-vital-meter" label={locale === "tr" ? "Depar" : "Sprint"} value={sprintCurrent} max={sprintMaximum}
            valueText={sprint.exhausted ? (locale === "tr" ? "Soluklanıyor — dayanıklılık toparlanıyor" : "Winded — stamina recovering") : undefined}
            showLabel={false} showValue={false} fill={sprint.exhausted ? "danger" : "sprint"}
            data-testid="sprint-stamina" />
          <GuildcraftArt art="meter" className="guild-vital-rim" />
          <span className="guild-vital-readout">{sprint.exhausted
            ? <><span className="guild-vital-label">{locale === "tr" ? "Depar" : "Sprint"}</span> <span data-testid="sprint-stamina-winded" role="status">{locale === "tr" ? "Nefessiz" : "Winded"}</span></>
            : <><span className="guild-vital-label">{locale === "tr" ? "Depar" : "Sprint"}</span> <strong>{sprintCurrent} / {sprintMaximum}</strong></>}</span>
        </div>
      );
    })()}
    {mount && (() => {
      const mountName = locale === "tr" && mount.label.toLowerCase() === "donkey" ? "Eşek" : mount.label;
      const isFull = mountCurrent >= mountMaximum && !mount.exhausted;
      return (
        <div className={`guild-vital-bar guild-sprint ${mount.exhausted ? "is-exhausted" : ""}${isFull ? " is-auto-hidden" : ""}`}>
          <Meter className="guild-vital-meter" label={mountName} value={mountCurrent} max={mountMaximum}
            valueText={mount.exhausted ? (locale === "tr" ? `Yoruldu — ${mountName.toLowerCase()} soluklanıyor` : `Winded — ${mount.label.toLowerCase()} recovering`) : undefined}
            showLabel={false} showValue={false} fill={mount.exhausted ? "danger" : "sprint"}
            data-testid="mount-stamina" />
          <GuildcraftArt art="meter" className="guild-vital-rim" />
          <span className="guild-vital-readout">{mount.exhausted
            ? <><span className="guild-vital-label">{mountName}</span> <span data-testid="mount-stamina-winded" role="status">{locale === "tr" ? "Yoruldu" : "Winded"}</span></>
            : <><span className="guild-vital-label">{mountName}</span> <strong>{mountCurrent} / {mountMaximum}</strong></>}</span>
        </div>
      );
    })()}
    {statusEffects.length > 0 && <div className="guild-status-effects" aria-label={locale === "tr" ? "Aktif durum etkileri" : "Active status effects"}>
      {statusEffects.map((chip) => {
        const copy = translateStatusChip(chip, locale);
        return <span key={chip.id} className={`guild-status-effect status-chip--${chip.type}`}
          title={`${copy.label}: ${copy.description}`} data-testid={`status-chip-${chip.id}`}>
          <HudIcon name={chip.icon} size={14} /><span>{copy.label}</span>
        </span>;
      })}
    </div>}
  </div>
  );
}, (prev, next) => {
  if (prev.className !== next.className) return false;
  if (prev.onOpenCharacterSheet !== next.onOpenCharacterSheet) return false;
  if (Math.round(prev.work.current) !== Math.round(next.work.current)) return false;
  if (Math.round(prev.work.maximum) !== Math.round(next.work.maximum)) return false;
  if (prev.work.exhausted !== next.work.exhausted) return false;
  if (prev.work.earnedToday !== next.work.earnedToday) return false;
  if (prev.work.earnCap !== next.work.earnCap) return false;
  if (prev.work.showLowNotice !== next.work.showLowNotice) return false;
  if (Math.round(prev.sprint?.current ?? 0) !== Math.round(next.sprint?.current ?? 0)) return false;
  if (Math.round(prev.sprint?.maximum ?? 0) !== Math.round(next.sprint?.maximum ?? 0)) return false;
  if (prev.sprint?.exhausted !== next.sprint?.exhausted) return false;
  if (Math.round(prev.mount?.current ?? 0) !== Math.round(next.mount?.current ?? 0)) return false;
  if (Math.round(prev.mount?.maximum ?? 0) !== Math.round(next.mount?.maximum ?? 0)) return false;
  if (prev.mount?.exhausted !== next.mount?.exhausted) return false;
  if (prev.mount?.label !== next.mount?.label) return false;
  const prevEffects = prev.statusEffects ?? [];
  const nextEffects = next.statusEffects ?? [];
  if (prevEffects.length !== nextEffects.length) return false;
  for (let i = 0; i < prevEffects.length; i++) {
    if (prevEffects[i].id !== nextEffects[i].id || prevEffects[i].label !== nextEffects[i].label) return false;
  }
  return true;
});

import type { LaborHudDto } from "../../simulation/core/contracts";
import { IconEnergy } from "../components/HudIcons";
import { ChromeButton, ChromeKeycap } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";
import { useTranslation } from "../../i18n/useTranslation";
import { useId } from "react";
import "./labor.css";

interface LaborMinigameWidgetProps {
  hud: LaborHudDto;
  onStrike: () => void;
  onCancel: () => void;
}

/**
 * The Work-shift timing instrument. It displays a simulation-owned meter and
 * sweet-spot band plus two commands; it never derives the sweet spot, the
 * strike grade or the reward itself. The needle and band are positioned
 * straight from the HUD DTO, so the display cannot drift from the simulation.
 */
export function LaborMinigameWidget({ hud, onStrike, onCancel }: LaborMinigameWidgetProps) {
  const { t } = useTranslation();
  const guidanceId = useId();

  const meterPercent = Math.round(hud.meter * 100);
  const sweetLeft = Math.round(hud.targetMin * 100);
  const sweetWidth = Math.max(2, Math.round((hud.targetMax - hud.targetMin) * 100));
  const inSweet = hud.timingGrade === "clean";
  const yieldPreview = Math.max(0, Math.round(hud.yield));
  const stationKey = hud.stationId?.replace(/^labor\./, "");
  const stationTitle = stationKey ? t(`labor.stations.${stationKey}.title`) : hud.stationName;
  const gradeLabel = t(`labor.${hud.timingGrade}`);

  return (
    <div className="labor-shift-container" data-testid="labor-minigame" aria-label={stationTitle}>
      <GameSheet
        family="ink"
        tone="slate"
        corners
        className={`labor-shift${inSweet ? " is-in-sweet" : ""}${hud.timingGrade === "glancing" ? " is-glancing" : ""}`}
      >
        <header className="labor-shift__header">
          <span className="labor-shift__title">
            <IconEnergy size={15} aria-hidden="true" />
            {stationTitle}
          </span>
          {yieldPreview > 0 && (
            <span
              className="labor-shift__reward"
              title={t("labor.cleanReward", { amount: yieldPreview })}
              data-testid="labor-shift-reward"
            >
              {`+${yieldPreview} ${t("labor.work")}`}
            </span>
          )}
        </header>

        <p className="labor-shift__context">{t(`labor.stations.${stationKey}.context`)}</p>

        <div
          className="labor-shift__meter"
          role="meter"
          aria-label={t("labor.timing", { station: stationTitle })}
          aria-describedby={guidanceId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={meterPercent}
          aria-valuetext={t("labor.meterReading", { percent: meterPercent, grade: gradeLabel })}
        >
          <div className="labor-shift__track">
            <span
              className="labor-shift__near"
              style={{ left: `${hud.glancingMin * 100}%`, width: `${(hud.glancingMax - hud.glancingMin) * 100}%` }}
              aria-hidden="true"
            />
            <span
              className="labor-shift__sweet"
              style={{ left: `${sweetLeft}%`, width: `${sweetWidth}%` }}
              aria-hidden="true"
            />
            <span
              className="labor-shift__needle"
              style={{ left: `${meterPercent}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="labor-shift__legend">
          <span className="labor-shift__legend-clean">{t("labor.cleanReward", { amount: yieldPreview })}</span>
          <span>{t("labor.glancingReward", { amount: hud.glancingYield })}</span>
        </div>

        <p className="labor-shift__readout">
          {t(inSweet ? "labor.ready" : hud.timingGrade === "glancing" ? "labor.near" : "labor.wait")}
        </p>

        <p id={guidanceId} className="labor-shift__guidance">{t("labor.guidance")}</p>

        <div className="labor-shift__actions">
          <ChromeButton
            variant="gold"
            soundCue="confirm"
            className="labor-shift__strike"
            onClick={onStrike}
            autoFocus
          >
            {t("labor.strike")} <ChromeKeycap keyName="E" />
          </ChromeButton>
          <ChromeButton variant="secondary" className="labor-shift__stop" onClick={onCancel}>
            {t("labor.stop")} <ChromeKeycap keyName="Esc" />
          </ChromeButton>
        </div>
        <p className="labor-shift__terms">{t("labor.terms")}</p>
        <p className="labor-shift__remaining" data-testid="labor-chores-remaining">
          {t("labor.remaining", { remaining: hud.choresRemaining, total: hud.totalChores })}
        </p>
      </GameSheet>
    </div>
  );
}

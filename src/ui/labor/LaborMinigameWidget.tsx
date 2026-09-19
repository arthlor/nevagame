import type { LaborHudDto } from "../../simulation/core/contracts";
import { IconEnergy } from "../components/HudIcons";
import { ChromeButton, ChromeKeycap } from "../chrome/Chrome";
import { GameSheet } from "../coastal/CoastalUI";

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
  const meterPercent = Math.round(hud.meter * 100);
  const sweetLeft = Math.round(hud.targetMin * 100);
  const sweetWidth = Math.max(2, Math.round((hud.targetMax - hud.targetMin) * 100));
  const inSweet = hud.meter >= hud.targetMin && hud.meter <= hud.targetMax;
  const yieldPreview = Math.max(0, Math.round(hud.yield));

  return (
    <div className="labor-shift-container" data-testid="labor-minigame">
      <GameSheet
        family="ink"
        tone="slate"
        corners
        className={`labor-shift${inSweet ? " is-in-sweet" : ""}`}
      >
        <header className="labor-shift__header">
          <span className="labor-shift__title">
            <IconEnergy size={15} aria-hidden="true" />
            {hud.stationName}
          </span>
          {yieldPreview > 0 && (
            <span
              className="labor-shift__reward"
              title={`A clean strike earns ${yieldPreview} Work`}
              data-testid="labor-shift-reward"
            >
              {`+${yieldPreview} Work`}
            </span>
          )}
        </header>

        <div
          className="labor-shift__meter"
          role="meter"
          aria-label={`${hud.stationName} timing`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={meterPercent}
          aria-valuetext={
            inSweet
              ? `${meterPercent} percent — in the sweet spot`
              : `${meterPercent} percent`
          }
        >
          <div className="labor-shift__track">
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

        <p className="labor-shift__readout">
          {inSweet ? "In the sweet spot — strike now" : "Line up the swing with the gold band"}
        </p>

        <div className="labor-shift__actions">
          <ChromeButton
            variant="gold"
            soundCue="confirm"
            className="labor-shift__strike"
            onClick={onStrike}
          >
            Strike <ChromeKeycap keyName="E" />
          </ChromeButton>
          <ChromeButton variant="secondary" className="labor-shift__stop" onClick={onCancel}>
            Stop
          </ChromeButton>
        </div>
      </GameSheet>
    </div>
  );
}

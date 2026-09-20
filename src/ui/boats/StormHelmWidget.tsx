import type { StormHelmHudDto } from "../../simulation/core/contracts";
import { IconWarning } from "../components/HudIcons";
import { GameSheet } from "../coastal/CoastalUI";

interface StormHelmWidgetProps {
  hud: StormHelmHudDto;
}

/**
 * The storm-helm stability instrument. Every value — needle, safe band, gust
 * strength, timer and hull lives — comes straight from the simulation-owned
 * DTO. The widget never derives the band or decides an outcome; it only shows
 * what `StormHelmDomain` already resolved, and the player steers with the
 * ordinary helm controls.
 */
export function StormHelmWidget({ hud }: StormHelmWidgetProps) {
  const heelPercent = Math.round(((hud.heel + 1) / 2) * 100);
  const safeLeft = Math.round(((-hud.heelSafeHalfWidth + 1) / 2) * 100);
  const safeWidth = Math.max(4, Math.round(hud.heelSafeHalfWidth * 100));
  const inBand = Math.abs(hud.heel) <= hud.heelSafeHalfWidth;
  const showingResult = hud.phase === "result";
  const survived = showingResult && hud.lastResult === "survived";
  const failed = showingResult && hud.lastResult === "failed";
  const strengthPercent = Math.round(hud.gustStrength * 100);
  const hullLives = Math.max(0, Math.min(hud.maxLives, hud.hullLives));

  const readout = showingResult
    ? survived
      ? "Steady helm — she held"
      : hud.failReason === "broach"
        ? "Broached! The hull struck"
        : "She labored too long — the hull struck"
    : inBand
      ? "Hold her head to the wind"
      : "Bring her bow into the gust";

  const stateClass = failed
    ? " is-hit"
    : survived
      ? " is-held"
      : inBand
        ? " is-steady"
        : " is-straining";

  return (
    <div className="storm-helm-container" data-testid="storm-helm">
      <GameSheet family="ink" tone="slate" corners className={`storm-helm${stateClass}`}>
        <header className="storm-helm__header">
          <span className="storm-helm__title">
            <IconWarning size={15} aria-hidden="true" />
            {hud.wrecked ? "Hull lost" : "Storm helm"}
          </span>
          <span
            className="storm-helm__lives"
            title={`${hullLives} of ${hud.maxLives} hull lives`}
            data-testid="storm-helm-lives"
          >
            {Array.from({ length: hud.maxLives }, (_, index) => (
              <span
                key={index}
                className={`storm-helm__pip${index < hullLives ? " is-full" : " is-lost"}`}
                aria-hidden="true"
              />
            ))}
            <span className="storm-helm__lives-label">{`${hullLives}/${hud.maxLives}`}</span>
          </span>
        </header>

        <div
          className="storm-helm__meter"
          role="meter"
          aria-label="Hull heel"
          aria-valuemin={-100}
          aria-valuemax={100}
          aria-valuenow={Math.round(hud.heel * 100)}
          aria-valuetext={inBand ? "heel inside the safe band" : "heel outside the safe band"}
        >
          <div className="storm-helm__track">
            <span
              className="storm-helm__safe"
              style={{ left: `${safeLeft}%`, width: `${safeWidth}%` }}
              aria-hidden="true"
            />
            <span className="storm-helm__center" aria-hidden="true" />
            <span
              className="storm-helm__needle"
              style={{ left: `${heelPercent}%` }}
              aria-hidden="true"
            />
          </div>
        </div>

        <p className="storm-helm__readout" data-testid="storm-helm-readout">
          {hud.wrecked
            ? "She cannot make way — signal a tow to Neva Harbor"
            : showingResult
              ? readout
              : `${readout} · A / D steer`}
        </p>

        <footer className="storm-helm__footer">
          <span className="storm-helm__gust" title="Gust strength">
            {`Gust ${strengthPercent}%`}
          </span>
          {hud.phase === "gust" && !hud.wrecked && (
            <span className="storm-helm__timer" data-testid="storm-helm-timer">
              {`${hud.remainingSeconds.toFixed(1)}s`}
            </span>
          )}
          {hud.consecutiveFails > 0 && !hud.wrecked && (
            <span className="storm-helm__fails" data-testid="storm-helm-fails">
              {`${hud.consecutiveFails} failed ${hud.consecutiveFails === 1 ? "gust" : "gusts"} in a row`}
            </span>
          )}
        </footer>
      </GameSheet>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import type { SportFishingHudDto } from "../simulation/core/contracts";
import { IconFish, IconRod, IconWarning } from "./components/HudIcons";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForBehavior, atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton } from "./chrome/Chrome";
import { GameSheet, KeyHint } from "./coastal/CoastalUI";

interface FishingHUDProps {
  hud: SportFishingHudDto;
  onSetInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onSetDrag?: (notch: 0 | 1 | 2) => void;
}

interface FishingHoldState {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
}

const EMPTY_HOLD: FishingHoldState = {
  isReeling: false,
  isSlacking: false,
  isBracing: false
};

const DRAG_LABEL: Record<0 | 1 | 2, string> = {
  0: "Light",
  1: "Balanced",
  2: "Heavy"
};

export const FishingHUD: React.FC<FishingHUDProps> = ({ hud, onSetInput, onSetDrag }) => {
  const holdRef = useRef<FishingHoldState>(EMPTY_HOLD);
  const onSetInputRef = useRef(onSetInput);
  const hudRef = useRef(hud);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  onSetInputRef.current = onSetInput;
  hudRef.current = hud;

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const updatePointerMode = () => setIsCoarsePointer(media.matches);
    updatePointerMode();
    media.addEventListener?.("change", updatePointerMode);
    return () => media.removeEventListener?.("change", updatePointerMode);
  }, []);

  const emitHold = (patch: Partial<FishingHoldState>) => {
    holdRef.current = { ...holdRef.current, ...patch };
    onSetInput({
      ...holdRef.current,
      rodDirectionAngle: hudRef.current.rodDirectionAngle
    });
  };

  const releaseAllHolds = () => {
    if (!holdRef.current.isReeling && !holdRef.current.isSlacking && !holdRef.current.isBracing) return;
    holdRef.current = EMPTY_HOLD;
    onSetInputRef.current({
      ...EMPTY_HOLD,
      rodDirectionAngle: hudRef.current.rodDirectionAngle
    });
  };

  useEffect(() => {
    const handleWindowBlur = () => releaseAllHolds();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") releaseAllHolds();
    };
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseAllHolds();
    };
  }, []);

  const releaseAction = (action: keyof FishingHoldState) => emitHold({ [action]: false });
  const { decision, telemetry } = hud;
  const inLandingRange = telemetry.runDistanceMeters <= telemetry.landingDistanceMeters;
  const rodLay = telemetry.rodDeflectionPercent;
  // Swinging with the fish is the mistake worth colouring; a clean counter reads calm.
  const counterSwingTone =
    telemetry.counterSwingPercent <= -25
      ? "danger"
      : telemetry.counterSwingPercent >= 25
        ? "good"
        : "neutral";
  useEffect(() => {
    if (decision.action !== "neutral") return;
    holdRef.current = EMPTY_HOLD;
    onSetInputRef.current({ ...EMPTY_HOLD, rodDirectionAngle: 0 });
  }, [decision.action]);
  const holdButtonProps = (action: keyof FishingHoldState) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      emitHold({ [action]: true });
    },
    onPointerUp: () => releaseAction(action),
    onPointerCancel: () => releaseAction(action),
    onLostPointerCapture: () => releaseAction(action)
  });

  const directionButtonProps = (direction: -1 | 1) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onSetInput({ ...holdRef.current, rodDirectionAngle: direction * hud.steeringMagnitude });
    },
    onPointerUp: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }),
    onPointerCancel: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }),
    onLostPointerCapture: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 })
  });
  const decisionTouchProps = decision.action === "steer-left"
    ? directionButtonProps(-1)
    : decision.action === "steer-right"
      ? directionButtonProps(1)
      : decision.action === "slack"
        ? holdButtonProps("isSlacking")
        : decision.action === "brace"
          ? holdButtonProps("isBracing")
          : holdButtonProps("isReeling");

  return (
    <GameSheet
      family="ink"
      className={`fishing-hud-container fishing-hud-simple interactive${hud.tensionTone === "danger" ? " fishing-tension-danger" : ""}`}
      role="region"
      aria-label="Sport fishing fight"
      data-testid="sport-fishing-hud"
    >
      <header className="fishing-target-row">
        <AtlasImage src={atlasForFish(hud.speciesId)} alt="" size={28} />
        {!atlasForFish(hud.speciesId) && <IconFish size={20} aria-hidden="true" />}
        <div className="fishing-target-copy">
          <strong className="fishing-target-name">{hud.speciesName}</strong>
          <span>Fish energy</span>
        </div>
        <strong className="fishing-energy-value">{hud.energyPercent}%</strong>
      </header>

      <div className="fishing-energy-track" data-testid="fish-stamina" aria-label={`Fish energy ${hud.energyPercent}%`}>
        <div className="fishing-energy-fill" style={{ width: `${hud.energyPercent}%` }} />
      </div>

      {hud.showFirstTip && <p className="fishing-first-tip">Match the highlighted key to the fish.</p>}
      {hud.signatureMoment && (
        <p className="fishing-signature-moment" aria-live="polite" key={hud.signatureMoment.id}>
          {hud.signatureMoment.copy}
        </p>
      )}

      <section className={`fishing-decision fishing-decision-${decision.tone}`} aria-live="polite">
        <AtlasImage className="fishing-decision-icon" src={atlasForBehavior(decision.icon)} alt="" size={30} />
        <div className="fishing-decision-copy">
          <span>{decision.fishAction}</span>
          <strong>{decision.response}</strong>
        </div>
        {decision.key && <KeyHint keyName={decision.key} glow />}
      </section>

      <div className="fishing-drag-row">
        <span className="fishing-drag-label">Drag</span>
        <ChromeButton
          className="fishing-drag-btn"
          soundCue="click"
          aria-label={`Drag ${DRAG_LABEL[hud.dragNotch]}. Activate to change.`}
          onClick={() => onSetDrag?.(((hud.dragNotch + 1) % 3) as 0 | 1 | 2)}
        >
          {DRAG_LABEL[hud.dragNotch]}
        </ChromeButton>
        <span className="fishing-drag-hint">
          {hud.dragNotch === 0 ? "forgiving" : hud.dragNotch === 2 ? "decisive" : "steady"}
        </span>
      </div>

      <section className="fishing-tension" aria-label={`Line tension ${hud.tensionWord.toLowerCase()}`}>
        <div className="fishing-tension-head">
          <IconRod size={13} aria-hidden="true" />
          <span>Line tension</span>
          <strong className={`fishing-tension-word fishing-tension-word-${hud.tensionTone}`}>{hud.tensionWord.toUpperCase()}</strong>
        </div>
        <div
          className="fishing-tension-track"
          aria-hidden="true"
          style={{
            gridTemplateColumns: `${hud.tensionBands.slackEndPercent}% ${Math.max(
              0,
              hud.tensionBands.dangerStartPercent - hud.tensionBands.slackEndPercent
            )}% ${Math.max(0, 100 - hud.tensionBands.dangerStartPercent)}%`
          }}
        >
          <span className="fishing-tension-zone fishing-tension-zone-slack" />
          <span className="fishing-tension-zone fishing-tension-zone-safe" />
          <span className="fishing-tension-zone fishing-tension-zone-danger" />
          <span className="fishing-tension-needle" style={{ left: `${hud.tensionPercent}%` }} />
        </div>
      </section>

      <section
        className="fishing-telemetry"
        aria-label="Fight telemetry"
        data-testid="fishing-telemetry"
      >
        <div className="fishing-telemetry-run">
          <div className="fishing-telemetry-run-head">
            <span>Run</span>
            <strong data-testid="fishing-run-distance">
              {`${telemetry.runDistanceMeters.toFixed(1)} m`}
            </strong>
          </div>
          {/* The landing mark sits where the fish comes within reach, so the
              angler can see the gap closing rather than guess at it. */}
          <div
            className={`fishing-telemetry-run-track${inLandingRange ? " is-in-range" : ""}`}
            aria-hidden="true"
          >
            <span
              className="fishing-telemetry-run-fill"
              style={{ width: `${telemetry.runDistancePercent}%` }}
            />
            <span className="fishing-telemetry-landing-mark" />
          </div>
          <span className="fishing-telemetry-run-note">
            {inLandingRange
              ? "Within reach"
              : `Landing at ${telemetry.landingDistanceMeters} m`}
          </span>
        </div>

        <dl className="fishing-telemetry-grid">
          <div className="fishing-telemetry-cell">
            <dt>Depth</dt>
            <dd data-testid="fishing-depth">
              {telemetry.waterDepthMeters <= 0
                ? "Surfaced"
                : `${telemetry.waterDepthMeters.toFixed(1)} m`}
            </dd>
          </div>
          <div className="fishing-telemetry-cell">
            <dt>Rod</dt>
            <dd data-testid="fishing-rod-deflection">
              {rodLay === 0 ? "Centred" : `${rodLay > 0 ? "Right" : "Left"} ${Math.abs(rodLay)}%`}
            </dd>
          </div>
        </dl>

        {/* Counter-swing is the one telemetry number that is also an
            instruction, so it carries the [A]/[D] cue with it. */}
        <div
          className={`fishing-counter-swing tone-${counterSwingTone}`}
          data-testid="fishing-counter-swing"
          data-tone={counterSwingTone}
        >
          <span className="fishing-counter-swing-label">Counter</span>
          <div className="fishing-counter-swing-track" aria-hidden="true">
            <span className="fishing-counter-swing-centre" />
            <span
              className="fishing-counter-swing-fill"
              style={{
                width: `${Math.abs(telemetry.counterSwingPercent) / 2}%`,
                left: telemetry.counterSwingPercent >= 0 ? "50%" : undefined,
                right: telemetry.counterSwingPercent < 0 ? "50%" : undefined
              }}
            />
          </div>
          {telemetry.counterSwingCue ? (
            <span className="fishing-counter-swing-cue">
              <KeyHint keyName={telemetry.counterSwingCue === "left" ? "A" : "D"} glow={counterSwingTone === "danger"} />
              <span>{telemetry.counterSwingCue === "left" ? "Swing left" : "Swing right"}</span>
            </span>
          ) : (
            <span className="fishing-counter-swing-cue is-idle">Holding</span>
          )}
        </div>
      </section>

      {hud.showLineWarning && (
        <div className={`fishing-line-warning${hud.lineIntegrityPercent <= 20 ? " is-critical" : ""}`} data-testid="fish-integrity">
          <IconWarning size={13} aria-hidden="true" />
          <span>Line damaged</span>
          <strong>{hud.lineIntegrityPercent}%</strong>
        </div>
      )}

      {hud.landingProgress !== null && (
        <section className="fishing-landing" aria-label="Landing progress">
          <div className="fishing-landing-label">
            <strong>{hud.landingProgress > 0 ? "LANDING" : "HOLD STEADY"}</strong>
          </div>
          <div className="fishing-landing-track">
            <div className="fishing-landing-fill" style={{ width: `${hud.landingProgress * 100}%` }} />
          </div>
        </section>
      )}

      {isCoarsePointer && decision.action !== "neutral" && (
        <div className="fishing-touch-controls" aria-label="Fishing touch controls">
          <ChromeButton className="fishing-touch-control" {...decisionTouchProps}>
            {decision.response}
          </ChromeButton>
        </div>
      )}
    </GameSheet>
  );
};

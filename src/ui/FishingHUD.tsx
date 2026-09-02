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

export const FishingHUD: React.FC<FishingHUDProps> = ({ hud, onSetInput }) => {
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
  const { decision } = hud;
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

      <section className={`fishing-decision fishing-decision-${decision.tone}`} aria-live="polite">
        <AtlasImage className="fishing-decision-icon" src={atlasForBehavior(decision.icon)} alt="" size={30} />
        <div className="fishing-decision-copy">
          <span>{decision.fishAction}</span>
          <strong>{decision.response}</strong>
        </div>
        {decision.key && <KeyHint keyName={decision.key} glow />}
      </section>

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

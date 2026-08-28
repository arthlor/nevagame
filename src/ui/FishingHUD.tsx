// src/ui/FishingHUD.tsx
import React, { useEffect, useRef, useState } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import { FISHING_TUNING } from "../simulation/fishing/FishingTuning";
import type { FishingEncounterState } from "../simulation/core/types";
import { IconEnergy, IconFish, IconRod, IconWarning } from "./components/HudIcons";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForBehavior, atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeKeycap, ChromeMeter, ChromePanel, ChromeQuality } from "./chrome/Chrome";

interface FishingHUDProps {
  encounter: FishingEncounterState;
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

interface FishingCue {
  behavior: string;
  key: string | null;
  label: string;
}

const EMPTY_HOLD: FishingHoldState = {
  isReeling: false,
  isSlacking: false,
  isBracing: false
};

function cueForEncounter(encounter: FishingEncounterState): FishingCue {
  switch (encounter.behavior) {
    case "run-left":
      return { behavior: "run", key: null, label: "Running left" };
    case "run-right":
      return { behavior: "run", key: null, label: "Running right" };
    case "dive":
      return { behavior: "dive", key: null, label: "Diving" };
    case "burst":
      return { behavior: "burst", key: null, label: "Surging" };
    case "shake":
      return { behavior: "shake", key: null, label: "Shaking the hook" };
    case "surface":
      return { behavior: "surface", key: null, label: "Fish is breaking the surface" };
    default:
      return { behavior: "tiring", key: null, label: "Recovering" };
  }
}

export const FishingHUD: React.FC<FishingHUDProps> = ({ encounter, onSetInput }) => {
  const holdRef = useRef<FishingHoldState>(EMPTY_HOLD);
  const onSetInputRef = useRef(onSetInput);
  const encounterRef = useRef(encounter);
  const [heldActions, setHeldActions] = useState<FishingHoldState>(EMPTY_HOLD);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  onSetInputRef.current = onSetInput;
  encounterRef.current = encounter;

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const updatePointerMode = () => setIsCoarsePointer(media.matches);
    updatePointerMode();
    media.addEventListener?.("change", updatePointerMode);
    return () => media.removeEventListener?.("change", updatePointerMode);
  }, []);

  const emitHold = (patch: Partial<FishingHoldState>) => {
    holdRef.current = { ...holdRef.current, ...patch };
    setHeldActions(holdRef.current);
    onSetInput({
      ...holdRef.current,
      rodDirectionAngle: encounter.rodDirectionAngle
    });
  };

  const releaseAllHolds = () => {
    if (!holdRef.current.isReeling && !holdRef.current.isSlacking && !holdRef.current.isBracing) return;
    holdRef.current = EMPTY_HOLD;
    setHeldActions(EMPTY_HOLD);
    onSetInputRef.current({
      ...EMPTY_HOLD,
      rodDirectionAngle: encounterRef.current.rodDirectionAngle
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
  const staminaPercent = encounter.maxStamina <= 0
    ? 0
    : Math.round((encounter.stamina / encounter.maxStamina) * 100);
  const tensionPercent = Math.min(100, Math.max(0, encounter.lineTension));
  const integrityPercent = Math.min(100, Math.max(0, encounter.lineIntegrity));
  const maxSafeTension = ContentRegistry.rods.get(encounter.rodId)?.maxSafeTension ?? 80;
  const minimumTension = FISHING_TUNING.minimumLandingTension;
  const tensionTone = tensionPercent < minimumTension ? "slack" : tensionPercent >= maxSafeTension ? "danger" : "safe";
  const integrityTone = integrityPercent <= 20 ? "danger" : "safe";
  const cue = cueForEncounter(encounter);
  const direction = Math.max(-1, Math.min(1, encounter.fishDirection));
  const directionMarker = 50 + direction * 35;
  const rodMarker = 50 + (encounter.dynamics?.rodDirection ?? encounter.rodDirectionAngle) * 35;
  const dangerCopy = tensionPercent < minimumTension
    ? "Take up slack"
    : tensionPercent >= maxSafeTension * 0.95 ? "Let line out" : null;
  if (dangerCopy) {
    cue.key = tensionPercent < minimumTension ? "W" : "S";
    cue.label = dangerCopy;
  }
  const activeActions = {
    isReeling: !encounter.isSlacking && !heldActions.isSlacking && (encounter.isReeling || heldActions.isReeling),
    isSlacking: encounter.isSlacking || heldActions.isSlacking,
    isBracing: encounter.isBracing || heldActions.isBracing
  };

  const holdButtonProps = (action: keyof FishingHoldState) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      emitHold({ [action]: true });
    },
    onPointerUp: () => releaseAction(action),
    onPointerCancel: () => releaseAction(action),
    onPointerLeave: () => releaseAction(action),
    onLostPointerCapture: () => releaseAction(action)
  });

  return (
    <ChromePanel
      as="section"
      tone="dock"
      className="fishing-hud-container interactive"
      aria-label="Sport fishing controls"
      data-testid="sport-fishing-hud"
      data-fishing-behavior={encounter.behavior}
    >
      <div className="fishing-hud-top">
        <div className="fishing-species-badge" aria-label="Hooked fish and quality">
          <AtlasImage src={atlasForFish(encounter.fish.speciesId)} alt="" size={26} />
          {!atlasForFish(encounter.fish.speciesId) && <IconFish size={20} aria-hidden="true" />}
          <ChromeQuality quality={encounter.fish.quality} showLabel={false} />
        </div>
        <span
          className="fishing-distance"
          aria-label={`${encounter.distanceMeters.toFixed(1)} metres of line remain`}
        >
          {`${encounter.distanceMeters.toFixed(1)}m`}
        </span>
      </div>

      <div
        className={`fishing-tension fishing-tension-${tensionTone}`}
        role="progressbar"
        aria-label="Line tension"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(tensionPercent)}
        aria-valuetext={`${Math.round(tensionPercent)} percent`}
      >
        <div className="fishing-tension-head">
          <IconRod size={15} aria-hidden="true" />
          {dangerCopy && (
            <span className="fishing-danger-copy" role="status" aria-live="polite">
              <IconWarning size={12} aria-hidden="true" />
              {dangerCopy}
            </span>
          )}
        </div>
        <div className="fishing-tension-track" aria-hidden="true" style={{ gridTemplateColumns: `${minimumTension}% ${maxSafeTension - minimumTension}% ${100 - maxSafeTension}%` }}>
          <span className="fishing-tension-zone fishing-tension-zone-slack" />
          <span className="fishing-tension-zone fishing-tension-zone-safe" />
          <span className="fishing-tension-zone fishing-tension-zone-danger" />
          <span className="fishing-tension-needle" style={{ left: `${tensionPercent}%` }} />
        </div>
      </div>

      <div className="fishing-hud-lower">
        <div className="fishing-hud-meters" aria-label="Fish stamina and line integrity">
          <ChromeMeter
            className="fishing-hud-meter fishing-stamina-meter"
            label="Fish stamina"
            value={encounter.stamina}
            max={encounter.maxStamina}
            valueText={`${staminaPercent}% remaining`}
            variant="stamina"
            orientation="vertical"
            showLabel={false}
            showValue={false}
            icon={<IconEnergy size={15} aria-hidden="true" />}
            data-testid="fish-stamina"
          />
          <ChromeMeter
            className={`fishing-hud-meter fishing-integrity-meter integrity-${integrityTone}`}
            label="Line integrity"
            value={encounter.lineIntegrity}
            max={100}
            valueText={`${Math.round(integrityPercent)}% remaining`}
            variant={integrityTone === "danger" ? "danger" : "fishing"}
            orientation="vertical"
            showLabel={false}
            showValue={false}
            icon={<IconWarning size={15} aria-hidden="true" />}
            data-testid="fish-integrity"
          />
        </div>

        <div className="fishing-direction-block">
          <div
            className="fishing-direction-arc-row"
            role="img"
            aria-label={`${direction < -0.1 ? "Fish pulling left" : direction > 0.1 ? "Fish pulling right" : "Fish holding center"}; rod ${rodMarker < 45 ? "left" : rodMarker > 55 ? "right" : "center"}`}
          >
            <ChromeKeycap keyName="A" />
            <span className="fishing-direction-arc" aria-hidden="true">
              <span className="fishing-direction-marker" style={{ left: `${directionMarker}%` }} />
              <span className="fishing-rod-marker" style={{ left: `${rodMarker}%` }} />
            </span>
            <ChromeKeycap keyName="D" />
          </div>
          <div className="fishing-action-cue" role="status" aria-label={cue.label} aria-live="polite">
            <AtlasImage src={atlasForBehavior(cue.behavior)} alt="" size={18} />
            {!atlasForBehavior(cue.behavior) && <IconFish size={16} aria-hidden="true" />}
            {cue.key && <ChromeKeycap keyName={cue.key} glow={tensionTone === "danger"} />}
          </div>
        </div>

      </div>

      {isCoarsePointer && (
        <div className="fishing-touch-controls" aria-label="Touch fishing controls">
          <ChromeButton
            className={`fishing-touch-control fishing-touch-control-reel ${activeActions.isReeling ? "is-active" : ""}`}
            aria-label="Hold reel"
            aria-pressed={activeActions.isReeling}
            {...holdButtonProps("isReeling")}
          >
            <span className="fishing-touch-label">Reel</span>
            <ChromeKeycap keyName="W" glow={activeActions.isReeling} />
          </ChromeButton>
          <ChromeButton
            className={`fishing-touch-control fishing-touch-control-brace ${activeActions.isBracing ? "is-active" : ""}`}
            aria-label="Hold brace"
            aria-pressed={activeActions.isBracing}
            {...holdButtonProps("isBracing")}
          >
            <span className="fishing-touch-label">Brace</span>
            <ChromeKeycap keyName="Space" glow={activeActions.isBracing} />
          </ChromeButton>
          <ChromeButton
            className={`fishing-touch-control fishing-touch-control-slack ${activeActions.isSlacking ? "is-active" : ""}`}
            aria-label="Hold slack"
            aria-pressed={activeActions.isSlacking}
            {...holdButtonProps("isSlacking")}
          >
            <span className="fishing-touch-label">Slack</span>
            <ChromeKeycap keyName="S" glow={activeActions.isSlacking} />
          </ChromeButton>
        </div>
      )}
    </ChromePanel>
  );
};

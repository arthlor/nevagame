import React, { useEffect, useRef, useState } from "react";
import { ContentRegistry } from "../content/ContentRegistry";
import { FISHING_TUNING, fishingBehaviorReadout } from "../simulation/fishing/FishingTuning";
import type { FishingEncounterState } from "../simulation/core/types";
import { IconFish, IconRod, IconWarning } from "./components/HudIcons";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForBehavior, atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton, ChromeKeycap, ChromePanel } from "./chrome/Chrome";

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

interface FishingDecision {
  fishAction: string;
  response: string;
  key: "W" | "S" | "A" | "D" | "Spc";
  icon: "run" | "dive" | "burst" | "shake" | "surface" | "tiring";
  tone: "steady" | "warning" | "danger" | "opportunity";
}

const EMPTY_HOLD: FishingHoldState = {
  isReeling: false,
  isSlacking: false,
  isBracing: false
};

function decisionForEncounter(
  encounter: FishingEncounterState,
  phase: ReturnType<typeof fishingBehaviorReadout>["phase"],
  maxSafeTension: number,
  landingWindow: boolean
): FishingDecision {
  if (landingWindow) {
    return { fishAction: "Fish is at the boat", response: "Hold steady", key: "W", icon: "tiring", tone: "opportunity" };
  }
  if (encounter.lineTension >= maxSafeTension * 0.95) {
    return { fishAction: "Line is overloaded", response: "Give line", key: "S", icon: "burst", tone: "danger" };
  }
  if (encounter.lineTension < FISHING_TUNING.minimumLandingTension && encounter.slackTimerSeconds > 0.2) {
    return { fishAction: "Hook is going loose", response: "Reel in", key: "W", icon: "tiring", tone: "danger" };
  }
  if (phase === "recovery" || encounter.behavior === "rest") {
    return { fishAction: "Fish is easing off", response: "Reel now", key: "W", icon: "tiring", tone: "opportunity" };
  }
  switch (encounter.behavior) {
    case "run-left":
      return { fishAction: "Running left", response: "Pull right", key: "D", icon: "run", tone: "warning" };
    case "run-right":
      return { fishAction: "Running right", response: "Pull left", key: "A", icon: "run", tone: "warning" };
    case "surface":
      return { fishAction: "Breaking the surface", response: "Reel down", key: "W", icon: "surface", tone: "warning" };
    case "dive":
      return { fishAction: "Diving deep", response: "Brace", key: "Spc", icon: "dive", tone: "warning" };
    case "shake":
      return { fishAction: "Shaking the hook", response: "Hold firm", key: "Spc", icon: "shake", tone: "warning" };
    case "burst":
      return { fishAction: "Power surge", response: "Brace", key: "Spc", icon: "burst", tone: "warning" };
    default:
      return { fishAction: "Fish is tiring", response: "Reel now", key: "W", icon: "tiring", tone: "opportunity" };
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
      rodDirectionAngle: encounterRef.current.rodDirectionAngle
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
  const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId);
  const profile = species ? ContentRegistry.fishBehaviors.get(species.behaviorProfileId) : undefined;
  const rod = ContentRegistry.rods.get(encounter.rodId);
  const maxSafeTension = rod?.maxSafeTension ?? 80;
  const staminaPercent = encounter.maxStamina <= 0
    ? 0
    : Math.round((encounter.stamina / encounter.maxStamina) * 100);
  const tensionPercent = Math.min(100, Math.max(0, encounter.lineTension));
  const integrityPercent = Math.min(100, Math.max(0, encounter.lineIntegrity));
  const tensionTone = tensionPercent < FISHING_TUNING.minimumLandingTension
    ? "slack"
    : tensionPercent >= maxSafeTension
      ? "danger"
      : "safe";
  const tensionWord = tensionTone === "slack" ? "LOOSE" : tensionTone === "danger" ? "EASE" : "GOOD";
  const tired = encounter.stamina <= encounter.maxStamina * FISHING_TUNING.landingStaminaRatio;
  const inRange = encounter.distanceMeters <= FISHING_TUNING.landingDistance;
  const landingWindow = tired && inRange;
  const landingProgress = Math.max(0, Math.min(1,
    (encounter.dynamics?.landReadySeconds ?? 0) / FISHING_TUNING.landReadySeconds));
  const behaviorReadout = fishingBehaviorReadout(encounter, profile);
  const decision = decisionForEncounter(encounter, behaviorReadout.phase, maxSafeTension, landingWindow);
  const showFirstTip = encounter.elapsedSeconds < 8;
  const showLineWarning = integrityPercent <= 55;
  const activeActions = {
    isReeling: !encounter.isSlacking && !heldActions.isSlacking && (encounter.isReeling || heldActions.isReeling),
    isSlacking: encounter.isSlacking || heldActions.isSlacking,
    isBracing: encounter.isBracing || heldActions.isBracing
  };

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

  const directionButtonProps = (value: -1 | 1) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onSetInput({ ...holdRef.current, rodDirectionAngle: value });
    },
    onPointerUp: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }),
    onPointerCancel: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }),
    onLostPointerCapture: () => onSetInput({ ...holdRef.current, rodDirectionAngle: 0 })
  });

  const railChip = (label: string, keyName: string, on: boolean, glow: boolean) => (
    <span className={`fishing-rail-chip${on ? " is-active" : ""}${glow ? " is-glow" : ""}`}>
      <ChromeKeycap keyName={keyName} glow={glow} />
      <span className="fishing-rail-label">{label}</span>
    </span>
  );

  return (
    <ChromePanel
      className={`fishing-hud-container fishing-hud-simple interactive${tensionTone === "danger" ? " fishing-tension-danger" : ""}`}
      role="region"
      aria-label="Sport fishing fight"
      data-testid="sport-fishing-hud"
    >
      <header className="fishing-target-row">
        <AtlasImage src={atlasForFish(encounter.fish.speciesId)} alt="" size={28} />
        {!atlasForFish(encounter.fish.speciesId) && <IconFish size={20} aria-hidden="true" />}
        <div className="fishing-target-copy">
          <strong className="fishing-target-name">{species?.name ?? "Sport fish"}</strong>
          <span>Fish energy</span>
        </div>
        <strong className="fishing-energy-value">{staminaPercent}%</strong>
      </header>

      <div className="fishing-energy-track" data-testid="fish-stamina" aria-label={`Fish energy ${staminaPercent}%`}>
        <div className="fishing-energy-fill" style={{ width: `${staminaPercent}%` }} />
      </div>

      {showFirstTip && <p className="fishing-first-tip">Match the highlighted key to the fish.</p>}

      <section className={`fishing-decision fishing-decision-${decision.tone}`} aria-live="polite">
        <AtlasImage className="fishing-decision-icon" src={atlasForBehavior(decision.icon)} alt="" size={30} />
        <div className="fishing-decision-copy">
          <span>{decision.fishAction}</span>
          <strong>{decision.response}</strong>
        </div>
        <ChromeKeycap keyName={decision.key} glow />
      </section>

      <section className="fishing-tension" aria-label={`Line tension ${tensionWord.toLowerCase()}`}>
        <div className="fishing-tension-head">
          <IconRod size={13} aria-hidden="true" />
          <span>Line tension</span>
          <strong className={`fishing-tension-word fishing-tension-word-${tensionTone}`}>{tensionWord}</strong>
        </div>
        <div className="fishing-tension-track" aria-hidden="true">
          <span className="fishing-tension-zone fishing-tension-zone-slack" />
          <span className="fishing-tension-zone fishing-tension-zone-safe" />
          <span className="fishing-tension-zone fishing-tension-zone-danger" />
          <span className="fishing-tension-needle" style={{ left: `${tensionPercent}%` }} />
        </div>
      </section>

      {showLineWarning && (
        <div className={`fishing-line-warning${integrityPercent <= 20 ? " is-critical" : ""}`} data-testid="fish-integrity">
          <IconWarning size={13} aria-hidden="true" />
          <span>Line damaged</span>
          <strong>{integrityPercent}%</strong>
        </div>
      )}

      {landingWindow && (
        <section className="fishing-landing" aria-label="Landing progress">
          <div className="fishing-landing-label">
            <strong>{landingProgress > 0 ? "LANDING" : "REEL — HOLD IT"}</strong>
          </div>
          <div className="fishing-landing-track">
            <div className="fishing-landing-fill" style={{ width: `${landingProgress * 100}%` }} />
          </div>
        </section>
      )}

      <div className="fishing-action-rail" aria-label="Fishing controls">
        {railChip("Reel", "W", activeActions.isReeling, decision.key === "W")}
        {railChip("Give", "S", activeActions.isSlacking, decision.key === "S")}
        {railChip("Brace", "Spc", activeActions.isBracing, decision.key === "Spc")}
        {railChip("Pull", "A/D", Math.abs(encounter.rodDirectionAngle) > 0.1, decision.key === "A" || decision.key === "D")}
      </div>

      {isCoarsePointer && (
        <div className="fishing-touch-controls" aria-label="Fishing touch controls">
          <div className="fishing-touch-row">
            <ChromeButton className="fishing-touch-control" {...directionButtonProps(-1)}>Left</ChromeButton>
            <ChromeButton className="fishing-touch-control" {...holdButtonProps("isReeling")}>Reel</ChromeButton>
            <ChromeButton className="fishing-touch-control" {...directionButtonProps(1)}>Right</ChromeButton>
          </div>
          <div className="fishing-touch-row">
            <ChromeButton className="fishing-touch-control" {...holdButtonProps("isSlacking")}>Give line</ChromeButton>
            <ChromeButton className="fishing-touch-control" {...holdButtonProps("isBracing")}>Brace</ChromeButton>
          </div>
        </div>
      )}
    </ChromePanel>
  );
};

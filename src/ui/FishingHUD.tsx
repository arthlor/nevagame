import React, { useRef, useState } from "react";
import { FishingEncounterState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";

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

const EMPTY_HOLD: FishingHoldState = {
  isReeling: false,
  isSlacking: false,
  isBracing: false
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const FishingHUD: React.FC<FishingHUDProps> = ({ encounter, onSetInput }) => {
  const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId);
  const holdRef = useRef<FishingHoldState>(EMPTY_HOLD);
  const [heldActions, setHeldActions] = useState<FishingHoldState>(EMPTY_HOLD);

  const emitHold = (patch: Partial<FishingHoldState>) => {
    holdRef.current = { ...holdRef.current, ...patch };
    setHeldActions(holdRef.current);
    onSetInput({
      ...holdRef.current,
      rodDirectionAngle: encounter.rodDirectionAngle
    });
  };

  const releaseAction = (action: keyof FishingHoldState) => emitHold({ [action]: false });
  const staminaPercent = Math.max(0, Math.round((encounter.stamina / encounter.maxStamina) * 100));
  const tensionPercent = Math.min(100, Math.max(0, encounter.lineTension));
  const activeActions = {
    isReeling: encounter.isReeling || heldActions.isReeling,
    isSlacking: encounter.isSlacking || heldActions.isSlacking,
    isBracing: encounter.isBracing || heldActions.isBracing
  };

  const behaviorCue = (() => {
    switch (encounter.behavior) {
      case "run-left":
        return { text: "Running left — lean right", key: "D", tone: "caution" };
      case "run-right":
        return { text: "Running right — lean left", key: "A", tone: "caution" };
      case "dive":
        return { text: "Diving — brace the rod", key: "Space", tone: "cool" };
      case "surface":
        return { text: "Surfacing — keep the line steady", key: null, tone: "cool" };
      case "burst":
        return { text: "Hard run — give it slack", key: "S", tone: "danger" };
      case "shake":
        return { text: "Thrashing — ease the pressure", key: null, tone: "caution" };
      default:
        return { text: "Resting — reel it closer", key: "W / LMB", tone: "steady" };
    }
  })();

  const tensionCue =
    tensionPercent < 10
      ? "Line slack"
      : tensionPercent >= 80
        ? "Line near breaking"
        : "Line steady";

  const holdButtonProps = (action: keyof FishingHoldState) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      emitHold({ [action]: true });
    },
    onPointerUp: () => releaseAction(action),
    onPointerCancel: () => releaseAction(action),
    onLostPointerCapture: () => releaseAction(action)
  });

  return (
    <section className="fishing-hud-container interactive" aria-label="Fishing encounter">
      <header className="fishing-header">
        <div>
          <strong>{species?.name || "Hooked fish"}</strong>
          <span>{encounter.fish.weightKg.toFixed(1)} kg · {capitalize(encounter.fish.quality)}</span>
        </div>
        <div className="fishing-distance">
          <strong>{encounter.distanceMeters.toFixed(1)}</strong>
          <span>metres</span>
        </div>
      </header>

      <div className={`fishing-behavior fishing-behavior-${behaviorCue.tone}`} role="status" aria-live="polite">
        <span>{behaviorCue.text}</span>
        {behaviorCue.key && <kbd>{behaviorCue.key}</kbd>}
      </div>

      <div className="fishing-meters">
        <div className="fishing-meter-label">
          <span>Tension</span>
          <span className={tensionPercent < 10 || tensionPercent >= 80 ? "is-danger" : ""}>
            {tensionCue} · {Math.round(tensionPercent)}%
          </span>
        </div>
        <div className="tension-gauge-track" aria-label={`Line tension ${Math.round(tensionPercent)} percent`}>
          <div className="tension-slack-zone" />
          <div className="tension-safe-zone" />
          <div className="tension-danger-zone" />
          <div className="tension-indicator" style={{ left: `calc(${tensionPercent}% - 5px)` }} />
        </div>

        <div className="fishing-meter-label fishing-stamina-label">
          <span>Fish stamina</span>
          <span>{staminaPercent}%</span>
        </div>
        <div className="stamina-bar-track" aria-label={`Fish stamina ${staminaPercent} percent`}>
          <div className="stamina-bar-fill" style={{ width: `${staminaPercent}%` }} />
        </div>
      </div>

      <div className="fishing-actions" aria-label="Fishing controls">
        <button
          type="button"
          className={activeActions.isReeling ? "is-active" : ""}
          aria-pressed={activeActions.isReeling}
          {...holdButtonProps("isReeling")}
        >
          <span>Reel</span><kbd>W / LMB</kbd>
        </button>
        <button
          type="button"
          className={activeActions.isBracing ? "is-active" : ""}
          aria-pressed={activeActions.isBracing}
          {...holdButtonProps("isBracing")}
        >
          <span>Brace</span><kbd>Space</kbd>
        </button>
        <button
          type="button"
          className={activeActions.isSlacking ? "is-active" : ""}
          aria-pressed={activeActions.isSlacking}
          {...holdButtonProps("isSlacking")}
        >
          <span>Slack</span><kbd>S</kbd>
        </button>
      </div>
    </section>
  );
};

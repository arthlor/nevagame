// src/ui/FishingHUD.tsx
import React, { useRef, useState } from "react";
import { FishingEncounterState } from "../simulation/core/types";
import { ContentRegistry } from "../content/ContentRegistry";
import { IconFish, IconWarning } from "./components/HudIcons";
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

const EMPTY_HOLD: FishingHoldState = {
  isReeling: false,
  isSlacking: false,
  isBracing: false
};

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
        return { text: "Running Left — Lean Right", key: "D", tone: "caution", behavior: "run" };
      case "run-right":
        return { text: "Running Right — Lean Left", key: "A", tone: "caution", behavior: "run" };
      case "dive":
        return { text: "Diving Deep — Brace Rod", key: "Space", tone: "cool", behavior: "dive" };
      case "surface":
        return { text: "Surfacing — Keep Line Steady", key: null, tone: "cool", behavior: "surface" };
      case "burst":
        return { text: "Hard Run — Give Line Slack", key: "S", tone: "danger", behavior: "burst" };
      case "shake":
        return { text: "Thrashing — Ease Pressure", key: null, tone: "caution", behavior: "shake" };
      default:
        return { text: "Tiring Out — Reel In", key: "W / LMB", tone: "steady", behavior: "tiring" };
    }
  })();

  const tensionTone =
    tensionPercent < 15
      ? "slack"
      : tensionPercent >= 75
        ? "danger"
        : "safe";

  const tensionCueText =
    tensionPercent < 15
      ? "Line Slack — Reel in to tighten"
      : tensionPercent >= 85
        ? "CRITICAL TENSION — Slack line now!"
        : tensionPercent >= 75
          ? "High Tension — Ease pressure"
          : "Tension Optimal";

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
    <ChromePanel as="section" tone="slate" flourish corners className="fishing-hud-container interactive" aria-label="Sport fishing encounter" data-testid="sport-fishing-hud">
      {/* 1. Header: Fish Profile & Distance */}
      <header className="fishing-header">
        <div className="fishing-fish-badge">
          <AtlasImage src={atlasForFish(encounter.fish.speciesId)} alt="" size={40} />
          {!atlasForFish(encounter.fish.speciesId) && <IconFish size={22} className="fishing-header-icon" />}
          <div className="fishing-fish-meta">
            <strong>{species?.name || "Hooked Sport Fish"}</strong>
            <span className="fishing-fish-sub">
              {encounter.fish.weightKg.toFixed(1)} kg · <ChromeQuality quality={encounter.fish.quality} />
            </span>
          </div>
        </div>

        <div className="fishing-distance-badge">
          <span className="distance-label">Distance</span>
          <div className="distance-value-group">
            <strong>{encounter.distanceMeters.toFixed(1)}</strong>
            <span>m</span>
          </div>
        </div>
      </header>

      {/* 2. Behavior Cue Banner */}
      <div className={`fishing-behavior fishing-behavior-${behaviorCue.tone}`} role="status" aria-live="polite">
        <AtlasImage src={atlasForBehavior(behaviorCue.behavior)} className="behavior-arrow" size={28} aria-hidden="true" />
        <span className="behavior-text">{behaviorCue.text}</span>
        {behaviorCue.key && <ChromeKeycap keyName={behaviorCue.key} glow={behaviorCue.tone === "danger"} />}
      </div>

      {/* 3. Meters: Tension Gauge & Stamina Bar */}
      <div className="fishing-meters">
        {/* Tension Gauge */}
        <div className="fishing-meter-label">
          <span className="meter-name">Line Tension</span>
          <span className={`meter-status status-${tensionTone}`}>
            {tensionTone === "danger" && <IconWarning size={12} className="meter-status-icon" />}
            {tensionCueText} · {Math.round(tensionPercent)}%
          </span>
        </div>
        <div className={`tension-gauge-track track-${tensionTone}`} aria-label={`Line tension ${Math.round(tensionPercent)} percent`}>
          <div className="tension-zone tension-slack-zone" title="Slack zone (<15%)">
            <span>Slack</span>
          </div>
          <div className="tension-zone tension-safe-zone" title="Safe reeling zone (15%-75%)">
            <span>Optimal Range</span>
          </div>
          <div className="tension-zone tension-danger-zone" title="Line snap risk zone (>75%)">
            <span>Danger</span>
          </div>
          <div
            className={`tension-indicator indicator-${tensionTone}`}
            style={{ left: `calc(${tensionPercent}% - 6px)` }}
          />
        </div>

        <ChromeMeter
          className="fishing-stamina-meter"
          label="Fish stamina"
          value={encounter.stamina}
          max={encounter.maxStamina}
          valueText={`${staminaPercent}% remaining`}
          variant="stamina"
          data-testid="fish-stamina"
        />
      </div>

      {/* 4. Action Controls */}
      <div className="fishing-actions" aria-label="Fishing encounter controls">
        <ChromeButton
          className={`fishing-btn fishing-btn-reel ${activeActions.isReeling ? "is-active" : ""}`}
          aria-pressed={activeActions.isReeling}
          {...holdButtonProps("isReeling")}
        >
          <span className="btn-title">Reel</span>
          <ChromeKeycap keyName="W" glow={activeActions.isReeling} />
        </ChromeButton>

        <ChromeButton
          className={`fishing-btn fishing-btn-brace ${activeActions.isBracing ? "is-active" : ""}`}
          aria-pressed={activeActions.isBracing}
          {...holdButtonProps("isBracing")}
        >
          <span className="btn-title">Brace</span>
          <ChromeKeycap keyName="Space" glow={activeActions.isBracing} />
        </ChromeButton>

        <ChromeButton
          className={`fishing-btn fishing-btn-slack ${activeActions.isSlacking ? "is-active" : ""}`}
          aria-pressed={activeActions.isSlacking}
          {...holdButtonProps("isSlacking")}
        >
          <span className="btn-title">Slack</span>
          <ChromeKeycap keyName="S" glow={activeActions.isSlacking} />
        </ChromeButton>
      </div>
    </ChromePanel>
  );
};

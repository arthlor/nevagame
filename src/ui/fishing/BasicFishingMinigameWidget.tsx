// src/ui/fishing/BasicFishingMinigameWidget.tsx

import React, { useEffect, useRef } from "react";
import { BasicFishingState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import "./BasicFishingMinigame.css";

interface BasicFishingMinigameWidgetProps {
  fishingState: BasicFishingState;
  onHookBite?: () => void;
  onSetInput?: (isHolding: boolean) => void;
  onReleaseCast?: (power?: number) => void;
  onDismissModal?: () => void;
}

export const BasicFishingMinigameWidget: React.FC<BasicFishingMinigameWidgetProps> = ({
  fishingState,
  onHookBite,
  onSetInput,
  onReleaseCast,
  onDismissModal
}) => {
  const {
    phase,
    castPower = 0.5,
    fishY = 0.25,
    barY = 0.0,
    barHeight = 0.25,
    catchProgress = 0.3,
    isPerfect = true,
    hasTreasure = false,
    treasureY = 0.5,
    treasureProgress = 0.0,
    treasureCaught = false,
    catchItemId,
    quality = "normal"
  } = fishingState;

  const species = catchItemId ? ContentRegistry.fishSpecies.get(catchItemId) : undefined;
  const speciesName = species?.name || "Fish";

  const propsRef = useRef({ phase, onHookBite, onSetInput, onReleaseCast, onDismissModal });
  const inputHeldRef = useRef(false);
  // Charge starts in GameApp before this widget mounts, so the starting hold
  // must count as already down or the first Space/click up is ignored.
  const castChargingRef = useRef(phase === "charging-cast");
  propsRef.current = { phase, onHookBite, onSetInput, onReleaseCast, onDismissModal };

  const releaseHeldInput = () => {
    const current = propsRef.current;
    if (inputHeldRef.current) {
      inputHeldRef.current = false;
      current.onSetInput?.(false);
    }
    if (castChargingRef.current) {
      castChargingRef.current = false;
      current.onReleaseCast?.();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "KeyE" || e.code === "KeyF" || e.code === "KeyC") {
        e.preventDefault();
        const { phase: currentPhase, onHookBite: hook, onSetInput: setInp, onDismissModal: dismiss } = propsRef.current;
        if (currentPhase === "bite-reaction") {
          hook?.();
        } else if (currentPhase === "minigame") {
          inputHeldRef.current = true;
          setInp?.(true);
        } else if (currentPhase === "charging-cast") {
          castChargingRef.current = true;
        } else if (currentPhase === "caught" || currentPhase === "escaped") {
          dismiss?.();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "KeyE" || e.code === "KeyF" || e.code === "KeyC") {
        e.preventDefault();
        const { phase: currentPhase, onReleaseCast: release, onSetInput: setInp } = propsRef.current;
        if (currentPhase === "charging-cast") {
          if (castChargingRef.current) {
            castChargingRef.current = false;
            release?.();
          }
        } else if (currentPhase === "minigame") {
          if (inputHeldRef.current) {
            inputHeldRef.current = false;
            setInp?.(false);
          }
        }
      }
    };

    const handleWindowBlur = () => releaseHeldInput();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") releaseHeldInput();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseHeldInput();
    };
  }, []);

  useEffect(() => {
    if (phase !== "minigame" && inputHeldRef.current) {
      inputHeldRef.current = false;
      onSetInput?.(false);
    }
    if (phase !== "charging-cast" && castChargingRef.current) {
      castChargingRef.current = false;
      onReleaseCast?.();
    }
  }, [phase, onReleaseCast, onSetInput]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (phase === "minigame" || phase === "charging-cast") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (phase === "bite-reaction") {
      onHookBite?.();
    } else if (phase === "minigame") {
      inputHeldRef.current = true;
      onSetInput?.(true);
    } else if (phase === "charging-cast") {
      castChargingRef.current = true;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (phase === "charging-cast") {
      if (castChargingRef.current) {
        castChargingRef.current = false;
        onReleaseCast?.();
      }
    } else if (phase === "minigame") {
      if (inputHeldRef.current) {
        inputHeldRef.current = false;
        onSetInput?.(false);
      }
    }
  };

  if (phase === "charging-cast") {
    return (
      <div className="basic-fishing-container" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <div className="cast-power-card">
          <div className="cast-title">🎣 Cast Power</div>
          <div className="cast-power-bar-track">
            <div
              className="cast-power-bar-fill"
              style={{ width: `${Math.round(castPower * 100)}%` }}
            />
          </div>
          <div className="cast-power-percentage">{Math.round(castPower * 100)}%</div>
          <div className="cast-hint">Release [Space / LMB] to Cast</div>
        </div>
      </div>
    );
  }

  if (phase === "bite-reaction") {
    return (
      <div className="basic-fishing-container">
        <div className="bite-alert-banner" onPointerDown={handlePointerDown}>
          <div className="bite-exclamation">!</div>
          <div className="bite-text">Bite! Hook It!</div>
          <div className="cast-hint" style={{ color: "#fef08a" }}>Press [Space] or Click!</div>
        </div>
      </div>
    );
  }

  if (phase === "minigame") {
    return (
      <div
        className="basic-fishing-container"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
      >
        <div className="minigame-card">
          <div className="minigame-header">
            <span className="minigame-species-name">Reeling Fish</span>
            {isPerfect && <span className="perfect-badge">✨ Perfect</span>}
          </div>

          <div className="minigame-board">
            {/* Water track containing the green bar and fish */}
            <div className="water-track">
              {/* Green catch bar */}
              <div
                className="green-catch-bar"
                style={{
                  bottom: `${barY * 100}%`,
                  height: `${barHeight * 100}%`
                }}
              >
                <div className="green-bar-handle" />
              </div>

              {/* Sunken Treasure Chest */}
              {hasTreasure && (
                <div
                  className="treasure-chest-icon"
                  style={{
                    bottom: `${treasureY * 100}%`,
                    opacity: treasureCaught ? 0.3 : 1.0
                  }}
                >
                  🎁
                  {!treasureCaught && (
                    <div className="treasure-progress-ring">
                      <div
                        className="treasure-progress-fill"
                        style={{ width: `${treasureProgress * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Swimming Fish Avatar */}
              <div
                className="fish-avatar"
                style={{
                  bottom: `${fishY * 100}%`
                }}
              >
                🐟
              </div>
            </div>

            {/* Catch Progress Meter */}
            <div className="catch-progress-track">
              <div
                className="catch-progress-fill"
                style={{ height: `${Math.round(catchProgress * 100)}%` }}
              />
            </div>
          </div>

          <div className="minigame-footer-hint">
            Hold [Space / LMB] to Raise Bar
          </div>
        </div>
      </div>
    );
  }

  if (phase === "caught") {
    return (
      <div className="basic-fishing-container">
        <div className="catch-summary-card">
          <div className="catch-summary-header">🎉 Fish Caught!</div>
          <div className="catch-item-preview">
            <div className="catch-item-emoji">🐟</div>
            <div className="catch-item-name">{speciesName}</div>
            <div className={`catch-quality-badge quality-${quality}`}>
              {quality === "iridium" ? "🌟 Iridium Quality" :
               quality === "gold" ? "⭐ Gold Quality" :
               quality === "silver" ? "⭐ Silver Quality" :
               "Regular Quality"}
            </div>
          </div>

          {isPerfect && (
            <div className="perfect-badge" style={{ fontSize: "12px", padding: "4px 10px" }}>
              ✨ PERFECT CATCH (+Double XP)
            </div>
          )}

          {hasTreasure && treasureCaught && (
            <div className="treasure-summary-tag">
              🎁 Sunken Treasure Recovered!
            </div>
          )}

          <button className="dismiss-button" onClick={onDismissModal}>
            Collect Catch [Space]
          </button>
        </div>
      </div>
    );
  }

  return null;
};

// src/ui/fishing/BasicFishingMinigameWidget.tsx

import React, { useEffect, useRef } from "react";
import { BasicFishingState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { IconFish } from "../components/HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeButton, ChromeKeycap, ChromeMeter, ChromePanel, ChromeQuality } from "../chrome/Chrome";
import { playUiSound } from "../audio/uiAudio";
import "./BasicFishingMinigame.css";

interface BasicFishingMinigameWidgetProps {
  fishingState: BasicFishingState;
  onHookBite?: () => void;
  onSetInput?: (isHolding: boolean) => void;
  onReleaseCast?: (power?: number) => void;
  onDismissModal?: () => void;
  onCancel?: () => void;
}

export const BasicFishingMinigameWidget: React.FC<BasicFishingMinigameWidgetProps> = ({
  fishingState,
  onHookBite,
  onSetInput,
  onReleaseCast,
  onDismissModal,
  onCancel
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

  const propsRef = useRef({ phase, onHookBite, onSetInput, onReleaseCast, onDismissModal, onCancel });
  const inputHeldRef = useRef(false);
  // Charge starts in GameApp before this widget mounts, so the starting hold
  // must count as already down or the first Space/click up is ignored.
  const castChargingRef = useRef(phase === "charging-cast");
  const prevPhaseRef = useRef(phase);
  propsRef.current = { phase, onHookBite, onSetInput, onReleaseCast, onDismissModal, onCancel };

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (phase === "bite-reaction") playUiSound("confirm");
    if (phase === "caught") playUiSound("chime");
    if (phase === "escaped") playUiSound("click");
  }, [phase]);

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
      if (e.code === "Escape") {
        const { phase: currentPhase, onCancel: cancel, onDismissModal: dismiss } = propsRef.current;
        if (currentPhase === "caught" || currentPhase === "escaped") {
          dismiss?.();
          return;
        }
        if (
          currentPhase === "charging-cast" ||
          currentPhase === "waiting-bite" ||
          currentPhase === "bite-reaction" ||
          currentPhase === "minigame"
        ) {
          cancel?.();
        }
        return;
      }
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
        <ChromePanel tone="slate" flourish corners className="cast-power-card">
          <div className="cast-title">Cast power</div>
          <ChromeMeter
            className="cast-power-meter"
            label="Cast power"
            value={castPower}
            max={1}
            valueText={`${Math.round(castPower * 100)}%`}
            variant="gold"
            data-testid="cast-power-meter"
          />
          <div className="cast-hint">Release <ChromeKeycap keyName="Space" glow /> to Cast · <ChromeKeycap keyName="Esc" /> cancel</div>
        </ChromePanel>
      </div>
    );
  }

  if (phase === "bite-reaction") {
    return (
      <div className="basic-fishing-container">
        <ChromePanel tone="slate" flourish corners className="bite-alert-banner" onPointerDown={handlePointerDown} data-testid="bite-alert">
          <div className="bite-exclamation">!</div>
          <div className="bite-text">Bite!</div>
          <div className="cast-hint">Hook set — press <ChromeKeycap keyName="Space" glow /></div>
        </ChromePanel>
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
        <ChromePanel tone="slate" flourish corners className="minigame-card" data-testid="reeling-minigame">
          <div className="minigame-header">
            <span className="minigame-species-name">Reeling Fish</span>
            {isPerfect && <span className="perfect-badge">Perfect</span>}
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
                  <span className="treasure-mark" aria-label="Sunken treasure">◆</span>
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
                <AtlasImage src={atlasForFish(catchItemId)} alt="" size={18} />
                {!atlasForFish(catchItemId) && <IconFish size={18} aria-hidden="true" />}
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
            Hold <ChromeKeycap keyName="Space" glow /> to keep pressure · <ChromeKeycap keyName="Esc" /> cancel
          </div>
        </ChromePanel>
      </div>
    );
  }

  if (phase === "caught") {
    return (
      <div className="basic-fishing-container">
        <ChromePanel tone="slate" flourish corners className="catch-summary-card" data-testid="catch-landed">
          <div className="catch-summary-header">Fish landed</div>
          <div className="catch-item-preview">
            <div className="catch-item-emoji">
              <AtlasImage src={atlasForFish(catchItemId)} alt="" size={72} />
              {!atlasForFish(catchItemId) && <IconFish size={22} aria-hidden="true" />}
            </div>
            <div className="catch-item-name">{speciesName}</div>
            <ChromeQuality quality={quality} />
          </div>

          {isPerfect && (
            <div className="perfect-badge" style={{ fontSize: "12px", padding: "4px 10px" }}>
              Perfect catch (+double experience)
            </div>
          )}

          {hasTreasure && treasureCaught && (
            <div className="treasure-summary-tag">
              Sunken treasure recovered
            </div>
          )}

          <ChromeButton className="dismiss-button" variant="gold" soundCue="confirm" onClick={onDismissModal}>
            Collect <ChromeKeycap keyName="Space" />
          </ChromeButton>
        </ChromePanel>
      </div>
    );
  }

  if (phase === "escaped") {
    return (
      <div className="basic-fishing-container">
        <ChromePanel tone="slate" flourish corners className="catch-summary-card escaped-card" data-testid="catch-escaped">
          <div className="catch-summary-header">Got away</div>
          <div className="catch-item-preview">
            <div className="catch-item-emoji">
              <AtlasImage src={atlasForFish(catchItemId)} alt="" size={72} />
              {!atlasForFish(catchItemId) && <IconFish size={22} aria-hidden="true" />}
            </div>
            <p className="cast-hint">The fish slipped the hook.</p>
          </div>
          <ChromeButton className="dismiss-button dismiss-secondary" onClick={onDismissModal}>
            Dismiss
          </ChromeButton>
        </ChromePanel>
      </div>
    );
  }

  return null;
};

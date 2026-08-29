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
  onDismissModal?: () => void;
}

export const BasicFishingMinigameWidget: React.FC<BasicFishingMinigameWidgetProps> = ({
  fishingState,
  onHookBite,
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

  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (phase === "bite-reaction") playUiSound("confirm");
    if (phase === "caught") playUiSound("chime");
    if (phase === "escaped") playUiSound("click");
  }, [phase]);

  if (phase === "charging-cast") {
    return (
      <div className="basic-fishing-container">
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
          <div className="cast-hint">Release <ChromeKeycap keyName="E / LMB" glow /> to cast · <ChromeKeycap keyName="Esc" /> cancel</div>
        </ChromePanel>
      </div>
    );
  }

  if (phase === "bite-reaction") {
    return (
      <div className="basic-fishing-container">
        <ChromePanel tone="slate" flourish corners className="bite-alert-banner" data-testid="bite-alert">
          <div className="bite-exclamation">!</div>
          <div className="bite-text">Bite!</div>
          <div className="cast-hint">Hook set — press <ChromeKeycap keyName="Space" glow /></div>
          <ChromeButton variant="gold" soundCue="confirm" onClick={onHookBite}>Hook fish</ChromeButton>
        </ChromePanel>
      </div>
    );
  }

  if (phase === "minigame") {
    return (
      <div
        className="basic-fishing-container"
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

            {/* Catch Progress & Risk Meter (Right Side) */}
            <div
              className="catch-progress-track"
              role="meter"
              aria-label="Fish catch risk gauge"
              aria-valuenow={Math.round(catchProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              title={`Catch Progress: ${Math.round(catchProgress * 100)}%`}
            >
              <div
                className={`catch-progress-fill${catchProgress < 0.25 ? " is-critical-risk" : ""}`}
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

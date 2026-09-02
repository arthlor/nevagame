import React, { useEffect, useRef, useState } from "react";
import { BasicFishingState } from "../../simulation/core/types";
import { ContentRegistry } from "../../content/ContentRegistry";
import { IconFish } from "../components/HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeButton, ChromeQuality } from "../chrome/Chrome";
import { GameSheet, KeyHint, Meter } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";

interface BasicFishingMinigameWidgetProps {
  fishingState: BasicFishingState;
  onHookBite?: () => void;
  onDismissModal?: () => { success: boolean; reason?: string; reasonCode?: string };
  onOpenSatchel?: () => void;
  onDiscardCatch?: () => void;
}

export const BasicFishingMinigameWidget: React.FC<BasicFishingMinigameWidgetProps> = ({
  fishingState,
  onHookBite,
  onDismissModal,
  onOpenSatchel,
  onDiscardCatch
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
  const [inventoryBlocked, setInventoryBlocked] = useState(false);

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (phase === "bite-reaction") playUiSound("confirm");
    if (phase === "caught") playUiSound("chime");
    if (phase === "escaped") playUiSound("click");
  }, [phase]);

  const collectCatch = () => {
    const result = onDismissModal?.();
    setInventoryBlocked(result?.reasonCode === "inventory-full");
  };

  if (phase === "charging-cast") {
    return (
      <div className="basic-fishing-container">
        <GameSheet family="ink" tone="slate" corners className="cast-power-card">
          <div className="cast-title">Cast power</div>
          <Meter
            className="cast-power-meter"
            label="Cast power"
            value={castPower}
            max={1}
            valueText={`${Math.round(castPower * 100)}%`}
            variant="gold"
            data-testid="cast-power-meter"
          />
          <div className="cast-hint">Release <KeyHint keyName="E / LMB" glow /> to cast · <KeyHint keyName="Esc" /> cancel</div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "bite-reaction") {
    return (
      <div className="basic-fishing-container">
        <GameSheet family="ink" tone="slate" corners className="bite-alert-banner" data-testid="bite-alert">
          <div className="bite-exclamation">!</div>
          <div className="bite-text">Bite!</div>
          <div className="cast-hint">Hook set — press <KeyHint keyName="Space" glow /></div>
          <ChromeButton variant="gold" soundCue="confirm" onClick={onHookBite}>Hook fish</ChromeButton>
        </GameSheet>
      </div>
    );
  }

  if (phase === "minigame") {
    return (
      <div className="basic-fishing-container">
        <GameSheet family="ink" tone="slate" corners className="minigame-card" data-testid="reeling-minigame">
          <div className="minigame-header">
            <span className="minigame-species-name">Reeling Fish</span>
            {isPerfect && <span className="perfect-badge">Perfect</span>}
          </div>

          <div className="minigame-board">
            <div className="water-track">
              <div
                className="green-catch-bar"
                style={{
                  bottom: `${barY * 100}%`,
                  height: `${barHeight * 100}%`
                }}
              >
                <div className="green-bar-handle" />
              </div>

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
            Hold <KeyHint keyName="Space" glow /> to keep pressure · <KeyHint keyName="Esc" /> cancel
          </div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "caught") {
    return (
      <div className="basic-fishing-container">
        <GameSheet family="ink" tone="slate" corners className="catch-summary-card result-stamp" data-testid="catch-landed">
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
              Perfect catch
            </div>
          )}

          {hasTreasure && treasureCaught && (
            <div className="treasure-summary-tag">
              Sunken treasure recovered
            </div>
          )}

          <p className="catch-storage-line">
            {inventoryBlocked ? "Storage · Waiting in hand" : "Storage · Satchel on collect"}
          </p>
          {inventoryBlocked && <p className="catch-storage-blocker">The satchel is full. Make room or discard this catch.</p>}
          <div className="catch-result-actions">
            <ChromeButton
              className="dismiss-button"
              variant="gold"
              soundCue="confirm"
              autoFocus={inventoryBlocked}
              onClick={collectCatch}
            >
              Collect <KeyHint keyName="Space" />
            </ChromeButton>
            {inventoryBlocked && onOpenSatchel && (
              <ChromeButton onClick={onOpenSatchel}>Open satchel</ChromeButton>
            )}
            {inventoryBlocked && onDiscardCatch && (
              <ChromeButton variant="danger" onClick={onDiscardCatch}>Discard catch</ChromeButton>
            )}
          </div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "escaped") {
    return (
      <div className="basic-fishing-container">
        <GameSheet family="ink" tone="slate" corners className="catch-summary-card result-stamp escaped-card" data-testid="catch-escaped">
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
        </GameSheet>
      </div>
    );
  }

  return null;
};

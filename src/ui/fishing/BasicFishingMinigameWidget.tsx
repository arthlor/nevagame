import React, { useEffect, useRef, useState } from "react";
import type { BasicFishingState } from "../../simulation/core/types";
import { BasicFishingMinigame } from "../../simulation/fishing/BasicFishingMinigame";
import { ContentRegistry } from "../../content/ContentRegistry";
import { IconFish } from "../components/HudIcons";
import { AtlasImage } from "../chrome/AtlasImage";
import { atlasForFish } from "../chrome/uiAtlas";
import { ChromeButton, ChromeQuality } from "../chrome/Chrome";
import { GameSheet, KeyHint, Meter } from "../coastal/CoastalUI";
import { playUiSound } from "../audio/uiAudio";
import { useTranslation } from "../../i18n/useTranslation";

interface BasicFishingMinigameWidgetProps {
  fishingState: Readonly<BasicFishingState>;
  onHoldChange?: (holding: boolean) => void;
  onHookBite?: () => void;
  onDismissModal?: () => { success: boolean; reason?: string; reasonCode?: string };
  onOpenSatchel?: () => void;
  onDiscardCatch?: () => void;
}

export const BasicFishingMinigameWidget: React.FC<BasicFishingMinigameWidgetProps> = ({
  fishingState,
  onHoldChange,
  onHookBite,
  onDismissModal,
  onOpenSatchel,
  onDiscardCatch
}) => {
  const { locale, getLocalizedFish } = useTranslation();
  const isTr = locale === "tr";

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
  const speciesName = (isTr && catchItemId ? getLocalizedFish(catchItemId).name : null) || species?.name || (isTr ? "Balık" : "Fish");

  const { good: CAST_GOOD, prime: CAST_PRIME } = BasicFishingMinigame.CAST_QUALITY_THRESHOLDS;
  const castBand: "short" | "good" | "prime" =
    castPower >= CAST_PRIME ? "prime" : castPower >= CAST_GOOD ? "good" : "short";

  const prevPhaseRef = useRef(phase);
  const onHoldChangeRef = useRef(onHoldChange);
  onHoldChangeRef.current = onHoldChange;
  const [inventoryBlocked, setInventoryBlocked] = useState(false);

  useEffect(() => {
    if (prevPhaseRef.current === phase) return;
    prevPhaseRef.current = phase;
    if (phase === "bite-reaction") playUiSound("confirm");
    if (phase === "caught") playUiSound("chime");
    if (phase === "escaped") playUiSound("click");
  }, [phase]);

  useEffect(() => {
    if (phase !== "minigame") onHoldChangeRef.current?.(false);
  }, [phase]);

  useEffect(() => () => {
    onHoldChangeRef.current?.(false);
  }, []);

  const setMinigameHold = (holding: boolean) => {
    onHoldChangeRef.current?.(holding);
  };

  const minigameHoldProps = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setMinigameHold(true);
    },
    onPointerUp: () => setMinigameHold(false),
    onPointerCancel: () => setMinigameHold(false),
    onLostPointerCapture: () => setMinigameHold(false)
  };

  const collectCatch = () => {
    const result = onDismissModal?.();
    setInventoryBlocked(result?.reasonCode === "inventory-full");
  };

  if (phase === "charging-cast") {
    return (
      <div className="basic-fishing-container basic-fishing-container--charging-cast">
        <GameSheet family="ink" tone="slate" corners className="cast-power-card">
          <div className="cast-title">{isTr ? "Savurma gücü" : "Cast power"}</div>
          <Meter
            className="cast-power-meter"
            label={isTr ? "Savurma gücü" : "Cast power"}
            showLabel={false}
            value={castPower}
            max={1}
            valueText={`${Math.round(castPower * 100)}%`}
            variant="gold"
            data-testid="cast-power-meter"
          />
          {/* The sweet spot marks the power bands the quality roll actually
              uses, so releasing on the gold band is a real decision. */}
          <div className="cast-sweet-spot-track" aria-hidden="true">
            <span
              className="cast-sweet-spot-band is-good"
              style={{
                left: `${CAST_GOOD * 100}%`,
                width: `${(CAST_PRIME - CAST_GOOD) * 100}%`
              }}
            />
            <span
              className="cast-sweet-spot-band is-prime"
              style={{
                left: `${CAST_PRIME * 100}%`,
                width: `${(1 - CAST_PRIME) * 100}%`
              }}
            />
            <span className="cast-sweet-spot-needle" style={{ left: `${castPower * 100}%` }} />
          </div>
          <div className="cast-power-zones">
            <span
              className={`cast-zone${castBand === "short" ? " is-active" : ""}`}
              data-testid="cast-band-short"
            >
              {isTr ? "Kısa" : "Short"}
            </span>
            <span
              className={`cast-zone is-good${castBand === "good" ? " is-active" : ""}`}
              data-testid="cast-band-good"
            >
              {isTr ? "İyi" : "Good"}
            </span>
            <span
              className={`cast-zone is-prime${castBand === "prime" ? " is-active" : ""}`}
              data-testid="cast-band-prime"
            >
              {isTr ? "Kusursuz" : "Prime"}
            </span>
          </div>
          <div className="cast-hint">
            <span className="hint-desktop">
              {isTr ? (
                <>Savurmak için <KeyHint keyName="E / LMB" glow /> bırak · <KeyHint keyName="Esc" /> iptal</>
              ) : (
                <>Release <KeyHint keyName="E / LMB" glow /> to cast · <KeyHint keyName="Esc" /> cancel</>
              )}
            </span>
            <span className="hint-touch">{isTr ? "Bırakmak için [Savur]'a dokun" : "Tap [Cast] to release"}</span>
          </div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "bite-reaction") {
    return (
      <div className="basic-fishing-container basic-fishing-container--bite-reaction">
        <GameSheet family="ink" tone="slate" corners className="bite-alert-banner" data-testid="bite-alert">
          <div className="bite-bobber" data-testid="bite-bobber" aria-hidden="true">
            <span className="bite-bobber-ripple" />
            <span className="bite-bobber-ripple bite-bobber-ripple--delayed" />
            <span className="bite-bobber-float" />
          </div>
          <div className="bite-exclamation">!</div>
          <div className="bite-text">{isTr ? "Vurdu!" : "Bite!"}</div>
          <div className="cast-hint">
            <span className="hint-desktop">
              {isTr ? (
                <>Tasmala — <KeyHint keyName="Space" glow /> tuşuna bas</>
              ) : (
                <>Hook set — press <KeyHint keyName="Space" glow /></>
              )}
            </span>
            <span className="hint-touch">{isTr ? "Balık oltada — Tasmala'ya dokun!" : "Fish on line — tap Hook!"}</span>
          </div>
          <ChromeButton variant="gold" soundCue="confirm" onClick={onHookBite}>
            {isTr ? "Tasmala" : "Hook fish"}
          </ChromeButton>
        </GameSheet>
      </div>
    );
  }

  if (phase === "minigame") {
    return (
      <div className="basic-fishing-container basic-fishing-container--minigame">
        <GameSheet
          family="ink"
          tone="slate"
          corners
          className="minigame-card"
          data-testid="reeling-minigame"
          {...minigameHoldProps}
        >
          <div className="minigame-header">
            <span className="minigame-species-name">{isTr ? "Balık Çekiliyor" : "Reeling Fish"}</span>
            {isPerfect && <span className="perfect-badge">{isTr ? "Kusursuz" : "Perfect"}</span>}
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
                  <span className="treasure-mark" aria-label={isTr ? "Batık hazine" : "Sunken treasure"}>◆</span>
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
              title={isTr ? `Av İlerlemesi: %${Math.round(catchProgress * 100)}` : `Catch Progress: ${Math.round(catchProgress * 100)}%`}
            >
              <div
                className={`catch-progress-fill${catchProgress < 0.25 ? " is-critical-risk" : ""}`}
                style={{ height: `${Math.round(catchProgress * 100)}%` }}
              />
            </div>
          </div>

          <div className="minigame-footer-hint">
            <span className="hint-desktop">
              {isTr ? (
                <>Baskıyı korumak için karta basılı tut ya da <KeyHint keyName="Space" glow /> bas · <KeyHint keyName="Esc" /> iptal</>
              ) : (
                <>Hold the card or <KeyHint keyName="Space" glow /> to keep pressure · <KeyHint keyName="Esc" /> cancel</>
              )}
            </span>
            <span className="hint-touch">
              {isTr ? "Baskıyı korumak için [Sar] veya karta basılı tut" : "Hold [Reel] or card to keep pressure"}
            </span>
          </div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "caught") {
    return (
      <div className="basic-fishing-container basic-fishing-container--caught">
        <GameSheet family="ink" tone="slate" corners className="catch-summary-card result-stamp" data-testid="catch-landed">
          <div className="catch-summary-header">{isTr ? "Balık karada" : "Fish landed"}</div>
          <div className="catch-item-preview">
            <div className="catch-item-emoji">
              <AtlasImage src={atlasForFish(catchItemId)} alt="" size={72} />
              {!atlasForFish(catchItemId) && <IconFish size={22} aria-hidden="true" />}
            </div>
            <div className="catch-item-name">{speciesName}</div>
            <ChromeQuality quality={quality} />
          </div>

          {isPerfect && (
            <div className="perfect-badge perfect-badge--summary">
              {isTr ? "Kusursuz av" : "Perfect catch"}
            </div>
          )}

          {hasTreasure && treasureCaught && (
            <div className="treasure-summary-tag">
              {isTr ? "Batık hazine kurtarıldı" : "Sunken treasure recovered"}
            </div>
          )}

          <p className="catch-storage-line">
            {isTr
              ? (inventoryBlocked ? "Depo · Elde bekliyor" : "Depo · Alınınca heybeye")
              : (inventoryBlocked ? "Storage · Waiting in hand" : "Storage · Satchel on collect")}
          </p>
          {inventoryBlocked && (
            <p className="catch-storage-blocker">
              {isTr ? "Heybe tamamen dolu. Yer aç ya da bu avı bırak." : "The satchel is full. Make room or discard this catch."}
            </p>
          )}
          <div className="catch-result-actions">
            <ChromeButton
              className="dismiss-button"
              variant="gold"
              soundCue="confirm"
              autoFocus={inventoryBlocked}
              onClick={collectCatch}
            >
              {isTr ? "Topla" : "Collect"} <KeyHint keyName="Space" />
            </ChromeButton>
            {inventoryBlocked && onOpenSatchel && (
              <ChromeButton onClick={onOpenSatchel}>
                {isTr ? "Heybeyi aç" : "Open satchel"}
              </ChromeButton>
            )}
            {inventoryBlocked && onDiscardCatch && (
              <ChromeButton variant="danger" onClick={onDiscardCatch}>
                {isTr ? "Avı bırak" : "Discard catch"}
              </ChromeButton>
            )}
          </div>
        </GameSheet>
      </div>
    );
  }

  if (phase === "escaped") {
    return (
      <div className="basic-fishing-container basic-fishing-container--escaped">
        <GameSheet family="ink" tone="slate" corners className="catch-summary-card result-stamp escaped-card" data-testid="catch-escaped">
          <div className="catch-summary-header">{isTr ? "Kaçırdın" : "Got away"}</div>
          <div className="catch-item-preview">
            <div className="catch-item-emoji">
              <AtlasImage src={atlasForFish(catchItemId)} alt="" size={72} />
              {!atlasForFish(catchItemId) && <IconFish size={22} aria-hidden="true" />}
            </div>
            <p className="cast-hint">{isTr ? "Balık iğneden kurtuldu." : "The fish slipped the hook."}</p>
            <p className="escape-tip">
              {isTr
                ? "Yeşil çubuğu balığın üzerinde tutup hareketini takip etmeye çalış."
                : "Try keeping the green bar over the fish and matching its movement."}
            </p>
          </div>
          <ChromeButton className="dismiss-button dismiss-secondary" onClick={onDismissModal}>
            {isTr ? "Kapat" : "Dismiss"}
          </ChromeButton>
        </GameSheet>
      </div>
    );
  }

  return null;
};

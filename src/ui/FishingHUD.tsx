import React, { useEffect, useRef, useState } from "react";
import type { SportFishingHudDto } from "../simulation/core/contracts";
import { IconFish, IconRod, IconWarning } from "./components/HudIcons";
import { AtlasImage } from "./chrome/AtlasImage";
import { atlasForBehavior, atlasForFish } from "./chrome/uiAtlas";
import { ChromeButton } from "./chrome/Chrome";
import { GuildcraftArt } from "./hud/GuildcraftArt";
import { GameSheet, KeyHint } from "./coastal/CoastalUI";
import { useTranslation } from "../i18n/useTranslation";

interface FishingHUDProps {
  hud: SportFishingHudDto;
  onSetInput: (input: {
    isReeling: boolean;
    isSlacking: boolean;
    isBracing: boolean;
    rodDirectionAngle: number;
  }) => void;
  onSetDrag?: (notch: 0 | 1 | 2) => void;
  /** Stows a landed fish; disabled while `hud.keepAvailable` is false. */
  onKeepCatch?: () => void;
  /** Lets a landed fish go for release XP instead of cargo. */
  onReleaseCatch?: () => void;
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

const DRAG_LABEL_EN: Record<0 | 1 | 2, string> = {
  0: "Light",
  1: "Balanced",
  2: "Heavy"
};

const DRAG_LABEL_TR: Record<0 | 1 | 2, string> = {
  0: "Hafif",
  1: "Dengeli",
  2: "Sıkı"
};

function localizeFishAction(action: string, isTr: boolean): string {
  if (!isTr) return action;
  if (/surging/i.test(action)) return "Hırçın dalış";
  if (/running/i.test(action)) return "Uzaklaşıyor";
  if (/thrashing/i.test(action)) return "Çırpınıyor";
  if (/tiring/i.test(action)) return "Yoruluyor";
  if (/surfaced/i.test(action)) return "Su yüzeyinde";
  if (/resting/i.test(action)) return "Dinleniyor";
  return action;
}

function localizeResponse(response: string, isTr: boolean): string {
  if (!isTr) return response;
  if (/reel/i.test(response)) return "Kendine doğru sar";
  if (/slack/i.test(response)) return "Misinayı sal";
  if (/brace/i.test(response)) return "Kamışı destekle";
  if (/left/i.test(response)) return "Sola çek";
  if (/right/i.test(response)) return "Sağa çek";
  if (/steady/i.test(response)) return "Dengede tut";
  return response;
}

export const FishingHUD: React.FC<FishingHUDProps> = ({
  hud,
  onSetInput,
  onSetDrag,
  onKeepCatch,
  onReleaseCatch
}) => {
  const { locale, getLocalizedFish } = useTranslation();
  const isTr = locale === "tr";
  const dragLabels = isTr ? DRAG_LABEL_TR : DRAG_LABEL_EN;
  const speciesDisplayName = (isTr ? getLocalizedFish(hud.speciesId).name : null) || hud.speciesName;

  const holdRef = useRef<FishingHoldState>(EMPTY_HOLD);
  const onSetInputRef = useRef(onSetInput);
  const hudRef = useRef(hud);
  const steeringHeld = useRef(false);
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
    if (!holdRef.current.isReeling && !holdRef.current.isSlacking && !holdRef.current.isBracing && !steeringHeld.current) return;
    steeringHeld.current = false;
    holdRef.current = EMPTY_HOLD;
    onSetInputRef.current({
      ...EMPTY_HOLD,
      rodDirectionAngle: 0
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
  const { decision, telemetry } = hud;
  const inLandingRange = telemetry.runDistanceMeters <= telemetry.landingDistanceMeters;
  const rodLay = telemetry.rodDeflectionPercent;
  // Swinging with the fish is the mistake worth colouring; a clean counter reads calm.
  const counterSwingTone =
    telemetry.counterSwingPercent <= -25
      ? "danger"
      : telemetry.counterSwingPercent >= 25
        ? "good"
        : "neutral";
  useEffect(() => {
    // A captured touch belongs to the action that was pressed. A new prompt
    // must not leave that old action held behind a relabelled button.
    releaseAllHolds();
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
      steeringHeld.current = true;
      onSetInput({ ...holdRef.current, rodDirectionAngle: direction * hud.steeringMagnitude });
    },
    onPointerUp: () => { steeringHeld.current = false; onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }); },
    onPointerCancel: () => { steeringHeld.current = false; onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }); },
    onLostPointerCapture: () => { steeringHeld.current = false; onSetInput({ ...holdRef.current, rodDirectionAngle: 0 }); }
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

  const localizedDecisionResponse = localizeResponse(decision.response, isTr);
  const localizedFishAction = localizeFishAction(decision.fishAction, isTr);

  return (
    <>
    <section className="guild-fish-target" aria-label={isTr ? "İğnedeki balık" : "Hooked fish"}>
      <header className="fishing-target-row">
        <span className="guild-fish-portrait"><AtlasImage src={atlasForFish(hud.speciesId)} alt="" size={60} /><GuildcraftArt art="ring" /></span>
        {!atlasForFish(hud.speciesId) && <IconFish size={20} aria-hidden="true" />}
        <div className="fishing-target-copy">
          <strong className="fishing-target-name">{speciesDisplayName}</strong>
          <span>{isTr ? "Balık gücü" : "Fish energy"}</span>
        </div>
        <strong className="fishing-energy-value">{hud.energyPercent}%</strong>
      </header>

      <div className="fishing-energy-track" data-testid="fish-stamina" role="meter" aria-label={isTr ? "Balık enerjisi" : "Fish energy"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={hud.energyPercent}>
        <div className="fishing-energy-fill" style={{ width: `${hud.energyPercent}%` }} />
      </div>

    </section>
    <GameSheet
      family="ink"
      className={`fishing-hud-container fishing-hud-simple interactive${hud.tensionTone === "danger" ? " fishing-tension-danger" : ""}`}
      role="region"
      aria-label={isTr ? "Sportif balıkçılık mücadelesi" : "Sport fishing fight"}
      data-testid="sport-fishing-hud"
    >
      {hud.awaitingLandingChoice ? (
        <section className="fishing-landing-choice" aria-label={isTr ? "Karaya çıkarma seçimi" : "Landing choice"} data-testid="fishing-landing-choice">
          <strong>{isTr ? "Balık karada" : "Fish landed"}</strong>
          <p>
            {isTr
              ? (hud.keepAvailable
                  ? "Sakla veya salıver."
                  : "Yer yok. Balığı salıver.")
              : (hud.keepAvailable
                  ? "Keep or release the catch."
                  : "No room. Release the catch.")}
          </p>
          {hud.workSettlement && (
            <p data-testid="sport-work-recovery">
              {hud.workSettlement.landingRecovery > 0
                ? (isTr
                    ? `Saklayınca veya salıverince +${hud.workSettlement.landingRecovery} Emek`
                    : `Keep or release to recover +${hud.workSettlement.landingRecovery} Work`)
                : (isTr ? "Şu anda Emek kazanılamıyor." : "No Work can be recovered right now.")}
            </p>
          )}
          <div className="fishing-landing-choice-actions">
            <ChromeButton
              variant="gold"
              soundCue="confirm"
              disabled={!hud.keepAvailable}
              onClick={() => onKeepCatch?.()}
            >
              {isTr ? "Sakla" : "Keep"}
            </ChromeButton>
            <ChromeButton soundCue="cancel" onClick={() => onReleaseCatch?.()}>
              {isTr ? "Salıver" : "Release"}
            </ChromeButton>
          </div>
        </section>
      ) : (
        <>
          {hud.showFirstTip && (
            <p className="fishing-first-tip">
              {isTr
                ? "Gösterilen kontrolü basılı tut."
                : "Hold the highlighted control."}
            </p>
          )}
      {hud.signatureMoment && (
        <p className="fishing-signature-moment" aria-live="polite" key={hud.signatureMoment.id}>
          {hud.signatureMoment.copy}
        </p>
      )}

      <section className={`fishing-decision fishing-decision-${decision.tone}`} aria-live="polite">
        <AtlasImage className="fishing-decision-icon" src={atlasForBehavior(decision.icon)} alt="" size={30} />
        <div className="fishing-decision-copy">
          <span>{localizedFishAction}</span>
          <strong>{localizedDecisionResponse}</strong>
        </div>
        {decision.key && <KeyHint keyName={decision.key} glow />}
      </section>

      <section
        className="fishing-tension"
        aria-label={
          isTr
            ? `Misina gerginliği: ${
                hud.tensionWord.toLowerCase() === "danger"
                  ? "tehlikeli"
                  : hud.tensionWord.toLowerCase() === "slack"
                    ? "boşta"
                    : "güvenli"
              }`
            : `Line tension ${hud.tensionWord.toLowerCase()}`
        }
      >
        <div className="fishing-tension-head">
          <IconRod size={13} aria-hidden="true" />
          <span>{isTr ? "Misina gerginliği" : "Line tension"}</span>
          <strong className={`fishing-tension-word fishing-tension-word-${hud.tensionTone}`}>
            {isTr
              ? (hud.tensionWord.toLowerCase() === "danger"
                  ? "TEHLİKELİ"
                  : hud.tensionWord.toLowerCase() === "slack"
                    ? "BOŞTA"
                    : "GÜVENLİ")
              : hud.tensionWord.toUpperCase()}
          </strong>
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
        <div className="fishing-tension-labels" aria-hidden="true">
          <span>{isTr ? "Boşta" : "Slack"}</span>
          <span>{isTr ? "Güvenli" : "Safe"}</span>
          <span>{isTr ? "Tehlikeli" : "Danger"}</span>
        </div>
      </section>

      <section
        className="fishing-telemetry"
        aria-label={isTr ? "Mücadele telemetrisi" : "Fight telemetry"}
        data-testid="fishing-telemetry"
      >
        <div className="fishing-telemetry-run">
          <div className="fishing-telemetry-run-head">
            <span>{isTr ? "Mesafe" : "Distance"}</span>
            <strong data-testid="fishing-run-distance">
              {`${telemetry.runDistanceMeters.toFixed(1)} m`}
            </strong>
          </div>
          {/* The landing mark sits where the fish comes within reach, so the
              angler can see the gap closing rather than guess at it. */}
          <div
            className={`fishing-telemetry-run-track${inLandingRange ? " is-in-range" : ""}`}
            aria-hidden="true"
          >
            <span
              className="fishing-telemetry-run-fill"
              style={{ width: `${telemetry.runDistancePercent}%` }}
            />
            <span className="fishing-telemetry-landing-mark" />
          </div>
          <span className="fishing-telemetry-run-note">
            {inLandingRange
              ? (isTr ? "Uzanma menzilinde" : "Within reach")
              : (isTr ? `${telemetry.landingDistanceMeters} m içinde çekilir` : `Land within ${telemetry.landingDistanceMeters} m`)}
          </span>
        </div>

        <details className="fishing-telemetry-details">
        <summary>{isTr ? "Kamış ve derinlik" : "Rod & depth"}</summary>
        <dl className="fishing-telemetry-grid">
          <div className="fishing-telemetry-cell fishing-telemetry-depth">
            <dt>{isTr ? "Derinlik" : "Depth"}</dt>
            <dd data-testid="fishing-depth">
              {telemetry.waterDepthMeters <= 0
                ? (isTr ? "Yüzeyde" : "Surfaced")
                : `${telemetry.waterDepthMeters.toFixed(1)} m`}
            </dd>
          </div>
          <div className="fishing-telemetry-cell fishing-telemetry-rod">
            <dt>{isTr ? "Kamış" : "Rod"}</dt>
            <dd data-testid="fishing-rod-deflection">
              {rodLay === 0
                ? (isTr ? "Ortada" : "Centred")
                : `${rodLay > 0 ? (isTr ? "Sağ" : "Right") : (isTr ? "Sol" : "Left")} ${Math.abs(rodLay)}%`}
            </dd>
          </div>
        </dl>

        {/* Counter-swing is the one telemetry number that is also an
            instruction, so it carries the [A]/[D] cue with it. */}
        <div
          className={`fishing-counter-swing tone-${counterSwingTone}`}
          data-testid="fishing-counter-swing"
          data-tone={counterSwingTone}
        >
          <span className="fishing-counter-swing-label">{isTr ? "Karşı Hamle" : "Counter"}</span>
          <div className="fishing-counter-swing-track" aria-hidden="true">
            <span className="fishing-counter-swing-centre" />
            <span
              className="fishing-counter-swing-fill"
              style={{
                width: `${Math.abs(telemetry.counterSwingPercent) / 2}%`,
                left: telemetry.counterSwingPercent >= 0 ? "50%" : undefined,
                right: telemetry.counterSwingPercent < 0 ? "50%" : undefined
              }}
            />
          </div>
          {telemetry.counterSwingCue ? (
            <span className="fishing-counter-swing-cue">
              <KeyHint keyName={telemetry.counterSwingCue === "left" ? "A" : "D"} glow={counterSwingTone === "danger"} />
              <span>
                {isTr
                  ? (telemetry.counterSwingCue === "left" ? "Sola yatır" : "Sağa yatır")
                  : (telemetry.counterSwingCue === "left" ? "Swing left" : "Swing right")}
              </span>
            </span>
          ) : (
            <span className="fishing-counter-swing-cue is-idle">{isTr ? "Dengede" : "Holding"}</span>
          )}
        </div>
        </details>
      </section>

      {hud.showLineWarning && (
        <div className={`fishing-line-warning${hud.lineIntegrityPercent <= 20 ? " is-critical" : ""}`} data-testid="fish-integrity">
          <IconWarning size={13} aria-hidden="true" />
          <span>{isTr ? "Misina yıprandı" : "Line damaged"}</span>
          <strong>{hud.lineIntegrityPercent}%</strong>
        </div>
      )}

      {hud.landingProgress !== null && (
        <section className="fishing-landing" aria-label={isTr ? "Karaya çıkarma ilerlemesi" : "Landing progress"}>
          <div className="fishing-landing-label">
            <strong>
              {hud.landingProgress > 0
                ? (isTr ? "ÇEKİLİYOR" : "LANDING")
                : (isTr ? "SABİT TUT" : "HOLD STEADY")}
            </strong>
          </div>
          <div className="fishing-landing-track">
            <div className="fishing-landing-fill" style={{ width: `${hud.landingProgress * 100}%` }} />
          </div>
        </section>
      )}

      <div className="guild-fishing-bindings" aria-label={isTr ? "Balıkçılık kontrolleri" : "Fishing controls"}>
        <span><KeyHint keyName="W" /> {isTr ? "Sar" : "Reel"}</span>
        <span><KeyHint keyName="S" /> {isTr ? "Misinayı sal" : "Ease line"}</span>
        <span><KeyHint keyName="Space" /> {isTr ? "Destekle" : "Brace"}</span>
      </div>
      {isCoarsePointer && decision.action !== "neutral" && (
        <div className="fishing-touch-controls" aria-label={isTr ? "Dokunmatik balıkçılık kontrolleri" : "Fishing touch controls"}>
          <ChromeButton className="fishing-touch-control" {...decisionTouchProps}>
            {localizedDecisionResponse}
          </ChromeButton>
        </div>
      )}
        </>
      )}
    </GameSheet>
    {onSetDrag && !hud.awaitingLandingChoice && <div className="guild-drag-control interactive" role="group" aria-label={isTr ? "Kalama ayarı" : "Fishing drag"}>
      <span>{isTr ? "Kalama" : "Drag"}</span><div className="guild-drag-notches">
        {([0, 1, 2] as const).map((notch) => <ChromeButton key={notch} size="sm" aria-pressed={hud.dragNotch === notch}
          className={`guild-drag-notch ${hud.dragNotch === notch ? "is-selected" : ""}`}
          onClick={() => onSetDrag(notch)}>{dragLabels[notch]}</ChromeButton>)}
      </div>
    </div>}
    </>
  );
};

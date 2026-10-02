import React, { useEffect, useRef, useState } from "react";
import type { ActiveModal } from "../app/ModeController";
import type { GameAction, GameMode } from "../simulation/core/types";
import type { FishingInputState, VirtualMoveVector } from "../input/InputRouter";
import { useTranslation } from "../i18n/useTranslation";

export type SportTouchResponse = "reel" | "slack" | "brace" | "steer-left" | "steer-right" | "neutral";

export interface MobileControlsProps {
  touchDevice: boolean;
  landscape: boolean;
  orientationBlocked: boolean;
  bootReady: boolean;
  mode: GameMode;
  /** The ridden mount's gait from the HUD DTO ("Gallop" or "Trot"); null on foot. */
  mountGaitLabel?: string | null;
  /** On foot with a donkey: offers the same call the H key dispatches. */
  canCallDonkey?: boolean;
  canFishHere?: boolean;
  /** Concise verb projected from the existing world prompt. */
  interactionLabel?: string | null;
  activeModal: ActiveModal;
  basicFishingPhase: "charging-cast" | "waiting-bite" | "bite-reaction" | "minigame" | "caught" | "escaped" | "casting" | "waiting" | "bite" | null;
  onSetMoveVector: (vector: VirtualMoveVector) => void;
  onSetSprint: (held: boolean) => void;
  onQueueJump: () => void;
  onVirtualAction: (action: GameAction) => void;
  onSetFishingInput: (input: Partial<FishingInputState>) => void;
  onReleaseBasicCast: () => void;
  onClearVirtualInput: () => void;
  /** Highlighted sport-fishing response; the card owns the decision, the cluster owns the thumbs. */
  sportResponse?: { action: SportTouchResponse } | null;
  /** Normalized steering magnitude from the sport HUD DTO (01 §9 shares the ±0.6 clamp). */
  sportSteeringMagnitude?: number;
  dragNotch?: 0 | 1 | 2 | null;
  onSetFishingDrag?: (notch: 0 | 1 | 2) => void;
}

interface HoldControlProps {
  label: string;
  className?: string;
  onPress: () => void;
  onRelease: () => void;
}

const MobileHoldButton: React.FC<HoldControlProps> = ({
  label,
  className = "",
  onPress,
  onRelease
}) => {
  const [pressed, setPressed] = useState(false);
  const activeRef = useRef(false);
  const pointerRef = useRef<number | null>(null);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;

  useEffect(() => {
    const reset = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      pointerRef.current = null;
      setPressed(false);
      releaseRef.current();
    };
    const onVisibilityChange = () => { if (document.visibilityState !== "visible") reset(); };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reset();
    };
  }, []);

  const release = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeRef.current) return;
    if (event && event.pointerId !== pointerRef.current) return;
    activeRef.current = false;
    pointerRef.current = null;
    setPressed(false);
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onRelease();
  };

  return (
    <button
      type="button"
      className={`mobile-action-button mobile-action-button--hold ${pressed ? "is-pressed" : ""} ${className}`.trim()}
      onPointerDown={(event) => {
        event.preventDefault();
        if (activeRef.current) return;
        pointerRef.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        activeRef.current = true;
        setPressed(true);
        onPress();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={() => {
        if (!activeRef.current) return;
        activeRef.current = false;
        pointerRef.current = null;
        setPressed(false);
        onRelease();
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (event.repeat || activeRef.current) return;
        activeRef.current = true;
        setPressed(true);
        onPress();
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        release();
      }}
      onBlur={() => release()}
      aria-label={label}
      aria-pressed={pressed}
    >
      <span className="mobile-action-label">{label}</span>
    </button>
  );
};

const MobileTapButton: React.FC<{
  label: string;
  className?: string;
  onTap: () => void;
  selected?: boolean;
}> = ({ label, className = "", onTap, selected }) => (
  <button
    type="button"
    className={`mobile-action-button ${className}`.trim()}
    onClick={onTap}
    aria-label={label}
    aria-pressed={selected}
  >
    <span className="mobile-action-label">{label}</span>
  </button>
);

const KNOB_TRAVEL_RATIO = 0.29;
const JOYSTICK_DEADZONE = 0.06;

const MobileJoystick: React.FC<{
  onChange: (vector: VirtualMoveVector) => void;
}> = ({ onChange }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const pointerIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [vector, setVector] = useState<VirtualMoveVector>({ x: 0, z: 0 });
  const [knobTravel, setKnobTravel] = useState(34);
  const [isActive, setIsActive] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    const reset = () => {
      pointerIdRef.current = null;
      setIsActive(false);
      setVector({ x: 0, z: 0 });
      onChangeRef.current({ x: 0, z: 0 });
    };
    const onVisibilityChange = () => { if (document.visibilityState !== "visible") reset(); };
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reset();
    };
  }, []);

  const emit = (next: VirtualMoveVector): void => {
    setVector(next);
    onChangeRef.current(next);
  };

  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const size = Math.max(1, Math.min(bounds.width, bounds.height));
    const radius = size * 0.5;
    setKnobTravel(size * KNOB_TRAVEL_RATIO);
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;
    let x = (event.clientX - centerX) / radius;
    let z = (event.clientY - centerY) / radius;
    const length = Math.hypot(x, z);
    if (length < JOYSTICK_DEADZONE) {
      emit({ x: 0, z: 0 });
      return;
    }
    if (length > 1) {
      x /= length;
      z /= length;
    }
    emit({ x, z });
  };

  const release = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null) return;
    if (event && pointerIdRef.current !== event.pointerId) return;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    setIsActive(false);
    emit({ x: 0, z: 0 });
  };

  return (
    <div
      className={`mobile-joystick ${isActive ? "is-active" : ""}`.trim()}
      role="group"
      aria-label={isTr ? "Hareket kontrol kolu" : "Movement joystick"}
      data-knob-travel={knobTravel.toFixed(1)}
      onPointerDown={(event) => {
        event.preventDefault();
        if (pointerIdRef.current !== null) return;
        pointerIdRef.current = event.pointerId;
        setIsActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current === event.pointerId) update(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={(event) => {
        if (pointerIdRef.current === event.pointerId) release(event);
      }}
      onLostPointerCapture={() => {
        if (pointerIdRef.current === null) return;
        pointerIdRef.current = null;
        setIsActive(false);
        emit({ x: 0, z: 0 });
      }}
    >
      <span className="mobile-joystick-ring" aria-hidden="true" />
      <span
        className="mobile-joystick-knob"
        aria-hidden="true"
        style={{ transform: `translate(${vector.x * knobTravel}px, ${vector.z * knobTravel}px)` }}
      />
    </div>
  );
};

export const MobileOrientationGate: React.FC<{
  touchDevice: boolean;
  orientationBlocked: boolean;
  onRequestLandscape: () => void;
}> = ({ touchDevice, orientationBlocked, onRequestLandscape }) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  if (!touchDevice || !orientationBlocked) return null;
  return (
    <div className="mobile-orientation-gate" role="status" aria-live="polite" aria-label={isTr ? "Yatay yönlendirme gerekli" : "Landscape orientation required"}>
      <div className="mobile-orientation-panel">
        <span className="mobile-orientation-mark" aria-hidden="true">↔</span>
        <h2>{isTr ? "Cihazını yan çevir" : "Turn your device sideways"}</h2>
        <p>{isTr ? "Kıyı dünyası yatay ekranda oynanır." : "The coast is played in landscape."}</p>
        <button type="button" className="mobile-orientation-button" onClick={onRequestLandscape}>
          {isTr ? "Yatay konuma geç" : "Turn to landscape"}
        </button>
      </div>
    </div>
  );
};

export const MobileControls: React.FC<MobileControlsProps> = ({
  touchDevice,
  landscape,
  orientationBlocked,
  bootReady,
  mode,
  mountGaitLabel = null,
  canCallDonkey = false,
  canFishHere = false,
  interactionLabel = null,
  activeModal,
  basicFishingPhase,
  onSetMoveVector,
  onSetSprint,
  onQueueJump,
  onVirtualAction,
  onSetFishingInput,
  onReleaseBasicCast,
  onClearVirtualInput,
  sportResponse = null,
  sportSteeringMagnitude = 0.6,
  dragNotch = null,
  onSetFishingDrag
}) => {
  const { locale } = useTranslation();
  const isTr = locale === "tr";
  const clearVirtualInputRef = useRef(onClearVirtualInput);
  clearVirtualInputRef.current = onClearVirtualInput;
  useEffect(() => () => clearVirtualInputRef.current(), []);
  // Tracks both steering thumbs so releasing one side never cancels the
  // other while it is still held.
  const steerHeldRef = useRef({ left: false, right: false });
  const fishingInputRef = useRef(onSetFishingInput);
  fishingInputRef.current = onSetFishingInput;
  useEffect(() => {
    if (mode !== "sport-fishing") return;
    steerHeldRef.current = { left: false, right: false };
    fishingInputRef.current({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
  }, [mode, sportResponse?.action]);

  if (!touchDevice || !landscape || orientationBlocked || !bootReady || activeModal) return null;

  if (mode === "basic-fishing") {
    return (
      <div className="mobile-controls mobile-controls--fishing mobile-controls--basic" data-testid="mobile-basic-controls">
        <div className="mobile-action-cluster" aria-label={isTr ? "Balıkçılık eylemleri" : "Fishing actions"}>
          {basicFishingPhase === "charging-cast" && (
            <MobileTapButton label={isTr ? "Fırlat" : "Cast"} className="is-primary" onTap={onReleaseBasicCast} />
          )}
          {basicFishingPhase === "minigame" && (
            <MobileHoldButton
              label={isTr ? "Sar" : "Reel"}
              className="is-primary"
              onPress={() => onSetFishingInput({ isReeling: true })}
              onRelease={() => onSetFishingInput({ isReeling: false })}
            />
          )}
          {basicFishingPhase !== "caught" && basicFishingPhase !== "escaped" && (
            <MobileTapButton label={isTr ? "İptal" : "Cancel"} onTap={() => onVirtualAction("pause")} />
          )}
        </div>
      </div>
    );
  }

  if (mode === "sport-fishing") {
    // Two-thumb fight controls: steering lives on the left thumb, the single
    // highlighted response (02 §17) on the right, so reel-while-steering works
    // with multi-touch. The fight card stays a compact readout; its in-card
    // touch button is hidden on touch devices (see mobile.css) so verbs never
    // stack in two places.
    const response = sportResponse?.action ?? "neutral";
    // The landed choice card owns input once the fight is won.
    if (!sportResponse && dragNotch == null) return null;
    const needsSteerLeft = response === "steer-left";
    const needsSteerRight = response === "steer-right";
    const holdKey = response === "slack" ? "isSlacking" : response === "brace" ? "isBracing" : "isReeling";
    // Short verb labels: the DTO carries phrases ("Reel it closer", "Pull
    // right") sized for the readout card, and a steer response must never
    // label the reel hold. Neutral is the landing window: release all input.
    const holdLabel = response === "slack" ? (isTr ? "Boşluk ver" : "Slack") : response === "brace" ? (isTr ? "Diren" : "Brace") : (isTr ? "Sar" : "Reel");
    const steerMagnitude = Math.abs(sportSteeringMagnitude) > 0 ? Math.abs(sportSteeringMagnitude) : 0.6;
    const applySteer = () => {
      const held = steerHeldRef.current;
      onSetFishingInput({ rodDirectionAngle: held.left && !held.right ? -steerMagnitude : !held.left && held.right ? steerMagnitude : 0 });
    };
    return (
      <div className="mobile-controls mobile-controls--fishing mobile-controls--sport" data-testid="mobile-sport-controls">
        <div className="mobile-steer-cluster" role="group" aria-label={isTr ? "Olta yönlendirme" : "Rod steering"}>
          <MobileHoldButton
            label={isTr ? "◀ Sol" : "◀ Left"}
            className={needsSteerLeft ? "is-primary" : ""}
            onPress={() => { steerHeldRef.current.left = true; applySteer(); }}
            onRelease={() => { steerHeldRef.current.left = false; applySteer(); }}
          />
          <MobileHoldButton
            label={isTr ? "Sağ ▶" : "Right ▶"}
            className={needsSteerRight ? "is-primary" : ""}
            onPress={() => { steerHeldRef.current.right = true; applySteer(); }}
            onRelease={() => { steerHeldRef.current.right = false; applySteer(); }}
          />
        </div>
        <div className="mobile-action-cluster" role="group" aria-label={isTr ? "Balıkçılık eylemleri" : "Fishing actions"}>
          {onSetFishingDrag && (
            <div className="mobile-action-row mobile-drag-row" role="group" aria-label={isTr ? "Kalama direnci" : "Fishing drag"}>
              {(["Light", "Balanced", "Heavy"] as const).map((label, notch) => (
                <MobileTapButton
                  key={label}
                  label={label === "Light" ? (isTr ? "Hafif" : "Light") : label === "Balanced" ? (isTr ? "Orta" : "Medium") : (isTr ? "Sıkı" : "Heavy")}
                  className={dragNotch === notch ? "is-primary" : ""}
                  selected={dragNotch === notch}
                  onTap={() => onSetFishingDrag(notch as 0 | 1 | 2)}
                />
              ))}
            </div>
          )}
          {response !== "neutral" && <div className="mobile-action-row">
            <MobileHoldButton
              key={response}
              label={holdLabel}
              className="is-primary mobile-action-button--response"
              onPress={() => onSetFishingInput({ [holdKey]: true } as Partial<FishingInputState>)}
              onRelease={() => onSetFishingInput({ [holdKey]: false } as Partial<FishingInputState>)}
            />
          </div>}
        </div>
      </div>
    );
  }

  const isPlacement = mode === "farm-placement";
  const isMounted = mode === "mounted";
  const isBoat = mode === "boat-driving";
  const isAngling = canFishHere && (mode === "on-foot" || isBoat);

  return (
    <div className={`mobile-controls mobile-controls--world mobile-controls--${mode}`} data-testid="mobile-world-controls">
      <MobileJoystick onChange={onSetMoveVector} />
      <div className="mobile-action-cluster" aria-label={isTr ? "Dokunmatik eylemler" : "Touch actions"}>
        <div className="mobile-action-row">
          <MobileTapButton
            label={isPlacement ? (isTr ? "Yerleştir" : "Place") : interactionLabel ?? (isTr ? "Etkileşim" : "Interact")}
            className="is-primary"
            onTap={() => onVirtualAction("interact")}
          />
          {!isMounted && !isPlacement && (
            <MobileHoldButton
              label={isAngling ? (isTr ? "Olta At" : "Cast") : (isTr ? "Alet" : "Tool")}
              onPress={() => onVirtualAction("use-primary")}
              onRelease={() => onVirtualAction("use-primary-release")}
            />
          )}
          {isAngling && !isPlacement && (
            <MobileTapButton label={isTr ? "Yem" : "Lure"} onTap={() => onVirtualAction("fishing.toggle-lure")} />
          )}
        </div>
        <div className="mobile-action-row">
          {isPlacement ? (
            <MobileTapButton label={isTr ? "İptal" : "Cancel"} onTap={() => onVirtualAction("use-secondary")} />
          ) : (
            !isMounted && (
              <MobileTapButton label={isTr ? "İncele" : "Inspect"} onTap={() => onVirtualAction("use-secondary")} />
            )
          )}
          {!isBoat && !isPlacement && (
            <MobileHoldButton
              label={isMounted && mountGaitLabel
                ? (isTr ? (mountGaitLabel === "Trot" ? "Tırıs" : "Dörtnala") : mountGaitLabel)
                : (isTr ? "Depar" : "Sprint")}
              onPress={() => onSetSprint(true)}
              onRelease={() => onSetSprint(false)}
            />
          )}
          {!isBoat && !isMounted && !isPlacement && (
            <MobileTapButton label={isTr ? "Zıpla" : "Jump"} onTap={onQueueJump} />
          )}
          {canCallDonkey && !isBoat && !isMounted && !isPlacement && (
            <MobileTapButton label={isTr ? "Eşek" : "Donkey"} onTap={() => onVirtualAction("call-donkey")} />
          )}
        </div>
      </div>
    </div>
  );
};

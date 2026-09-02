import React, { useEffect, useRef, useState } from "react";
import type { ActiveModal } from "../app/ModeController";
import type { GameAction, GameMode } from "../simulation/core/types";
import type { FishingInputState, VirtualMoveVector } from "../input/InputRouter";

export interface MobileControlsProps {
  touchDevice: boolean;
  landscape: boolean;
  orientationBlocked: boolean;
  bootReady: boolean;
  mode: GameMode;
  activeModal: ActiveModal;
  basicFishingPhase: "charging-cast" | "waiting-bite" | "bite-reaction" | "minigame" | "caught" | "escaped" | "casting" | "waiting" | "bite" | null;
  onSetMoveVector: (vector: VirtualMoveVector) => void;
  onSetSprint: (held: boolean) => void;
  onQueueJump: () => void;
  onVirtualAction: (action: GameAction) => void;
  onSetFishingInput: (input: Partial<FishingInputState>) => void;
  onReleaseBasicCast: () => void;
  onClearVirtualInput: () => void;
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
  const activeRef = useRef(false);
  const releaseRef = useRef(onRelease);
  releaseRef.current = onRelease;

  useEffect(() => () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    releaseRef.current();
  }, []);

  const release = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onRelease();
  };

  return (
    <button
      type="button"
      className={`mobile-action-button mobile-action-button--hold ${className}`.trim()}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        if (activeRef.current) return;
        activeRef.current = true;
        onPress();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={() => {
        if (!activeRef.current) return;
        activeRef.current = false;
        onRelease();
      }}
      aria-label={label}
    >
      <span className="mobile-action-label">{label}</span>
    </button>
  );
};

const MobileTapButton: React.FC<{
  label: string;
  className?: string;
  onTap: () => void;
}> = ({ label, className = "", onTap }) => (
  <button
    type="button"
    className={`mobile-action-button ${className}`.trim()}
    onClick={onTap}
    aria-label={label}
  >
    <span className="mobile-action-label">{label}</span>
  </button>
);

const KNOB_TRAVEL_RATIO = 0.29;

const MobileJoystick: React.FC<{
  onChange: (vector: VirtualMoveVector) => void;
}> = ({ onChange }) => {
  const pointerIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [vector, setVector] = useState<VirtualMoveVector>({ x: 0, z: 0 });
  const [knobTravel, setKnobTravel] = useState(34);
  onChangeRef.current = onChange;

  useEffect(() => () => {
    pointerIdRef.current = null;
    onChangeRef.current({ x: 0, z: 0 });
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
    if (length > 1) {
      x /= length;
      z /= length;
    }
    emit({ x, z });
  };

  const release = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === null) return;
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerIdRef.current = null;
    emit({ x: 0, z: 0 });
  };

  return (
    <div
      className="mobile-joystick"
      role="group"
      aria-label="Movement joystick"
      data-knob-travel={knobTravel.toFixed(1)}
      onPointerDown={(event) => {
        event.preventDefault();
        pointerIdRef.current = event.pointerId;
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
  if (!touchDevice || !orientationBlocked) return null;
  return (
    <div className="mobile-orientation-gate" role="status" aria-live="polite" aria-label="Landscape orientation required">
      <div className="mobile-orientation-panel">
        <span className="mobile-orientation-mark" aria-hidden="true">↔</span>
        <h2>Turn your device sideways</h2>
        <p>The coast is played in landscape.</p>
        <button type="button" className="mobile-orientation-button" onClick={onRequestLandscape}>
          Turn to landscape
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
  activeModal,
  basicFishingPhase,
  onSetMoveVector,
  onSetSprint,
  onQueueJump,
  onVirtualAction,
  onSetFishingInput,
  onReleaseBasicCast,
  onClearVirtualInput
}) => {
  const clearVirtualInputRef = useRef(onClearVirtualInput);
  clearVirtualInputRef.current = onClearVirtualInput;
  useEffect(() => () => clearVirtualInputRef.current(), []);

  if (!touchDevice || !landscape || orientationBlocked || !bootReady || activeModal) return null;

  if (mode === "basic-fishing") {
    return (
      <div className="mobile-controls mobile-controls--fishing mobile-controls--basic" data-testid="mobile-basic-controls">
        <div className="mobile-action-cluster" aria-label="Fishing actions">
          {basicFishingPhase === "charging-cast" && (
            <MobileTapButton label="Cast" className="is-primary" onTap={onReleaseBasicCast} />
          )}
          {basicFishingPhase === "minigame" && (
            <MobileHoldButton
              label="Reel"
              className="is-primary"
              onPress={() => onSetFishingInput({ isReeling: true })}
              onRelease={() => onSetFishingInput({ isReeling: false })}
            />
          )}
          <MobileTapButton label="Cancel" onTap={() => onVirtualAction("pause")} />
        </div>
      </div>
    );
  }

  if (mode === "sport-fishing") return null;

  const isPlacement = mode === "farm-placement";
  const isMounted = mode === "mounted";
  const isBoat = mode === "boat-driving";

  return (
    <div className={`mobile-controls mobile-controls--world mobile-controls--${mode}`} data-testid="mobile-world-controls">
      <MobileJoystick onChange={onSetMoveVector} />
      <div className="mobile-action-cluster" aria-label="Touch actions">
        <div className="mobile-action-row">
          <MobileTapButton
            label={isPlacement ? "Place" : isBoat ? "Dock" : "Interact"}
            className="is-primary"
            onTap={() => onVirtualAction("interact")}
          />
          {!isMounted && !isPlacement && (
            <MobileHoldButton
              label={isBoat ? "Cast" : "Use"}
              onPress={() => onVirtualAction("use-primary")}
              onRelease={() => onVirtualAction("use-primary-release")}
            />
          )}
        </div>
        <div className="mobile-action-row">
          {isPlacement ? (
            <MobileTapButton label="Cancel" onTap={() => onVirtualAction("use-secondary")} />
          ) : (
            !isMounted && !isBoat && (
              <MobileTapButton label="Inspect" onTap={() => onVirtualAction("use-secondary")} />
            )
          )}
          {!isBoat && (
            <MobileHoldButton
              label="Sprint"
              onPress={() => onSetSprint(true)}
              onRelease={() => onSetSprint(false)}
            />
          )}
          {!isBoat && !isMounted && (
            <MobileTapButton label="Jump" onTap={onQueueJump} />
          )}
        </div>
        {!isMounted && !isPlacement && (
          <div className="mobile-action-row">
            <MobileTapButton label="Lure" onTap={() => onVirtualAction("fishing.toggle-lure")} />
          </div>
        )}
      </div>
    </div>
  );
};

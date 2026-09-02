import type { GameAction, GameMode } from "../simulation/core/types";
import { FISHING_STEER_INPUT_MAX } from "../simulation/fishing/FishingTuning";

export interface FishingInputState {
  isReeling: boolean;
  isSlacking: boolean;
  isBracing: boolean;
  rodDirectionAngle: number;
}

export interface InputState {
  moveVector: { x: number; z: number };
  sprint: boolean;
  fishing: FishingInputState;
  pointerNdc: { x: number; y: number };
  farmGisHeld: boolean;
}

export interface CameraInputIntent {
  orbitDeltaX: number;
  orbitDeltaY: number;
  zoomDelta: number;
  isOrbiting: boolean;
}

export interface VirtualMoveVector {
  x: number;
  z: number;
}

export type ActionCallback = (action: GameAction) => void;
export type InterruptionCallback = () => void;

export class HeldInputState {
  private readonly held = new Set<string>();

  public get values(): ReadonlySet<string> {
    return this.held;
  }

  public press(binding: string): void {
    this.held.add(binding);
  }

  public release(binding: string): void {
    this.held.delete(binding);
  }

  public clear(): void {
    this.held.clear();
  }
}

const GAME_KEY_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM", "KeyR", "Space",
  "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "KeyP",
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5"
]);
const MOVEMENT_MODES = new Set<GameMode>(["on-foot", "farm-placement", "boat-driving", "mounted"]);
const EMPTY_KEYS: ReadonlySet<string> = new Set();
const ORBIT_DRAG_THRESHOLD_PX = 4;
const MAX_ACCUMULATED_POINTER_DELTA = 600;
interface TouchPointerState {
  id: number;
  target: HTMLElement;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  dragged: boolean;
}

function hasAny(keys: ReadonlySet<string>, ...codes: string[]): boolean {
  return codes.some((code) => keys.has(code));
}

/** Maps physical bindings to semantic, mode-safe continuous intents. */
export function deriveSemanticInput(
  keys: ReadonlySet<string>,
  mode: GameMode,
  pointerNdc: Readonly<{ x: number; y: number }> = { x: 0, y: 0 }
): InputState {
  let x = 0;
  let z = 0;
  if (MOVEMENT_MODES.has(mode)) {
    if (hasAny(keys, "KeyW", "ArrowUp")) z -= 1;
    if (hasAny(keys, "KeyS", "ArrowDown")) z += 1;
    if (hasAny(keys, "KeyA", "ArrowLeft")) x -= 1;
    if (hasAny(keys, "KeyD", "ArrowRight")) x += 1;
  }
  const length = Math.hypot(x, z);
  if (length > 0) {
    x /= length;
    z /= length;
  }

  let rodDirectionAngle = 0;
  if (mode === "sport-fishing") {
    if (hasAny(keys, "KeyA", "ArrowLeft")) rodDirectionAngle -= FISHING_STEER_INPUT_MAX;
    if (hasAny(keys, "KeyD", "ArrowRight")) rodDirectionAngle += FISHING_STEER_INPUT_MAX;
  }

  return {
    moveVector: { x, z },
    sprint: (mode === "on-foot" || mode === "farm-placement" || mode === "mounted") && hasAny(keys, "ShiftLeft", "ShiftRight"),
    fishing: {
      isReeling:
        (mode === "sport-fishing" && hasAny(keys, "Mouse0", "KeyW")) ||
        (mode === "basic-fishing" && keys.has("Space")),
      isSlacking: mode === "sport-fishing" && hasAny(keys, "Mouse2", "KeyS"),
      isBracing: mode === "sport-fishing" && keys.has("Space"),
      rodDirectionAngle
    },
    pointerNdc: { x: pointerNdc.x, y: pointerNdc.y },
    farmGisHeld: hasAny(keys, "AltLeft", "AltRight")
  };
}

export class InputRouter {
  private readonly heldInput = new HeldInputState();
  private actionListeners: ActionCallback[] = [];
  private interruptionListeners: InterruptionCallback[] = [];
  private currentMode: GameMode = "on-foot";
  private worldInputSuspended = false;
  private layoutEditorActive = false;
  private readonly pointerNdc = { x: 0, y: 0 };
  private readonly virtualMoveVector = { x: 0, z: 0 };
  private virtualSprint = false;
  private virtualFishing: FishingInputState = {
    isReeling: false,
    isSlacking: false,
    isBracing: false,
    rodDirectionAngle: 0
  };
  private orbitPointer: {
    id: number;
    target: HTMLElement;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    dragged: boolean;
  } | null = null;
  private layoutPointer: { id: number; target: HTMLElement } | null = null;
  private pendingLayoutPickNdc: { x: number; y: number } | null = null;
  private orbitDeltaX = 0;
  private orbitDeltaY = 0;
  private zoomDelta = 0;
  private jumpQueued = false;
  private jumpBlocked = false;
  private readonly touchPointers = new Map<number, TouchPointerState>();
  private touchPrimaryPointerId: number | null = null;
  private touchPinchDistance: number | null = null;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerCancel);
    window.addEventListener("lostpointercapture", this.onLostPointerCapture);
    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  public setMode(mode: GameMode, options: { interrupt?: boolean } = {}): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.clearTransientState();
    if (options.interrupt !== false) {
      for (const listener of this.interruptionListeners) listener();
    }
  }

  public setWorldInputSuspended(suspended: boolean): void {
    if (suspended === this.worldInputSuspended) return;
    this.worldInputSuspended = suspended;
    if (suspended) this.interrupt();
  }

  /**
   * Virtual controls are presentation input only. They are folded into the
   * same semantic state as keyboard/mouse input and never become simulation
   * state or a second action dispatch path.
   */
  public setVirtualMoveVector(vector: VirtualMoveVector): void {
    this.virtualMoveVector.x = clamp(vector.x, -1, 1);
    this.virtualMoveVector.z = clamp(vector.z, -1, 1);
  }

  public setVirtualSprint(held: boolean): void {
    this.virtualSprint = held;
  }

  public setVirtualFishingInput(input: Partial<FishingInputState>): void {
    this.virtualFishing = {
      ...this.virtualFishing,
      ...input,
      rodDirectionAngle: clamp(
        input.rodDirectionAngle ?? this.virtualFishing.rodDirectionAngle,
        -FISHING_STEER_INPUT_MAX,
        FISHING_STEER_INPUT_MAX
      )
    };
  }

  public queueVirtualJump(): void {
    if (!this.worldInputSuspended) this.jumpQueued = true;
  }

  public dispatchVirtualAction(action: GameAction): void {
    if (!this.worldInputSuspended) this.dispatch(action);
  }

  public clearVirtualInput(): void {
    this.virtualMoveVector.x = 0;
    this.virtualMoveVector.z = 0;
    this.virtualSprint = false;
    this.virtualFishing = {
      isReeling: false,
      isSlacking: false,
      isBracing: false,
      rodDirectionAngle: 0
    };
  }

  public setLayoutEditorActive(active: boolean): void {
    this.layoutEditorActive = active;
    if (!active) {
      this.pendingLayoutPickNdc = null;
      this.releaseLayoutPointer();
    }
  }

  /** Layout-editor clicks are consumed once so a tap between frames is not lost. */
  public consumeLayoutPrimaryPress(): { x: number; y: number } | null {
    const pending = this.pendingLayoutPickNdc;
    this.pendingLayoutPickNdc = null;
    return pending;
  }

  public isHeld(code: string): boolean {
    return this.heldInput.values.has(code);
  }

  public onAction(callback: ActionCallback): () => void {
    this.actionListeners.push(callback);
    return () => {
      this.actionListeners = this.actionListeners.filter((entry) => entry !== callback);
    };
  }

  /** Presentation actions may be cancelled before their authored commit marker. */
  public onInterruption(callback: InterruptionCallback): () => void {
    this.interruptionListeners.push(callback);
    return () => {
      this.interruptionListeners = this.interruptionListeners.filter((entry) => entry !== callback);
    };
  }

  public getInputState(): InputState {
    if (this.worldInputSuspended) return deriveSemanticInput(EMPTY_KEYS, this.currentMode, this.pointerNdc);

    const physical = deriveSemanticInput(this.heldInput.values, this.currentMode, this.pointerNdc);
    const movementEnabled = MOVEMENT_MODES.has(this.currentMode);
    const virtualMoveX = movementEnabled ? this.virtualMoveVector.x : 0;
    const virtualMoveZ = movementEnabled ? this.virtualMoveVector.z : 0;
    const moveX = physical.moveVector.x + virtualMoveX;
    const moveZ = physical.moveVector.z + virtualMoveZ;
    const moveLength = Math.hypot(moveX, moveZ);
    const moveVector = moveLength > 1
      ? { x: moveX / moveLength, z: moveZ / moveLength }
      : { x: moveX, z: moveZ };
    const fishingEnabled = this.currentMode === "sport-fishing" || this.currentMode === "basic-fishing";

    return {
      ...physical,
      moveVector,
      sprint: physical.sprint || (movementEnabled && this.virtualSprint),
      fishing: {
        isReeling: physical.fishing.isReeling || (fishingEnabled && this.virtualFishing.isReeling),
        isSlacking: physical.fishing.isSlacking || (this.currentMode === "sport-fishing" && this.virtualFishing.isSlacking),
        isBracing: physical.fishing.isBracing || (this.currentMode === "sport-fishing" && this.virtualFishing.isBracing),
        rodDirectionAngle: clamp(
          physical.fishing.rodDirectionAngle + (this.currentMode === "sport-fishing" ? this.virtualFishing.rodDirectionAngle : 0),
          -FISHING_STEER_INPUT_MAX,
          FISHING_STEER_INPUT_MAX
        )
      }
    };
  }

  /** Camera deltas are consumed once per render frame and never become simulation state. */
  public consumeCameraInput(): CameraInputIntent {
    const hasPendingOrbit = Math.abs(this.orbitDeltaX) > 0 || Math.abs(this.orbitDeltaY) > 0;
    const intent = {
      orbitDeltaX: this.orbitDeltaX,
      orbitDeltaY: this.orbitDeltaY,
      zoomDelta: this.zoomDelta,
      isOrbiting: (this.orbitPointer?.dragged ?? false) || hasPendingOrbit
    };
    this.orbitDeltaX = 0;
    this.orbitDeltaY = 0;
    this.zoomDelta = 0;
    return intent;
  }

  /** Buffers a press so a short tap between fixed physics steps is not lost. */
  public consumeJumpRequest(): boolean {
    if (
      this.jumpBlocked ||
      this.worldInputSuspended ||
      (this.currentMode !== "on-foot" && this.currentMode !== "farm-placement")
    ) {
      this.jumpQueued = false;
      return false;
    }
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  /** Drop and ignore jump while a presentation action owns Space. */
  public setJumpBlocked(blocked: boolean): void {
    this.jumpBlocked = blocked;
    if (blocked) this.jumpQueued = false;
  }

  public interrupt(): void {
    this.clearTransientState();
    for (const listener of this.interruptionListeners) listener();
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  private isCanvasTarget(target: EventTarget | null): target is HTMLElement {
    return target instanceof HTMLElement && (target.tagName === "CANVAS" || target.id === "game-canvas");
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Modal focus managers may consume Escape during capture. Do not let the
    // global router pop a second overlay in the same key event.
    if (event.code === "Escape" && event.defaultPrevented) return;
    const isTyping = this.isTypingTarget(event.target);
    if (isTyping && event.code !== "Escape") return;
    if (
      this.layoutEditorActive
      && (event.metaKey || event.ctrlKey)
      && (event.code === "KeyC" || event.code === "KeyV" || event.code === "KeyD")
    ) {
      event.preventDefault();
      return;
    }
    if (this.layoutEditorActive && (event.code === "Delete" || event.code === "Backspace")) {
      event.preventDefault();
      return;
    }
    if (!isTyping && GAME_KEY_CODES.has(event.code)) event.preventDefault();
    if (!isTyping && this.layoutEditorActive && (event.code === "KeyQ" || event.code === "KeyE")) {
      event.preventDefault();
    }
    if (event.repeat) return;

    if (!this.worldInputSuspended || event.code === "Escape") this.heldInput.press(event.code);
    switch (event.code) {
      case "KeyE":
        if (
          !this.worldInputSuspended &&
          !this.layoutEditorActive &&
          this.currentMode !== "sport-fishing" &&
          this.currentMode !== "basic-fishing"
        ) {
          this.dispatch("interact");
        }
        break;
      case "KeyI": this.dispatch("open-inventory"); break;
      case "KeyJ": this.dispatch("open-journal"); break;
      case "KeyL": this.dispatch("open-ledger"); break;
      case "KeyM": this.dispatch("open-map"); break;
      case "KeyP": this.dispatch("open-planning"); break;
      case "KeyR":
        if (!this.worldInputSuspended && (this.currentMode === "on-foot" || this.currentMode === "boat-driving")) {
          this.dispatch("fishing.toggle-lure");
        }
        break;
      case "Digit1": if (!this.worldInputSuspended) this.dispatch("select-tool-1"); break;
      case "Digit2": if (!this.worldInputSuspended) this.dispatch("select-tool-2"); break;
      case "Digit3": if (!this.worldInputSuspended) this.dispatch("select-tool-3"); break;
      case "Digit4": if (!this.worldInputSuspended) this.dispatch("select-tool-4"); break;
      case "Digit5": if (!this.worldInputSuspended) this.dispatch("select-tool-5"); break;
      case "Escape": this.dispatch("pause"); break;
      case "Space":
        if (!this.worldInputSuspended && this.currentMode === "sport-fishing") {
          this.dispatch("fish-brace");
        } else if (!this.worldInputSuspended && this.currentMode === "basic-fishing") {
          this.dispatch("fish-reel");
        } else if (
          !this.jumpBlocked &&
          !this.worldInputSuspended &&
          (this.currentMode === "on-foot" || this.currentMode === "farm-placement")
        ) {
          this.jumpQueued = true;
        }
        break;
      case "KeyW":
        if (!this.worldInputSuspended && this.currentMode === "sport-fishing") this.dispatch("fish-reel");
        break;
      case "KeyS":
        if (!this.worldInputSuspended && this.currentMode === "sport-fishing") this.dispatch("fish-slack");
        break;
      case "KeyA":
      case "ArrowLeft":
        if (!this.worldInputSuspended && this.currentMode === "sport-fishing") this.dispatch("fish-left");
        break;
      case "KeyD":
      case "ArrowRight":
        if (!this.worldInputSuspended && this.currentMode === "sport-fishing") this.dispatch("fish-right");
        break;
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.heldInput.release(event.code);
    if (!this.worldInputSuspended && this.currentMode === "basic-fishing" && event.code === "KeyE") {
      this.dispatch("interact-release");
    }
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.worldInputSuspended || !this.isCanvasTarget(event.target)) return;
    this.updatePointerNdc(event, event.target);
    if (event.pointerType === "touch") {
      this.onTouchPointerDown(event, event.target);
      return;
    }
    if (event.button === 0) {
      this.heldInput.press("Mouse0");
      if (this.layoutEditorActive) {
        this.pendingLayoutPickNdc = { x: this.pointerNdc.x, y: this.pointerNdc.y };
        this.layoutPointer = { id: event.pointerId, target: event.target };
        event.target.setPointerCapture?.(event.pointerId);
      } else {
        this.dispatch(this.currentMode === "sport-fishing" ? "fish-reel" : "use-primary");
      }
      return;
    }
    if (event.button !== 2) return;

    this.heldInput.press("Mouse2");
    if (this.currentMode === "sport-fishing") {
      this.dispatch("fish-slack");
      return;
    }
    this.orbitPointer = {
      id: event.pointerId,
      target: event.target,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false
    };
    event.target.setPointerCapture?.(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.onTouchPointerMove(event);
      return;
    }
    const pointerTarget = this.orbitPointer?.id === event.pointerId
      ? this.orbitPointer.target
      : this.layoutPointer?.id === event.pointerId
        ? this.layoutPointer.target
        : this.isCanvasTarget(event.target) ? event.target : null;
    if (pointerTarget) this.updatePointerNdc(event, pointerTarget);
    const orbit = this.orbitPointer;
    if (!orbit || orbit.id !== event.pointerId || this.worldInputSuspended) return;

    const deltaX = event.clientX - orbit.lastX;
    const deltaY = event.clientY - orbit.lastY;
    orbit.lastX = event.clientX;
    orbit.lastY = event.clientY;
    if (!orbit.dragged) {
      orbit.dragged = Math.hypot(event.clientX - orbit.startX, event.clientY - orbit.startY) >= ORBIT_DRAG_THRESHOLD_PX;
    }
    if (!orbit.dragged) return;
    this.orbitDeltaX = clamp(this.orbitDeltaX + deltaX, -MAX_ACCUMULATED_POINTER_DELTA, MAX_ACCUMULATED_POINTER_DELTA);
    this.orbitDeltaY = clamp(this.orbitDeltaY + deltaY, -MAX_ACCUMULATED_POINTER_DELTA, MAX_ACCUMULATED_POINTER_DELTA);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.onTouchPointerUp(event);
      return;
    }
    if (event.button === 0) {
      this.heldInput.release("Mouse0");
      if (this.layoutPointer?.id === event.pointerId) this.releaseLayoutPointer();
      if (!this.worldInputSuspended && this.currentMode === "basic-fishing") {
        this.dispatch("use-primary-release");
      }
    }
    if (event.button !== 2) return;
    this.heldInput.release("Mouse2");
    const orbit = this.orbitPointer;
    if (!orbit || orbit.id !== event.pointerId) return;
    if (!orbit.dragged && !this.worldInputSuspended && !this.layoutEditorActive) this.dispatch("use-secondary");
    this.releaseOrbitPointer();
  };

  private onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.releaseAllTouchPointers();
      this.clearVirtualInput();
      return;
    }
    this.heldInput.release("Mouse0");
    this.heldInput.release("Mouse2");
    if (this.layoutPointer?.id === event.pointerId) this.releaseLayoutPointer();
    if (this.orbitPointer?.id === event.pointerId) this.releaseOrbitPointer();
  };

  private onLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerType === "touch") {
      this.releaseTouchPointer(event.pointerId);
      if (this.touchPointers.size === 0) this.clearVirtualInput();
      return;
    }
    if (this.layoutPointer?.id === event.pointerId) {
      this.heldInput.release("Mouse0");
      this.layoutPointer = null;
    }
    if (this.orbitPointer?.id !== event.pointerId) return;
    this.heldInput.release("Mouse2");
    this.orbitPointer = null;
  };

  private onWheel = (event: WheelEvent): void => {
    if (this.worldInputSuspended || !this.isCanvasTarget(event.target)) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 18
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
    this.zoomDelta = clamp(this.zoomDelta + event.deltaY * scale, -1200, 1200);
  };

  private updatePointerNdc(event: PointerEvent, target: HTMLElement): void {
    const bounds = target.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.pointerNdc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private onTouchPointerDown(event: PointerEvent, target: HTMLElement): void {
    event.preventDefault();
    const pointer: TouchPointerState = {
      id: event.pointerId,
      target,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragged: false
    };
    this.touchPointers.set(event.pointerId, pointer);
    if (this.touchPointers.size === 1) {
      this.touchPrimaryPointerId = event.pointerId;
    } else {
      this.touchPrimaryPointerId = null;
      for (const touch of this.touchPointers.values()) touch.dragged = true;
      this.touchPinchDistance = this.touchDistance();
    }
    if (this.currentMode === "basic-fishing") {
      this.setVirtualFishingInput({ isReeling: true });
    }
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is a convenience; the window listeners remain active.
    }
  }

  private onTouchPointerMove(event: PointerEvent): void {
    const touch = this.touchPointers.get(event.pointerId);
    if (!touch || this.worldInputSuspended) return;
    this.updatePointerNdc(event, touch.target);
    const deltaX = event.clientX - touch.lastX;
    const deltaY = event.clientY - touch.lastY;
    touch.lastX = event.clientX;
    touch.lastY = event.clientY;

    if (this.touchPointers.size >= 2) {
      for (const pointer of this.touchPointers.values()) pointer.dragged = true;
      const distance = this.touchDistance();
      if (distance !== null) {
        if (this.touchPinchDistance !== null) {
          this.zoomDelta = clamp(
            this.zoomDelta + (this.touchPinchDistance - distance) * 1.15,
            -1200,
            1200
          );
        }
        this.touchPinchDistance = distance;
      }
      return;
    }

    if (this.touchPrimaryPointerId !== event.pointerId) return;
    if (!touch.dragged) {
      touch.dragged = Math.hypot(event.clientX - touch.startX, event.clientY - touch.startY) >= ORBIT_DRAG_THRESHOLD_PX;
    }
    if (!touch.dragged) return;
    this.orbitDeltaX = clamp(this.orbitDeltaX + deltaX, -MAX_ACCUMULATED_POINTER_DELTA, MAX_ACCUMULATED_POINTER_DELTA);
    this.orbitDeltaY = clamp(this.orbitDeltaY + deltaY, -MAX_ACCUMULATED_POINTER_DELTA, MAX_ACCUMULATED_POINTER_DELTA);
  }

  private onTouchPointerUp(event: PointerEvent): void {
    const touch = this.touchPointers.get(event.pointerId);
    if (!touch) return;
    const wasPrimary = this.touchPrimaryPointerId === event.pointerId;
    const wasTap = wasPrimary && !touch.dragged && this.touchPointers.size === 1;
    this.releaseTouchPointer(event.pointerId);
    if (this.touchPointers.size < 2) {
      this.touchPinchDistance = null;
      const remaining = [...this.touchPointers.values()][0];
      this.touchPrimaryPointerId = remaining?.id ?? null;
    }

    if (this.touchPointers.size === 0 && this.currentMode === "basic-fishing") {
      this.setVirtualFishingInput({ isReeling: false });
    }

    if (!wasTap || this.worldInputSuspended || this.layoutEditorActive) return;
    if (this.currentMode === "sport-fishing") return;
    this.dispatch("use-primary");
    // A canvas tap is a complete primary action. If it entered the basic
    // fishing charge state, release it immediately; the dedicated mobile
    // release button remains available for deliberate power charging.
    if (this.currentMode === "basic-fishing") this.dispatch("use-primary-release");
  }

  private touchDistance(): number | null {
    const touches = [...this.touchPointers.values()].slice(0, 2);
    if (touches.length < 2) return null;
    return Math.hypot(touches[0].lastX - touches[1].lastX, touches[0].lastY - touches[1].lastY);
  }

  private releaseTouchPointer(pointerId: number): void {
    const pointer = this.touchPointers.get(pointerId);
    if (!pointer) return;
    this.touchPointers.delete(pointerId);
    if (this.touchPrimaryPointerId === pointerId) this.touchPrimaryPointerId = null;
    try {
      if (pointer.target.hasPointerCapture?.(pointerId)) pointer.target.releasePointerCapture?.(pointerId);
    } catch {
      // The browser may already have released capture during blur or removal.
    }
  }

  private releaseAllTouchPointers(): void {
    for (const pointer of this.touchPointers.values()) {
      try {
        if (pointer.target.hasPointerCapture?.(pointer.id)) pointer.target.releasePointerCapture?.(pointer.id);
      } catch {
        // The browser may already have released capture during blur or removal.
      }
    }
    this.touchPointers.clear();
    this.touchPrimaryPointerId = null;
    this.touchPinchDistance = null;
  }

  private onContextMenu = (event: Event): void => {
    if (
      this.isCanvasTarget(event.target) ||
      (event.target instanceof HTMLElement && event.target.closest(".basic-fishing-container"))
    ) event.preventDefault();
  };

  private onBlur = (): void => this.interrupt();
  private onVisibilityChange = (): void => {
    if (document.hidden) this.interrupt();
  };

  private releaseLayoutPointer(): void {
    const pointer = this.layoutPointer;
    this.layoutPointer = null;
    if (!pointer) return;
    try {
      if (pointer.target.hasPointerCapture?.(pointer.id)) pointer.target.releasePointerCapture?.(pointer.id);
    } catch {
      // The browser may already have released capture during blur or element removal.
    }
  }

  private releaseOrbitPointer(): void {
    const orbit = this.orbitPointer;
    this.orbitPointer = null;
    if (!orbit) return;
    try {
      if (orbit.target.hasPointerCapture?.(orbit.id)) orbit.target.releasePointerCapture?.(orbit.id);
    } catch {
      // The browser may already have released capture during blur or element removal.
    }
  }

  private clearTransientState(): void {
    this.heldInput.clear();
    this.clearVirtualInput();
    this.orbitDeltaX = 0;
    this.orbitDeltaY = 0;
    this.zoomDelta = 0;
    this.jumpQueued = false;
    this.pendingLayoutPickNdc = null;
    this.releaseLayoutPointer();
    this.releaseOrbitPointer();
    this.releaseAllTouchPointers();
  }

  private dispatch(action: GameAction): void {
    for (const listener of this.actionListeners) listener(action);
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    window.removeEventListener("lostpointercapture", this.onLostPointerCapture);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.clearTransientState();
    this.actionListeners = [];
    this.interruptionListeners = [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

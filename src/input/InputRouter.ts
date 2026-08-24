// src/input/InputRouter.ts

import { GameAction, GameMode } from "../simulation/core/types";

export interface InputState {
  moveVector: { x: number; z: number };
  isPrimaryDown: boolean;
  isSecondaryDown: boolean;
  isSpaceDown: boolean;
  isShiftDown: boolean;
  keysDown: Set<string>;
}

export type ActionCallback = (action: GameAction) => void;

const GAME_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyE",
  "KeyI",
  "KeyJ",
  "KeyM",
  "Space",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight"
]);

export class InputRouter {
  private keysDown: Set<string> = new Set();
  private actionListeners: ActionCallback[] = [];
  private currentMode: GameMode = "on-foot";

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  public setMode(mode: GameMode): void {
    this.currentMode = mode;
  }

  public onAction(callback: ActionCallback): () => void {
    this.actionListeners.push(callback);
    return () => {
      this.actionListeners = this.actionListeners.filter((cb) => cb !== callback);
    };
  }

  public getInputState(): InputState {
    let x = 0;
    let z = 0;

    if (this.currentMode === "on-foot" || this.currentMode === "boat-driving") {
      if (this.keysDown.has("KeyW") || this.keysDown.has("ArrowUp")) z -= 1;
      if (this.keysDown.has("KeyS") || this.keysDown.has("ArrowDown")) z += 1;
      if (this.keysDown.has("KeyA") || this.keysDown.has("ArrowLeft")) x -= 1;
      if (this.keysDown.has("KeyD") || this.keysDown.has("ArrowRight")) x += 1;
    }

    const len = Math.sqrt(x * x + z * z);
    if (len > 0) {
      x /= len;
      z /= len;
    }

    return {
      moveVector: { x, z },
      isPrimaryDown: this.keysDown.has("Mouse0") || this.keysDown.has("KeyW"),
      isSecondaryDown: this.keysDown.has("Mouse2") || this.keysDown.has("KeyS"),
      isSpaceDown: this.keysDown.has("Space"),
      isShiftDown: this.keysDown.has("ShiftLeft") || this.keysDown.has("ShiftRight"),
      keysDown: this.keysDown
    };
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable;
  }

  private isCanvasTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.tagName === "CANVAS" || target.id === "game-canvas";
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.isTypingTarget(e.target) && GAME_KEY_CODES.has(e.code)) {
      e.preventDefault();
    }

    if (e.repeat) return;
    this.keysDown.add(e.code);

    // Semantic action dispatches
    switch (e.code) {
      case "KeyE":
        if (this.currentMode !== "sport-fishing") {
          this.dispatch("interact");
        }
        break;
      case "KeyI":
        this.dispatch("open-inventory");
        break;
      case "KeyJ":
        this.dispatch("open-journal");
        break;
      case "KeyM":
        this.dispatch("open-map");
        break;
      case "Escape":
        this.dispatch("pause");
        break;
      case "Space":
        if (this.currentMode === "sport-fishing") {
          this.dispatch("fish-brace");
        }
        break;
      case "KeyW":
        if (this.currentMode === "sport-fishing") {
          this.dispatch("fish-reel");
        }
        break;
      case "KeyS":
        if (this.currentMode === "sport-fishing") {
          this.dispatch("fish-slack");
        }
        break;
      case "KeyA":
      case "ArrowLeft":
        if (this.currentMode === "sport-fishing") {
          this.dispatch("fish-left");
        }
        break;
      case "KeyD":
      case "ArrowRight":
        if (this.currentMode === "sport-fishing") {
          this.dispatch("fish-right");
        }
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.isCanvasTarget(e.target)) return;
    if (e.button === 0) {
      this.keysDown.add("Mouse0");
      if (this.currentMode === "sport-fishing") {
        this.dispatch("fish-reel");
      }
    } else if (e.button === 2) {
      this.keysDown.add("Mouse2");
      if (this.currentMode === "sport-fishing") {
        this.dispatch("fish-slack");
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.type === "pointercancel") {
      this.keysDown.delete("Mouse0");
      this.keysDown.delete("Mouse2");
      return;
    }
    if (e.button === 0) {
      this.keysDown.delete("Mouse0");
    } else if (e.button === 2) {
      this.keysDown.delete("Mouse2");
    }
  };

  private onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private onBlur = (): void => {
    this.keysDown.clear();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysDown.clear();
    }
  };

  private dispatch(action: GameAction): void {
    for (const listener of this.actionListeners) {
      listener(action);
    }
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.keysDown.clear();
    this.actionListeners = [];
  }
}

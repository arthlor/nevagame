import type { GameMode, GameState } from "../simulation/core/types";
import { ModalStack } from "./ModalStack";

export type GameplayMode = Exclude<GameMode, "menu" | "paused">;
export type GameOverlay = "inventory" | "market" | "journal" | "expedition" | "dialogue" | "pause" | "map" | "ledger" | "new-game-confirm";
export type ActiveModal = GameOverlay | null;


const modeFromState = (state: Readonly<GameState>): GameplayMode => {
  if (state.sportFishing) return "sport-fishing";
  if (state.basicFishing) return "basic-fishing";
  if (state.player.activeBoatId) return "boat-driving";
  return "on-foot";
};

/**
 * Owns the player's gameplay mode and the overlay stack as one state machine.
 * A pause child is stacked above Pause, so closing it returns to Pause instead
 * of accidentally resuming the simulation.
 */
export class ModeController {
  private gameplayMode: GameplayMode;
  private readonly overlays = new ModalStack<GameOverlay>();

  constructor(initialMode: GameplayMode = "on-foot") {
    this.gameplayMode = initialMode;
  }

  public get mode(): GameplayMode {
    return this.gameplayMode;
  }

  public get activeModal(): ActiveModal {
    return this.overlays.active;
  }

  public get hasOverlay(): boolean {
    return !this.overlays.isEmpty;
  }

  public get pausesSimulation(): boolean {
    return this.overlays.includes("pause") || this.overlays.includes("new-game-confirm");
  }

  public get blocksWorldInput(): boolean {
    return this.hasOverlay;
  }

  /** Inventory/journal/map/tools must not interrupt an active fishing minigame. */
  public get blocksHudOverlaysAndTools(): boolean {
    return this.gameplayMode === "basic-fishing" || this.gameplayMode === "sport-fishing";
  }

  public restoreFromState(state: Readonly<GameState>): void {
    this.gameplayMode = modeFromState(state);
    this.overlays.clear();
  }

  public setGameplayMode(mode: GameplayMode): void {
    this.gameplayMode = mode;
  }

  public open(modal: GameOverlay): void {
    if (this.activeModal === "new-game-confirm" && modal !== "new-game-confirm") {
      return;
    }
    if (modal === "new-game-confirm") {
      this.overlays.replace("new-game-confirm");
      return;
    }
    if (modal === "pause") {
      this.overlays.replace("pause");
      return;
    }

    if (this.pausesSimulation) {
      this.overlays.replaceChild("pause", modal);
    } else {
      this.overlays.replace(modal);
    }
  }

  public toggle(modal: Exclude<GameOverlay, "pause" | "new-game-confirm">): void {
    if (this.activeModal === modal) {
      this.closeActive();
    } else {
      this.open(modal);
    }
  }

  public closeActive(): void {
    if (this.activeModal === "new-game-confirm") return;
    this.overlays.pop();
  }

  public handleEscape(): void {
    if (this.activeModal === "new-game-confirm") return;
    if (this.hasOverlay) {
      this.closeActive();
    } else {
      this.open("pause");
    }
  }

  public confirmNewGame(): void {
    if (this.activeModal === "new-game-confirm") {
      this.overlays.clear();
    }
  }

  public resume(): void {
    if (this.activeModal === "new-game-confirm") return;
    this.overlays.clear();
  }
}

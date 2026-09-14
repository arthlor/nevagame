import type { GameMode, GameState } from "../simulation/core/types";
import { ModalStack } from "./ModalStack";

export type GameplayMode = Exclude<GameMode, "menu" | "paused">;
export type GameOverlay = "inventory" | "character" | "crafting" | "market" | "journal" | "expedition" | "dialogue" | "catch" | "pause" | "map" | "ledger";
export type ActiveModal = GameOverlay | null;


const modeFromState = (state: Readonly<GameState>): GameplayMode => {
  if (state.sportFishing) return "sport-fishing";
  if (state.basicFishing) return "basic-fishing";
  if (state.player.activeBoatId) return "boat-driving";
  if (state.player.activeMountId) return "mounted";
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
    return this.overlays.includes("pause");
  }

  public get blocksWorldInput(): boolean {
    return this.hasOverlay;
  }

  /** Inventory/journal/map/tools must not interrupt an active fishing minigame. */
  public get blocksHudOverlaysAndTools(): boolean {
    return this.gameplayMode === "basic-fishing" || this.gameplayMode === "sport-fishing";
  }

  /** Closing overlays (null) and Pause are allowed while fishing; other HUD modals are not. */
  public allowsOverlayChange(modal: ActiveModal, options?: { catchSummary?: boolean }): boolean {
    if (!this.blocksHudOverlaysAndTools) return true;
    if (options?.catchSummary && modal === "inventory") return true;
    return modal === "pause" || modal === null;
  }

  /**
   * A market or a conversation is a place the player is standing in, not a
   * panel they flipped open. Letting a stray `I` replace it dropped them back
   * into the world on the next Escape with no way back, so contextual overlays
   * hold the HUD hotkeys until they are closed.
   */
  public get blocksOverlayHotkeys(): boolean {
    const active = this.activeModal;
    return active === "market" || active === "dialogue" || active === "crafting" || active === "catch";
  }

  public restoreFromState(state: Readonly<GameState>): void {
    this.gameplayMode = modeFromState(state);
    this.overlays.clear();
  }

  public setGameplayMode(mode: GameplayMode): void {
    this.gameplayMode = mode;
  }

  public open(modal: GameOverlay): void {
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

  public toggle(modal: Exclude<GameOverlay, "pause">): void {
    if (this.activeModal === modal) {
      this.closeActive();
    } else {
      this.open(modal);
    }
  }

  public closeActive(): void {
    this.overlays.pop();
  }

  public handleEscape(): void {
    if (this.hasOverlay) {
      this.closeActive();
    } else {
      this.open("pause");
    }
  }

  public resume(): void {
    this.overlays.clear();
  }
}

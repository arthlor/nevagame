import { describe, expect, it } from "vitest";
import { ModeController } from "../../src/app/ModeController";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";

describe("ModeController", () => {
  it("keeps direct overlays modal without pausing simulation time", () => {
    const modes = new ModeController();
    modes.open("inventory");

    expect(modes.activeModal).toBe("inventory");
    expect(modes.blocksWorldInput).toBe(true);
    expect(modes.pausesSimulation).toBe(false);

    modes.handleEscape();
    expect(modes.activeModal).toBeNull();
    expect(modes.blocksWorldInput).toBe(false);
  });

  it("returns a Pause child to Pause and resumes only after Pause closes", () => {
    const modes = new ModeController();
    modes.open("pause");
    modes.open("inventory");

    expect(modes.activeModal).toBe("inventory");
    expect(modes.pausesSimulation).toBe(true);

    modes.closeActive();
    expect(modes.activeModal).toBe("pause");
    expect(modes.pausesSimulation).toBe(true);

    modes.closeActive();
    expect(modes.activeModal).toBeNull();
    expect(modes.pausesSimulation).toBe(false);
  });

  it("restores gameplay mode from canonical state without restoring UI overlays", () => {
    const state = createInitialGameState();
    state.player.activeBoatId = "boat.player_rowboat";
    const modes = new ModeController();
    modes.open("pause");

    modes.restoreFromState(state);

    expect(modes.mode).toBe("boat-driving");
    expect(modes.activeModal).toBeNull();
    expect(modes.pausesSimulation).toBe(false);
  });

  it("treats sport-fishing like basic-fishing for overlay and tool blocking", () => {
    const sportState = createInitialGameState();
    sportState.sportFishing = { result: "active" } as (typeof sportState)["sportFishing"];
    const sportModes = new ModeController();
    sportModes.restoreFromState(sportState);
    expect(sportModes.mode).toBe("sport-fishing");
    expect(sportModes.blocksHudOverlaysAndTools).toBe(true);

    const basicState = createInitialGameState();
    basicState.basicFishing = { phase: "minigame" } as (typeof basicState)["basicFishing"];
    const basicModes = new ModeController();
    basicModes.restoreFromState(basicState);
    expect(basicModes.mode).toBe("basic-fishing");
    expect(basicModes.blocksHudOverlaysAndTools).toBe(true);

    const onFoot = new ModeController();
    onFoot.setGameplayMode("on-foot");
    expect(onFoot.blocksHudOverlaysAndTools).toBe(false);
    onFoot.setGameplayMode("farm-placement");
    expect(onFoot.blocksHudOverlaysAndTools).toBe(false);
  });

  it("allows closing overlays and opening pause while fishing, but not inventory", () => {
    const basicState = createInitialGameState();
    basicState.basicFishing = { phase: "minigame" } as (typeof basicState)["basicFishing"];
    const modes = new ModeController();
    modes.restoreFromState(basicState);

    expect(modes.allowsOverlayChange("pause")).toBe(true);
    expect(modes.allowsOverlayChange(null)).toBe(true);
    expect(modes.allowsOverlayChange("inventory")).toBe(false);
    expect(modes.allowsOverlayChange("journal")).toBe(false);
  });

  it("lets Escape dismiss new-game confirm without confirming a wipe", () => {
    const modes = new ModeController();
    modes.open("new-game-confirm");
    expect(modes.activeModal).toBe("new-game-confirm");

    modes.closeActive();
    modes.open("pause");
    expect(modes.activeModal).toBe("new-game-confirm");

    modes.handleEscape();
    expect(modes.activeModal).toBeNull();
    expect(modes.pausesSimulation).toBe(false);
  });

  it("locks other overlays on new-game confirm until confirm or dismiss", () => {
    const modes = new ModeController();
    modes.open("new-game-confirm");

    expect(modes.activeModal).toBe("new-game-confirm");
    expect(modes.pausesSimulation).toBe(true);
    expect(modes.blocksWorldInput).toBe(true);

    modes.closeActive();
    modes.open("pause");
    expect(modes.activeModal).toBe("new-game-confirm");

    modes.confirmNewGame();
    expect(modes.activeModal).toBeNull();
    expect(modes.pausesSimulation).toBe(false);
  });
});

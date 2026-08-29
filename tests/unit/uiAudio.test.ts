import { describe, it, expect, vi } from "vitest";
import { playUiSound } from "../../src/ui/audio/uiAudio";
import { gameAudio } from "../../src/audio/AudioManager";

describe("uiAudio dispatcher", () => {
  it("dispatches expected sound cues to gameAudio without crashing", () => {
    const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});
    const playBankSpy = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});

    playUiSound("click");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

    playUiSound("confirm");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-confirm");

    playUiSound("open");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

    playUiSound("cloth");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

    playUiSound("coins");
    expect(playOneShotSpy).toHaveBeenCalledWith("coins");

    playUiSound("page-turn");
    expect(playOneShotSpy).toHaveBeenCalledWith("page-turn");

    playUiSound("chime");
    expect(playOneShotSpy).toHaveBeenCalledWith("quest-chime");

    playUiSound("error");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-error");

    playUiSound("stamp");
    expect(playOneShotSpy).toHaveBeenCalledWith("contract-stamp");

    playUiSound("sketch");
    expect(playOneShotSpy).toHaveBeenCalledWith("journal-sketch");

    playUiSound("treasure");
    expect(playOneShotSpy).toHaveBeenCalledWith("treasure-chime");

    playUiSound("perfect");
    expect(playOneShotSpy).toHaveBeenCalledWith("perfect-catch");

    playOneShotSpy.mockRestore();
    playBankSpy.mockRestore();
  });
});

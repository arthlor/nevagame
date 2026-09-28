import { describe, it, expect, vi } from "vitest";
import { playAcceptedUiDing, playUiSound } from "../../src/ui/audio/uiAudio";
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
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-cloth");

    playUiSound("cloth");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-cloth");

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

  it("plays one click per activation and stays silent for hover and a rejected control", async () => {
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const playOneShotSpy = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});

    playUiSound("hover");
    playUiSound("click");
    playUiSound("click");
    expect(playOneShotSpy).toHaveBeenCalledTimes(1);
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-click");

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    playUiSound("click");
    expect(playOneShotSpy).toHaveBeenCalledTimes(2);

    playOneShotSpy.mockClear();
    playAcceptedUiDing({ closest: () => ({}) } as unknown as EventTarget);
    expect(playOneShotSpy).not.toHaveBeenCalled();
    playAcceptedUiDing({ closest: () => null } as unknown as EventTarget, "confirm");
    expect(playOneShotSpy).toHaveBeenCalledWith("ui-confirm");

    playOneShotSpy.mockRestore();
  });
});

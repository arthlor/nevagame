import { afterEach, describe, expect, it, vi } from "vitest";

import { gameAudio } from "../../src/audio/AudioManager";
import { bindDomainAudio, syncWorldAudio } from "../../src/audio/gameplayAudio";
import { EventBus } from "../../src/simulation/core/EventBus";

const position = { x: 0, y: 0.5, z: 0 };
const worldInput = {
  position,
  mode: "on-foot" as const,
  weather: "clear" as const,
  clock: { timeOfDay: "day" as const },
  paused: false
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gameplay audio adapters", () => {
  it("plays the exhaustion cue once when sprint exhaustion begins", () => {
    const playOneShot = vi.spyOn(gameAudio, "playOneShot").mockImplementation(() => {});

    syncWorldAudio({ ...worldInput, sprintExhausted: false });
    syncWorldAudio({ ...worldInput, sprintExhausted: true });
    syncWorldAudio({ ...worldInput, sprintExhausted: true });
    syncWorldAudio({ ...worldInput, sprintExhausted: false });

    expect(playOneShot).toHaveBeenCalledExactlyOnceWith("stamina-exhausted", position);
  });

  it("uses the donkey variation bank when the mount is boarded", () => {
    const playBank = vi.spyOn(gameAudio, "playBank").mockImplementation(() => {});
    const events = new EventBus();
    const unsubscribe = bindDomainAudio(events, () => position);

    events.emit("MountBoarded", { mountId: "mount.donkey", minute: 1 });
    unsubscribe();

    expect(playBank).toHaveBeenCalledExactlyOnceWith("donkey-snort", position);
  });
});

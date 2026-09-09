import { describe, expect, it, vi, afterEach } from "vitest";
import { buildWorldAudio, WorldMusicRouting } from "../../src/simulation/presentation/WorldAudioPresentation";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_AMBIENCE_PROFILES } from "../../src/world/WorldGameplayLocations";

afterEach(() => vi.restoreAllMocks());
describe("world soundscapes", () => {
  it("preserves every authored profile gain rather than collapsing regions into beds", () => {
    vi.spyOn(WorldLayout, "isInterior").mockReturnValue(false);
    const region = vi.spyOn(WorldLayout, "regionAt");
    for (const profile of WORLD_AMBIENCE_PROFILES) {
      region.mockReturnValue(profile.regionId);
      const { layers } = buildWorldAudio({ x: 0, z: 0 }, "on-foot", { timeOfDay: "day" });
      expect(layers["ambience-wind"]).toBe(profile.windGain);
      expect(layers["ambience-waves"]).toBe(profile.surfGain);
      expect(layers["ambience-insects"]).toBe(profile.insectsGain);
      if (profile.regionId !== "region.village") expect(layers["ambience-market"]).toBe(profile.harborGain);
    }
  });
  it("routes by place, activity and clock phase", () => {
    vi.spyOn(WorldLayout, "isInterior").mockReturnValue(false);
    vi.spyOn(WorldLayout, "regionAt").mockReturnValue("region.village");
    const position = { x: 0, z: 0 };
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-village");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "night" }).music).toBe("theme-piano");
    expect(buildWorldAudio(position, "boat-driving", { timeOfDay: "day" }).music).toBe("theme-guitar-arpeggio");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "dawn" }).layers["ambience-dawn"]).toBe(1);
  });
  it("requires a continuous dwell and cancels a pending border transition", () => {
    const music = new WorldMusicRouting();
    expect(music.sample("theme-village", 0)).toBe("theme-village");
    expect(music.sample("theme-folk-calm", 1000)).toBe("theme-village");
    expect(music.sample("theme-village", 6000)).toBe("theme-village");
    expect(music.sample("theme-folk-calm", 7000)).toBe("theme-village");
    expect(music.sample("theme-folk-calm", 14999)).toBe("theme-village");
    expect(music.sample("theme-folk-calm", 15000)).toBe("theme-folk-calm");
  });
});

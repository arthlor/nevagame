import { describe, expect, it, vi, afterEach } from "vitest";
import { buildWorldAudio, headwaterLoopGains, pinewatchLakeLoop, reedwaterRun, WorldMusicRouting } from "../../src/simulation/presentation/WorldAudioPresentation";
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
      const sunreach = profile.regionId.startsWith("region.sunreach");
      expect(layers["ambience-insects"]).toBe(0);
      expect(layers["ambience-meadow"]).toBe(sunreach ? 0 : profile.insectsGain);
      expect(layers["ambience-scrub"]).toBe(sunreach ? profile.insectsGain : 0);
      expect(layers["ambience-forest"]).toBe(profile.regionId === "region.pinewatch" ? 0.4 : 0);
      if (profile.regionId === "region.harbor") {
        expect(layers["ambience-market"]).toBe(0);
        expect(layers["ambience-harbor"]).toBeGreaterThan(0);
      } else if (profile.regionId !== "region.village") {
        expect(layers["ambience-market"]).toBe(profile.harborGain);
      }
    }
  });
  it("routes by place, activity and clock phase", () => {
    vi.spyOn(WorldLayout, "isInterior").mockReturnValue(false);
    const region = vi.spyOn(WorldLayout, "regionAt");
    const position = { x: 0, z: 0 };
    region.mockReturnValue("region.farm");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme");
    region.mockReturnValue("region.village");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-village");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "night" }).music).toBe("theme-night");
    region.mockReturnValue("region.farm");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "dusk" }).music).toBe("theme-dusk");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "night" }).layers["ambience-insects"]).toBeGreaterThan(0);
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "night" }).layers["ambience-meadow"]).toBe(0);
    region.mockReturnValue("region.pinewatch");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-forest");
    region.mockReturnValue("region.highridge");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-highland");
    region.mockReturnValue("region.sunreach_cove");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-sunreach");
    region.mockReturnValue("region.sunreach_ridge");
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "day" }).music).toBe("theme-highland");
    region.mockReturnValue("region.farm");
    expect(buildWorldAudio(position, "boat-driving", { timeOfDay: "day" }).music).toBe("theme-guitar-arpeggio");
    expect(buildWorldAudio(position, "sport-fishing", { timeOfDay: "day" }).music).toBe("theme");
    expect(headwaterLoopGains({ x: -29.5, z: -135.2 }).fall).toBe(1);
    expect(headwaterLoopGains({ x: 80, z: 80 }).fall).toBe(0);
    expect(pinewatchLakeLoop({ x: -590, z: -180 }).gain).toBe(1);
    expect(pinewatchLakeLoop({ x: 0, z: 0 }).gain).toBe(0);
    expect(reedwaterRun({ x: -550, z: 70 }).gain).toBe(1);
    expect(reedwaterRun({ x: 0, z: 0 }).gain).toBe(0);
    expect(buildWorldAudio(position, "on-foot", { timeOfDay: "dawn" }).layers["ambience-dawn"]).toBe(1);
  });
  it("requires a continuous dwell and cancels a pending border transition", () => {
    const music = new WorldMusicRouting();
    expect(music.sample("theme", 0)).toBe("theme");
    expect(music.sample("theme-forest", 1000)).toBe("theme");
    expect(music.sample("theme-forest", 8999)).toBe("theme");
    expect(music.sample("theme-forest", 9000)).toBe("theme-forest");
    expect(music.sample("theme-dusk", 10000)).toBe("theme-forest");
    expect(music.sample("theme-forest", 12000)).toBe("theme-forest");
    expect(music.sample("theme-dusk", 17000)).toBe("theme-forest");
    expect(music.sample("theme-dusk", 24999)).toBe("theme-forest");
    expect(music.sample("theme-dusk", 25000)).toBe("theme-dusk");
  });
  it("cuts the fishing fight theme in and out without the place dwell", () => {
    const music = new WorldMusicRouting();
    music.sample("theme-village", 0);
    expect(music.sample("theme-village", 8000)).toBe("theme-village");
    expect(music.sample("theme-line-tension", 9000)).toBe("theme-line-tension");
    expect(music.sample("theme", 9500)).toBe("theme");
  });
});

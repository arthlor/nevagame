import { describe, expect, it } from "vitest";
import {
  atlasForAction,
  atlasForBehavior,
  atlasForMapNode,
  atlasForQuality,
  atlasForWeather,
  qualitySpriteKey
} from "../../src/ui/chrome/uiAtlas";

describe("UI atlas resolvers", () => {
  it("maps simulation quality aliases onto the four medallions", () => {
    expect(qualitySpriteKey("common")).toBe("normal");
    expect(qualitySpriteKey("fine")).toBe("silver");
    expect(qualitySpriteKey("exceptional")).toBe("gold");
    expect(qualitySpriteKey("trophy")).toBe("iridium");
    expect(atlasForQuality("gold")).toContain("quality-gold.png");
  });

  it("normalises weather tags and time of day", () => {
    expect(atlasForWeather("cloudy")).toContain("weather-overcast.png");
    expect(atlasForWeather("heavy_rain")).toContain("weather-rain.png");
    expect(atlasForWeather("windy")).toContain("weather-wind.png");
    expect(atlasForWeather("clear", "night")).toContain("time-moon.png");
    expect(atlasForWeather("clear", "dawn")).toContain("time-dawn.png");
  });

  it("folds processing actions and hooked-fish behaviours", () => {
    expect(atlasForAction("processing-collect")).toContain("action-processing.png");
    expect(atlasForBehavior("run-left")).toContain("behavior-run.png");
    expect(atlasForBehavior("rest")).toContain("behavior-tiring.png");
    expect(atlasForMapNode("node_lighthouse")).toContain("mapnode-lighthouse.png");
  });
});

import { describe, expect, it } from "vitest";

import {
  sampleWeatherPosture,
  SocialReactionPresentation
} from "../../src/render/presentation/SocialReactionPresentation";

describe("SocialReactionPresentation", () => {
  it("turns a harbor return into a stronger and wider response than ordinary work", () => {
    const reactions = new SocialReactionPresentation();
    reactions.trigger("work", 0, 0, 0);
    const work = reactions.sample(1, 0, 0.5, false);
    reactions.trigger("homecoming", 0, 0, 1);
    const homecoming = reactions.sample(1, 0, 1.8, false);
    expect(work.attention).toBeGreaterThan(0);
    expect(work.turnBody).toBe(false);
    expect(homecoming.attention).toBeGreaterThan(work.attention);
    expect(homecoming.kind).toBe("homecoming");
    expect(homecoming.turnBody).toBe(true);
    expect(homecoming.targetX).toBe(0);
    expect(homecoming.targetZ).toBe(0);
  });

  it("stays local, expires, and removes nod motion under reduced motion", () => {
    const reactions = new SocialReactionPresentation();
    reactions.trigger("trade", 0, 0, 10);
    expect(reactions.sample(50, 0, 10.6, false).attention).toBe(0);
    expect(reactions.sample(1, 0, 10.6, true).nodRadians).toBe(0);
    expect(reactions.sample(1, 0, 20, false).attention).toBe(0);
  });
});

describe("sampleWeatherPosture", () => {
  it("is still in calm weather and leans deterministically in wind", () => {
    expect(sampleWeatherPosture(
      { windDirectionDeg: 0, windSpeed: 0, precipitation: 0 }, 0, 4, false
    )).toEqual({ pitchRadians: 0, rollRadians: 0 });
    const windy = sampleWeatherPosture(
      { windDirectionDeg: 90, windSpeed: 18, precipitation: 0.4 }, 0, 4, false, 0.3
    );
    expect(Math.abs(windy.rollRadians)).toBeGreaterThan(0);
    expect(windy).toEqual(sampleWeatherPosture(
      { windDirectionDeg: 90, windSpeed: 18, precipitation: 0.4 }, 0, 4, false, 0.3
    ));
  });

  it("keeps a smaller static posture under reduced motion", () => {
    const full = sampleWeatherPosture(
      { windDirectionDeg: 0, windSpeed: 18, precipitation: 1 }, 0, 3, false
    );
    const reduced = sampleWeatherPosture(
      { windDirectionDeg: 0, windSpeed: 18, precipitation: 1 }, 0, 3, true
    );
    expect(Math.abs(reduced.pitchRadians)).toBeGreaterThan(0);
    expect(Math.abs(reduced.pitchRadians)).toBeLessThan(Math.abs(full.pitchRadians));
    expect(reduced.rollRadians).toBe(0);
  });
});

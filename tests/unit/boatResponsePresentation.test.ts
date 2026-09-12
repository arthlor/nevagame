import { describe, expect, it } from "vitest";

import { BoatResponsePresentation } from "../../src/render/presentation/BoatResponsePresentation";

describe("BoatResponsePresentation", () => {
  it("adds a short side-aware cargo response and then settles", () => {
    const response = new BoatResponsePresentation();
    response.trigger("boat.rowboat", "cargo-load", 10, 0);
    const active = response.sample("boat.rowboat", 10.2, false);
    expect(Math.abs(active.heaveMeters)).toBeGreaterThan(0);
    expect(Math.abs(active.rollRadians)).toBeGreaterThan(0);
    expect(response.sample("boat.rowboat", 12, false)).toEqual({
      heaveMeters: 0,
      pitchRadians: 0,
      rollRadians: 0
    });
  });

  it("uses opposite roll sides for neighbouring cargo slots", () => {
    const port = new BoatResponsePresentation();
    const starboard = new BoatResponsePresentation();
    port.trigger("boat", "cargo-load", 0, 0);
    starboard.trigger("boat", "cargo-load", 0, 1);
    expect(Math.sign(port.sample("boat", 0.2, false).rollRadians))
      .toBe(-Math.sign(starboard.sample("boat", 0.2, false).rollRadians));
  });

  it("suppresses transient boat motion under reduced motion", () => {
    const response = new BoatResponsePresentation();
    response.trigger("boat", "dock", 4);
    expect(response.sample("boat", 4.2, true)).toEqual({
      heaveMeters: 0,
      pitchRadians: 0,
      rollRadians: 0
    });
  });
});


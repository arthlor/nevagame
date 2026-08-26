import { describe, expect, it } from "vitest";
import {
  createSportFishingPresentationSample,
  sampleSportFishingPresentation
} from "../../src/render/fishing/FishingPresentation";
import type { FishingEncounterState } from "../../src/simulation/core/types";

function encounter(overrides: Partial<FishingEncounterState> = {}): FishingEncounterState {
  return {
    fish: { instanceId: "fish.test", speciesId: "fish.trout", weightKg: 2, quality: "common" },
    rodId: "rod.willow",
    stamina: 40,
    maxStamina: 80,
    distanceMeters: 18,
    lineTension: 35,
    lineIntegrity: 100,
    fishDirection: 0,
    behavior: "rest",
    behaviorUntilSeconds: 1,
    elapsedSeconds: 3,
    rodDirectionAngle: 0,
    isReeling: false,
    isSlacking: false,
    isBracing: false,
    slackTimerSeconds: 0,
    snapTimerSeconds: 0,
    result: "active",
    ...overrides
  };
}

describe("sport fishing presentation", () => {
  it("maps fish distance and direction without changing the authoritative encounter", () => {
    const state = encounter({ fishDirection: 1, behavior: "run-right" });
    const result = sampleSportFishingPresentation(
      state,
      4,
      7,
      0,
      1,
      createSportFishingPresentationSample()
    );
    expect(Math.hypot(result.endpointX - 4, result.endpointZ - 7)).toBeCloseTo(18, 5);
    expect(result.endpointX).toBeGreaterThan(4);
    expect(state.distanceMeters).toBe(18);
    expect(state.fishDirection).toBe(1);
  });

  it("tightens line sag and bends the rod from encounter tension", () => {
    const low = sampleSportFishingPresentation(
      encounter({ lineTension: 12 }), 0, 0, 0, 1, createSportFishingPresentationSample()
    );
    const high = sampleSportFishingPresentation(
      encounter({ lineTension: 92, lineIntegrity: 28 }), 0, 0, 0, 1,
      createSportFishingPresentationSample()
    );
    expect(high.lineSagMeters).toBeLessThan(low.lineSagMeters);
    expect(high.rodBendRadians).toBeGreaterThan(low.rodBendRadians);
  });

  it("keeps essential fish position while reduced motion removes secondary response", () => {
    const state = encounter({ behavior: "surface", lineTension: 80, fishDirection: -1 });
    const full = sampleSportFishingPresentation(
      state, 0, 0, 0.4, 1, createSportFishingPresentationSample()
    );
    const reduced = sampleSportFishingPresentation(
      state, 0, 0, 0.4, 0, createSportFishingPresentationSample()
    );
    expect(reduced.endpointX).toBeCloseTo(full.endpointX, 8);
    expect(reduced.endpointZ).toBeCloseTo(full.endpointZ, 8);
    expect(reduced.depthMeters).toBe(full.depthMeters);
    expect(reduced.rodBendRadians).toBe(0);
    expect(reduced.surfaceStrength).toBe(0);
  });
});

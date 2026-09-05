import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";
import {
  sportFishingMaxStartDistanceMeters,
  sportFishingStartDistanceForWeight,
  sportFishingStartDistanceMeters
} from "../../src/simulation/fishing/FishingEncounter";
import { findFishingWater } from "../../src/simulation/fishing/FishingTuning";
import { WorldLayout } from "../../src/world/WorldLayout";

describe("weight-readable fight starts", () => {
  it("shifts start distance from base-spread at minimum to base+spread at maximum", () => {
    expect(sportFishingStartDistanceForWeight("small", 2.5, 2.5, 12)).toBeCloseTo(25, 5);
    expect(sportFishingStartDistanceForWeight("small", 12, 2.5, 12)).toBeCloseTo(35, 5);
    expect(sportFishingStartDistanceForWeight("small", 7.25, 2.5, 12)).toBeCloseTo(30, 5);
    expect(
      sportFishingStartDistanceForWeight("gargantuan", 60, 60, 320)
    ).toBeCloseTo(45, 5);
    expect(
      sportFishingStartDistanceForWeight("gargantuan", 320, 60, 320)
    ).toBeCloseTo(65, 5);
  });

  it("clamps out-of-range weights instead of extrapolating", () => {
    expect(sportFishingStartDistanceForWeight("medium", -5, 4, 28)).toBeCloseTo(
      sportFishingStartDistanceMeters("medium") - 7,
      5
    );
    expect(sportFishingStartDistanceForWeight("medium", 500, 4, 28)).toBeCloseTo(
      sportFishingStartDistanceMeters("medium") + 7,
      5
    );
  });

  it("starts the hooked fight at the weight distance, bounded by validated water", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const encounter = sim.state.sportFishing!;
    const species = ContentRegistry.fishSpecies.get(encounter.fish.speciesId)!;
    const lake = SCHOOL_SPAWN_POINTS.find(
      (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
    )!;
    // Same search the hook path runs: player standing on the school, bearing 0.
    const water = findFishingWater(
      lake.x,
      lake.z,
      0,
      sportFishingMaxStartDistanceMeters(species.cargoClass),
      (x, z) => WorldLayout.isSailable(x, z)
    )!;
    const expected = Math.min(
      water.distance,
      sportFishingStartDistanceForWeight(
        species.cargoClass,
        encounter.fish.weightKg,
        species.weightKg.min,
        species.weightKg.max
      )
    );
    expect(encounter.distanceMeters).toBeCloseTo(expected, 5);
  });
});

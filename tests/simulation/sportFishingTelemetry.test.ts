import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { FISHING_STEER_INPUT_MAX, FISHING_TUNING } from "../../src/simulation/fishing/FishingTuning";
import { hookLakeTroutForTest as hookLakeTrout } from "./sportFishingTestUtils";

/**
 * The fight telemetry must be a read of the encounter the player is actually
 * fighting. These assertions drive the encounter state and check the readout
 * follows it, so a hardcoded or drifting readout fails here.
 */
describe("sport-fishing fight telemetry", () => {
  it("reports the encounter's own range and depth, not a fixed pair", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);

    sim.state.sportFishing!.distanceMeters = 18.36;
    sim.state.sportFishing!.dynamics!.depthMeters = 3.24;
    const far = sim.inspectSportFishingHud()!.telemetry;
    expect(far.runDistanceMeters).toBeCloseTo(18.4, 5);
    expect(far.waterDepthMeters).toBeCloseTo(3.2, 5);

    sim.state.sportFishing!.distanceMeters = 4.1;
    sim.state.sportFishing!.dynamics!.depthMeters = 0.55;
    const near = sim.inspectSportFishingHud()!.telemetry;
    expect(near.runDistanceMeters).toBeCloseTo(4.1, 5);
    expect(near.waterDepthMeters).toBeCloseTo(0.6, 5);
    expect(near.runDistancePercent).toBeLessThan(far.runDistancePercent);
  });

  it("publishes the same landing range the encounter lands the fish at", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    expect(sim.inspectSportFishingHud()!.telemetry.landingDistanceMeters)
      .toBe(FISHING_TUNING.landingDistance);
  });

  it("bottoms the run gauge at landing range and tops it out on a long run", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);

    sim.state.sportFishing!.distanceMeters = FISHING_TUNING.landingDistance;
    expect(sim.inspectSportFishingHud()!.telemetry.runDistancePercent).toBe(0);

    // Inside landing range the gauge must clamp rather than go negative.
    sim.state.sportFishing!.distanceMeters = 0.6;
    expect(sim.inspectSportFishingHud()!.telemetry.runDistancePercent).toBe(0);

    sim.state.sportFishing!.distanceMeters = FISHING_TUNING.maximumDistance;
    expect(sim.inspectSportFishingHud()!.telemetry.runDistancePercent).toBe(100);
  });

  it("tracks the rod lay across its full steer range", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);

    sim.state.sportFishing!.dynamics!.rodDirection = 0;
    expect(sim.inspectSportFishingHud()!.telemetry.rodDeflectionPercent).toBe(0);

    sim.state.sportFishing!.dynamics!.rodDirection = FISHING_STEER_INPUT_MAX;
    expect(sim.inspectSportFishingHud()!.telemetry.rodDeflectionPercent).toBe(100);

    sim.state.sportFishing!.dynamics!.rodDirection = -FISHING_STEER_INPUT_MAX;
    expect(sim.inspectSportFishingHud()!.telemetry.rodDeflectionPercent).toBe(-100);

    sim.state.sportFishing!.dynamics!.rodDirection = FISHING_STEER_INPUT_MAX / 2;
    expect(sim.inspectSportFishingHud()!.telemetry.rodDeflectionPercent).toBe(50);
  });

  it("scores counter-swing positive only when the rod opposes the run", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    const encounter = sim.state.sportFishing!;

    // Fish running right, rod laid left: a clean counter.
    encounter.fishDirection = 1;
    encounter.dynamics!.rodDirection = -FISHING_STEER_INPUT_MAX;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingPercent).toBe(100);

    // Same run, rod laid with the fish: feeding it slack.
    encounter.dynamics!.rodDirection = FISHING_STEER_INPUT_MAX;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingPercent).toBe(-100);

    // Mirror the run and the sign must mirror with it.
    encounter.fishDirection = -1;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingPercent).toBe(100);
  });

  it("cues the swing against the run, and stays quiet while the fish holds", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    const encounter = sim.state.sportFishing!;

    encounter.fishDirection = 1;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingCue).toBe("left");

    encounter.fishDirection = -1;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingCue).toBe("right");

    encounter.fishDirection = 0;
    expect(sim.inspectSportFishingHud()!.telemetry.counterSwingCue).toBeNull();
  });

  it("never mutates the encounter while reporting telemetry", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    sim.state.sportFishing!.distanceMeters = 9.5;
    const before = JSON.stringify(sim.state.sportFishing);
    sim.inspectSportFishingHud();
    sim.inspectSportFishingHud();
    expect(JSON.stringify(sim.state.sportFishing)).toBe(before);
  });
});

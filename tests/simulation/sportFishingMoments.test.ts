import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { SIGNATURE_MOMENT_SECONDS } from "../../src/simulation/domains/FishingDomain";
import { hookLakeTroutForTest as hookLakeTrout } from "./sportFishingTestUtils";

describe("sport-fishing signature moments", () => {
  it("is silent while the fish rests, then pulses once on its trigger behavior", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    // A fresh encounter always opens at rest, before any trigger behavior.
    expect(sim.state.sportFishing?.behavior).toBe("rest");
    expect(sim.inspectSportFishingHud()?.signatureMoment).toBeNull();

    sim.state.sportFishing!.behavior = "surface";
    sim.state.sportFishing!.elapsedSeconds = 10;
    expect(sim.inspectSportFishingHud()?.signatureMoment).toEqual({
      id: "fish.trout:surface",
      copy: "The trout breaks the surface!"
    });
  });

  it("expires after its pulse window and never fires twice in one fight", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    sim.state.sportFishing!.behavior = "surface";
    sim.state.sportFishing!.elapsedSeconds = 10;
    expect(sim.inspectSportFishingHud()?.signatureMoment).not.toBeNull();

    sim.state.sportFishing!.elapsedSeconds = 10 + SIGNATURE_MOMENT_SECONDS + 1;
    expect(sim.inspectSportFishingHud()?.signatureMoment).toBeNull();

    // A later surface in the same fight must not re-fire the moment.
    sim.state.sportFishing!.behavior = "dive";
    sim.state.sportFishing!.behavior = "surface";
    expect(sim.inspectSportFishingHud()?.signatureMoment).toBeNull();
  });

  it("fires again for a new fight, keyed by fish instance id", () => {
    const sim = new Simulation();
    hookLakeTrout(sim);
    sim.state.sportFishing!.behavior = "surface";
    sim.state.sportFishing!.elapsedSeconds = 10;
    expect(sim.inspectSportFishingHud()?.signatureMoment).not.toBeNull();

    // A new fight carries a new fish instance: the moment must fire again.
    sim.state.sportFishing!.fish.instanceId = "fish_inst_second_fight";
    sim.state.sportFishing!.behavior = "rest";
    sim.state.sportFishing!.elapsedSeconds = 20;
    expect(sim.inspectSportFishingHud()?.signatureMoment).toBeNull();
    sim.state.sportFishing!.behavior = "surface";
    expect(sim.inspectSportFishingHud()?.signatureMoment).toEqual({
      id: "fish.trout:surface",
      copy: "The trout breaks the surface!"
    });
  });
});

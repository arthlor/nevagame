// tests/unit/fishingEncounter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FishInstance } from "../../src/simulation/core/types";
import { ContentRegistry } from "../../src/content/ContentRegistry";

describe("FishingEncounter Mechanics", () => {
  beforeEach(() => {
    ContentRegistry.initializeAndValidate();
  });

  it("can land a fish when skillfully played", () => {
    const fish: FishInstance = {
      instanceId: "test_fish_1",
      speciesId: "fish.trout",
      weightKg: 3.0,
      quality: "fine",
      caughtAtMinute: 100
    };

    const rng = new SeededRng(42);
    const encounter = new FishingEncounter(fish, "rod.willow", rng, 20);

    let result = "active";
    for (let step = 0; step < 200; step++) {
      const state = encounter.getState();
      const isReeling = state.lineTension < 70;
      const isBracing = state.behavior === "dive" || state.behavior === "burst";
      const isSlacking = state.lineTension > 80;

      encounter.setInput({
        isReeling: isReeling && !isSlacking,
        isSlacking,
        isBracing,
        rodDirectionAngle: -state.fishDirection
      });

      result = encounter.tick(0.5);
      if (result !== "active") break;
    }

    expect(result).toBe("landed");
  });
});

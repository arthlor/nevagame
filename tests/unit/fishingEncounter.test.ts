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

  it("starts tuna farther than trout", () => {
    const trout = new FishingEncounter(
      {
        instanceId: "trout",
        speciesId: "fish.trout",
        weightKg: 3.2,
        quality: "common",
        caughtAtMinute: 100
      },
      "rod.willow",
      new SeededRng(1),
      30
    );
    const tuna = new FishingEncounter(
      {
        instanceId: "tuna",
        speciesId: "fish.tuna",
        weightKg: 35,
        quality: "fine",
        caughtAtMinute: 100
      },
      "rod.heavy_sport",
      new SeededRng(1),
      45
    );
    expect(trout.getState().distanceMeters).toBe(30);
    expect(tuna.getState().distanceMeters).toBe(45);
    expect(tuna.getState().maxStamina).toBeGreaterThan(trout.getState().maxStamina);
  });

  it("applies tensionSensitivity so a greedy-reel timeline lands trout and snaps tuna", () => {
    const greedy = (
      speciesId: "fish.trout" | "fish.tuna",
      rodId: string,
      startDistance: number
    ) => {
      const encounter = new FishingEncounter(
        {
          instanceId: `greedy.${speciesId}`,
          speciesId,
          weightKg: speciesId === "fish.trout" ? 3.2 : 35,
          quality: "fine",
          caughtAtMinute: 100
        },
        rodId,
        new SeededRng(7),
        startDistance
      );
      let result: ReturnType<FishingEncounter["tick"]> = "active";
      for (let step = 0; step < 240; step++) {
        encounter.setInput({
          isReeling: true,
          isSlacking: false,
          isBracing: false,
          rodDirectionAngle: 0
        });
        result = encounter.tick(0.25);
        if (result !== "active") break;
      }
      return result;
    };

    expect(greedy("fish.trout", "rod.willow", 20)).toBe("landed");
    expect(greedy("fish.tuna", "rod.heavy_sport", 45)).toBe("line-snapped");
  });
});

// tests/unit/fishingEncounter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FISHING_TUNING } from "../../src/simulation/fishing/FishingTuning";
import { FishInstance, FishingEncounterState } from "../../src/simulation/core/types";
import { ContentRegistry } from "../../src/content/ContentRegistry";

function makeFish(speciesId: string, weightKg: number): FishInstance {
  return { instanceId: `test.${speciesId}`, speciesId, weightKg, quality: "fine", caughtAtMinute: 100 };
}

/**
 * Plays a competent fight: reel in the green band, ease off when tension
 * climbs, counter runs.
 *
 * The budget is deliberately clear of the real fight length. A 3 kg trout on
 * `rod.willow` lands at ~150 s: stamina falls from 57.2 to the 15% landing
 * threshold at roughly 0.32/s. At 600 steps this assertion sat exactly on the
 * boundary and failed by a single tick. This claim is "a competent fight
 * lands the fish", not "it lands within 150 s" — see the encounter's own
 * duration tests for pacing.
 */
function playSkilfully(encounter: FishingEncounter, maxSteps = 900, dt = 0.25): FishingEncounterState["result"] {
  let result: FishingEncounterState["result"] = "active";
  for (let step = 0; step < maxSteps; step++) {
    const s = encounter.getState();
    const slacking = s.lineTension > 82;
    encounter.setInput({
      isReeling: s.lineTension < 68 && !slacking,
      isSlacking: slacking,
      isBracing: s.behavior === "dive" || s.behavior === "burst",
      rodDirectionAngle: -s.fishDirection
    });
    result = encounter.tick(dt);
    if (result !== "active") break;
  }
  return result;
}

describe("FishingEncounter Mechanics", () => {
  beforeEach(() => {
    ContentRegistry.initializeAndValidate();
  });

  it("lands a trout when the fight is played in the green band", () => {
    const encounter = new FishingEncounter(makeFish("fish.trout", 3), "rod.willow", new SeededRng(42), 20);
    expect(playSkilfully(encounter)).toBe("landed");
  });

  it("snaps the line when a heavy fish is horsed on an undersized rod", () => {
    const encounter = new FishingEncounter(makeFish("fish.tuna", 40), "rod.willow", new SeededRng(9), 45);
    let result: FishingEncounterState["result"] = "active";
    for (let step = 0; step < 800 && result === "active"; step++) {
      encounter.setInput({ isReeling: true, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      result = encounter.tick(0.25);
    }
    expect(result).toBe("line-snapped");
  });

  it("lets the fish escape when the line is left slack", () => {
    const encounter = new FishingEncounter(makeFish("fish.trout", 3), "rod.willow", new SeededRng(3), 24);
    let result: FishingEncounterState["result"] = "active";
    for (let step = 0; step < 400 && result === "active"; step++) {
      encounter.setInput({ isReeling: false, isSlacking: true, isBracing: false, rodDirectionAngle: 0 });
      result = encounter.tick(0.25);
    }
    expect(result).toBe("escaped");
  });

  it("is fully deterministic for a given seed and input script", () => {
    const run = () => {
      const encounter = new FishingEncounter(makeFish("fish.trout", 3.4), "rod.river", new SeededRng(1234), 22);
      const trace: number[] = [];
      let result: FishingEncounterState["result"] = "active";
      for (let step = 0; step < 300 && result === "active"; step++) {
        const s = encounter.getState();
        encounter.setInput({
          isReeling: s.lineTension < 70,
          isSlacking: s.lineTension > 85,
          isBracing: false,
          rodDirectionAngle: -s.fishDirection
        });
        result = encounter.tick(0.2);
        trace.push(Math.round(s.lineTension * 1000), Math.round(s.distanceMeters * 1000));
      }
      return { trace, result };
    };
    const a = run();
    const b = run();
    expect(b.trace).toEqual(a.trace);
    expect(b.result).toBe(a.result);
  });

  it("holds each selected behavior long enough to read and answer", () => {
    const encounter = new FishingEncounter(makeFish("fish.trout", 3), "rod.willow", new SeededRng(15), 20);
    const state = encounter.getState() as FishingEncounterState;
    state.behaviorUntilSeconds = 0.01;
    state.dynamics!.behaviorDurationSeconds = 0.01;
    encounter.tick(0.05);
    expect(state.dynamics!.behaviorDurationSeconds).toBeGreaterThanOrEqual(FISHING_TUNING.minimumBehaviorSeconds);
    expect(state.behaviorUntilSeconds).toBeGreaterThan(3.1);
  });

  it("requires the landing window to be held before the fish beaches", () => {
    const encounter = new FishingEncounter(makeFish("fish.trout", 2.6), "rod.willow", new SeededRng(5), 12);
    const s = encounter.getState() as FishingEncounterState;
    s.stamina = 0;
    s.distanceMeters = 1;
    s.lineTension = 24;
    s.behavior = "rest";
    s.behaviorUntilSeconds = 99;
    // Keep the line-length spring consistent with the forced short distance so the
    // recomputed tension stays inside the green band across the hold.
    s.dynamics!.lineLengthMeters = 0.15;

    let elapsed = 0;
    let result: FishingEncounterState["result"] = "active";
    while (elapsed < 0.3 && result === "active") {
      encounter.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      result = encounter.tick(0.1);
      elapsed += 0.1;
    }
    expect(result).toBe("active"); // held far less than landReadySeconds

    while (elapsed < FISHING_TUNING.landReadySeconds + 0.4 && result === "active") {
      encounter.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      result = encounter.tick(0.1);
      elapsed += 0.1;
    }
    expect(result).toBe("landed");
  });

  it("chews line integrity while a hard-shaking fish rings the rod", () => {
    const encounter = new FishingEncounter(makeFish("fish.pike", 6), "rod.river", new SeededRng(11), 16);
    const s = encounter.getState() as FishingEncounterState;
    for (let step = 0; step < 40; step++) {
      s.behavior = "shake";
      s.behaviorUntilSeconds = 999;
      encounter.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      encounter.tick(0.1);
    }
    expect(encounter.getState().lineIntegrity).toBeLessThan(99);
  });

  it("turns a deliberate rod lift into extra retrieval when the player winds down", () => {
    const makeRecoveryFight = () => {
      const encounter = new FishingEncounter(
        makeFish("fish.trout", 3),
        "rod.river",
        new SeededRng(77),
        20
      );
      const state = encounter.getState() as FishingEncounterState;
      state.behavior = "rest";
      state.behaviorUntilSeconds = 99;
      state.dynamics!.behaviorDurationSeconds = 99;
      return encounter;
    };
    const pumped = makeRecoveryFight();
    const flat = makeRecoveryFight();

    for (let step = 0; step < 15; step++) {
      pumped.setInput({ isReeling: false, isSlacking: false, isBracing: true, rodDirectionAngle: 0 });
      flat.setInput({ isReeling: false, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
      pumped.tick(0.05);
      flat.tick(0.05);
    }
    expect(pumped.getState().dynamics!.rodLoad).toBeGreaterThan(flat.getState().dynamics!.rodLoad + 0.1);

    for (let step = 0; step < 12; step++) {
      const wind = { isReeling: true, isSlacking: false, isBracing: false, rodDirectionAngle: 0 };
      pumped.setInput(wind);
      flat.setInput(wind);
      pumped.tick(0.05);
      flat.tick(0.05);
    }
    expect(pumped.getState().dynamics!.lineLengthMeters)
      .toBeLessThan(flat.getState().dynamics!.lineLengthMeters - 0.05);
  });

  it("rejects a wet fish endpoint when the taut line would cross an island", () => {
    const encounter = new FishingEncounter(
      makeFish("fish.trout", 3),
      "rod.river",
      new SeededRng(19),
      12,
      {
        originX: 0,
        originZ: 0,
        bearingRadians: 0,
        isWater: (_x, z) => z < 5 || z > 7
      }
    );
    const pathIsClear = (encounter as unknown as {
      waterPathIsClear(point: { x: number; z: number }): boolean;
    }).waterPathIsClear.bind(encounter);
    expect(pathIsClear({ x: 0, z: 4 })).toBe(true);
    expect(pathIsClear({ x: 0, z: 12 })).toBe(false);
  });

  it("starts a tuna farther out and tougher than a trout", () => {
    const trout = new FishingEncounter(makeFish("fish.trout", 3.2), "rod.willow", new SeededRng(1), 30);
    const tuna = new FishingEncounter(makeFish("fish.tuna", 35), "rod.heavy_sport", new SeededRng(1), 45);
    expect(trout.getState().distanceMeters).toBe(30);
    expect(tuna.getState().distanceMeters).toBe(45);
    expect(tuna.getState().maxStamina).toBeGreaterThan(trout.getState().maxStamina);
  });

  it("makes a tuna resist a greedy reel materially longer than a trout", () => {
    const greedy = (speciesId: "fish.trout" | "fish.tuna", rodId: string, startDistance: number) => {
      const encounter = new FishingEncounter(
        makeFish(speciesId, speciesId === "fish.trout" ? 3.2 : 35),
        rodId,
        new SeededRng(7),
        startDistance
      );
      let result: FishingEncounterState["result"] = "active";
      for (let step = 0; step < 1200 && result === "active"; step++) {
        encounter.setInput({ isReeling: true, isSlacking: false, isBracing: false, rodDirectionAngle: 0 });
        result = encounter.tick(0.25);
      }
      return { result, seconds: encounter.getState().elapsedSeconds };
    };
    const trout = greedy("fish.trout", "rod.willow", 20);
    const tuna = greedy("fish.tuna", "rod.heavy_sport", 45);
    expect(trout.result).toBe("landed");
    expect(tuna.seconds).toBeGreaterThan(trout.seconds * 1.5);
  });
});

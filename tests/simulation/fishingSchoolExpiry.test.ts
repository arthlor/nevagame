import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import type { GameState } from "../../src/simulation/core/types";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";

function lakeSchoolId(sim: Simulation): string {
  const lake = SCHOOL_SPAWN_POINTS.find(
    (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
  )!;
  return Object.values(sim.state.world.activeSchools).find(
    (school) => school.habitatId === "lake" && school.x === lake.x && school.z === lake.z
  )!.id;
}

function landForTest(sim: Simulation): void {
  sim.clock.setSpeed(0);
  for (let step = 0; step < 400; step += 1) {
    if (sim.state.sportFishing?.awaitingLandingChoice) return;
    const state = sim.activeFishingEncounter?.getState();
    if (!state) throw new Error("encounter ended before landing");
    const isReeling = state.lineTension < 70;
    const isBracing = state.behavior === "dive" || state.behavior === "burst";
    const isSlacking = state.lineTension > 80;
    sim.setSportFishingInput({
      isReeling: isReeling && !isSlacking,
      isSlacking,
      isBracing,
      rodDirectionAngle: -state.fishDirection
    });
    sim.tick(0.5);
  }
  throw new Error("fight did not land");
}

function pressureForLake(state: GameState) {
  return Object.values(state.world.fishingPressureByHabitat).find(
    (pressure) => pressure.ecologyId === "ecology.neva" && pressure.habitatId === "lake"
  );
}

function expectValidSave(sim: Simulation): void {
  expect(validateSaveEnvelope({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAtUtcMs: 1,
    state: sim.state
  })).toBe(true);
}

describe("sport-fishing school expiry around the landing choice", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("keeps the school through an expired pending choice, then counts one kept catch across reload", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const schoolId = lakeSchoolId(sim);
    landForTest(sim);

    const school = sim.state.world.activeSchools[schoolId];
    school.expiresAtMinute = sim.state.clock.currentMinute + 1;
    sim.clock.setSpeed(1);
    sim.tick(1);

    expect(sim.state.clock.currentMinute).toBe(school.expiresAtMinute);
    expect(sim.state.sportFishing?.awaitingLandingChoice).toBe(true);
    expect(sim.state.world.activeSchools[schoolId]).toBeDefined();
    expect(pressureForLake(sim.state)).toBeUndefined();
    expectValidSave(sim);

    const pendingState = structuredClone(sim.state);
    const fightElapsedBeforeOffline = pendingState.sportFishing!.elapsedSeconds;
    const offline = applyOfflineProgression(
      pendingState,
      pendingState.metadata.lastSavedUtcMs + 5_000
    );
    expect(offline.simulatedGameMinutes).toBe(5);
    expect(pendingState.sportFishing?.elapsedSeconds).toBe(fightElapsedBeforeOffline);
    expect(pendingState.world.activeSchools[schoolId]).toBeDefined();
    expect(pressureForLake(pendingState)).toBeUndefined();
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: pendingState.metadata.lastSavedUtcMs,
      state: pendingState
    })).toBe(true);

    const reloaded = new Simulation(pendingState);
    expect(reloaded.state.sportFishing?.awaitingLandingChoice).toBe(true);
    reloaded.tick(0.1);
    expect(reloaded.state.world.activeSchools[schoolId]).toBeDefined();
    expectValidSave(reloaded);

    const keep = reloaded.execute({ type: "fishing.keep-catch" });
    expect(keep.success).toBe(true);
    expect(reloaded.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
    expect(reloaded.execute({ type: "fishing.keep-catch" }).success).toBe(false);

    reloaded.tick(1);
    expect(reloaded.state.world.activeSchools[schoolId]).toBeUndefined();
    const pressure = pressureForLake(reloaded.state)!;
    expect(pressure.recentCatchCount).toBe(1);
    expect(pressure.cooldownUntilMinute - pressure.lastEndedMinute).toBe(110);
    expect(Object.values(reloaded.state.fishCargo).filter((cargo) => cargo.speciesId === "fish.trout")).toHaveLength(1);
    expect(reloaded.state.journal.fishRecords["fish.trout"]?.catchCount).toBe(1);

    const pressureAfterRepeatExpiry = structuredClone(pressure);
    reloaded.tick(1);
    expect(pressureForLake(reloaded.state)).toEqual(pressureAfterRepeatExpiry);
  });

  it("does not consume school potential when an expired pending catch is released", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const schoolId = lakeSchoolId(sim);
    landForTest(sim);

    const school = sim.state.world.activeSchools[schoolId];
    school.expiresAtMinute = sim.state.clock.currentMinute + 1;
    sim.clock.setSpeed(1);
    sim.tick(1);

    expect(sim.state.world.activeSchools[schoolId]).toBeDefined();
    expect(sim.execute({ type: "fishing.release-catch" }).success).toBe(true);
    expect(sim.execute({ type: "fishing.release-catch" }).success).toBe(false);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
    expect(pressureForLake(sim.state)).toBeUndefined();

    sim.tick(1);
    expect(sim.state.world.activeSchools[schoolId]).toBeUndefined();
    const pressure = pressureForLake(sim.state)!;
    expect(pressure.recentCatchCount).toBe(0);
    expect(pressure.cooldownUntilMinute - pressure.lastEndedMinute).toBe(90);

    const pressureAfterRepeatExpiry = structuredClone(pressure);
    sim.tick(1);
    expect(pressureForLake(sim.state)).toEqual(pressureAfterRepeatExpiry);
  });
});

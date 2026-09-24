import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { SPORT_FISHING_WORK_COST_BY_CLASS } from "../../src/simulation/domains/FishingDomain";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";

describe("saved sport-fishing Work charge", () => {
  it("accepts a real discounted charge even when Fishing rank changes during the fight", () => {
    const simulation = new Simulation();
    simulation.state.player.proficiencies.fishing = 60_000;
    hookLakeTroutForTest(simulation);
    const charged = simulation.state.sportFishing!.workCharged!;
    expect(charged).toBeGreaterThan(0);
    expect(charged).toBeLessThan(SPORT_FISHING_WORK_COST_BY_CLASS.small);

    // A quest can grant XP during the encounter. Validation cannot reprice a
    // saved hook using the player's current rank or equipment.
    simulation.state.player.proficiencies.fishing = 0;
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: simulation.state
    };
    expect(validateSaveEnvelope(envelope)).toBe(true);

    // Old in-flight fights predate the captured charge and use a bounded
    // fallback quote when they resolve.
    delete simulation.state.sportFishing!.workCharged;
    expect(validateSaveEnvelope(envelope)).toBe(true);
  });

  it("rejects charges that could over-refund the hooked fish's class", () => {
    const simulation = new Simulation();
    hookLakeTroutForTest(simulation);
    const encounter = simulation.state.sportFishing!;
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: simulation.state
    };
    expect(encounter.fish.speciesId).toBe("fish.trout");
    encounter.workCharged = SPORT_FISHING_WORK_COST_BY_CLASS.small;
    expect(validateSaveEnvelope(envelope)).toBe(true);

    for (const invalid of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      SPORT_FISHING_WORK_COST_BY_CLASS.small + 1,
      SPORT_FISHING_WORK_COST_BY_CLASS.gargantuan,
      "18",
      null
    ]) {
      (encounter as unknown as { workCharged: unknown }).workCharged = invalid;
      expect(validateSaveEnvelope(envelope), `workCharged=${String(invalid)}`).toBe(false);
    }
  });
});

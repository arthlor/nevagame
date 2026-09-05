import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  familiarityWeightMultiplier,
  groundFamiliarityLevel
} from "../../src/simulation/domains/FishingDomain";

function bridgePlayer(sim: Simulation): void {
  const bridge = WorldLayout.landmark("bridge");
  sim.state.player.x = bridge.x;
  sim.state.player.z = bridge.z;
}

/** A trout school floating near the bridge player, inserted as plain state. */
function bridgeSchool(sim: Simulation, dxMetres: number): void {
  const bridge = WorldLayout.landmark("bridge");
  sim.state.world.activeSchools["school.test_trout"] = {
    id: "school.test_trout",
    ecologyId: "ecology.neva",
    habitatId: "river",
    x: bridge.x + dxMetres,
    z: bridge.z,
    radius: 8,
    spawnedAtMinute: 0,
    expiresAtMinute: 180,
    remainingCatchPotential: 3,
    speciesWeights: [{ speciesId: "fish.trout", weight: 80 }]
  };
}

describe("reading the water", () => {
  it("reports conditions and the local pool to a novice, with no school sense", () => {
    const sim = new Simulation();
    bridgePlayer(sim);
    bridgeSchool(sim, 20);
    const rngBefore = sim.rng.getState();
    const reading = sim.inspectWaterReading();
    expect(reading).not.toBeNull();
    expect(reading?.habitatId).toBe("river");
    expect(reading?.ecologyId).toBe("ecology.neva");
    expect(reading?.likelySpeciesNames).toContain("Rainbow Trout");
    expect(reading?.schoolHint).toBeNull();
    expect(reading?.brief).toContain("Rainbow Trout");
    // A read is a pure query: the gameplay RNG stream must not advance.
    expect(sim.rng.getState()).toBe(rngBefore);
  });

  it("senses nearby feeding at Skilled without naming anything", () => {
    const sim = new Simulation();
    bridgePlayer(sim);
    bridgeSchool(sim, 20);
    sim.state.player.proficiencies.fishing = 3000;
    const reading = sim.inspectWaterReading();
    expect(reading?.schoolHint).toEqual({ level: "nearby" });
    expect(reading?.brief).toContain("feeding nearby");
  });

  it("places distant feeding water at Expert, and names its holding at Master", () => {
    const expert = new Simulation();
    bridgePlayer(expert);
    bridgeSchool(expert, 100);
    expert.state.player.proficiencies.fishing = 7500;
    const expertReading = expert.inspectWaterReading();
    expect(expertReading?.schoolHint?.level).toBe("ranged");
    expect(expertReading?.schoolHint?.distanceBand).toBe("far off");
    expect(expertReading?.schoolHint?.speciesNames).toBeUndefined();

    const master = new Simulation();
    bridgePlayer(master);
    bridgeSchool(master, 100);
    master.state.player.proficiencies.fishing = 15000;
    const masterReading = master.inspectWaterReading();
    expect(masterReading?.schoolHint?.level).toBe("ranged");
    expect(masterReading?.schoolHint?.speciesNames).toContain("Rainbow Trout");
    expect(masterReading?.brief).toContain("Rainbow Trout");
  });

  it("stays quiet with no school in range, and returns null away from water", () => {
    const sim = new Simulation();
    bridgePlayer(sim);
    sim.state.player.proficiencies.fishing = 15000;
    expect(sim.inspectWaterReading()?.schoolHint).toBeNull();

    sim.state.player.x = -65;
    sim.state.player.z = -55;
    expect(sim.inspectWaterReading()).toBeNull();
  });

  it("names ground familiarity from journal catches, with no stored memory", () => {
    expect(groundFamiliarityLevel(0)).toBe(0);
    expect(groundFamiliarityLevel(1)).toBe(0);
    expect(groundFamiliarityLevel(2)).toBe(1);
    expect(groundFamiliarityLevel(6)).toBe(2);
    expect(groundFamiliarityLevel(12)).toBe(3);
    expect(groundFamiliarityLevel(40)).toBe(3);
    expect(familiarityWeightMultiplier(0)).toBe(1);
    expect(familiarityWeightMultiplier(1)).toBeCloseTo(1.25, 5);
    expect(familiarityWeightMultiplier(2)).toBeCloseTo(1.5, 5);
    expect(familiarityWeightMultiplier(3)).toBeCloseTo(1.75, 5);
    expect(familiarityWeightMultiplier(9)).toBeCloseTo(1.75, 5);

    const strange = new Simulation();
    bridgePlayer(strange);
    expect(strange.inspectWaterReading()?.familiarityLabel).toBeNull();

    const regular = new Simulation();
    bridgePlayer(regular);
    regular.state.journal.fishRecords["fish.trout"] = {
      discovered: true,
      catchCount: 6,
      largestWeightKg: 5,
      bestQuality: "fine",
      firstCaughtMinute: 0
    };
    const reading = regular.inspectWaterReading();
    expect(reading?.familiarityLabel).toBe("well-known water");
    expect(reading?.brief).toContain("well-known water");
  });
});

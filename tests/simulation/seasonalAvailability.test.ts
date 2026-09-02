import { describe, it, expect } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { SEASONS, DAYS_PER_SEASON, MINUTES_PER_DAY } from "../../src/simulation/core/GameClock";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import {
  speciesSeasonWeight,
  isSpeciesInSeason,
  PEAK_SEASON_WEIGHT,
  SHOULDER_SEASON_WEIGHT
} from "../../src/simulation/fishing/seasonalAvailability";
import type { SeasonId } from "../../src/simulation/core/types";

/**
 * Regression cover for the dead-habitat defect: every offshore species in the
 * catalog is authored summer/autumn/winter, so a hard `seasons.includes(...)`
 * gate left `offshore` with an empty species pool in spring — and spring is
 * where every real playthrough lives. No offshore school could ever spawn.
 */
describe("seasonal availability", () => {
  const allSpecies = () => Array.from(ContentRegistry.fishSpecies.values());

  it("weights a species at full strength inside its authored seasons", () => {
    const marlin = ContentRegistry.fishSpecies.get("fish.blue_marlin")!;
    expect(marlin.seasons).toContain("summer");
    expect(speciesSeasonWeight(marlin, "summer")).toBe(PEAK_SEASON_WEIGHT);
    expect(speciesSeasonWeight(marlin, "autumn")).toBe(PEAK_SEASON_WEIGHT);
  });

  it("weights shoulder seasons thin but non-zero, and treats the calendar as a ring", () => {
    const marlin = ContentRegistry.fishSpecies.get("fish.blue_marlin")!;
    // summer/autumn authored -> spring and winter are both one step away.
    expect(speciesSeasonWeight(marlin, "spring")).toBe(SHOULDER_SEASON_WEIGHT);
    expect(speciesSeasonWeight(marlin, "winter")).toBe(SHOULDER_SEASON_WEIGHT);

    // winter <-> spring must wrap, not read as three steps apart.
    const swordfish = ContentRegistry.fishSpecies.get("fish.swordfish")!;
    expect(swordfish.seasons).toContain("winter");
    expect(speciesSeasonWeight(swordfish, "spring")).toBe(SHOULDER_SEASON_WEIGHT);
  });

  it("returns zero for a season opposite every authored season", () => {
    const sailfish = ContentRegistry.fishSpecies.get("fish.sailfish")!;
    expect(sailfish.seasons).toEqual(["summer"]);
    expect(speciesSeasonWeight(sailfish, "winter")).toBe(0);
    expect(isSpeciesInSeason(sailfish, "winter")).toBe(false);
  });

  it("makes every species reachable in at least three of four seasons", () => {
    for (const fish of allSpecies()) {
      const reachable = SEASONS.filter((season) => isSpeciesInSeason(fish, season));
      expect(
        reachable.length,
        `${fish.id} is reachable in only ${reachable.length} season(s): ${reachable.join(", ")}`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves no sport-fishing habitat empty in any season", () => {
    const habitats = Array.from(new Set(SCHOOL_SPAWN_POINTS.map((point) => point.habitatId)));
    expect(habitats).toContain("offshore");

    for (const season of SEASONS) {
      for (const habitatId of habitats) {
        const eligible = allSpecies().filter(
          (fish) =>
            fish.isSportFish &&
            fish.habitats.includes(habitatId) &&
            isSpeciesInSeason(fish, season)
        );
        expect(
          eligible.length,
          `habitat '${habitatId}' has no sport species in ${season}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("spawns an offshore school in spring, through the live simulation", () => {
    const sim = new Simulation();
    const offshore = SCHOOL_SPAWN_POINTS.find((point) => point.habitatId === "offshore")!;
    expect(sim.state.clock.season).toBe("spring");

    const schoolId = sim.spawnFishSchool(
      offshore.habitatId,
      offshore.x,
      offshore.z,
      ["fish.blue_marlin"]
    );
    const school = sim.state.world.activeSchools[schoolId];
    expect(school).toBeDefined();
    expect(school.speciesWeights.length).toBeGreaterThan(0);
    // Present, but thin: a shoulder-season school is rarer than a peak one.
    expect(school.speciesWeights.every((entry) => entry.weight > 0)).toBe(true);
  });

  it("scales school density with the season rather than gating on it", () => {
    const springSim = new Simulation();
    const offshore = SCHOOL_SPAWN_POINTS.find((point) => point.habitatId === "offshore")!;
    const springId = springSim.spawnFishSchool(offshore.habitatId, offshore.x, offshore.z, [
      "fish.blue_marlin"
    ]);
    const springWeight = springSim.state.world.activeSchools[springId].speciesWeights[0].weight;

    const summerSim = new Simulation();
    summerSim.setDebugMinute(DAYS_PER_SEASON * MINUTES_PER_DAY + 10 * 60);
    expect(summerSim.state.clock.season as SeasonId).toBe("summer");
    const summerId = summerSim.spawnFishSchool(offshore.habitatId, offshore.x, offshore.z, [
      "fish.blue_marlin"
    ]);
    const summerWeight = summerSim.state.world.activeSchools[summerId].speciesWeights[0].weight;

    expect(summerWeight).toBeGreaterThan(springWeight);
  });
});

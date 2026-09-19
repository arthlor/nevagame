import { beforeEach, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { Simulation } from "../../src/simulation/Simulation";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { SPORT_FISHING_LANDING_WORK_REBATE } from "../../src/simulation/domains/FishingDomain";
import { sportFishLandingXp, sportFishReleaseXp } from "../../src/simulation/economy/calculateFishXp";
import { hookLakeTroutForTest } from "./sportFishingTestUtils";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";

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
  for (let step = 0; step < 400; step++) {
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

function expectedLandingXp(sim: Simulation): number {
  const species = ContentRegistry.fishSpecies.get(sim.state.sportFishing!.fish.speciesId)!;
  return sportFishLandingXp(species, sim.state.sportFishing!.fish.weightKg, sim.state.sportFishing!.fish.quality);
}

describe("sport-fishing landing choice", () => {
  beforeEach(() => ContentRegistry.initializeAndValidate());

  it("holds a won fight until the angler chooses, without stowing or escaping", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const schoolId = lakeSchoolId(sim);
    const xpBefore = sim.state.player.proficiencies.fishing;
    const fishingCargoBefore = Object.keys(sim.state.fishCargo).length;

    landForTest(sim);

    expect(sim.state.sportFishing?.result).toBe("landed");
    expect(sim.state.sportFishing?.awaitingLandingChoice).toBe(true);
    expect(sim.activeFishingEncounter).not.toBeNull();
    expect(Object.keys(sim.state.fishCargo).length).toBe(fishingCargoBefore);
    expect(sim.state.player.proficiencies.fishing).toBe(xpBefore);
    expect(sim.state.journal.fishRecords["fish.trout"]).toBeUndefined();
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
    const hud = sim.inspectSportFishingHud();
    expect(hud?.awaitingLandingChoice).toBe(true);
    expect(hud?.keepAvailable).toBe(true);
    expect(validateSaveEnvelope({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      savedAtUtcMs: 1,
      state: sim.state
    })).toBe(true);
  });

  it("stows on keep, consumes the school catch and pays the landing reward once", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const schoolId = lakeSchoolId(sim);
    landForTest(sim);
    const xpBefore = sim.state.player.proficiencies.fishing;
    sim.state.player.workCapacity.current = 10;
    const workBefore = sim.state.player.workCapacity.current;
    const landed: string[] = [];
    sim.events.on("FishLanded", (event) => landed.push(event.speciesId));

    const keep = sim.execute({ type: "fishing.keep-catch" });

    expect(keep.success).toBe(true);
    expect(landed).toEqual(["fish.trout"]);
    expect(sim.activeFishingEncounter).toBeNull();
    expect(sim.state.sportFishing).toBeNull();
    const cargo = Object.values(sim.state.fishCargo).find((entry) => entry.speciesId === "fish.trout")!;
    expect(cargo).toBeDefined();
    expect(cargo.location.type).toBe("player");
    expect(sim.state.player.carriedFishCargoId).toBe(cargo.id);
    expect(sim.state.player.proficiencies.fishing).toBeGreaterThan(xpBefore);
    expect(sim.state.player.workCapacity.current).toBe(workBefore + SPORT_FISHING_LANDING_WORK_REBATE);
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
    expect(sim.state.journal.fishRecords["fish.trout"]?.catchCount).toBe(1);
  });

  it("records the landing XP only through the keep path, at the landing amount", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    landForTest(sim);
    const xpBefore = sim.state.player.proficiencies.fishing;
    const landingXp = expectedLandingXp(sim);

    sim.execute({ type: "fishing.keep-catch" });

    expect(sim.state.player.proficiencies.fishing - xpBefore).toBe(landingXp);
  });

  it("releases without cargo or school consumption, for a smaller XP share", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    const schoolId = lakeSchoolId(sim);
    landForTest(sim);
    const species = ContentRegistry.fishSpecies.get("fish.trout")!;
    const fish = sim.state.sportFishing!.fish;
    const xpBefore = sim.state.player.proficiencies.fishing;
    const released: string[] = [];
    sim.events.on("SportFishReleased", (event) => released.push(event.speciesId));

    const release = sim.execute({ type: "fishing.release-catch" });

    expect(release.success).toBe(true);
    expect(released).toEqual(["fish.trout"]);
    expect(Object.values(sim.state.fishCargo).some((entry) => entry.speciesId === "fish.trout")).toBe(false);
    expect(sim.state.journal.fishRecords["fish.trout"]).toBeUndefined();
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
    const gained = sim.state.player.proficiencies.fishing - xpBefore;
    const landingXp = sportFishLandingXp(species, fish.weightKg, fish.quality);
    expect(gained).toBe(sportFishReleaseXp(species, fish.weightKg, fish.quality));
    expect(gained).toBeLessThan(landingXp);
    expect(gained).toBeGreaterThan(0);
  });

  it("keeps the pending choice through save and reload", () => {
    const sim = new Simulation();
    hookLakeTroutForTest(sim);
    landForTest(sim);
    const schoolId = lakeSchoolId(sim);

    const reloaded = new Simulation(structuredClone(sim.state));
    expect(reloaded.state.sportFishing?.awaitingLandingChoice).toBe(true);
    expect(reloaded.inspectSportFishingHud()?.awaitingLandingChoice).toBe(true);

    const release = reloaded.execute({ type: "fishing.release-catch" });
    expect(release.success).toBe(true);
    expect(reloaded.activeFishingEncounter).toBeNull();
    expect(reloaded.state.sportFishing).toBeNull();
    expect(reloaded.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(3);
  });
});

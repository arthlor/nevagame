import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { BasicFishingMinigame } from "../../src/simulation/fishing/BasicFishingMinigame";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";
import type { FishQuality } from "../../src/simulation/core/types";

function lakeTroutSchool(sim: Simulation): string {
  const lake = SCHOOL_SPAWN_POINTS.find(
    (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
  )!;
  const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
  sim.state.player.x = lake.x;
  sim.state.player.z = lake.z;
  expect(sim.chumFishSchool(schoolId).success).toBe(true);
  return schoolId;
}

/** Wins the active fight instantly, with a fixed weight/quality for the record ladder. */
function landWith(sim: Simulation, schoolId: string, weightKg: number, quality: FishQuality): void {
  expect(sim.hookSportFish(schoolId).success).toBe(true);
  sim.state.sportFishing!.fish.weightKg = weightKg;
  sim.state.sportFishing!.fish.quality = quality;
  sim.state.sportFishing!.stamina = 0;
  sim.state.sportFishing!.distanceMeters = 0.5;
  sim.state.sportFishing!.lineTension = 35;
  sim.state.sportFishing!.dynamics!.landReadySeconds = 1;
  sim.tick(0.1);
  expect(sim.state.sportFishing).toBeNull();
}

function freeCarry(sim: Simulation): void {
  const carried = sim.state.player.carriedFishCargoId;
  if (carried) {
    expect(sim.execute({ type: "cargo.discard", cargoId: carried })).toMatchObject({ success: true });
  }
}

describe("landmark catch records", () => {
  it("flags first, heaviest and finest sport landings in priority order", () => {
    const sim = new Simulation();
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 2 }]);
    const records: Array<string | undefined> = [];
    sim.events.on("FishLanded", (event) => records.push(event.record));

    const first = lakeTroutSchool(sim);
    landWith(sim, first, 3.0, "common");
    freeCarry(sim);
    landWith(sim, first, 7.5, "common");
    freeCarry(sim);
    landWith(sim, first, 1.0, "exceptional");
    freeCarry(sim);
    // The first school is spent (3 of 3); a fresh school keeps the ladder honest.
    const second = lakeTroutSchool(sim);
    landWith(sim, second, 1.0, "common");

    expect(records).toEqual(["first", "weight", "quality", undefined]);
    const journal = sim.state.journal.fishRecords["fish.trout"];
    expect(journal.catchCount).toBe(4);
    expect(journal.largestWeightKg).toBe(7.5);
    expect(journal.bestQuality).toBe("exceptional");
  });

  it("flags first and finest basic catches, which have no weight axis", () => {
    const sim = new Simulation();
    const records: Array<string | undefined> = [];
    sim.events.on("BasicFishingResolved", (event) => records.push(event.record));

    const commit = (quality: FishQuality): void => {
      const attempt = BasicFishingMinigame.createInitialState(
        "river", "fish.perch", 0.8, "rod.willow", 0, false,
        sim.rng, "clear", "day", "ecology.neva"
      );
      attempt.phase = "caught";
      attempt.quality = quality;
      sim.state.basicFishing = attempt;
      expect(sim.execute({ type: "fishing.commit-basic" })).toMatchObject({ success: true });
    };
    commit("fine");
    commit("common");

    expect(records).toEqual(["first", undefined]);
    expect(sim.state.journal.fishRecords["fish.perch"].bestQuality).toBe("fine");
  });
});

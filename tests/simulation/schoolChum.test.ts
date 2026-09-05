import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import {
  DEEP_CHUM_SINKER_MULTIPLIER,
  SCHOOL_SPAWN_POINTS,
  deepChumWeightMultiplier
} from "../../src/simulation/domains/FishingDomain";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import saveV29Layout10 from "../fixtures/save_v29_layout10.json";

function lakePoint(): { x: number; z: number } {
  return SCHOOL_SPAWN_POINTS.find(
    (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
  )!;
}

function stock(sim: Simulation, items: Array<{ itemId: string; quantity: number }>): void {
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  InventoryManager.addItemsAtomically(inventory, items);
}

function chummedSchool(sim: Simulation, speciesIds: string[]): string {
  const lake = lakePoint();
  const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, speciesIds as never[]);
  sim.state.player.x = lake.x;
  sim.state.player.z = lake.z;
  return schoolId;
}

describe("specialty chum", () => {
  it("casts the strongest scent first and sets its frenzy window", () => {
    const sim = new Simulation();
    stock(sim, [
      { itemId: "item.chum_bucket", quantity: 1 },
      { itemId: "item.chum_rich", quantity: 1 },
      { itemId: "item.chum_deep", quantity: 1 }
    ]);
    const frenzies: number[] = [];
    sim.events.on("FishSchoolChummed", (event) => frenzies.push(event.frenzyMinutes));

    const now = sim.state.clock.currentMinute;
    const first = chummedSchool(sim, ["fish.trout"]);
    expect(sim.chumFishSchool(first).success).toBe(true);
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    expect(InventoryManager.getItemCount(inventory, "item.chum_deep")).toBe(0);
    expect(InventoryManager.getItemCount(inventory, "item.chum_rich")).toBe(1);
    expect(InventoryManager.getItemCount(inventory, "item.chum_bucket")).toBe(1);
    expect(sim.state.world.activeSchools[first].feedingFrenzyUntilMinute).toBe(now + 45);
    expect(sim.state.world.activeSchools[first].deepChumUntilMinute).toBe(now + 45);

    const second = chummedSchool(sim, ["fish.trout"]);
    expect(sim.chumFishSchool(second).success).toBe(true);
    expect(InventoryManager.getItemCount(inventory, "item.chum_rich")).toBe(0);
    expect(InventoryManager.getItemCount(inventory, "item.chum_bucket")).toBe(1);
    expect(sim.state.world.activeSchools[second].feedingFrenzyUntilMinute).toBe(
      sim.state.clock.currentMinute + 60
    );
    expect(sim.state.world.activeSchools[second].deepChumUntilMinute).toBeUndefined();

    const third = chummedSchool(sim, ["fish.trout"]);
    expect(sim.chumFishSchool(third).success).toBe(true);
    expect(sim.state.world.activeSchools[third].feedingFrenzyUntilMinute).toBe(
      sim.state.clock.currentMinute + 30
    );
    expect(frenzies).toEqual([45, 60, 30]);
  });

  it("leans the hook roll toward sinker species while deep scent holds", () => {
    expect(deepChumWeightMultiplier("sinker", true)).toBe(DEEP_CHUM_SINKER_MULTIPLIER);
    expect(deepChumWeightMultiplier("sinker", false)).toBe(1);
    expect(deepChumWeightMultiplier("dart", true)).toBe(1);
    expect(deepChumWeightMultiplier(undefined, true)).toBe(1);

    const sim = new Simulation();
    sim.state.player.equippedRodId = "rod.river";
    sim.state.player.ownedRodIds = ["rod.willow", "rod.river"];
    stock(sim, [{ itemId: "item.chum_deep", quantity: 1 }]);
    const schoolId = chummedSchool(sim, ["fish.trout", "fish.catfish"]);
    expect(sim.chumFishSchool(schoolId).success).toBe(true);

    // Three hooks off one school at ~75% catfish each: a school this certain
    // of trout would acquit the lean of doing anything at all.
    const hooked: string[] = [];
    for (let fight = 0; fight < 3; fight += 1) {
      expect(sim.hookSportFish(schoolId).success).toBe(true);
      hooked.push(sim.state.sportFishing!.fish.speciesId);
      sim.state.sportFishing!.stamina = 0;
      sim.state.sportFishing!.distanceMeters = 0.5;
      sim.state.sportFishing!.lineTension = 35;
      sim.state.sportFishing!.dynamics!.landReadySeconds = 1;
      sim.tick(0.1);
      const carried = sim.state.player.carriedFishCargoId!;
      expect(sim.execute({ type: "cargo.discard", cargoId: carried }).success).toBe(true);
    }
    expect(hooked.filter((speciesId) => speciesId === "fish.catfish").length).toBeGreaterThan(0);
  });
});

describe("schema v30 school migration", () => {
  it("carries a v29 save across with its schools intact and valid", () => {
    const migrated = migrateSaveData({
      schemaVersion: 29,
      savedAtUtcMs: 1,
      state: saveV29Layout10.state as never,
      checksum: "dummy_checksum"
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const school = migrated.state.world.activeSchools["school.fixture_trout"];
    expect(school).toBeDefined();
    expect(school.remainingCatchPotential).toBe(3);
    expect("deepChumUntilMinute" in school).toBe(false);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("scrubs a malformed deep-chum value instead of failing the save", () => {
    const legacy = JSON.parse(JSON.stringify(saveV29Layout10.state)) as {
      world: { activeSchools: Record<string, Record<string, unknown>> };
    };
    legacy.world.activeSchools["school.fixture_trout"].deepChumUntilMinute = "soon";
    const migrated = migrateSaveData({
      schemaVersion: 29,
      savedAtUtcMs: 1,
      state: legacy as never,
      checksum: "dummy_checksum"
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(
      migrated.state.world.activeSchools["school.fixture_trout"].deepChumUntilMinute
    ).toBeUndefined();
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });
});

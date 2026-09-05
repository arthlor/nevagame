import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { SCHOOL_SPAWN_POINTS } from "../../src/simulation/domains/FishingDomain";

function chummedLakeSchool(sim: Simulation): string {
  const lake = SCHOOL_SPAWN_POINTS.find(
    (point) => point.ecologyId === "ecology.neva" && point.habitatId === "lake"
  )!;
  const inventory = sim.state.inventories[sim.state.player.inventoryId];
  InventoryManager.addItemsAtomically(inventory, [{ itemId: "item.chum_bucket", quantity: 1 }]);
  const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
  sim.state.player.x = lake.x;
  sim.state.player.z = lake.z;
  expect(sim.chumFishSchool(schoolId).success).toBe(true);
  return schoolId;
}

function instantLand(sim: Simulation, schoolId: string): string {
  expect(sim.hookSportFish(schoolId).success).toBe(true);
  sim.state.sportFishing!.stamina = 0;
  sim.state.sportFishing!.distanceMeters = 0.5;
  sim.state.sportFishing!.lineTension = 35;
  sim.state.sportFishing!.dynamics!.landReadySeconds = 1;
  sim.tick(0.1);
  expect(sim.state.sportFishing).toBeNull();
  const carried = sim.state.player.carriedFishCargoId;
  expect(carried).not.toBeNull();
  return carried!;
}

describe("catch and release", () => {
  it("frees the slot with no payout while school and journal stand consumed", () => {
    const sim = new Simulation();
    const schoolId = chummedLakeSchool(sim);
    const released: Array<{ speciesId: string }> = [];
    sim.events.on("FishReleased", (event) => released.push({ speciesId: event.speciesId }));

    const cargoId = instantLand(sim, schoolId);
    const scrapsBefore = InventoryManager.getItemCount(
      sim.state.inventories[sim.state.player.inventoryId],
      "item.fish_scraps"
    );
    expect(sim.execute({ type: "cargo.release", cargoId })).toMatchObject({ success: true });

    expect(sim.state.fishCargo[cargoId]).toBeUndefined();
    expect(sim.state.player.carriedFishCargoId).toBeNull();
    expect(released).toEqual([{ speciesId: "fish.trout" }]);
    // No material return for a release.
    expect(
      InventoryManager.getItemCount(sim.state.inventories[sim.state.player.inventoryId], "item.fish_scraps")
    ).toBe(scrapsBefore);
    // The landing already consumed the school and wrote the journal: release
    // can never farm either of them.
    expect(sim.state.world.activeSchools[schoolId].remainingCatchPotential).toBe(2);
    expect(sim.state.journal.fishRecords["fish.trout"].catchCount).toBe(1);

    // The freed slot hooks again.
    expect(sim.hookSportFish(schoolId).success).toBe(true);

    // Releasing twice fails cleanly.
    expect(sim.execute({ type: "cargo.release", cargoId })).toMatchObject({
      success: false,
      reason: "Fish cargo not found"
    });
  });

  it("refuses a spoiled fish and points at scraps instead", () => {
    const sim = new Simulation();
    const schoolId = chummedLakeSchool(sim);
    const cargoId = instantLand(sim, schoolId);
    sim.state.fishCargo[cargoId]!.freshness = 0;
    expect(sim.execute({ type: "cargo.release", cargoId })).toMatchObject({
      success: false,
      reason: "The fish is spoiled — make scraps instead"
    });
    expect(sim.state.fishCargo[cargoId]).toBeDefined();
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { NavigationDomain } from "../../src/simulation/domains/NavigationDomain";
import { isStarterTeachingSchool } from "../../src/simulation/domains/FishingDomain";
import { WorldLayout } from "../../src/world/WorldLayout";
import { nearestMooring } from "../../src/world/WorldMoorings";

function skiffAboardWithNoFuel(sim: Simulation): void {
  expect(sim.prepareDebugSkiffReview()).toBe(true);
  const boat = sim.state.boats["boat.player_skiff"];
  boat.fuel = 0;
  // Sail far from any dock so the tow has somewhere to go.
  expect(sim.setDebugBoatDriving("boat.player_skiff", { x: 200, z: 200, headingRadians: 0 })).toBe(true);
  expect(sim.state.player.activeBoatId).toBe("boat.player_skiff");
}

describe("emergency tow", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
  });

  it("docks the skiff at a mooring for a flat fee with cargo and fuel untouched", () => {
    skiffAboardWithNoFuel(sim);
    sim.state.player.money = 100;
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);

    const docked: Array<{ boatId: string }> = [];
    sim.events.on("BoatDocked", (event) => docked.push({ boatId: event.boatId }));

    const result = sim.execute({ type: "boat.emergency-tow" });
    expect(result).toMatchObject({ success: true });

    const boat = sim.state.boats["boat.player_skiff"];
    const mooring = nearestMooring(200, 200, "boat.skiff");
    expect(sim.state.player.money).toBe(100 - NavigationDomain.EMERGENCY_TOW_COST);
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBe(mooring.marketId);
    expect({ x: boat.x, z: boat.z }).toEqual({ x: mooring.boatPosition.x, z: mooring.boatPosition.z });
    expect(boat.speed).toBe(0);
    expect(boat.fuel).toBe(0);
    expect(sim.state.player.activeBoatId).toBeNull();
    expect(docked).toHaveLength(1);
  });

  it("refuses when there is nothing to tow", () => {
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({
      success: false,
      reason: "Board a boat before signaling a tow"
    });

    // The oar-powered rowboat needs no tow.
    sim.state.player.activeBoatId = "boat.player_rowboat";
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({
      success: false,
      reason: "This boat needs no tow — row it home"
    });
  });

  it("refuses with fuel in the tank or an empty purse, spending nothing", () => {
    skiffAboardWithNoFuel(sim);
    sim.state.boats["boat.player_skiff"].fuel = 10;
    sim.state.player.money = 100;
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({ success: false });
    expect(sim.state.player.money).toBe(100);

    sim.state.boats["boat.player_skiff"].fuel = 0;
    sim.state.player.money = NavigationDomain.EMERGENCY_TOW_COST - 1;
    expect(sim.execute({ type: "boat.emergency-tow" })).toMatchObject({
      success: false,
      reason: `Emergency tow needs ${NavigationDomain.EMERGENCY_TOW_COST} G`
    });
    expect(sim.state.player.money).toBe(NavigationDomain.EMERGENCY_TOW_COST - 1);
    expect(sim.state.boats["boat.player_skiff"].isDocked).not.toBe(true);
  });
});

describe("act 5 teaching fight", () => {
  let sim: Simulation;

  beforeEach(() => {
    sim = new Simulation();
    sim.state.quests.tracks["track.main"].activeQuestId = "quest.act5_maiden_voyage";
  });

  it("recognizes the trout-only starter school by construction", () => {
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    const school = sim.state.world.activeSchools[schoolId];
    expect(school.ecologyId).toBe("ecology.neva");
    expect(isStarterTeachingSchool(school)).toBe(true);
  });

  it("snapshots calm water for the starter school even in a storm", () => {
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);

    sim.state.weather.type = "storm";
    sim.state.weather.seaRoughness = 0.9;
    const hook = sim.hookSportFish(schoolId);
    expect(hook.success).toBe(true);
    expect(hook.encounter?.seaConditionSnapshot.weatherType).toBe("storm");
    expect(hook.encounter?.seaConditionSnapshot.seaRoughness).toBeLessThanOrEqual(0.25);
  });

  it("leaves live sea pressure alone once the voyage is over", () => {
    sim.state.quests.tracks["track.main"].activeQuestId = "quest.act6_harbor_promise";
    const inv = sim.state.inventories[sim.state.player.inventoryId];
    InventoryManager.addItemsAtomically(inv, [{ itemId: "item.chum_bucket", quantity: 1 }]);
    const lake = { x: 18, z: WorldLayout.coastlineZ(18) + 12 };
    const schoolId = sim.spawnFishSchool("lake", lake.x, lake.z, ["fish.trout"]);
    sim.state.player.x = lake.x;
    sim.state.player.z = lake.z;
    expect(sim.chumFishSchool(schoolId).success).toBe(true);

    sim.state.weather.type = "storm";
    sim.state.weather.seaRoughness = 0.9;
    const hook = sim.hookSportFish(schoolId);
    expect(hook.success).toBe(true);
    expect(hook.encounter?.seaConditionSnapshot.seaRoughness).toBe(0.9);
  });
});

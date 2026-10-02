import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { InventoryManager } from "../../src/simulation/inventory/InventoryManager";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { mainQuestTrack } from "../../src/simulation/core/QuestTypes";
import { HARBOR_DOCK } from "../../src/world/WorldAnchors";
import { BOAT_MOORINGS, nearestMooring } from "../../src/world/WorldMoorings";
import { OCEAN_ISLETS } from "../../src/world/OceanIslets";
import { MAINLAND_LAKE, MAINLAND_RIVER } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import {
  SHORE_DOCK_REFUSAL,
  planShoreDock,
  shoreBerthAt,
  shoreHullMetrics
} from "../../src/world/ShoreBerth";
import type { BoatState } from "../../src/simulation/core/types";

function skiff(sim: Simulation): BoatState {
  const def = ContentRegistry.boats.get("boat.skiff")!;
  const boat: BoatState = {
    ...sim.state.boats["boat.player_rowboat"],
    id: "boat.player_skiff",
    boatTypeId: def.id,
    fuel: def.fuelCapacity,
    durability: def.durabilityMax,
    fishCargoSlotIds: def.fishCargoSlots.map(() => null),
    supplyInventoryId: "inventory.test_skiff"
  };
  sim.state.boats[boat.id] = boat;
  sim.state.inventories[boat.supplyInventoryId] = {
    id: boat.supplyInventoryId,
    slotCount: 8,
    slots: Array.from({ length: 8 }, () => ({}))
  };
  return boat;
}

function aboard(sim: Simulation, boat: BoatState, x: number, z: number): void {
  Object.assign(boat, { x, z, isDocked: false, dockedMarketId: null, speed: 0 });
  Object.assign(sim.state.player, { x, z, activeBoatId: boat.id, activeMountId: null });
}

function outsideAuthoredRadius(x: number, z: number, boatTypeId: string): boolean {
  const mooring = nearestMooring(x, z, boatTypeId);
  return Math.hypot(mooring.boatPosition.x - x, mooring.boatPosition.z - z) > mooring.dockRadius + 8;
}

function findApproach(
  boatTypeId: string,
  points: ReadonlyArray<readonly [number, number]>
): { x: number; z: number } | null {
  for (const [x, z] of points) {
    if (!WorldLayout.isSailable(x, z) || !outsideAuthoredRadius(x, z, boatTypeId)) continue;
    const planned = planShoreDock(x, z, 0, boatTypeId);
    if (planned.ok) return { x, z };
  }
  return null;
}

function grid(minX: number, maxX: number, minZ: number, maxZ: number, step: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let z = minZ; z <= maxZ; z += step) {
    for (let x = minX; x <= maxX; x += step) points.push([x, z]);
  }
  return points;
}

describe("shore mooring", () => {
  it("refuses to moor while the hull is still making way", () => {
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    aboard(sim, boat, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z);
    boat.speed = 2;
    expect(sim.canDockActiveBoat()).toBe(false);
    expect(sim.execute({ type: "boat.dock" })).toMatchObject({
      success: false,
      reason: "Bring the boat to a stop before mooring"
    });
    expect(sim.state.player.activeBoatId).toBe(boat.id);
    expect(boat.isDocked).toBe(false);
    expect(boat.speed).toBe(2);
    boat.speed = 0;
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(boat.isDocked).toBe(true);
    expect(boat.speed).toBe(0);
  });

  it("moors on a beach, saves, and lets the player reboard and refuel from the pad", () => {
    const approach = findApproach("boat.skiff", grid(-205, -150, -20, 90, 5));
    expect(approach, "expected a western beach the skiff can step onto").not.toBeNull();
    const sim = new Simulation();
    const boat = skiff(sim);
    aboard(sim, boat, approach!.x, approach!.z);
    expect(sim.execute({ type: "boat.dock" })).toMatchObject({ success: true });
    expect(boat.isDocked).toBe(true);
    expect(boat.dockedMarketId).toBeNull();
    expect(sim.state.player.activeBoatId).toBeNull();
    expect(WorldLayout.isWalkable(sim.state.player.x, sim.state.player.z)).toBe(true);
    expect(WorldLayout.isWater(sim.state.player.x, sim.state.player.z)).toBe(false);
    expect(Math.hypot(sim.state.player.x - boat.x, sim.state.player.z - boat.z))
      .toBeGreaterThanOrEqual(shoreHullMetrics(boat.boatTypeId).horizontalRadius);
    expect(shoreBerthAt(boat.x, boat.z, boat.headingRadians, boat.boatTypeId)).not.toBeNull();
    const save = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 0, state: sim.state };
    expect(validateSaveEnvelope(save)).toBe(true);

    boat.fuel = 10;
    InventoryManager.addItemsAtomically(sim.state.inventories[sim.state.player.inventoryId], [
      { itemId: "item.boat_fuel", quantity: 1 }
    ]);
    expect(sim.execute({ type: "boat.refuel", boatId: boat.id }).success).toBe(true);
    expect(sim.execute({ type: "boat.board", boatId: boat.id }).success).toBe(true);
    expect(boat.isDocked).toBe(false);
  });

  it("keeps the harbor snap inside a berth and wild-moors on the beach outside it", () => {
    const harbor = new Simulation();
    const rowboat = harbor.state.boats["boat.player_rowboat"];
    aboard(harbor, rowboat, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z);
    expect(harbor.execute({ type: "boat.dock" }).success).toBe(true);
    expect(rowboat.dockedMarketId).toBe("market.harbor");
    expect(rowboat.headingRadians).toBe(0);
    expect(rowboat.x).toBeCloseTo(HARBOR_DOCK.boatPosition.x);
    expect(rowboat.z).toBeCloseTo(HARBOR_DOCK.boatPosition.z);

    const beach = findApproach("boat.rowboat", grid(16, 48, 64, 78, 3));
    expect(beach, "expected a harbor beach outside every berth radius").not.toBeNull();
    const sim = new Simulation();
    const boat = sim.state.boats["boat.player_rowboat"];
    aboard(sim, boat, beach!.x, beach!.z);
    expect(sim.execute({ type: "boat.dock" })).toMatchObject({ success: true });
    expect(boat.dockedMarketId).toBeNull();
    for (const mooring of BOAT_MOORINGS) {
      if (mooring.marketId !== "market.harbor") continue;
      expect(Math.hypot(boat.x - mooring.boatPosition.x, boat.z - mooring.boatPosition.z)).toBeGreaterThan(mooring.dockRadius);
    }
  });

  it("moors on a river bank and on the forest lake", () => {
    const river = findApproach("boat.rowboat", MAINLAND_RIVER.flatMap((point) => [
      [point.x, point.z] as [number, number],
      [point.x + 4, point.z] as [number, number],
      [point.x - 4, point.z] as [number, number]
    ]));
    expect(river, "expected a mainland river bank").not.toBeNull();
    const riverSim = new Simulation();
    const riverBoat = riverSim.state.boats["boat.player_rowboat"];
    aboard(riverSim, riverBoat, river!.x, river!.z);
    expect(riverSim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(riverBoat.dockedMarketId).toBeNull();

    const lake = findApproach("boat.rowboat", grid(
      MAINLAND_LAKE.center.x - MAINLAND_LAKE.radiusX - 8,
      MAINLAND_LAKE.center.x + 8,
      MAINLAND_LAKE.center.z - MAINLAND_LAKE.radiusZ,
      MAINLAND_LAKE.center.z + MAINLAND_LAKE.radiusZ,
      4
    ));
    expect(lake, "expected a forest-lake bank").not.toBeNull();
    const lakeSim = new Simulation();
    const lakeBoat = lakeSim.state.boats["boat.player_rowboat"];
    aboard(lakeSim, lakeBoat, lake!.x, lake!.z);
    expect(lakeSim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(lakeBoat.dockedMarketId).toBeNull();
    expect(shoreBerthAt(lakeBoat.x, lakeBoat.z, lakeBoat.headingRadians, lakeBoat.boatTypeId)).not.toBeNull();
  });

  it("refuses open water, a cliff, a coaster in a narrow channel, and a coaster at an islet", () => {
    expect(planShoreDock(600, 110, 0, "boat.skiff")).toMatchObject({
      ok: false,
      reason: SHORE_DOCK_REFUSAL.approach
    });

    let cliff: string | null = null;
    for (const [x, z] of grid(140, 170, -220, -180, 4)) {
      if (!WorldLayout.isSailable(x, z)) continue;
      const planned = planShoreDock(x, z, 0, "boat.rowboat");
      if (!planned.ok && planned.reason === SHORE_DOCK_REFUSAL.steep) {
        cliff = planned.reason;
        break;
      }
    }
    expect(cliff).toBe(SHORE_DOCK_REFUSAL.steep);

    let narrow: { x: number; z: number } | null = null;
    for (let z = -90; z <= -40; z += 8) {
      const center = WorldLayout.riverCenterX(z);
      for (const x of [center - 3, center, center + 3]) {
        if (!WorldLayout.isSailable(x, z)) continue;
        const row = planShoreDock(x, z, 0, "boat.rowboat");
        const ship = planShoreDock(x, z, 0, "boat.trading_ship");
        if (row.ok && !ship.ok && ship.reason === SHORE_DOCK_REFUSAL.narrow) {
          narrow = { x, z };
          break;
        }
      }
      if (narrow) break;
    }
    expect(narrow, "expected a channel the rowboat can moor in and the coaster cannot").not.toBeNull();

    const islet = OCEAN_ISLETS[0];
    const mooring = BOAT_MOORINGS.find((entry) => entry.islandId === islet.id)!;
    const ship = planShoreDock(mooring.boatPosition.x, mooring.boatPosition.z, 0, "boat.trading_ship");
    expect(ship).toMatchObject({ ok: false, reason: SHORE_DOCK_REFUSAL.skiff });
  });

  it("does not let a second hull occupy the same hold", () => {
    const approach = findApproach("boat.rowboat", grid(-205, -150, -20, 90, 5));
    expect(approach).not.toBeNull();
    const sim = new Simulation();
    const rowboat = sim.state.boats["boat.player_rowboat"];
    aboard(sim, rowboat, approach!.x, approach!.z);
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    const boat = skiff(sim);
    aboard(sim, boat, rowboat.x, rowboat.z);
    const second = sim.execute({ type: "boat.dock" });
    const separation = Math.hypot(boat.x - rowboat.x, boat.z - rowboat.z);
    const minimum = shoreHullMetrics(rowboat.boatTypeId).horizontalRadius
      + shoreHullMetrics(boat.boatTypeId).horizontalRadius - 0.4;
    if (second.success) expect(separation).toBeGreaterThanOrEqual(minimum);
    else expect(second).toMatchObject({ reason: SHORE_DOCK_REFUSAL.occupied });
    expect(rowboat.isDocked).toBe(true);
  });

  it("refuses to dock during a cast and still tows an empty tank to a serviced mooring", () => {
    const approach = findApproach("boat.skiff", grid(-205, -150, -20, 90, 5));
    expect(approach).not.toBeNull();
    const sim = new Simulation();
    const boat = skiff(sim);
    aboard(sim, boat, approach!.x, approach!.z);
    sim.state.basicFishing = {
      ecologyId: "ecology.neva",
      phase: "waiting",
      habitatId: "ocean",
      remainingSeconds: 4,
      willCatch: true
    };
    expect(sim.execute({ type: "boat.dock" })).toMatchObject({
      success: false,
      reason: "Finish fishing first"
    });
    expect(sim.state.player.activeBoatId).toBe(boat.id);
    expect(sim.state.basicFishing).not.toBeNull();

    sim.state.basicFishing = null;
    boat.fuel = 0;
    const quote = sim.inspectEmergencyTowQuote();
    expect(quote.ok).toBe(true);
    expect(quote.destinationMarketId).not.toBeNull();
  });

  it("does not complete harbor or Sunreach dock objectives from a wild shore", () => {
    const approach = findApproach("boat.rowboat", grid(-205, -150, -20, 90, 5));
    expect(approach).not.toBeNull();
    const sim = new Simulation();
    const act5 = ContentRegistry.quests.get("quest.act5_maiden_voyage")!;
    const harborStep = act5.objectives.findIndex((objective) => objective.id === "step.act5_dock_rowboat");
    const track = mainQuestTrack(sim.state.quests);
    track.activeQuestId = act5.id;
    track.activeStepIndex = harborStep;
    track.stepProgress = {};
    const boat = sim.state.boats["boat.player_rowboat"];
    aboard(sim, boat, approach!.x, approach!.z);
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(track.activeStepIndex).toBe(harborStep);
    expect(track.stepProgress[act5.objectives[harborStep].id] ?? 0).toBe(0);
    Object.assign(boat, HARBOR_DOCK.boatPosition, { isDocked: true, dockedMarketId: "market.harbor", speed: 0 });

    const act7 = ContentRegistry.quests.get("quest.act7_open_channel")!;
    const coveStep = act7.objectives.findIndex((objective) => objective.id === "step.act7_dock_sunreach");
    track.activeQuestId = act7.id;
    track.activeStepIndex = coveStep;
    track.stepProgress = {};
    const coastal = skiff(sim);
    const skiffApproach = findApproach("boat.skiff", grid(-205, -150, -20, 90, 5));
    expect(skiffApproach).not.toBeNull();
    aboard(sim, coastal, skiffApproach!.x, skiffApproach!.z);
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(coastal.dockedMarketId).toBeNull();
    expect(track.activeStepIndex).toBe(coveStep);

    aboard(sim, boat, HARBOR_DOCK.boatPosition.x, HARBOR_DOCK.boatPosition.z);
    track.activeQuestId = act5.id;
    track.activeStepIndex = harborStep;
    track.stepProgress = {};
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(boat.dockedMarketId).toBe("market.harbor");
    expect(track.activeStepIndex).toBe(harborStep + 1);
  });
});

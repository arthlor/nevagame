import { describe, expect, it } from "vitest";
import fixture from "../fixtures/save_v41_layout19.json";
import olderFixture from "../fixtures/save_v38_layout16.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { Simulation } from "../../src/simulation/Simulation";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { WORLD_DISCOVERIES } from "../../src/content/discoveries";
import { drainMotorFuel } from "../../src/simulation/domains/NavigationDomain";
import { migrateOceanLayout20 } from "../../src/persistence/migrateOceanLayout20";
import { BOAT_MOORINGS, WORLD_SAILING_ROUTES, nearestMooring } from "../../src/world/WorldMoorings";
import { OCEAN_ISLETS, OCEAN_ISLAND_DEFINITIONS } from "../../src/world/OceanIslets";
import { FISHING_ECOLOGY_DEFINITIONS, SUNREACH_ANCHORS } from "../../src/world/WorldIslands";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";

function skiff(sim: Simulation) {
  const def = ContentRegistry.boats.get("boat.skiff")!;
  const boat = sim.state.boats["boat.player_skiff"] = { ...sim.state.boats["boat.player_rowboat"],
    id: "boat.player_skiff", boatTypeId: def.id, fuel: def.fuelCapacity, durability: def.durabilityMax,
    fishCargoSlotIds: def.fishCargoSlots.map(() => null), supplyInventoryId: "inventory.test_skiff" };
  sim.state.inventories[boat.supplyInventoryId] = { id: boat.supplyInventoryId, slotCount: 8, slots: Array.from({ length: 8 }, () => ({})) };
  return boat;
}
function arrive(sim: Simulation, x: number, z: number) {
  return sim.commitPhysicsFrame({ player: { ...sim.state.player, x, z, y: WorldLayout.traversalSurfaceHeight(x, z) + 0.5 }, boats: {} });
}

describe("expanded ocean expeditions", () => {
  it("keeps a continuous long crossing and a comfortable round trip fuel reserve", () => {
    const points = WORLD_SAILING_ROUTES.find((route) => route.id === "sailing.neva-sunreach")!.points;
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z); distance += length;
      for (let step = 0; step <= length; step += 2) {
        const t = step / length;
        expect(WorldLayout.isSailable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)).toBe(true);
      }
    }
    expect(distance).toBeGreaterThan(1050);
    expect(distance).toBeLessThan(1400);
    const sim = new Simulation(), boat = skiff(sim);
    boat.speed = ContentRegistry.boats.get(boat.boatTypeId)!.maxSpeed;
    const tripMinutes = distance / boat.speed * sim.state.clock.minutesPerRealSecond;
    drainMotorFuel(sim.state, tripMinutes * 2);
    expect(boat.fuel).toBeGreaterThan(45);
    expect(WorldLayout.navigationRequirementAt(600, 110)?.requiredBoatTypeId).toBe("boat.skiff");
    expect(nearestMooring(735, -20, "boat.skiff", true).marketId).not.toBeNull();
  });

  it.each(OCEAN_ISLETS)("supports landing, exploring and reboarding at $title without a fake market", (islet) => {
    const sim = new Simulation(), boat = skiff(sim);
    const mooring = BOAT_MOORINGS.find((m) => m.islandId === islet.id)!;
    Object.assign(boat, mooring.boatPosition, { isDocked: false, dockedMarketId: null });
    Object.assign(sim.state.player, mooring.boatPosition, { activeBoatId: boat.id });
    expect(WorldLayout.isSailable(boat.x, boat.z)).toBe(true);
    expect(sim.execute({ type: "boat.dock" }).success).toBe(true);
    expect(boat.dockedMarketId).toBeNull();
    const target = OCEAN_ISLAND_DEFINITIONS[islet.id].anchors.discovery;
    const start = mooring.playerPosition;
    for (let i = 0; i <= 20; i++) {
      const x = start.x + (target.x - start.x) * i / 20, z = start.z + (target.z - start.z) * i / 20;
      expect(WorldLayout.isWalkable(x, z)).toBe(true);
      expect(WorldLayout.traversalSurfaceSample(x, z).normal.y).toBeGreaterThan(Math.cos(38 * Math.PI / 180));
      expect(arrive(sim, x, z).success).toBe(true);
    }
    expect(sim.state.journal.unlockedKnowledge).toContain(islet.knowledgeId);
    const save = { schemaVersion: CURRENT_SCHEMA_VERSION, savedAtUtcMs: 0, state: sim.state };
    expect(validateSaveEnvelope(save)).toBe(true);
    const resumed = new Simulation(migrateSaveData(save).state);
    arrive(resumed, start.x, start.z);
    expect(resumed.execute({ type: "boat.board", boatId: boat.id }).success).toBe(true);
  });

  it("leaves a full-satchel cache available and grants it exactly once across reload", () => {
    const sim = new Simulation();
    const cache = WORLD_DISCOVERIES.find((d) => d.reward)!;
    const inventory = sim.state.inventories[sim.state.player.inventoryId];
    inventory.slots = Array.from({ length: inventory.slotCount }, () => ({ itemId: "item.boat_fuel", quantity: ContentRegistry.items.get("item.boat_fuel")!.stackLimit }));
    arrive(sim, cache.position.x, cache.position.z);
    expect(sim.state.journal.unlockedKnowledge).not.toContain(cache.id);
    inventory.slots = Array.from({ length: inventory.slotCount }, () => ({}));
    arrive(sim, cache.position.x, cache.position.z);
    expect(sim.state.journal.unlockedKnowledge).toContain(cache.id);
    expect(inventory.slots.filter((s) => s.itemId === "item.boat_fuel").reduce((n, s) => n + (s.quantity ?? 0), 0)).toBe(1);
    const resumed = new Simulation(structuredClone(sim.state));
    arrive(resumed, cache.position.x, cache.position.z);
    expect(resumed.state.inventories[inventory.id]).toEqual(inventory);
  });

  it("keeps every school in its declared habitat and ecology", () => {
    for (const ecology of Object.values(FISHING_ECOLOGY_DEFINITIONS)) for (const point of ecology.schoolSpawnPoints) {
      expect(WorldLayout.fishingHabitatAt(point.x, point.z), JSON.stringify(point)).toBe(point.habitatId);
      expect(WorldLayout.fishingEcologyAt(point.x, point.z).id, JSON.stringify(point)).toBe(ecology.id);
    }
  });
});

describe("ocean layout save preservation", () => {
  it.each([fixture, olderFixture])("migrates retained old saves deterministically without changing inventory or farm-local crops", (source) => {
    const before = structuredClone(source) as unknown as SaveEnvelope;
    const copy = structuredClone(before);
    const after = migrateSaveData(before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.inventories).toEqual(before.state.inventories);
    expect(after.state.crops).toEqual(before.state.crops);
    // v43 intentionally rescales the Work pool to the daily ceiling.
    expect({ ...after.state.player, workCapacity: before.state.player.workCapacity }).toEqual(before.state.player);
    expect(after.state.world.structures["struct.sunreach_hand_mill"].x).toBe(1244);
    expect(migrateSaveData(after)).toEqual(after);
    expect(migrateSaveData(copy)).toEqual(after);
    expect(before).toEqual(copy);
  });
  it("repairs a head-schema slot whose stored layout revision still trails", () => {
    // A development build can tag a save with the shipping schema before the
    // matching layout migration lands. The runner reconciles by the revision
    // the slot actually holds rather than reporting it corrupt.
    const before = structuredClone(fixture) as unknown as SaveEnvelope;
    before.schemaVersion = 42;
    before.state.schemaVersion = 42;
    before.state.world.layoutRevision = 19;
    const after = migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("translates a veteran at Sunreach with inventory, journal and docked boats intact", () => {
    const before = structuredClone(fixture) as unknown as SaveEnvelope;
    Object.assign(before.state.player, { x: 455, z: 5, y: WorldLayout.traversalSurfaceHeight(SUNREACH_ANCHORS.terraceFarm.x, 5) + 0.5, currentRegionId: "region.sunreach_terraces" });
    const boat = before.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: 343, z: 58, isDocked: true, dockedMarketId: "market.sunreach_cove" });
    const after = migrateSaveData(before);
    expect(after.state.player.x).toBe(1255);
    expect(after.state.boats[boat.id]).toEqual({ ...boat, x: 1143 });
    expect(after.state.fishCargo).toEqual(before.state.fishCargo);
    expect(after.state.quests).toEqual(before.state.quests);
    expect(after.state.journal).toEqual(before.state.journal);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("re-docks a drifted islet boat at its islet instead of teleporting it mainland", () => {
    const sim = new Simulation();
    const boat = skiff(sim);
    const mooring = BOAT_MOORINGS.find((m) => m.islandId === OCEAN_ISLETS[0].id)!;
    Object.assign(boat, {
      x: mooring.boatPosition.x + 20,
      z: mooring.boatPosition.z,
      isDocked: true,
      dockedMarketId: null
    });
    const migrated = migrateOceanLayout20(sim.state);
    expect(migrated.boats[boat.id].dockedMarketId).toBeNull();
    expect(migrated.boats[boat.id].x).toBe(mooring.boatPosition.x);
    expect(migrated.boats[boat.id].z).toBe(mooring.boatPosition.z);
  });
});

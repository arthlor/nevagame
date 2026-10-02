import { describe, expect, it, vi } from "vitest";
import predecessor from "../fixtures/save_v75_collision_polish_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { COLLISION_POLISH_ASSETS, collisionPolishProxies, migrateCollisionPolish76 } from "../../src/persistence/migrateCollisionPolish76";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { isMountedFootprintSupported, mountedFootprint } from "../../src/simulation/mounts/MountedRecovery";
import { playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { FARMHOUSE_INTERIOR_DOOR, FARMHOUSE_OUTSIDE_DOOR } from "../../src/world/FarmhouseInterior";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { BOAT_MOORINGS } from "../../src/world/WorldMoorings";
import { WORLD_STATION_DEFINITIONS } from "../../src/world/WorldGameplayLocations";
import { getProcessingStationFrontPosition } from "../../src/world/ProcessingStationApproach";
import { PLAYER_SATCHEL_SLOT_COUNT } from "../../src/simulation/inventory/InventoryLimits";
import { Simulation } from "../../src/simulation/Simulation";
import { clearReach } from "../../src/persistence/terrainMigrationSupport";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const state = legacy().state;
const added = collisionPolishProxies(state, true);
const all = collisionPolishProxies(state);
const clear = (p: { x: number; z: number }, radius = .4, boxes = all) =>
  staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), radius);
const unchanged = ["farms", "crops", "processingJobs", "contracts", "quests", "journal",
  "clock", "weather", "metadata", "markets", "boats"] as const;

/** v77 appends empty player-satchel slots. Lots and every other inventory stay put. */
function expectSatchelGrown(after: SaveEnvelope, before: SaveEnvelope): void {
  const id = before.state.player.inventoryId;
  const previous = before.state.inventories[id];
  const next = after.state.inventories[id];
  expect(next.slots.slice(0, previous.slots.length)).toEqual(previous.slots);
  expect(next.slotCount).toBe(Math.max(previous.slotCount, previous.slots.length, PLAYER_SATCHEL_SLOT_COUNT));
  expect(next.slots).toHaveLength(next.slotCount);
  const rest = (inventories: SaveEnvelope["state"]["inventories"]) =>
    Object.fromEntries(Object.entries(inventories).filter(([key]) => key !== id));
  expect(rest(after.state.inventories)).toEqual(rest(before.state.inventories));
}

describe("collision polish schema 76 / layout 41", () => {
  it("retains the independently valid predecessor and passes clear gameplay state through without refills", () => {
    const saved = legacy();
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(saved.schemaVersion).toBe(75);
    expect(saved.state.world.layoutRevision).toBe(40);
    saved.state.player.workCapacity.current = 117;
    const before = structuredClone(saved);
    expect(migrateCollisionPolish76(before.state).player).toEqual(before.state.player);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.player).toEqual({ ...before.state.player,
      y: WorldLayout.traversalSurfaceHeight(before.state.player.x, before.state.player.z) + .5 });
    expect(after.state.mounts).toEqual(before.state.mounts);
    expect(after.state.fishCargo).toEqual(before.state.fishCargo);
    for (const key of unchanged) expect(after.state[key], key).toEqual(before.state[key]);
    expectSatchelGrown(after, before);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("recovers an old interior pose from newly solid furniture, preserving the room and goods", () => {
    const saved = legacy();
    const bookcase = added.find(box => box.id.startsWith("interior_bookcase:"))!;
    expect(bookcase).toBeDefined();
    Object.assign(saved.state.player, { x: bookcase.center.x, z: bookcase.center.z,
      y: WorldLayout.traversalSurfaceHeight(bookcase.center.x, bookcase.center.z) + .5, currentRegionId: "region.farm" });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(clear(after.state.player)).toBe(true);
    expect(WorldLayout.isInterior(after.state.player.x, after.state.player.z)).toBe(true);
    expect(Math.hypot(after.state.player.x - before.state.player.x, after.state.player.z - before.state.player.z)).toBeLessThan(2);
    expect(after.state.player.workCapacity).toEqual(before.state.player.workCapacity);
    for (const key of unchanged) expect(after.state[key], key).toEqual(before.state[key]);
    expectSatchelGrown(after, before);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it.each([STARTER_DONKEY_ID, STARTER_CARRIAGE_ID])("recovers the complete %s assembly and retains loaded cargo", mountId => {
    const saved = legacy();
    const mount = saved.state.mounts[mountId];
    // Use an actual changed world placement with enough nearby supported ground for the assembly.
    const post = added.find(box => box.id.includes("lamp") && !WorldLayout.isInterior(box.center.x, box.center.z)
      && isMountedFootprintSupported({ ...mount, x: box.center.x, z: box.center.z,
        y: WorldLayout.traversalSurfaceHeight(box.center.x, box.center.z) }))!;
    expect(post).toBeDefined();
    Object.assign(mount, { x: post.center.x, z: post.center.z,
      y: WorldLayout.traversalSurfaceHeight(post.center.x, post.center.z), gallopStamina: 39 });
    Object.assign(saved.state.player, playerPoseFromMount(mount), { activeMountId: mountId });
    if (mount.fishCargoSlotIds) {
      mount.fishCargoSlotIds[0] = "cargo.polish";
      saved.state.fishCargo["cargo.polish"] = { id: "cargo.polish", speciesId: "fish.trout", weightKg: 3, quality: "fine",
        caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small",
        location: { type: "carriage", containerId: mount.id, slotIndex: 0 } };
    }
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    const recovered = after.state.mounts[mountId];
    expect(mountedFootprint(recovered).every(p => clear(p, p.radius))).toBe(true);
    expect(isMountedFootprintSupported(recovered)).toBe(true);
    expect(after.state.player).toMatchObject({ ...playerPoseFromMount(recovered), activeMountId: mountId });
    expect(recovered.gallopStamina).toBe(39);
    expect(recovered.fishCargoSlotIds).toEqual(before.state.mounts[mountId].fishCargoSlotIds);
    expect(after.state.fishCargo).toEqual(before.state.fishCargo);
    for (const key of unchanged) expect(after.state[key], key).toEqual(before.state[key]);
    expectSatchelGrown(after, before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(saved).toEqual(before);
  });

  it("recovers ground cargo without changing its identity, freshness or quantity", () => {
    const saved = legacy();
    const post = added.find(box => box.id.includes("lamp") && !WorldLayout.isInterior(box.center.x, box.center.z))!;
    saved.state.fishCargo["cargo.ground_polish"] = { id: "cargo.ground_polish", speciesId: "fish.trout", weightKg: 3, quality: "fine",
      caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small",
      location: { type: "ground", containerId: "ground", x: post.center.x, z: post.center.z } };
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    const cargo = after.state.fishCargo["cargo.ground_polish"];
    expect(clear({ x: cargo.location.x!, z: cargo.location.z! }, .45)).toBe(true);
    expect({ ...cargo, location: before.state.fishCargo[cargo.id].location }).toEqual(before.state.fishCargo[cargo.id]);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("does not alter the source when clearance recovery cannot find support", () => {
    const saved = legacy();
    const bookcase = added.find(box => box.id.startsWith("interior_bookcase:"))!;
    Object.assign(saved.state.player, { x: bookcase.center.x, z: bookcase.center.z });
    const before = structuredClone(saved);
    const dry = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateCollisionPolish76(saved.state)).toThrow("could not find safe");
      expect(saved).toEqual(before);
    } finally { dry.mockRestore(); }
  });

  it("retains an active bank cast and its hooked habitat when its old standing spot becomes solid", () => {
    const post = added.find(box => !WorldLayout.isInterior(box.center.x, box.center.z)
      && WorldLayout.isWalkable(box.center.x, box.center.z) && !WorldLayout.isWater(box.center.x, box.center.z)
      && WorldLayout.fishingAccessAt(box.center.x, box.center.z).accessible)!;
    expect(post).toBeDefined();
    const sim = new Simulation(legacy().state);
    const access = WorldLayout.fishingAccessAt(post.center.x, post.center.z);
    Object.assign(sim.state.player, { x: post.center.x, z: post.center.z,
      y: WorldLayout.traversalSurfaceHeight(post.center.x, post.center.z) + .5,
      rotationY: Math.atan2(access.target!.x - post.center.x, access.target!.z - post.center.z) });
    expect(sim.castBasicFishing().success).toBe(true);
    const saved = { ...legacy(), state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(saved)).toBe(true);
    const after = migrateSaveData(saved);
    expect(clear(after.state.player)).toBe(true);
    expect(after.state.basicFishing).toEqual(saved.state.basicFishing);
    const cast = after.state.basicFishing!;
    const forward = cast.castDistanceMeters ?? 6.5, lateral = cast.castLateralDriftMeters ?? 0;
    const bearing = after.state.player.rotationY + Math.atan2(lateral, forward), distance = Math.hypot(forward, lateral);
    expect(clearReach(after.state.player, bearing, distance)).toBe(true);
    const x = after.state.player.x + Math.sin(bearing) * distance, z = after.state.player.z + Math.cos(bearing) * distance;
    expect(WorldLayout.fishingHabitatAt(x, z)).toBe(cast.habitatId);
    expect(WorldLayout.fishingEcologyAt(x, z).id).toBe(cast.ecologyId);
    expectSatchelGrown(after, saved);
    expect(after.state.player.workCapacity).toEqual(saved.state.player.workCapacity);
    expect(after.state.metadata).toEqual(saved.state.metadata);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("keeps both durable slots unchanged if collision migration fails and the backup is loaded", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    const bookcase = added.find(box => box.id.startsWith("interior_bookcase:"))!;
    Object.assign(primary.state.player, { x: bookcase.center.x, z: bookcase.center.z, y: .67 });
    const backup = migrateSaveData(legacy()); backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>(resolve => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
    });
    const write = db.transaction("game_saves", "readwrite");
    write.objectStore("game_saves").put(primary, "primary_save");
    write.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>(resolve => { write.oncomplete = () => resolve(); });
    const read = (key: string) => new Promise<unknown>(resolve => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    const walkable = WorldLayout.isWalkable.bind(WorldLayout);
    const dry = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) =>
      !WorldLayout.isInterior(x, z) && walkable(x, z));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(validateSaveEnvelope(backup)).toBe(true);
      expect(() => migrateCollisionPolish76(primary.state)).toThrow("could not find safe");
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally { dry.mockRestore(); error.mockRestore(); warning.mockRestore(); db.close(); restore(); }
  });

  it("uses narrow catalog proxies, keeps young pines passable, and leaves every authored route and approach clear", () => {
    for (const id of COLLISION_POLISH_ASSETS) expect(ASSET_BY_ID.get(id)?.collision, id).not.toBe("none");
    expect(ASSET_BY_ID.get(ASSET_IDS.TREE_PINE_YOUNG_A)?.collision).toBe("none");
    expect(added.length).toBeGreaterThan(10);
    const points: Array<{ x: number; z: number; label: string }> = [
      ...BOAT_MOORINGS.map(mooring => ({ ...mooring.playerPosition, label: mooring.id })),
      { ...FARMHOUSE_OUTSIDE_DOOR, label: "outside door" },
      { ...FARMHOUSE_INTERIOR_DOOR.enterSpawn, label: "interior entry" },
      ...Object.entries(WORLD_STATION_DEFINITIONS).flatMap(([id, station]) => {
        const front = getProcessingStationFrontPosition(id, { ...station.position, rotationY: station.rotationY } as never);
        return front ? [{ ...front, label: id }] : [];
      }),
      ...WorldLayout.compiledRouteNetwork().flatMap(route => route.samples.map(s => ({ ...s.point, label: route.route.id })))
    ];
    const blocked = points.filter(p => !clear(p, .4, added)).map(p => ({ label: p.label, x: p.x, z: p.z,
      blockedBy: added.filter(box => !clear(p, .4, [box])).map(box => box.id) }));
    expect(blocked).toEqual([]);
  });
});

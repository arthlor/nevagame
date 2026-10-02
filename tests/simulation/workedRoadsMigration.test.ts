import { describe, expect, it, vi } from "vitest";
import predecessor from "../fixtures/save_v77_layout41_worked_roads_predecessor.json";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateWorkedRoads78, WORKED_ROADS_LAYOUT_REVISION } from "../../src/persistence/migrateWorkedRoads78";
import { collisionPolishProxies } from "../../src/persistence/migrateCollisionPolish76";
import * as migrationSupport from "../../src/persistence/terrainMigrationSupport";
import { Simulation } from "../../src/simulation/Simulation";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { carriagePoseIsClear, STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";
import { WorldLayout, RIVER_FISHING_ACCESS_RESERVES } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests",
  "journal", "clock", "weather", "metadata", "boats", "markets"] as const;

function expectProgressPreserved(before: SaveEnvelope, after: SaveEnvelope): void {
  for (const key of PRESERVED) expect(after.state[key], key).toEqual(before.state[key]);
  for (const key of ["money", "proficiencies", "workCapacity", "equipment", "ownedRodIds"] as const) {
    expect(after.state.player[key], key).toEqual(before.state.player[key]);
  }
  expect(after.state.world.activeSchools).toEqual(before.state.world.activeSchools);
  expect(after.state.world.fishingPressureByHabitat).toEqual(before.state.world.fishingPressureByHabitat);
  expect(after.state.worldSeed).toBe(before.state.worldSeed);
}

function bankPose() {
  for (const reserve of RIVER_FISHING_ACCESS_RESERVES) {
    const section = WorldLayout.riverSectionAt(reserve.z);
    const left = reserve.side === "left";
    const x = section.centerX + (left ? -1 : 1) * ((left ? section.leftWaterWidth : section.rightWaterWidth) + 2);
    const access = WorldLayout.fishingAccessAt(x, reserve.z);
    if (access.accessible && access.target && WorldLayout.isWalkable(x, reserve.z)) {
      return { x, z: reserve.z, y: WorldLayout.traversalSurfaceHeight(x, reserve.z) + .5,
        rotationY: Math.atan2(access.target.x - x, access.target.z - reserve.z), target: access.target };
    }
  }
  throw new Error("No supported river-bank fishing reserve");
}

async function openSaveDb(): Promise<IDBDatabase> {
  const request = indexedDB.open("neva_save_db", 1);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function slot(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise(resolve => {
    const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

describe("worked-road schema78/layout42 recovery", () => {
  it("retains an independently valid schema77/layout41 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(77);
    expect(saved.state.world.layoutRevision).toBe(41);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(WORKED_ROADS_LAYOUT_REVISION).toBe(42);
  });

  it("re-grounds a retained pose without refilling resources, advancing RNG or losing goods", () => {
    const saved = legacy();
    saved.state.player.workCapacity.current = 117;
    saved.state.player.money = 319;
    saved.state.fishCargo["cargo.road-ground"] = { id: "cargo.road-ground", speciesId: "fish.trout", weightKg: 3,
      quality: "fine", caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small",
      location: { type: "ground", containerId: "ground", x: saved.state.player.x, z: saved.state.player.z } };
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual({ x: before.state.player.x, z: before.state.player.z });
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(after.state.player.x, after.state.player.z) + .5, 6);
    expectProgressPreserved(before, after);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("re-grounds Sunreach and saved structures while keeping horizontal poses", () => {
    const saved = legacy();
    const route = WorldLayout.compiledRouteNetwork().find(({ route }) => route.id === "route.sunreach.cove-terraces")!;
    const point = route.samples[Math.floor(route.samples.length / 3)].point;
    Object.assign(saved.state.player, point, { y: 99, currentRegionId: WorldLayout.regionAt(point.x, point.z) });
    const structure = saved.state.world.structures["struct.workbench"];
    structure.y = 123;
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(point);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(point.x, point.z) + .5, 6);
    expect(after.state.world.structures[structure.id]).toEqual({ ...before.state.world.structures[structure.id],
      y: WorldLayout.terrainHeight(structure.x, structure.z) });
    expectProgressPreserved(before, after);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("recovers an unsafe actor, structure and ground lot without changing the lot", () => {
    const saved = legacy();
    const origin = { x: saved.state.player.x, z: saved.state.player.z };
    const cargo = { id: "cargo.road-unsafe", speciesId: "fish.trout", weightKg: 3,
      quality: "fine" as const, caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small" as const,
      location: { type: "ground" as const, containerId: "ground", ...origin } };
    saved.state.fishCargo[cargo.id] = cargo;
    Object.assign(saved.state.world.structures["struct.workbench"], origin);
    const before = structuredClone(saved);
    const walkable = WorldLayout.isWalkable.bind(WorldLayout);
    const support = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) =>
      !(x === origin.x && z === origin.z) && walkable(x, z));
    let after: SaveEnvelope;
    try { after = migrateSaveData(saved); } finally { support.mockRestore(); }
    const player = after.state.player;
    const structure = after.state.world.structures["struct.workbench"];
    const recovered = after.state.fishCargo[cargo.id];
    for (const point of [player, structure, recovered.location!]) {
      expect({ x: point.x, z: point.z }).not.toEqual(origin);
      expect(WorldLayout.isWalkable(point.x!, point.z!)).toBe(true);
      expect(WorldLayout.terrainPatchAt(point.x!, point.z!)?.islandId).toBe("island.neva");
    }
    expect(recovered).toEqual({ ...cargo, location: { ...cargo.location, x: recovered.location!.x, z: recovered.location!.z } });
    const expected = structuredClone(before);
    expected.state.fishCargo[cargo.id] = recovered;
    expectProgressPreserved(expected, after);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(saved).toEqual(before);
  });

  it("refuses a Neva fallback when a Sunreach actor has no remaining local support", () => {
    const saved = legacy();
    const route = WorldLayout.compiledRouteNetwork().find(({ route }) => route.id === "route.sunreach.cove-terraces")!;
    const point = route.samples[Math.floor(route.samples.length / 3)].point;
    Object.assign(saved.state.player, point, { y: 99, currentRegionId: WorldLayout.regionAt(point.x, point.z) });
    const before = structuredClone(saved);
    const walkable = WorldLayout.isWalkable.bind(WorldLayout);
    const support = vi.spyOn(WorldLayout, "isWalkable").mockImplementation((x, z) =>
      WorldLayout.terrainPatchAt(x, z)?.islandId === "island.neva" && walkable(x, z));
    try { expect(() => migrateWorkedRoads78(saved.state)).toThrow("safe Neva support"); }
    finally { support.mockRestore(); }
    expect(saved).toEqual(before);
  });

  it("keeps a loaded carriage assembly, rider attachment and stamina intact", () => {
    const saved = legacy();
    const cart = saved.state.mounts[STARTER_CARRIAGE_ID];
    cart.gallopStamina = 39;
    cart.fishCargoSlotIds![0] = "cargo.road-cart";
    saved.state.fishCargo["cargo.road-cart"] = { id: "cargo.road-cart", speciesId: "fish.trout", weightKg: 3,
      quality: "fine", caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small",
      location: { type: "carriage", containerId: cart.id, slotIndex: 0 } };
    Object.assign(saved.state.player, playerPoseFromMount(cart), { activeMountId: cart.id });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    const recovered = after.state.mounts[cart.id];
    expect(carriagePoseIsClear(recovered, collisionPolishProxies(after.state))).toBe(true);
    expect({ x: recovered.x, z: recovered.z, rotationY: recovered.rotationY }).toEqual({ x: cart.x, z: cart.z, rotationY: cart.rotationY });
    expect(recovered.gallopStamina).toBe(39);
    expect(recovered.fishCargoSlotIds).toEqual(cart.fishCargoSlotIds);
    expect(after.state.player).toMatchObject({ ...playerPoseFromMount(recovered), activeMountId: cart.id });
    expectProgressPreserved(before, after);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("recovers the loaded full carriage footprint from a farm fence omitted by environment-only projection", () => {
    const saved = legacy();
    const cart = saved.state.mounts[STARTER_CARRIAGE_ID];
    const all = collisionPolishProxies(saved.state);
    const isFarmFence = (id: string) => STARTER_FARM_LAYOUT.fenceAnchors.some(fence => id.startsWith(`${fence.id}:`));
    const fences = all.filter(proxy => isFarmFence(proxy.id));
    const withoutFences = all.filter(proxy => !isFarmFence(proxy.id));
    const blocked = fences.flatMap(fence => [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(rotationY => ({
      ...cart, x: fence.center.x, z: fence.center.z,
      y: WorldLayout.traversalSurfaceHeight(fence.center.x, fence.center.z), rotationY
    }))).find(candidate => carriagePoseIsClear(candidate, withoutFences) && !carriagePoseIsClear(candidate, all));
    expect(blocked, "a real farm fence must obstruct the complete assembly on otherwise supported ground").toBeDefined();
    Object.assign(cart, blocked!, { gallopStamina: 39 });
    cart.fishCargoSlotIds![0] = "cargo.road-fence";
    saved.state.fishCargo["cargo.road-fence"] = { id: "cargo.road-fence", speciesId: "fish.trout", weightKg: 3,
      quality: "fine", caughtAtMinute: saved.state.clock.currentMinute, freshness: 81, cargoClass: "small",
      location: { type: "carriage", containerId: cart.id, slotIndex: 0 } };
    Object.assign(saved.state.player, playerPoseFromMount(cart), {
      activeMountId: cart.id, currentRegionId: WorldLayout.regionAt(cart.x, cart.z)
    });
    expect(validateSaveEnvelope(saved)).toBe(true);
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    const recovered = after.state.mounts[cart.id];
    expect({ x: recovered.x, z: recovered.z }).not.toEqual({ x: cart.x, z: cart.z });
    expect(WorldLayout.terrainPatchAt(recovered.x, recovered.z)?.islandId).toBe("island.neva");
    expect(carriagePoseIsClear(recovered, collisionPolishProxies(after.state))).toBe(true);
    expect(recovered.rotationY).toBe(cart.rotationY);
    expect(recovered.gallopStamina).toBe(39);
    expect(recovered.fishCargoSlotIds).toEqual(cart.fishCargoSlotIds);
    expect(after.state.player).toMatchObject({ ...playerPoseFromMount(recovered), activeMountId: cart.id });
    expectProgressPreserved(before, after);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
    expect(saved).toEqual(before);
  });

  it.each(["basic", "sport"] as const)("preserves an active %s bank encounter without advancing it", mode => {
    const saved = legacy();
    const pose = bankPose();
    Object.assign(saved.state.player, { x: pose.x, y: pose.y, z: pose.z, rotationY: pose.rotationY,
      currentRegionId: WorldLayout.regionAt(pose.x, pose.z) });
    const sim = new Simulation(saved.state);
    if (mode === "basic") expect(sim.castBasicFishing().success).toBe(true);
    else {
      sim.state.player.equippedRodId = "rod.river";
      sim.state.player.ownedRodIds = ["rod.willow", "rod.river"];
      const encounter = new FishingEncounter({ instanceId: "fish.road-active", speciesId: "fish.trout",
        ecologyId: "ecology.neva", habitatId: "river", weightKg: 2, quality: "fine" }, "rod.river", new SeededRng(913),
      Math.hypot(pose.target.x - pose.x, pose.target.z - pose.z),
      { originX: pose.x, originZ: pose.z, bearingRadians: pose.rotationY, isWater: (x, z) => WorldLayout.isSailable(x, z) });
      sim.state.sportFishing = structuredClone(encounter.getState());
    }
    const before = { ...saved, state: structuredClone(sim.state) };
    expect(validateSaveEnvelope(before)).toBe(true);
    const after = migrateSaveData(before);
    expect(after.state.basicFishing).toEqual(before.state.basicFishing);
    expect(after.state.sportFishing).toEqual(before.state.sportFishing);
    expectProgressPreserved(before, after);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs a development save already at head schema but still on layout41", () => {
    const saved = legacy();
    saved.schemaVersion = saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expect(validateSaveEnvelope(saved)).toBe(false);
    const after = migrateSaveData(saved);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("keeps both durable slots when failed primary recovery falls back to a valid backup", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const db = await openSaveDb();
    const write = db.transaction("game_saves", "readwrite");
    write.objectStore("game_saves").put(primary, "primary_save");
    write.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>(resolve => { write.oncomplete = () => resolve(); });
    const unsupported = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    expect(() => migrateWorkedRoads78(primary.state)).toThrow("safe Neva support");
    unsupported.mockRestore();
    // The migration fails independently of the already safe backup's validation.
    const recovery = vi.spyOn(migrationSupport, "nearestPoint").mockImplementation(() => {
      throw new Error("No safe Neva support for road recovery");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(validateSaveEnvelope(backup)).toBe(true);
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await slot(db, "primary_save")).toEqual(primary);
      expect(await slot(db, "backup_save")).toEqual(backup);
    } finally { recovery.mockRestore(); error.mockRestore(); warning.mockRestore(); db.close(); restore(); }
  });
});

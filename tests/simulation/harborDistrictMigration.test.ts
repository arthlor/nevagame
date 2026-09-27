import { describe, expect, it } from "vitest";
import { Object3D } from "three";
import predecessor from "../fixtures/save_v66_harbor_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { harborBoatIsClear, migrateHarborDistrict67 } from "../../src/persistence/migrateHarborDistrict67";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { STARTER_DONKEY_ID, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { harborDistrictPlacements, HARBOR_WORKING_PIERS } from "../../src/world/HarborDistrictLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { clearReach } from "../../src/persistence/terrainMigrationSupport";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const added = harborDistrictPlacements((x, z) => WorldLayout.terrainHeight(x, z)).flatMap(p => {
  const root = new Object3D(); root.position.set(p.x, p.y ?? WorldLayout.terrainHeight(p.x, p.z), p.z);
  root.rotation.y = p.rotationY; root.scale.set(...p.scale);
  return projectAssetCollision(p.assetId as AssetId, root, p.id);
});

describe("harbor district layout35 save recovery", () => {
  it("retains a valid predecessor, preserves unaffected truth, and loads repeatedly", () => {
    const before = legacy(), untouched = structuredClone(before);
    expect(validateSaveEnvelope(before)).toBe(true);
    expect(before.state.world.layoutRevision).toBe(34);
    const after = migrateSaveData(before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    for (const key of ["player", "mounts", "farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "markets", "metadata"] as const) {
      expect(after.state[key], key).toEqual(before.state[key]);
    }
    for (const [id, boat] of Object.entries(before.state.boats))
      expect({ ...after.state.boats[id], x: boat.x, y: boat.y, z: boat.z, headingRadians: boat.headingRadians }).toEqual(boat);
    expect(before).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  }, 300_000);

  it.each(["neva", "sunreach"])('recovers player, mount and a ground pack out of a new %s warehouse', harbor => {
    const before = legacy();
    const store = added.find(p => p.id.includes(`${harbor}.${harbor === "neva" ? "freight-store" : "cargo-store"}`))!;
    expect(store).toBeDefined();
    const point = { x: store.center.x, z: store.center.z };
    Object.assign(before.state.player, point, { y: .5, activeBoatId: null, activeMountId: null });
    Object.assign(before.state.mounts[STARTER_DONKEY_ID], point, { y: WorldLayout.traversalSurfaceHeight(point.x, point.z) });
    before.state.fishCargo["cargo.harbor-test"] = {
      id: "cargo.harbor-test", speciesId: "fish.trout", weightKg: 3, freshness: 80, caughtAtMinute: 420,
      cargoClass: "small", quality: "fine", location: { type: "ground", containerId: "ground", ...point }
    };
    const untouched = structuredClone(before);
    const after = migrateHarborDistrict67(before.state);
    for (const [p, radius] of [[after.player, .4], [after.mounts[STARTER_DONKEY_ID], .7], [after.fishCargo["cargo.harbor-test"].location, .45]] as const) {
      const pose = { x: p.x!, z: p.z! };
      expect(staticPoseIsClear(added, pose, WorldLayout.traversalSurfaceHeight(pose.x, pose.z), radius)).toBe(true);
      expect(WorldLayout.isWater(pose.x, pose.z)).toBe(false);
      expect(Math.hypot(pose.x - point.x, pose.z - point.z)).toBeLessThan(12);
      expect(WorldLayout.terrainPatchAt(pose.x, pose.z)?.islandId).toBe(`island.${harbor}`);
    }
    const { location: _beforeLocation, ...catchBefore } = before.state.fishCargo["cargo.harbor-test"];
    const { location: _afterLocation, ...catchAfter } = after.fishCargo["cargo.harbor-test"];
    expect(catchAfter).toEqual(catchBefore);
    expect(before).toEqual(untouched);
  });

  it("preserves a ridden mount relationship and gives a saved dock walker the real plank height", () => {
    const before = legacy();
    const pier = HARBOR_WORKING_PIERS[3];
    Object.assign(before.state.player, { x: pier.x, z: pier.z, y: .5, activeBoatId: null });
    const walker = migrateHarborDistrict67(before.state);
    expect(walker.player.x).toBe(pier.x); expect(walker.player.z).toBe(pier.z);
    expect(walker.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(pier.x, pier.z) + .5);
    const mount = before.state.mounts[STARTER_DONKEY_ID];
    Object.assign(mount, { x: pier.x, z: pier.z, y: .5 });
    before.state.player.activeMountId = mount.id;
    const riding = migrateHarborDistrict67(before.state);
    expect(riding.player).toMatchObject(playerPoseFromMount(riding.mounts[mount.id]));
    expect(WorldLayout.isPierDeck(riding.mounts[mount.id].x, riding.mounts[mount.id].z)).toBe(false);
  });

  it("moves a hull intersecting a new jetty to a compatible mooring without losing its resources", () => {
    const before = legacy(), boat = before.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: HARBOR_WORKING_PIERS[0].x, z: HARBOR_WORKING_PIERS[0].z });
    const after = migrateHarborDistrict67(before.state).boats[boat.id];
    expect(harborBoatIsClear(after)).toBe(true);
    expect(WorldLayout.isSailable(after.x, after.z)).toBe(true);
    for (const key of ["id", "boatTypeId", "supplyInventoryId", "fishCargoSlotIds", "upgrades", "fuel", "durability"] as const) expect(after[key], key).toEqual(boat[key]);
  });

  it("repairs a head-schema save that still records the old layout", () => {
    const before = legacy(); before.schemaVersion = CURRENT_SCHEMA_VERSION; before.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expect(validateSaveEnvelope(before)).toBe(false);
    const after = migrateSaveData(before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("preserves an in-flight cast and crosswind while clearing a newly intersected jetty", () => {
    const before = legacy();
    Object.assign(before.state.player, { x: 54, z: 68, y: .5, rotationY: 0, activeBoatId: null, activeMountId: null });
    before.state.basicFishing = {
      ecologyId: "ecology.neva", habitatId: "coast", phase: "minigame", remainingSeconds: 2.2,
      catchItemId: "fish.sea_bream", willCatch: true, castDistanceMeters: 12, castLateralDriftMeters: 1.3,
      castPower: .9, catchProgress: .74, isPerfect: true, hasBait: true, fishY: .4, barY: .2,
      hasTreasure: true, treasureProgress: .6, treasureCaught: false, quality: "fine"
    };
    const after = migrateHarborDistrict67(before.state);
    expect(after.basicFishing).toEqual(before.state.basicFishing);
    const distance = Math.hypot(12, 1.3), bearing = after.player.rotationY + Math.atan2(1.3, 12);
    expect(clearReach(after.player, bearing, distance)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(after.player.x + Math.sin(bearing) * distance, after.player.z + Math.cos(bearing) * distance)).toBe("coast");
    expect(after.player.money).toBe(before.state.player.money);
    expect(after.metadata).toEqual(before.state.metadata);
  });

  it("keeps the migrated predecessor as a durable backup when the next save is written", async () => {
    const restore = installMemoryIndexedDB();
    let db: IDBDatabase | undefined;
    try {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("neva_save_db", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const old = legacy();
      await new Promise<void>(resolve => {
        const transaction = db!.transaction("game_saves", "readwrite");
        transaction.objectStore("game_saves").put(old, "primary_save"); transaction.oncomplete = () => resolve();
      });
      const read = (key: string) => new Promise<unknown>(resolve => {
        const request = db!.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
        request.onsuccess = () => resolve(request.result);
      });
      const repository = new IndexedDbSaveRepository(), loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status !== "loaded") throw new Error("The predecessor could not load");
      expect(validateSaveEnvelope(loaded.envelope)).toBe(true);
      expect(await read("primary_save")).toEqual(old);
      const next = structuredClone(loaded.envelope.state); next.player.money += 7;
      expect(await repository.saveGame(next)).toBe(true);
      expect(await read("backup_save")).toEqual(loaded.envelope);
      expect((await read("primary_save") as SaveEnvelope).state.player.money).toBe(next.player.money);
    } finally { db?.close(); restore(); }
  }, 300_000);
});

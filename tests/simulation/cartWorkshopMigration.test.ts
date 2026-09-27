import { Object3D } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateCartWorkshop68 } from "../../src/persistence/migrateCartWorkshop68";
import { migrateHarborDistrict67 } from "../../src/persistence/migrateHarborDistrict67";
import * as migrationSupport from "../../src/persistence/terrainMigrationSupport";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { carriagePoseIsClear, STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { createWorldStaticPlacements, prepareWorldEnvironmentLayout } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v66_layout34_workshop_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const preserved = ["farms", "crops", "inventories", "processingJobs", "contracts", "quests", "journal",
  "clock", "weather", "boats", "markets", "metadata"] as const;

describe("authored cart workshop save recovery", () => {
  let prior: SaveEnvelope;
  let boxes: ReturnType<typeof projectAssetCollision>;
  beforeAll(async () => {
    const input = legacy();
    await prepareWorldEnvironmentLayout(input.state.worldSeed);
    prior = { ...input, schemaVersion: 67, state: migrateHarborDistrict67(input.state) };
    boxes = createWorldStaticPlacements(input.state.worldSeed).flatMap(placement => {
      const root = new Object3D();
      root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      root.rotation.y = placement.rotationY;
      root.scale.set(...placement.scale);
      return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
    });
  // This integration setup builds the real seeded world and its collision catalog.
  // Allow the same shared-host preparation cost as the terrain migration suites.
  }, 600000);
  const clear = (point: { x: number; z: number }, radius = .4) =>
    staticPoseIsClear(boxes, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), radius);

  it("retains an independently validated predecessor and clears the new wall and bench without losing progress", () => {
    expect(validateSaveEnvelope(legacy())).toBe(true);
    expect(validateSaveEnvelope(prior)).toBe(true);
    expect(clear(prior.state.player)).toBe(false);
    const before = structuredClone(prior);
    const result = migrateSaveData(prior);
    expect(validateSaveEnvelope(result)).toBe(true);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(clear(result.state.player)).toBe(true);
    const cargo = result.state.fishCargo["cargo.workshop_predecessor"];
    expect(clear({ x: cargo.location.x!, z: cargo.location.z! }, .45)).toBe(true);
    expect({ ...cargo, location: before.state.fishCargo[cargo.id].location }).toEqual(before.state.fishCargo[cargo.id]);
    const workshopOnly = migrateCartWorkshop68(before.state);
    for (const key of preserved) expect(workshopOnly[key], key).toEqual(before.state[key]);
    for (const key of preserved.filter(key => key !== "markets" && key !== "boats")) expect(result.state[key], key).toEqual(before.state[key]);
    // The later main-pier migration changes berth poses, preserving the boat payload.
    for (const [id, boat] of Object.entries(before.state.boats))
      expect({ ...result.state.boats[id], x: boat.x, y: boat.y, z: boat.z, headingRadians: boat.headingRadians }).toEqual(boat);
    // The shared loader can add newly authored commodities; retained market
    // snapshots must remain intact and the workshop step never changes them.
    expect(result.state.markets).toMatchObject(before.state.markets);
    expect(result.state.player.money).toBe(before.state.player.money);
    expect(result.state.player.proficiencies).toEqual(before.state.player.proficiencies);
    expect(prior).toEqual(before);
    expect(migrateSaveData(result)).toEqual(result);
    expect(migrateSaveData(legacy())).toEqual(result);
  });

  it("moves the whole loaded carriage and attached rider while retaining every slot and resource", () => {
    const input = structuredClone(prior);
    const mount = input.state.mounts[STARTER_CARRIAGE_ID];
    Object.assign(mount, { x: 83.63, z: -43, rotationY: 0,
      y: WorldLayout.traversalSurfaceHeight(83.63, -43) });
    const cargo = input.state.fishCargo["cargo.workshop_predecessor"];
    cargo.location = { type: "carriage", containerId: mount.id, slotIndex: 0 };
    mount.fishCargoSlotIds![0] = cargo.id;
    input.state.player.activeMountId = mount.id;
    Object.assign(input.state.player, playerPoseFromMount(mount));
    expect(carriagePoseIsClear(mount, boxes)).toBe(false);
    const result = migrateSaveData(input);
    const moved = result.state.mounts[mount.id];
    expect(carriagePoseIsClear(moved, boxes)).toBe(true);
    expect(result.state.player).toMatchObject(playerPoseFromMount(moved));
    expect({ ...moved, x: mount.x, y: mount.y, z: mount.z }).toEqual(mount);
    expect(result.state.fishCargo).toEqual(input.state.fishCargo);
    expect(validateSaveEnvelope(result)).toBe(true);
    expect(migrateSaveData(result)).toEqual(result);
  });

  it("preserves an already clear save exactly apart from its version stamps", () => {
    const input = structuredClone(prior.state);
    Object.assign(input.player, { x: 80.7, z: -38,
      y: WorldLayout.traversalSurfaceHeight(80.7, -38) + .5 });
    Object.assign(input.fishCargo["cargo.workshop_predecessor"].location, { x: 81, z: -37 });
    expect(clear(input.player)).toBe(true);
    const after = migrateCartWorkshop68(input);
    expect(after).toEqual({ ...input, schemaVersion: 68,
      world: { ...input.world, layoutRevision: 36 } });
    const development = { ...structuredClone(prior), schemaVersion: CURRENT_SCHEMA_VERSION };
    development.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expect(migrateSaveData(development)).toEqual(migrateSaveData(prior));
  });

  it("keeps the old primary and backup intact when recovery cannot find safe ground", async () => {
    const restore = installMemoryIndexedDB();
    const old = structuredClone(prior);
    const backup = migrateSaveData(old);
    backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>(resolve => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
    });
    const transaction = db.transaction("game_saves", "readwrite");
    transaction.objectStore("game_saves").put(old, "primary_save");
    transaction.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve(); });
    const read = (key: string) => new Promise<unknown>(resolve => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    expect(() => migrateCartWorkshop68(old.state)).toThrow("safe Neva support");
    walkable.mockRestore();
    // Force the same migration failure without invalidating the already safe
    // backup's mount support during the repository's normal validation.
    const recovery = vi.spyOn(migrationSupport, "nearestPoint").mockImplementation(() => {
      throw new Error("No safe Neva support for workshop recovery");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status, JSON.stringify(error.mock.calls)).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(old);
      expect(await read("backup_save")).toEqual(backup);
    } finally { recovery.mockRestore(); error.mockRestore(); warning.mockRestore(); restore(); }
  });
});

import { Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { VILLAGE_LIFE_LAYOUT_REVISION, migrateVillageLife60 } from "../../src/persistence/migrateVillageLife60";
import { Simulation } from "../../src/simulation/Simulation";
import { carriagePoseIsClear } from "../../src/simulation/mounts/Carriage";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v59_layout29_village_life_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests",
  "journal", "clock", "weather", "boats"] as const;

/** Catalog collision of the placements layout 30 adds, projected as the recovery does. */
function villageLifeCollision() {
  return createWorldStaticPlacements(legacy().state.worldSeed)
    .filter((placement) => placement.id === "authored.village.dovecote" || placement.id.startsWith("authored.village.paddock.fence-"))
    .flatMap((placement) => {
      const root = new Object3D();
      root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
      root.rotation.y = placement.rotationY;
      root.scale.set(...placement.scale);
      return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
    });
}

function dovecote() {
  return createWorldStaticPlacements(legacy().state.worldSeed).find((placement) => placement.id === "authored.village.dovecote")!;
}

/** Dry square ground well clear of every layout-30 footprint. */
const SQUARE = { x: 41.5, z: -61 };

describe("village life layout30 recovery", () => {
  it("pins the retained predecessor to schema59/layout29", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(59);
    expect(saved.state.world.layoutRevision).toBe(29);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = 30;
    expect(validateSaveEnvelope(saved)).toBe(false);
    expect(VILLAGE_LIFE_LAYOUT_REVISION).toBe(WORLD_LAYOUT_REVISION);
    expect(CURRENT_SCHEMA_VERSION).toBe(60);
  });

  it("keeps a supported square pose exactly and preserves every other truth", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { ...SQUARE, y: WorldLayout.traversalSurfaceHeight(SQUARE.x, SQUARE.z) + 0.5 });
    const untouched = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(SQUARE);
    for (const [id, mount] of Object.entries(after.state.mounts)) {
      expect({ x: mount.x, z: mount.z }, id).toEqual({ x: untouched.state.mounts[id].x, z: untouched.state.mounts[id].z });
    }
    for (const key of PRESERVED) expect(after.state[key], key).toEqual(untouched.state[key]);
    expectMarketsPreserved(after.state, untouched.state);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it.each([false, true])("moves an actor standing where the dovecote now stands, mounted=%s", (mounted) => {
    const saved = legacy(), state = saved.state;
    const cote = dovecote();
    const spot = { x: cote.x, z: cote.z };
    Object.assign(state.player, { ...spot, y: WorldLayout.traversalSurfaceHeight(spot.x, spot.z) + 0.5 });
    const donkey = Object.values(state.mounts).find((mount) => mount.mountTypeId === "mount.donkey")!;
    if (mounted) {
      Object.assign(donkey, { ...spot, y: WorldLayout.traversalSurfaceHeight(spot.x, spot.z) });
      state.player.activeMountId = donkey.id;
      Object.assign(state.player, playerPoseFromMount(donkey));
    }
    const untouched = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    const collision = villageLifeCollision();
    const actor = mounted ? after.state.mounts[donkey.id] : after.state.player;
    const radius = mounted ? 0.7 : 0.4;
    expect(staticPoseIsClear(collision, { x: spot.x, z: spot.z }, WorldLayout.traversalSurfaceHeight(spot.x, spot.z), radius)).toBe(false);
    expect(staticPoseIsClear(collision, actor, WorldLayout.traversalSurfaceHeight(actor.x, actor.z), radius)).toBe(true);
    expect(Math.hypot(actor.x - spot.x, actor.z - spot.z)).toBeGreaterThan(0.5);
    expect(Math.hypot(actor.x - spot.x, actor.z - spot.z)).toBeLessThan(4);
    expect(WorldLayout.isWalkable(actor.x, actor.z)).toBe(true);
    if (mounted) expect(after.state.player).toMatchObject(playerPoseFromMount(after.state.mounts[donkey.id]));
    else expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(actor.x, actor.z) + 0.5, 6);
    for (const key of PRESERVED) expect(after.state[key], key).toEqual(untouched.state[key]);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("moves the carriage off a parking spot the paddock fence now crosses", () => {
    const saved = legacy(), state = saved.state;
    const carriage = Object.values(state.mounts).find((mount) => mount.mountTypeId === "mount.horse_carriage")!;
    const fence = createWorldStaticPlacements(state.worldSeed).find((placement) => placement.id === "authored.village.paddock.fence-north-2")!;
    Object.assign(carriage, { x: fence.x, z: fence.z, y: WorldLayout.traversalSurfaceHeight(fence.x, fence.z), rotationY: Math.PI / 2 });
    expect(carriagePoseIsClear(carriage, villageLifeCollision())).toBe(false);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    const moved = after.state.mounts[carriage.id];
    expect(carriagePoseIsClear(moved, villageLifeCollision())).toBe(true);
    expect(Math.hypot(moved.x - fence.x, moved.z - fence.z)).toBeGreaterThan(0.5);
    expect(Math.hypot(moved.x - fence.x, moved.z - fence.z)).toBeLessThan(8);
  });

  it("leaves a trade pack resting under the dovecote in place and collectable", () => {
    ContentRegistry.initializeAndValidate();
    const saved = legacy(), state = saved.state;
    const cote = dovecote();
    const species = ContentRegistry.fishSpecies.get("fish.trout")!;
    state.fishCargo["cargo.dovecote_pack"] = {
      id: "cargo.dovecote_pack", speciesId: "fish.trout", weightKg: 3, quality: "fine",
      caughtAtMinute: state.clock.currentMinute, freshness: 100, cargoClass: species.cargoClass,
      location: { type: "ground", containerId: "ground", x: cote.x, z: cote.z }
    };
    Object.assign(state.player, { x: cote.x, z: cote.z, y: WorldLayout.traversalSurfaceHeight(cote.x, cote.z) + 0.5 });
    expect(validateSaveEnvelope(saved)).toBe(true);
    const after = migrateSaveData(saved);
    // The pack keeps its pose; its 3 m reach spans the cote's footprint.
    expect(after.state.fishCargo["cargo.dovecote_pack"]).toEqual(state.fishCargo["cargo.dovecote_pack"]);
    const sim = new Simulation(structuredClone(after.state));
    sim.state.player.traversal = { ...sim.state.player.traversal, isGrounded: true };
    expect(sim.execute({ type: "cargo.pickup", cargoId: "cargo.dovecote_pack" })).toMatchObject({ success: true });
    sim.questDomain.dispose();
  });

  it("repairs a head-schema/layout29 development save and round-trips through persistence", async () => {
    const restore = installMemoryIndexedDB();
    try {
      // v60 is layout-only, so a head-schema development save differs only in its stamp.
      const retained = legacy();
      const saved: SaveEnvelope = { ...retained, schemaVersion: CURRENT_SCHEMA_VERSION,
        state: { ...retained.state, schemaVersion: CURRENT_SCHEMA_VERSION } };
      Object.assign(saved.state.player, { x: dovecote().x, z: dovecote().z });
      const after = migrateSaveData(saved), repository = new IndexedDbSaveRepository();
      expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
      expect(Math.hypot(after.state.player.x - dovecote().x, after.state.player.z - dovecote().z)).toBeGreaterThan(0.5);
      expect(validateSaveEnvelope(after)).toBe(true);
      expect(await repository.saveGame(after.state)).toBe(true);
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state).toEqual(after.state);
    } finally { restore(); }
  });

  it("leaves both stored slots unchanged when migration fails and the backup recovers", async () => {
    const restore = installMemoryIndexedDB();
    const primary = legacy();
    Object.assign(primary.state.player, { x: dovecote().x, z: dovecote().z });
    const backup = migrateSaveData(legacy());
    backup.state.player.money = 731;
    const open = indexedDB.open("neva_save_db", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onupgradeneeded = () => open.result.createObjectStore("game_saves");
      open.onsuccess = () => resolve(open.result);
    });
    const transaction = db.transaction("game_saves", "readwrite");
    transaction.objectStore("game_saves").put(primary, "primary_save");
    transaction.objectStore("game_saves").put(backup, "backup_save");
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
    const read = (key: string) => new Promise<unknown>((resolve) => {
      const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
      request.onsuccess = () => resolve(request.result);
    });
    // No water anywhere: the layout step cannot re-moor the saved rowboat.
    const water = vi.spyOn(WorldLayout, "isSailable").mockReturnValue(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => migrateVillageLife60(primary.state)).toThrow("no safe compatible boat mooring");
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state.player.money).toBe(731);
      expect(await read("primary_save")).toEqual(primary);
      expect(await read("backup_save")).toEqual(backup);
    } finally {
      water.mockRestore(); error.mockRestore(); warning.mockRestore(); restore();
    }
  });

  it("does not mutate the predecessor when recovery cannot find safe ground", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { x: dovecote().x, z: dovecote().z });
    const untouched = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateVillageLife60(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

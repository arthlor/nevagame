import { describe, expect, it } from "vitest";
import predecessor from "../fixtures/save_v68_main_dock_predecessor.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { mainHarborBoatIsClear, migrateMainHarbor69 } from "../../src/persistence/migrateMainHarbor69";
import { WorldLayout } from "../../src/world/WorldLayout";
import { HARBOR_DOCK, HARBOR_MAIN_PIER, WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { SeededRng } from "../../src/simulation/core/Rng";
import { FishingEncounter } from "../../src/simulation/fishing/FishingEncounter";
import { fishingEndpoint } from "../../src/simulation/fishing/FishingTuning";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("main harbor layout37 save recovery", () => {
  it("retains a valid predecessor, moves its docked boat and preserves gameplay truth on repeated loads", () => {
    const before = legacy(), untouched = structuredClone(before);
    expect(validateSaveEnvelope(before)).toBe(true);
    const after = migrateSaveData(before);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.boats["boat.player_rowboat"]).toMatchObject(HARBOR_DOCK.boatPosition);
    for (const key of ["player", "mounts", "farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "markets", "metadata"] as const)
      expect(after.state[key], key).toEqual(before.state[key]);
    for (const key of ["id", "boatTypeId", "supplyInventoryId", "fishCargoSlotIds", "upgrades", "fuel", "durability"] as const)
      expect(after.state.boats["boat.player_rowboat"][key], key).toEqual(before.state.boats["boat.player_rowboat"][key]);
    expect(before).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  }, 300_000);

  it("grounds a retained dock walker on the same plank elevation", () => {
    const before = legacy();
    Object.assign(before.state.player, { x: 75.5, z: 73, y: 2.166101659828691, activeBoatId: null, activeMountId: null });
    const after = migrateMainHarbor69(before.state);
    expect(after.player.x).toBe(75.5); expect(after.player.z).toBe(73);
    expect(after.player.y).toBeCloseTo(before.state.player.y, 6);
    expect(after.player.y).toBeCloseTo(WorldLayout.pierDeckSurfaceY() + .5, 6);
  });

  it("recovers an occupied hull intersecting the extension while retaining the rider and resources", () => {
    const before = legacy(), boat = before.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: HARBOR_MAIN_PIER.x, z: 99, headingRadians: 1.2, isDocked: false, dockedMarketId: null, speed: 2 });
    Object.assign(before.state.player, { x: boat.x, y: .5, z: boat.z, activeBoatId: boat.id });
    const after = migrateMainHarbor69(before.state), recovered = after.boats[boat.id];
    expect(recovered).toMatchObject({ ...HARBOR_DOCK.boatPosition, headingRadians: 0, isDocked: false, dockedMarketId: null });
    expect(mainHarborBoatIsClear(recovered)).toBe(true);
    expect(after.player).toMatchObject({ activeBoatId: boat.id, x: recovered.x, z: recovered.z });
    expect(recovered.fishCargoSlotIds).toEqual(boat.fishCargoSlotIds);
    expect(recovered.durability).toBe(boat.durability);
    expect(after.metadata).toEqual(before.state.metadata);
  });

  it("retains a boat already sailing clear of the new pier", () => {
    const before = legacy(), boat = before.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: 92, z: 120, headingRadians: .4, isDocked: false, dockedMarketId: null, speed: 2 });
    Object.assign(before.state.player, { x: boat.x, y: .5, z: boat.z, activeBoatId: boat.id });
    expect(migrateMainHarbor69(before.state).boats).toEqual(before.state.boats);
  });

  it("moves the hooked-water origin with a recovered occupied boat while retaining fight progress", () => {
    ContentRegistry.initializeAndValidate();
    const before = legacy(), boat = before.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: 75.5, z: 99, headingRadians: 0, isDocked: false, dockedMarketId: null });
    Object.assign(before.state.player, { x: boat.x, y: .5, z: boat.z, activeBoatId: boat.id });
    const species = [...ContentRegistry.fishSpecies.values()].find(fish => fish.habitats.includes("coast"))!;
    before.state.sportFishing = structuredClone(new FishingEncounter(
      { instanceId: "fish.main-pier-recovery", speciesId: species.id, ecologyId: "ecology.neva", habitatId: "coast", weightKg: 2, quality: "fine" },
      "rod.river", new SeededRng(913), 18,
      { originX: boat.x, originZ: boat.z, bearingRadians: Math.PI / 2, isWater: () => true }
    ).getState());
    const after = migrateMainHarbor69(before.state);
    const { dynamics: previousMotion, ...previousFight } = before.state.sportFishing;
    const { dynamics: motion, ...fight } = after.sportFishing!;
    expect(fight).toEqual(previousFight);
    expect(motion).toMatchObject({ ...previousMotion, originX: after.player.x, originZ: after.player.z,
      bearingRadians: expect.any(Number), headingRadians: expect.any(Number) });
    const endpoint = fishingEndpoint(after.sportFishing!);
    expect(WorldLayout.isSailable(endpoint.x, endpoint.z)).toBe(true);
    expect(WorldLayout.fishingHabitatAt(endpoint.x, endpoint.z)).toBe("coast");
    expect(after.player.activeBoatId).toBe(boat.id);
  });

  it("repairs a head-schema save carrying the preceding layout stamp", () => {
    const before = legacy(); before.schemaVersion = CURRENT_SCHEMA_VERSION; before.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expect(validateSaveEnvelope(before)).toBe(false);
    const after = migrateSaveData(before);
    expect(validateSaveEnvelope(after)).toBe(true); expect(migrateSaveData(after)).toEqual(after);
  });

  it("keeps the loaded predecessor available as a durable backup after the next write", async () => {
    const restore = installMemoryIndexedDB(); let db: IDBDatabase | undefined;
    try {
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("neva_save_db", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      const before = legacy();
      await new Promise<void>(resolve => {
        const tx = db!.transaction("game_saves", "readwrite"); tx.objectStore("game_saves").put(before, "primary_save"); tx.oncomplete = () => resolve();
      });
      const read = (key: string) => new Promise<unknown>(resolve => {
        const request = db!.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
        request.onsuccess = () => resolve(request.result);
      });
      const repository = new IndexedDbSaveRepository(), loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded"); if (loaded.status !== "loaded") throw Error("Predecessor could not load");
      expect(await read("primary_save")).toEqual(before);
      expect(await repository.saveGame(structuredClone(loaded.envelope.state))).toBe(true);
      expect(await read("backup_save")).toEqual(loaded.envelope);
      expect(validateSaveEnvelope(await read("primary_save"))).toBe(true);
    } finally { db?.close(); restore(); }
  }, 300_000);
});

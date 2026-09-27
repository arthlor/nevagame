import { describe, expect, it } from "vitest";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { ROAD_NETWORK_LAYOUT_REVISION } from "../../src/persistence/migrateRoadNetwork70";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { SUNREACH_ROUTES } from "../../src/world/SunreachWorld";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v69_layout37_road_network_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts",
  "quests", "journal", "clock", "weather", "boats", "markets"] as const;

/** A supported point halfway along a road, where the narrowed crown and bench moved the surface. */
function roadPoint(points: readonly { x: number; z: number }[]): { x: number; z: number } {
  for (let offset = 0; offset < points.length / 2; offset++) {
    const point = points[Math.floor(points.length / 2) + offset];
    if (WorldLayout.isWalkable(point.x, point.z) && !WorldLayout.isWater(point.x, point.z)
      && WorldLayout.traversalSurfaceSample(point.x, point.z).normal.y >= Math.cos(30 * Math.PI / 180)) {
      return { x: point.x, z: point.z };
    }
  }
  throw new Error("The road has no supported point");
}

async function openSaveDb(): Promise<IDBDatabase> {
  const request = indexedDB.open("neva_save_db", 1);
  return new Promise((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore("game_saves");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rawSlot(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const request = db.transaction("game_saves", "readonly").objectStore("game_saves").get(key);
    request.onsuccess = () => resolve(request.result);
  });
}

describe("road network layout38 recovery", () => {
  it("retains a validated schema69/layout37 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(69);
    expect(saved.state.world.layoutRevision).toBe(37);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(ROAD_NETWORK_LAYOUT_REVISION).toBe(38);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(70);
  });

  it.each([
    ["a re-planned mainland road", () => roadPoint(MAINLAND_ROUTES.find(route => route.id === "mainland-pinewatch-reedhaven")!.points)],
    ["a narrowed Sunreach road", () => roadPoint(WorldLayout.compiledRouteNetwork()
      .find(route => route.route.id === SUNREACH_ROUTES[0].id)!.samples.map(sample => sample.point))]
  ])("re-grounds a supported actor on %s without changing progress", (_, pointAt) => {
    const point = pointAt();
    const saved = legacy();
    Object.assign(saved.state.player, { ...point, y: 99, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(point);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(point.x, point.z) + 0.5, 6);
    for (const key of PRESERVED) expect(after.state[key], key).toEqual(before.state[key]);
    expect(after.state.player.money).toBe(before.state.player.money);
    expect(after.state.player.proficiencies).toEqual(before.state.player.proficiencies);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs a head-schema save that still records layout37", () => {
    const saved = legacy();
    saved.schemaVersion = CURRENT_SCHEMA_VERSION;
    saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
    expect(validateSaveEnvelope(saved)).toBe(false);
    const after = migrateSaveData(saved);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("keeps a migrated copy of the old primary as the durable backup", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const db = await openSaveDb();
      const old = legacy();
      await new Promise<void>((resolve) => {
        const transaction = db.transaction("game_saves", "readwrite");
        transaction.objectStore("game_saves").put(old, "primary_save");
        transaction.oncomplete = () => resolve();
      });
      const repository = new IndexedDbSaveRepository();
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status !== "loaded") return;
      expect(validateSaveEnvelope(loaded.envelope)).toBe(true);
      expect(await rawSlot(db, "primary_save")).toEqual(old);
      const next = structuredClone(loaded.envelope.state);
      next.player.money += 7;
      expect(await repository.saveGame(next)).toBe(true);
      expect(await rawSlot(db, "backup_save")).toEqual(loaded.envelope);
      expect((await rawSlot(db, "primary_save") as SaveEnvelope).state.player.money).toBe(next.player.money);
    } finally { restore(); }
  });
});

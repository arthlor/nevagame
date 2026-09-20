import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateNevaValley52 } from "../../src/persistence/migrateNevaValley52";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v51_layout23_valley_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("Neva valley layout24 recovery", () => {
  it("pins the retained predecessor to schema51/layout23", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(51);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = 24;
    expect(validateSaveEnvelope(saved)).toBe(false);
  });

  it.each([[-44, -152], [-126, -116], [-19, -124.5]])("recovers the former valley pose at %s,%s without losing progress", (x, z) => {
    const saved = legacy();
    Object.assign(saved.state.player, { x, z, y: 36.5 });
    const untouched = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    const p = after.state.player;
    expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
    expect(WorldLayout.isWater(p.x, p.z)).toBe(false);
    expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "markets", "boats"] as const) {
      expect(after.state[key], key).toEqual(saved.state[key]);
    }
    expect(after.state.player.money).toBe(saved.state.player.money);
    expect(after.state.player.workCapacity).toEqual(saved.state.player.workCapacity);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs a head-schema development slot then saves and reloads exactly once", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = legacy();
      saved.schemaVersion = saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
      const after = migrateSaveData(saved);
      expect(await new IndexedDbSaveRepository().saveGame(after.state)).toBe(true);
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state).toEqual(after.state);
    } finally { restore(); }
  });

  it("leaves the predecessor intact if no safe support exists", () => {
    const saved = legacy(), untouched = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateNevaValley52(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

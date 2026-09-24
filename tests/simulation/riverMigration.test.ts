import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateRiver53 } from "../../src/persistence/migrateRiver53";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { WorldLayout } from "../../src/world/WorldLayout";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v52_layout24_river_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("Neva river layout25 recovery", () => {
  it("pins the retained predecessor to schema52/layout24", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(52);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = 25;
    expect(validateSaveEnvelope(saved)).toBe(false);
  });

  it.each([[-30, -137], [-25, -103], [-16, 39]])("recovers the former river-bank pose at %s,%s without losing progress", (x, z) => {
    const saved = legacy();
    Object.assign(saved.state.player, { x, z, y: 36.5 });
    const untouched = structuredClone(saved);
    const expected = headSchemaDevelopmentSave(saved).state;
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    const p = after.state.player;
    expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
    expect(WorldLayout.isWater(p.x, p.z)).toBe(false);
    expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "boats"] as const) {
      expect(after.state[key], key).toEqual(expected[key]);
    }
    expectMarketsPreserved(after.state, expected);
    expect(after.state.player.money).toBe(saved.state.player.money);
    expect(after.state.player.workCapacity).toEqual(saved.state.player.workCapacity);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs a head-schema/layout24 development slot then saves and reloads exactly once", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = headSchemaDevelopmentSave(legacy());
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
      expect(() => migrateRiver53(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

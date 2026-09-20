import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateCoastalRoad54 } from "../../src/persistence/migrateCoastalRoad54";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { playerPoseFromMount, isMountableTraversalPoint } from "../../src/simulation/mounts/Mounts";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v53_layout25_road_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

describe("coastal road layout26 recovery", () => {
  it("pins the retained pre-road save to schema53/layout25", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(53);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expect(validateSaveEnvelope(saved)).toBe(false);
  });

  it.each([false, true])("re-grounds a former elevated-road pose, mounted=%s, preserving progress", mounted => {
    const saved = legacy(), state = saved.state;
    Object.assign(state.player, { x: 111, z: -193, y: 11.6 });
    if (mounted) {
      const mount = Object.values(state.mounts).find(m => m.mountTypeId === "mount.donkey")!;
      Object.assign(mount, { x: 111, z: -193, y: 11.1 });
      state.player.activeMountId = mount.id;
      Object.assign(state.player, playerPoseFromMount(mount));
    }
    const untouched = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.player.y).toBeLessThan(5);
    if (mounted) {
      const mount = after.state.mounts[after.state.player.activeMountId!];
      expect(isMountableTraversalPoint(mount.x, mount.z)).toBe(true);
      expect(mount.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(mount.x, mount.z), 6);
      expect(after.state.player).toMatchObject(playerPoseFromMount(mount));
    } else {
      const p = after.state.player;
      expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
      expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
    }
    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "weather", "markets", "boats"] as const) {
      expect(after.state[key], key).toEqual(saved.state[key]);
    }
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("repairs head-schema old-layout saves and round-trips through persistence", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = legacy();
      saved.schemaVersion = saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
      const after = migrateSaveData(saved), repository = new IndexedDbSaveRepository();
      expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
      expect(await repository.saveGame(after.state)).toBe(true);
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state).toEqual(after.state);
    } finally { restore(); }
  });

  it("does not mutate the predecessor when recovery cannot find safe ground", () => {
    const saved = legacy(), untouched = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateCoastalRoad54(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

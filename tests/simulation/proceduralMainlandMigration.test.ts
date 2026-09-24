import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import {
  PROCEDURAL_MAINLAND_LAYOUT_REVISION,
  migrateProceduralMainland59
} from "../../src/persistence/migrateProceduralMainland59";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { isMountableTraversalPoint, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v58_layout28_procedural_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests",
  "journal", "clock", "weather", "boats"] as const;

/** A dry, mountable point halfway along the rerouted forest road. */
function forestRoadPoint(): { x: number; z: number } {
  const road = MAINLAND_ROUTES.find(route => route.id === "mainland-forest-road")!;
  for (let offset = 0; offset < road.points.length / 2; offset++) {
    const point = road.points[Math.floor(road.points.length / 2) + offset];
    if (isMountableTraversalPoint(point.x, point.z)) return { x: point.x, z: point.z };
  }
  throw new Error("The forest road has no mountable support");
}

describe("procedural mainland layout29 recovery", () => {
  it("pins the retained pre-procedural save to schema58/layout28", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(58);
    expect(saved.state.world.layoutRevision).toBe(28);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expect(validateSaveEnvelope(saved)).toBe(false);
    expect(PROCEDURAL_MAINLAND_LAYOUT_REVISION).toBe(WORLD_LAYOUT_REVISION);
    expect(CURRENT_SCHEMA_VERSION).toBe(59);
  });

  it.each([false, true])("keeps a supported road pose in place and re-grounds it, mounted=%s", mounted => {
    const saved = legacy(), state = saved.state;
    const point = forestRoadPoint();
    Object.assign(state.player, { ...point, y: 99, activeBoatId: null });
    let mountId: string | null = null;
    if (mounted) {
      const mount = Object.values(state.mounts).find(m => m.mountTypeId === "mount.donkey")!;
      mountId = mount.id;
      Object.assign(mount, { ...point, y: 99 });
      state.player.activeMountId = mountId;
      Object.assign(state.player, playerPoseFromMount(mount));
    }
    const untouched = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    const support = WorldLayout.traversalSurfaceHeight(point.x, point.z);
    if (mounted) {
      const mount = after.state.mounts[mountId!];
      expect({ x: mount.x, z: mount.z }).toEqual(point);
      expect(mount.y).toBeCloseTo(support, 6);
      expect(after.state.player).toMatchObject(playerPoseFromMount(mount));
    } else {
      expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(point);
      expect(after.state.player.y).toBeCloseTo(support + 0.5, 6);
    }
    for (const key of PRESERVED) expect(after.state[key], key).toEqual(untouched.state[key]);
    expectMarketsPreserved(after.state, untouched.state);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("moves a player off a newly steep rock face onto the nearest walkable Neva ground", () => {
    const state = legacy().state;
    const face = { x: -425, z: -590 };
    expect(WorldLayout.traversalSurfaceSample(face.x, face.z).normal.y).toBeLessThan(Math.cos(38 * Math.PI / 180));
    Object.assign(state.player, { ...face, y: 40, activeMountId: null, activeBoatId: null });
    const recovered = migrateProceduralMainland59(state);
    expect(recovered.world.layoutRevision).toBe(PROCEDURAL_MAINLAND_LAYOUT_REVISION);
    expect(recovered.schemaVersion).toBe(59);
    const p = recovered.player;
    expect(Math.hypot(p.x - face.x, p.z - face.z)).toBeGreaterThan(0.4);
    expect(Math.hypot(p.x - face.x, p.z - face.z)).toBeLessThan(72);
    expect(WorldLayout.terrainPatchAt(p.x, p.z)?.islandId).toBe("island.neva");
    expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
    expect(WorldLayout.isWater(p.x, p.z)).toBe(false);
    expect(WorldLayout.traversalSurfaceSample(p.x, p.z).normal.y).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
    expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
  });

  it("repairs a head-schema/layout28 development save and round-trips through persistence", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = headSchemaDevelopmentSave(legacy());
      expect(saved.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(saved.state.world.layoutRevision).toBe(28);
      const after = migrateSaveData(saved), repository = new IndexedDbSaveRepository();
      expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
      expect(validateSaveEnvelope(after)).toBe(true);
      expect(await repository.saveGame(after.state)).toBe(true);
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state).toEqual(after.state);
    } finally { restore(); }
  });

  it("does not mutate the predecessor when recovery cannot find safe ground", () => {
    const saved = legacy(), untouched = structuredClone(saved);
    Object.assign(saved.state.player, { x: -425, z: -590, y: 40, activeMountId: null, activeBoatId: null });
    const before = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateProceduralMainland59(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(before);
      expect(untouched.state.world.layoutRevision).toBe(28);
    } finally { walkable.mockRestore(); }
  });
});

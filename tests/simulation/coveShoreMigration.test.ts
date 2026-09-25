import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { COVE_SHORE_LAYOUT_REVISION, migrateCoveShore60 } from "../../src/persistence/migrateCoveShore60";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { isMountableTraversalPoint, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { MAINLAND_ROUTES } from "../../src/world/NevaMainland";
import { WorldLayout } from "../../src/world/WorldLayout";
import { mooringById } from "../../src/world/WorldMoorings";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v59_layout29_cove_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests",
  "journal", "clock", "weather"] as const;
/** Dry beach under Pinewatch in layout29; the new shallow bight east of it is cove water now. */
const DROWNED_BEACH = { x: -292, z: 86 };
/** Open cove water in layout29; the new low point west of the bight is dry shore now. */
const NEW_POINT = { x: -350, z: 101.5 };

/** A dry, mountable point halfway along the landing lane down to Pinewatch's shore. */
function landingLanePoint(): { x: number; z: number } {
  const lane = MAINLAND_ROUTES.find(route => route.id === "mainland-pinewatch-landing")!;
  for (let index = Math.floor(lane.points.length / 2); index >= 0; index--) {
    const point = lane.points[index];
    if (isMountableTraversalPoint(point.x, point.z)) return { x: point.x, z: point.z };
  }
  throw new Error("The Pinewatch landing lane has no mountable support");
}

describe("cove shore layout30 recovery", () => {
  it("pins the retained pre-cove save to schema59/layout29", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(59);
    expect(saved.state.world.layoutRevision).toBe(29);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expect(validateSaveEnvelope(saved)).toBe(false);
    expect(COVE_SHORE_LAYOUT_REVISION).toBe(WORLD_LAYOUT_REVISION);
    expect(CURRENT_SCHEMA_VERSION).toBe(60);
  });

  it.each([false, true])("keeps a supported shore-lane pose in place and re-grounds it, mounted=%s", mounted => {
    const saved = legacy(), state = saved.state;
    const point = landingLanePoint();
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
    expect(after.state.boats).toEqual(untouched.state.boats);
    expectMarketsPreserved(after.state, untouched.state);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("walks a player off a beach the cove has drowned onto the nearest dry shore", () => {
    const state = legacy().state;
    expect(WorldLayout.isWater(DROWNED_BEACH.x, DROWNED_BEACH.z)).toBe(true);
    Object.assign(state.player, { ...DROWNED_BEACH, y: 1.4, activeMountId: null, activeBoatId: null });
    const recovered = migrateCoveShore60(state);
    expect(recovered.schemaVersion).toBe(60);
    expect(recovered.world.layoutRevision).toBe(COVE_SHORE_LAYOUT_REVISION);
    const p = recovered.player;
    expect(Math.hypot(p.x - DROWNED_BEACH.x, p.z - DROWNED_BEACH.z)).toBeGreaterThan(0.4);
    expect(Math.hypot(p.x - DROWNED_BEACH.x, p.z - DROWNED_BEACH.z)).toBeLessThan(30);
    expect(WorldLayout.terrainPatchAt(p.x, p.z)?.islandId).toBe("island.neva");
    expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
    expect(WorldLayout.isWater(p.x, p.z)).toBe(false);
    expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
  });

  it("returns a rowboat stranded on the new point to the nearest compatible mooring", () => {
    const state = legacy().state;
    expect(WorldLayout.isSailable(NEW_POINT.x, NEW_POINT.z)).toBe(false);
    const boat = Object.values(state.boats).find(candidate => candidate.boatTypeId === "boat.rowboat")!;
    Object.assign(boat, { ...NEW_POINT, y: 0, isDocked: false, dockedMarketId: null });
    const untouchedCargo = structuredClone(boat.fishCargoSlotIds);
    const recovered = migrateCoveShore60(state);
    const moved = recovered.boats[boat.id];
    const pinewatch = mooringById("mooring.pinewatch")!;
    expect({ x: moved.x, z: moved.z }).toEqual({ x: pinewatch.boatPosition.x, z: pinewatch.boatPosition.z });
    expect(WorldLayout.isSailable(moved.x, moved.z)).toBe(true);
    expect(moved.isDocked).toBe(true);
    expect(moved.dockedMarketId).toBe(pinewatch.marketId);
    expect(moved.fishCargoSlotIds).toEqual(untouchedCargo);
  });

  it("repairs a head-schema/layout29 development save and round-trips through persistence", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = headSchemaDevelopmentSave(legacy());
      expect(saved.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(saved.state.world.layoutRevision).toBe(29);
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
    const saved = legacy();
    Object.assign(saved.state.player, { ...DROWNED_BEACH, y: 1.4, activeMountId: null, activeBoatId: null });
    const before = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateCoveShore60(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(before);
      expect(saved.state.world.layoutRevision).toBe(29);
    } finally { walkable.mockRestore(); }
  });
});

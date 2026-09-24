import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateHeadwaterSpring55 } from "../../src/persistence/migrateHeadwaterSpring55";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION, HARBOR_SKIFF_MOORING } from "../../src/world/WorldAnchors";
import { isInHeadwaterGrayboxEnvelope } from "../../src/world/HeadwaterWaterfallGraybox";
import { playerPoseFromMount, isMountableTraversalPoint } from "../../src/simulation/mounts/Mounts";
import { expectMarketsPreserved } from "../helpers/migrationPreservation";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import { headSchemaDevelopmentSave } from "../helpers/headSchemaDevelopmentSave";
import predecessor from "../fixtures/save_v54_layout26_headwater_predecessor.json";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;

/** Shortened west-rim terminus: valid standing ground inside the envelope. */
const TERMINUS = { x: -48, z: -155 } as const;
/** Former trail end on the raised source bank: still valid standing ground inside the envelope. */
const OLD_SOURCE_BANK = { x: -37, z: -150 } as const;

describe("headwater spring layout27 recovery", () => {
  it("pins the retained predecessor to schema54/layout26", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(54);
    expect(saved.state.schemaVersion).toBe(54);
    expect(saved.state.world.layoutRevision).toBe(26);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = WORLD_LAYOUT_REVISION;
    expect(validateSaveEnvelope(saved)).toBe(false);
  });

  it("leaves an out-of-envelope farm pose on valid ground while bumping the layout", () => {
    const saved = legacy();
    expect(isInHeadwaterGrayboxEnvelope(saved.state.player.x, saved.state.player.z)).toBe(false);
    const before = structuredClone(saved.state.player);
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(after.state.player.x).toBe(before.x);
    expect(after.state.player.z).toBe(before.z);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(before.x, before.z) + 0.5, 6);
  });

  it.each([false, true])("re-grounds a former source-bank pose, mounted=%s, preserving progress", mounted => {
    const saved = legacy(), state = saved.state;
    Object.assign(state.player, { ...OLD_SOURCE_BANK, y: 21 });
    if (mounted) {
      const mount = Object.values(state.mounts).find(m => m.mountTypeId === "mount.donkey")!;
      Object.assign(mount, { ...OLD_SOURCE_BANK, y: 20.5 });
      state.player.activeMountId = mount.id;
      Object.assign(state.player, playerPoseFromMount(mount));
    }
    const untouched = structuredClone(saved);
    const expected = headSchemaDevelopmentSave(saved).state;
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    if (mounted) {
      const mount = after.state.mounts[after.state.player.activeMountId!];
      expect(isMountableTraversalPoint(mount.x, mount.z)).toBe(true);
      expect(mount.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(mount.x, mount.z), 6);
      expect(after.state.player).toMatchObject(playerPoseFromMount(mount));
    } else {
      const p = after.state.player;
      expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
      expect(WorldLayout.isWater(p.x, p.z)).toBe(false);
      expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(p.x, p.z) + 0.5, 6);
    }
    for (const key of ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "weather", "boats", "mounts"] as const) {
      if (key === "mounts" && mounted) {
        const { x: _x, y: _y, z: _z, ...restBefore } = untouched.state.mounts[after.state.player.activeMountId!];
        const { x: _x2, y: _y2, z: _z2, ...restAfter } = after.state.mounts[after.state.player.activeMountId!];
        expect(restAfter, "mount non-pose fields").toEqual(restBefore);
        continue;
      }
      expect(after.state[key], key).toEqual(expected[key]);
    }
    expect(after.state.clock).toEqual(expected.clock);
    expectMarketsPreserved(after.state, expected);
    expect(saved).toEqual(untouched);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("keeps a valid west-rim terminus pose in place and re-derives only Y", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { ...TERMINUS, y: 99 });
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    const p = after.state.player;
    expect(p.x).toBe(TERMINUS.x);
    expect(p.z).toBe(TERMINUS.z);
    expect(p.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(TERMINUS.x, TERMINUS.z) + 0.5, 6);
    expect(WorldLayout.isWalkable(p.x, p.z)).toBe(true);
  });

  it("re-docks a hull written inside the non-sailable headwater", () => {
    const saved = legacy();
    const boat = saved.state.boats["boat.player_rowboat"];
    Object.assign(boat, { x: -30, z: -130, y: 4.5, isDocked: false, dockedMarketId: null });
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    const docked = after.state.boats["boat.player_rowboat"];
    expect(docked.x).toBe(HARBOR_SKIFF_MOORING.boatPosition.x);
    expect(docked.z).toBe(HARBOR_SKIFF_MOORING.boatPosition.z);
    expect(docked.y).toBe(0);
    expect(docked.isDocked).toBe(true);
    expect(docked.dockedMarketId).toBe(HARBOR_SKIFF_MOORING.marketId);
  });

  it("moves a structure written inside the envelope onto valid ground", () => {
    const saved = legacy();
    saved.state.world.structures["dev.headwater_probe"] = {
      id: "dev.headwater_probe",
      type: "workbench",
      x: -37, y: 21, z: -150, rotationY: 0
    };
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    const structure = after.state.world.structures["dev.headwater_probe"];
    expect(WorldLayout.terrainHeight(structure.x, structure.z)).toBeCloseTo(structure.y, 6);
    expect(WorldLayout.isWalkable(structure.x, structure.z)).toBe(true);
    expect(after.state.world.structures["dev.headwater_probe"].id).toBe("dev.headwater_probe");
  });

  it("repairs a head-schema/layout26 development save and round-trips through persistence", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = headSchemaDevelopmentSave(legacy());
      const after = migrateSaveData(saved), repository = new IndexedDbSaveRepository();
      expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
      expect(await repository.saveGame(after.state)).toBe(true);
      const loaded = await repository.loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") expect(loaded.envelope.state).toEqual(after.state);
    } finally { restore(); }
  });

  it("does not mutate the predecessor when recovery cannot find safe ground", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { ...OLD_SOURCE_BANK, y: 21 });
    const untouched = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateHeadwaterSpring55(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

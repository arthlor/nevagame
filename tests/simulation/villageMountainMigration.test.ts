import { describe, expect, it, vi } from "vitest";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { VILLAGE_MOUNTAIN_LAYOUT_REVISION, migrateVillageMountain61 } from "../../src/persistence/migrateVillageMountain61";
import { WorldLayout } from "../../src/world/WorldLayout";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import predecessor from "../fixtures/save_v60_layout30_village_mountain_predecessor.json";
import { expectBoatsPreserved, expectInventoriesPreserved, expectMarketsPreserved } from "../helpers/migrationPreservation";

const legacy = () => structuredClone(predecessor) as unknown as SaveEnvelope;
const PRESERVED = ["farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts",
  "quests", "journal", "clock", "weather"] as const;

describe("village mountain layout31 recovery", () => {
  it("keeps a validated schema60/layout30 predecessor", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(60);
    expect(saved.state.world.layoutRevision).toBe(30);
    expect(validateSaveEnvelope(saved)).toBe(true);
    expect(VILLAGE_MOUNTAIN_LAYOUT_REVISION).toBe(31);
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(61);
  });

  it("recovers an old pose on a newly steep cirque flank without changing player resources", () => {
    const saved = legacy();
    // The layout30 village-facing flank stood about six metres higher here.
    Object.assign(saved.state.player, { x: 0, z: -160, y: 37.15, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    const player = after.state.player;
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(WorldLayout.isWater(player.x, player.z)).toBe(false);
    expect(WorldLayout.traversalSurfaceSample(player.x, player.z).normal.y).toBeGreaterThanOrEqual(Math.cos(38 * Math.PI / 180));
    expect(player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(player.x, player.z) + 0.5, 6);
    expect(Math.hypot(player.x, player.z + 160)).toBeGreaterThan(0.5);
    expect(Math.hypot(player.x, player.z + 160)).toBeLessThan(30);
    expect(player.money).toBe(before.state.player.money);
    expect(player.proficiencies).toEqual(before.state.player.proficiencies);
    for (const key of PRESERVED) if (key !== "inventories") expect(after.state[key], key).toEqual(before.state[key]);
    expectInventoriesPreserved(after.state, before.state);
    expectBoatsPreserved(after.state, before.state);
    expectMarketsPreserved(after.state, before.state);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("moves a saved actor out of a new mountain-grove trunk without changing gameplay state", () => {
    const saved = legacy();
    const tree = createWorldStaticPlacements(saved.state.worldSeed).find((placement) =>
      placement.id.startsWith("seeded-fill.mountain-grove.") && placement.assetId !== "tree_pine_young_a"
    );
    expect(tree).toBeDefined();
    Object.assign(saved.state.player, {
      x: tree!.x,
      y: WorldLayout.traversalSurfaceHeight(tree!.x, tree!.z) + 0.5,
      z: tree!.z,
      activeBoatId: null,
      activeMountId: null
    });
    const before = structuredClone(saved);
    const after = migrateSaveData(saved);
    expect(Math.hypot(after.state.player.x - tree!.x, after.state.player.z - tree!.z)).toBeGreaterThan(0.5);
    expect(WorldLayout.isWater(after.state.player.x, after.state.player.z)).toBe(false);
    expect(after.state.player.money).toBe(before.state.player.money);
    for (const key of PRESERVED) if (key !== "inventories") expect(after.state[key], key).toEqual(before.state[key]);
    expectInventoriesPreserved(after.state, before.state);
    expectBoatsPreserved(after.state, before.state);
    expectMarketsPreserved(after.state, before.state);
    expect(saved).toEqual(before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it("leaves supported village ground in place and only re-derives its height", () => {
    const saved = legacy();
    const spot = { x: 41.5, z: -61 };
    Object.assign(saved.state.player, { ...spot, y: 99 });
    const after = migrateSaveData(saved);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect({ x: after.state.player.x, z: after.state.player.z }).toEqual(spot);
    expect(after.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(spot.x, spot.z) + 0.5, 6);
  });

  it("does not mutate an old save when safe support cannot be found", () => {
    const saved = legacy();
    Object.assign(saved.state.player, { x: 0, z: -160, y: 37.15, activeBoatId: null, activeMountId: null });
    const before = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateVillageMountain61(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(before);
    } finally { walkable.mockRestore(); }
  });
});

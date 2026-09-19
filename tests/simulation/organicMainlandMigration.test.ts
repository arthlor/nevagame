import { beforeAll, describe, expect, it, vi } from "vitest";
import { Object3D } from "three";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear, type StaticCollisionProxy } from "../../src/physics/StaticCollision";
import { IndexedDbSaveRepository } from "../../src/persistence/IndexedDbSaveRepository";
import { migrateOrganicMainland51 } from "../../src/persistence/migrateOrganicMainland51";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import type { GameState } from "../../src/simulation/core/types";
import { carriagePoseIsClear, STARTER_CARRIAGE_ID } from "../../src/simulation/mounts/Carriage";
import { isValidMountPose, playerPoseFromMount, STARTER_DONKEY_ID } from "../../src/simulation/mounts/Mounts";
import { MAINLAND_VILLAGES } from "../../src/world/NevaMainland";
import { MAINLAND_SETTLEMENT_BUILDINGS } from "../../src/world/MainlandSettlementLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { installMemoryIndexedDB } from "../helpers/memoryIndexedDB";
import predecessor from "../fixtures/save_v50_layout22_organic_predecessor.json";

const legacy = (): SaveEnvelope => structuredClone(predecessor) as unknown as SaveEnvelope;
let collision: StaticCollisionProxy[];
const obstructed = MAINLAND_SETTLEMENT_BUILDINGS.find(building => building.pad.id === "mainland.pinewatch.west-house")!.pad.center;

function preserved(before: GameState, after: GameState): void {
  for (const key of ["worldSeed", "farms", "crops", "inventories", "processingJobs", "fishCargo", "contracts", "quests", "journal", "clock", "metadata", "weather", "markets"] as const) {
    expect(after[key], key).toEqual(before[key]);
  }
  for (const key of ["money", "workCapacity", "proficiencies", "equipment", "ownedRodIds", "carriedFishCargoId", "activeBoatId", "activeMountId"] as const) {
    expect(after.player[key], key).toEqual(before.player[key]);
  }
  expect(after.world.fishingPressureByHabitat).toEqual(before.world.fishingPressureByHabitat);
  expect(after.world.lastSchoolSpawnMinute).toBe(before.world.lastSchoolSpawnMinute);
}

beforeAll(() => {
  ContentRegistry.initializeAndValidate();
  collision = createWorldStaticPlacements(predecessor.state.worldSeed).flatMap(placement => {
    const root = new Object3D();
    root.position.set(placement.x, placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z), placement.z);
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
}, 60_000);

describe("organic mainland layout23 save recovery", () => {
  it("retains an independently valid schema50/layout22 fixture", () => {
    const saved = legacy();
    expect(saved.schemaVersion).toBe(50);
    expect(saved.state.world.layoutRevision).toBe(22);
    expect(validateSaveEnvelope(saved)).toBe(true);
    saved.state.world.layoutRevision = 23;
    expect(validateSaveEnvelope(saved)).toBe(false);
  });

  it("preserves farms, market state, resources, saved input and valid working-core positions", () => {
    const saved = legacy(), untouched = structuredClone(saved);
    const migrated = migrateSaveData(saved);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(migrated.state.player).toMatchObject({ x: saved.state.player.x, z: saved.state.player.z });
    expect(migrated.state.world.structures).toEqual(saved.state.world.structures);
    expect(migrated.state.boats).toEqual(saved.state.boats);
    preserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
    expect(migrateSaveData(migrated)).toEqual(migrated);
    expect(saved).toEqual(untouched);
  });

  it("re-grounds a retained village pose without scaling or moving it", () => {
    const saved = legacy();
    Object.assign(saved.state.player, MAINLAND_VILLAGES.pinewatch.market, { y: 999 });
    const migrated = migrateSaveData(saved);
    expect(migrated.state.player).toMatchObject(MAINLAND_VILLAGES.pinewatch.market);
    expect(migrated.state.player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(saved.state.player.x, saved.state.player.z) + 0.5, 6);
    preserved(saved.state, migrated.state);
  });

  it("moves a foot traveller clear of a newly occupied catalog footprint", () => {
    const saved = legacy();
    Object.assign(saved.state.player, obstructed, { y: WorldLayout.traversalSurfaceHeight(obstructed.x, obstructed.z) + 0.5 });
    expect(staticPoseIsClear(collision, obstructed, saved.state.player.y - 0.5, 0.4)).toBe(false);
    const migrated = migrateSaveData(saved);
    const player = migrated.state.player;
    expect(Math.hypot(player.x - obstructed.x, player.z - obstructed.z)).toBeGreaterThan(0);
    expect(staticPoseIsClear(collision, player, WorldLayout.traversalSurfaceHeight(player.x, player.z), 0.4)).toBe(true);
    expect(WorldLayout.isWater(player.x, player.z)).toBe(false);
    preserved(saved.state, migrated.state);
  });

  it.each([STARTER_DONKEY_ID, STARTER_CARRIAGE_ID])("recovers %s with its rider and physical cargo intact", id => {
    const saved = legacy();
    const mount = saved.state.mounts[id];
    Object.assign(mount, obstructed, { y: 999, gallopStamina: 41 });
    Object.assign(saved.state.player, obstructed, { y: 999.5, activeMountId: id });
    if (id === STARTER_CARRIAGE_ID) {
      mount.fishCargoSlotIds![0] = "cargo.organic-recovery";
      saved.state.fishCargo["cargo.organic-recovery"] = {
        id: "cargo.organic-recovery", speciesId: "fish.trout", weightKg: 2, quality: "fine",
        caughtAtMinute: 475, freshness: 86, cargoClass: "small", location: { type: "carriage", containerId: id, slotIndex: 0 }
      };
    }
    const migrated = migrateSaveData(saved);
    expect(isValidMountPose(migrated.state.mounts[id])).toBe(true);
    if (id === STARTER_CARRIAGE_ID) expect(carriagePoseIsClear(migrated.state.mounts[id], collision)).toBe(true);
    expect(migrated.state.player).toMatchObject(playerPoseFromMount(migrated.state.mounts[id]));
    expect(migrated.state.mounts[id].gallopStamina).toBe(41);
    preserved(saved.state, migrated.state);
    expect(validateSaveEnvelope(migrated)).toBe(true);
  });

  it("repairs a schema51/layout22 development slot once and reloads the saved result", async () => {
    const restore = installMemoryIndexedDB();
    try {
      const saved = legacy();
      saved.schemaVersion = saved.state.schemaVersion = CURRENT_SCHEMA_VERSION;
      const migrated = migrateSaveData(saved);
      const repository = new IndexedDbSaveRepository();
      expect(await repository.saveGame(migrated.state)).toBe(true);
      const loaded = await new IndexedDbSaveRepository().loadGameResult();
      expect(loaded.status).toBe("loaded");
      if (loaded.status === "loaded") {
        expect(loaded.envelope.state).toEqual(migrated.state);
        expect(migrateSaveData(loaded.envelope)).toEqual(loaded.envelope);
      }
    } finally { restore(); }
  });

  it("does not mutate the predecessor if recovery has no safe support", () => {
    const saved = legacy(), untouched = structuredClone(saved);
    const walkable = vi.spyOn(WorldLayout, "isWalkable").mockReturnValue(false);
    try {
      expect(() => migrateOrganicMainland51(saved.state)).toThrow("safe Neva support");
      expect(saved).toEqual(untouched);
    } finally { walkable.mockRestore(); }
  });
});

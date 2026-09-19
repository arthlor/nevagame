import { describe, expect, it } from "vitest";
import type { GameState } from "../../src/simulation/core/types";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope } from "../../src/persistence/SaveSchema";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { migrateHeadwaterFall47 } from "../../src/persistence/migrateHeadwaterFall47";
import legacy from "../fixtures/save_v46_layout20_headwater_predecessor.json";
import { WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { NEVA_HEADWATERS } from "../../src/world/NevaHeadwaters";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

const RIVER_BED_POSE = {
  x: WorldLayout.riverCenterX(-133),
  z: -133
};

function loadLegacy(): GameState {
  return structuredClone(legacy.state) as unknown as GameState;
}

function isSafeGround(x: number, z: number): boolean {
  return WorldLayout.isWalkable(x, z)
    && !WorldLayout.isWater(x, z)
    && WorldLayout.terrainNormalY(x, z) >= 0.7;
}

describe("v46 → v47 headwater fall migration", () => {
  it("re-authors the reach without touching anything outside the envelope", () => {
    const previous = loadLegacy();
    const before = structuredClone(previous);
    const migrated = migrateHeadwaterFall47(previous);

    expect(migrated.schemaVersion).toBe(47);
    expect(migrated.world.layoutRevision).toBe(21);
    // Inventory, farm, quests, clock and RNG are untouched.
    expect(migrated.inventories).toEqual(before.inventories);
    expect(migrated.farms).toEqual(before.farms);
    expect(migrated.quests).toEqual(before.quests);
    expect(migrated.clock).toEqual(before.clock);
    expect(migrated.metadata.rngState).toBe(before.metadata.rngState);
    expect(migrated.boats).toEqual(before.boats);
    // The migration never mutates its input.
    expect(previous.schemaVersion).toBe(46);
    expect(previous.world.layoutRevision).toBe(20);
  });

  it("re-grounds a valid pose in place instead of teleporting the player", () => {
    const state = loadLegacy();
    state.player.x = -44;
    state.player.z = -152;
    state.player.y = 999;
    const migrated = migrateHeadwaterFall47(state);
    expect(migrated.player.x).toBe(-44);
    expect(migrated.player.z).toBe(-152);
    expect(migrated.player.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(-44, -152) + MOUNT_TUNING.playerPoseGroundOffsetMeters,
      6
    );
  });

  it("moves a player stranded on the new fall face to safe ground", () => {
    const state = loadLegacy();
    Object.assign(state.player, RIVER_BED_POSE, { y: 5 });
    const migrated = migrateHeadwaterFall47(state);
    const { x, z, y } = migrated.player;
    expect(isSafeGround(x, z), `recovered to ${x},${z}`).toBe(true);
    expect(y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(x, z) + MOUNT_TUNING.playerPoseGroundOffsetMeters,
      6
    );
    // The shortest valid move keeps the player on the same reach, not across
    // the island: the spring rest stop well upstream or the harbor are wrong.
    expect(Math.hypot(x - RIVER_BED_POSE.x, z - RIVER_BED_POSE.z)).toBeLessThan(26);
    expect(x).toBeGreaterThan(WorldLayout.riverCenterX(z) - 30);
  });

  it("re-grounds mounts and structures inside the envelope only", () => {
    const state = loadLegacy();
    const [mountId, mount] = Object.entries(state.mounts)[0];
    const mountTypeId = mount.mountTypeId;
    mount.x = -30;
    mount.z = -146;
    mount.y = 500;
    const stationId = Object.keys(state.world.structures)[0];
    const station = state.world.structures[stationId];
    const stationBefore = { x: station.x, y: station.y, z: station.z };
    const migrated = migrateHeadwaterFall47(state);
    const migratedMount = migrated.mounts[mountId];
    // The injected pose stands in the channel, so the mount takes the shortest
    // move to dry ground; identity and rig stay untouched.
    expect(isSafeGround(migratedMount.x, migratedMount.z)).toBe(true);
    expect(Math.hypot(migratedMount.x + 30, migratedMount.z + 146)).toBeLessThan(6);
    expect(migratedMount.y).toBeCloseTo(
      WorldLayout.traversalSurfaceHeight(migratedMount.x, migratedMount.z),
      6
    );
    expect(migratedMount.mountTypeId).toBe(mountTypeId);
    // The first authored station sits outside the envelope and keeps its pose.
    expect(migrated.world.structures[stationId]).toMatchObject(stationBefore);
  });

  it("walks the retained fixture through the shipping chain and validates", () => {
    const envelope = migrateSaveData(structuredClone(legacy) as never);
    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(envelope.state.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(validateSaveEnvelope(envelope)).toBe(true);
  });

  it("is idempotent behind the shipping gate", () => {
    const once = migrateSaveData(structuredClone(legacy) as never);
    const twice = migrateSaveData(structuredClone(once) as never);
    expect(twice.state).toEqual(once.state);
  });

  it("keeps the live fall between the two named reaches", () => {
    const fall = NEVA_HEADWATERS.fall;
    const migrated = migrateHeadwaterFall47(loadLegacy());
    expect(migrated.world.layoutRevision).toBe(21);
    expect(WorldLayout.isWater(WorldLayout.riverCenterX(fall.lipZ), fall.lipZ - 1)).toBe(true);
    // The plunge pool carries water while its bank stays dry and walkable.
    // The bank probe follows the live section, because the carved basin moves
    // the waterline outward from the centreline.
    const poolX = WorldLayout.riverCenterX(-126);
    const poolSection = WorldLayout.riverSectionAt(-126);
    const bankX = poolSection.centerX - (poolSection.leftWaterWidth + poolSection.leftBankRun * 0.4);
    expect(WorldLayout.isWater(poolX, -126)).toBe(true);
    expect(isSafeGround(bankX, -126)).toBe(true);
  });
});

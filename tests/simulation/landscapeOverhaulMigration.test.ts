import { describe, expect, it } from "vitest";
import fixture from "../fixtures/save_v37_layout15.json";
import { migrateSaveData } from "../../src/persistence/SaveMigrations";
import { CURRENT_SCHEMA_VERSION, validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { WORLD_LAYOUT_REVISION } from "../../src/world/WorldAnchors";
import { WorldLayout } from "../../src/world/WorldLayout";
import { playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { FARMHOUSE_INTERIOR_DOOR } from "../../src/world/FarmhouseInterior";
import { expectContractsPreserved, expectFarmsPreserved, expectMarketsPreserved } from "../helpers/migrationPreservation";
import { WORK_CAPACITY_MAXIMUM } from "../../src/simulation/domains/ProgressionDomain";

const legacy = () => structuredClone(fixture) as unknown as SaveEnvelope;
function expectResourcesUnchanged(after: SaveEnvelope, before: SaveEnvelope) {
  for (const key of ["inventories", "crops", "processingJobs", "boats", "fishCargo", "quests", "journal", "clock", "weather", "metadata"] as const) {
    expect(after.state[key], key).toEqual(before.state[key]);
  }
  expectContractsPreserved(after.state, before.state);
  expectFarmsPreserved(after.state, before.state);
  expectMarketsPreserved(after.state, before.state);
  for (const key of ["money", "proficiencies", "equipment", "ownedRodIds"] as const) {
    expect(after.state.player[key], key).toEqual(before.state.player[key]);
  }
  // v43 intentionally rescales the Work pool to the daily ceiling.
  const beforeWork = before.state.player.workCapacity;
  expect(after.state.player.workCapacity.maximum).toBe(WORK_CAPACITY_MAXIMUM);
  expect(after.state.player.workCapacity.current).toBe(
    Math.round((beforeWork.current / beforeWork.maximum) * WORK_CAPACITY_MAXIMUM)
  );
}

describe("landscape overhaul migration (v38 / layout16)", () => {
  it("loads the retained pre-overhaul save without mutating it or its resources", () => {
    const before = legacy();
    const untouched = structuredClone(before);
    expect(validateSaveEnvelope(before)).toBe(true);
    const after = migrateSaveData(before);
    expect(after.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(after.state.world.layoutRevision).toBe(WORLD_LAYOUT_REVISION);
    expect(validateSaveEnvelope(after)).toBe(true);
    expect(before).toEqual(untouched);
    expectResourcesUnchanged(after, before);
    expect(migrateSaveData(after)).toEqual(after);
  });

  it.each([
    ["Neva", -126, -116, 15.988130798339844, "island.neva"],
    ["Sunreach", 566, 4, 18, "island.sunreach"]
  ] as const)("recovers a %s hillside pose on the same island", (_label, x, z, oldGround, island) => {
    const before = legacy();
    Object.assign(before.state.player, { x, z, y: oldGround + 0.5, activeMountId: null, activeBoatId: null });
    const after = migrateSaveData(before);
    const player = after.state.player;
    expect(WorldLayout.terrainPatchAt(player.x, player.z)?.islandId).toBe(island);
    expect(player.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(player.x, player.z) + 0.5, 6);
    expect(WorldLayout.isWalkable(player.x, player.z)).toBe(true);
    expectResourcesUnchanged(after, before);
  });

  it("keeps the rider attached to a recovered mount and preserves its gait resource", () => {
    const before = legacy();
    const mount = Object.values(before.state.mounts)[0];
    Object.assign(mount, { x: -126, z: -116, y: 15.988130798339844 });
    before.state.player.activeMountId = mount.id;
    Object.assign(before.state.player, playerPoseFromMount(mount));
    const after = migrateSaveData(before);
    const recovered = after.state.mounts[mount.id];
    expect(recovered.y).toBeCloseTo(WorldLayout.traversalSurfaceHeight(recovered.x, recovered.z), 6);
    expect(after.state.player).toMatchObject(playerPoseFromMount(recovered));
    expect({ ...recovered, x: mount.x, y: mount.y, z: mount.z }).toEqual(mount);
    expect(after.state.player.y - recovered.y).toBe(0.5);
    expect(validateSaveEnvelope(after)).toBe(true);
  });

  it("keeps interior poses and all vessel transactions intact", () => {
    const before = legacy();
    Object.assign(before.state.player, FARMHOUSE_INTERIOR_DOOR.enterSpawn);
    const player = structuredClone(before.state.player);
    const after = migrateSaveData(before);
    expect({ ...after.state.player, workCapacity: player.workCapacity }).toEqual(player);
    expectResourcesUnchanged(after, before);
  });
});

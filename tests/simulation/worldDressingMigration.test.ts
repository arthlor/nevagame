import { beforeAll, describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { migrateTerrainLayout14 } from "../../src/persistence/migrateTerrainLayout14";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import { WorldLayout } from "../../src/world/WorldLayout";
import { STARTER_DONKEY_ID, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import fixture from "../fixtures/save_v33_layout13.json";

beforeAll(() => ContentRegistry.initializeAndValidate());
describe("layout 14 dressing recovery", () => {
  it.each([false, true])("recovers a saved crate footprint without changing resources (mounted=%s)", (mounted) => {
    const envelope = structuredClone(fixture) as unknown as SaveEnvelope;
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const before = envelope.state;
    if (mounted) {
      Object.assign(before.mounts[STARTER_DONKEY_ID], { x: before.player.x, z: before.player.z,
        y: WorldLayout.traversalSurfaceHeight(before.player.x, before.player.z) });
      before.player.activeMountId = STARTER_DONKEY_ID;
      Object.assign(before.player, playerPoseFromMount(before.mounts[STARTER_DONKEY_ID]));
    }
    const untouched = structuredClone(before);
    const after = migrateTerrainLayout14(before);
    expect(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z)).toBeGreaterThan(0.4);
    expect(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z)).toBeLessThan(8);
    if (mounted) expect(after.player).toMatchObject(playerPoseFromMount(after.mounts[STARTER_DONKEY_ID]));
    for (const key of ["inventories", "crops", "farms", "fishCargo", "quests", "journal", "metadata", "clock"] as const) expect(after[key]).toEqual(before[key]);
    expect(before).toEqual(untouched);
    expect(validateSaveEnvelope({ ...envelope, schemaVersion: 34, state: after })).toBe(true);
    expect(migrateTerrainLayout14(after)).toEqual(after);
  });
});

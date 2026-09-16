import { beforeAll, describe, expect, it } from "vitest";
import { Object3D } from "three";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { projectAssetCollision } from "../../src/physics/CollisionCatalogAdapter";
import { staticPoseIsClear } from "../../src/physics/StaticCollision";
import { migrateTerrainLayout14 } from "../../src/persistence/migrateTerrainLayout14";
import { validateSaveEnvelope, type SaveEnvelope } from "../../src/persistence/SaveSchema";
import type { AssetId } from "../../src/render/assets/AssetCatalog";
import { STARTER_DONKEY_ID, playerPoseFromMount } from "../../src/simulation/mounts/Mounts";
import { createWorldStaticPlacements } from "../../src/world/WorldEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import fixture from "../fixtures/save_v33_layout13.json";

beforeAll(() => ContentRegistry.initializeAndValidate());

/**
 * The layout-14 migration recovers a pose obstructed by the layout-14 dressing.
 * The dressing itself is re-authored over time (layout 19 moved the village
 * crate the retained fixture originally stood in), so this locates an
 * obstructed Neva pose from the live placement set rather than hard-coding a
 * coordinate that a later dressing pass may move again.
 */
function findObstructedNevaPose(worldSeed: number): { x: number; z: number } {
  const placements = createWorldStaticPlacements(worldSeed);
  const collision = placements.flatMap((placement) => {
    const root = new Object3D();
    root.position.set(
      placement.x,
      placement.y ?? WorldLayout.terrainHeight(placement.x, placement.z),
      placement.z
    );
    root.rotation.y = placement.rotationY;
    root.scale.set(...placement.scale);
    return projectAssetCollision(placement.assetId as AssetId, root, placement.id);
  });
  for (const placement of placements) {
    const point = { x: placement.x, z: placement.z };
    if (WorldLayout.isInterior(point.x, point.z)) continue;
    if (WorldLayout.terrainPatchAt(point.x, point.z)?.id !== "terrain.neva") continue;
    if (!staticPoseIsClear(collision, point, WorldLayout.traversalSurfaceHeight(point.x, point.z), 0.4)) {
      return point;
    }
  }
  throw new Error("no obstructed Neva dressing pose found");
}

describe("layout 14 dressing recovery", () => {
  it.each([false, true])("recovers a saved dressing footprint without changing resources (mounted=%s)", (mounted) => {
    const envelope = structuredClone(fixture) as unknown as SaveEnvelope;
    expect(validateSaveEnvelope(envelope)).toBe(true);
    const before = envelope.state;
    const obstructed = findObstructedNevaPose(before.worldSeed);
    Object.assign(before.player, {
      x: obstructed.x,
      z: obstructed.z,
      y: WorldLayout.traversalSurfaceHeight(obstructed.x, obstructed.z) + 0.5,
      activeBoatId: null
    });
    if (mounted) {
      Object.assign(before.mounts[STARTER_DONKEY_ID], {
        x: before.player.x,
        z: before.player.z,
        y: WorldLayout.traversalSurfaceHeight(before.player.x, before.player.z)
      });
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

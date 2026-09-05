import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";
import { PLAYER_TRAVERSAL_TUNING } from "../../src/simulation/navigation/PlayerTraversal";
import {
  isPlacementFootprintStable,
  createWorldEnvironmentLayout
} from "../../src/world/WorldEnvironmentLayout";
import {
  STARTER_DONKEY_ANCHOR,
  STARTER_DONKEY_LOCAL_ANCHOR,
  STARTER_FARM_LAYOUT,
  worldToFarmLocal
} from "../../src/world/FarmLayout";
import { WorldLayout } from "../../src/world/WorldLayout";
import { loadHumanoidAsset } from "../helpers/humanoidAssets";

const ROOT = path.resolve(import.meta.dirname, "../..");
const publishedManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public/assets/models/asset-manifest.json"), "utf8")
) as { assets: Array<Record<string, unknown>> };

describe("starter donkey asset and placement contract", () => {
  it("registers the authored donkey rig, socket, clips, and LOD in the runtime catalog", () => {
    const donkey = ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A);
    expect(donkey).toBeDefined();
    expect(donkey).toMatchObject({
      id: "fauna_donkey_a",
      family: "prop",
      collision: "none",
      lod: "hero",
      rootNode: "fauna_donkey_a_root",
      readDistanceMeters: 30,
      rigNode: null
    });
    expect(donkey?.requiredNodes).toEqual(expect.arrayContaining([
      "fauna_donkey_a_LOD0",
      "fauna_donkey_a_LOD1",
      "fauna_donkey_a_motion_root",
      "fauna_donkey_a_head_pivot",
      "fauna_donkey_a_ear_left_pivot",
      "fauna_donkey_a_ear_right_pivot",
      "fauna_donkey_a_tail_pivot",
      "fauna_donkey_a_leg_front_left_pivot",
      "fauna_donkey_a_leg_front_left_lower_pivot",
      "fauna_donkey_a_leg_front_right_pivot",
      "fauna_donkey_a_leg_front_right_lower_pivot",
      "fauna_donkey_a_leg_rear_left_pivot",
      "fauna_donkey_a_leg_rear_left_lower_pivot",
      "fauna_donkey_a_leg_rear_right_pivot",
      "fauna_donkey_a_leg_rear_right_lower_pivot",
      "fauna_donkey_a_rider_socket",
      "fauna_donkey_a_stirrup_left_socket",
      "fauna_donkey_a_stirrup_right_socket"
    ]));
    expect(donkey?.animationClips?.map((clip) => clip.name)).toEqual([
      "idle", "graze", "look", "walk", "trot", "gallop", "mount", "dismount"
    ]);
    expect(donkey?.animationClips?.find((clip) => clip.name === "walk")?.events?.map((event) => event.name)).toEqual([
      "hoofstep_rear_left",
      "hoofstep_front_left",
      "hoofstep_rear_right",
      "hoofstep_front_right"
    ]);
    expect(donkey?.animationClips?.find((clip) => clip.name === "trot")?.events?.map((event) => event.name)).toEqual([
      "hoofstep_front_left_rear_right",
      "hoofstep_front_right_rear_left"
    ]);
    expect(donkey?.lodLevels?.map((level) => level.node)).toEqual([
      "fauna_donkey_a_LOD0", "fauna_donkey_a_LOD1"
    ]);
    expect(donkey?.lodLevels?.[1]?.triangleRatioMax).toBeLessThanOrEqual(0.72);

    const player = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A);
    const playerClipNames = [
      ...(player?.animationClips ?? []),
      ...(player?.additionalAnimationClips ?? [])
    ].map((clip) => clip.name);
    expect(playerClipNames).toEqual(expect.arrayContaining([
      "mounted_idle", "mounted_walk", "mounted_trot", "mount", "mount_right", "dismount", "dismount_right"
    ]));
  });

  it("keeps mounted tiers distinct, matches source locomotion timing and aligns mount gait clips to the 30 fps grid", async () => {
    const donkey = ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)!;
    const player = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
    const donkeyClips = new Map((donkey.animationClips ?? []).map((clip) => [clip.name, clip]));
    const playerClips = new Map([
      ...(player.animationClips ?? []),
      ...(player.additionalAnimationClips ?? [])
    ].map((clip) => [clip.name, clip]));

    // Riding must beat travelling on foot at every tier, or the mount is a
    // downgrade. This is the assertion that would have caught the shipped
    // 3.7 m/s trot losing to a 3.8 m/s sprint.
    expect(MOUNT_TUNING.walkSpeedMetersPerSecond).toBeGreaterThan(PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond);
    expect(MOUNT_TUNING.trotSpeedMetersPerSecond).toBeGreaterThan(PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond);
    expect(MOUNT_TUNING.gallopSpeedMetersPerSecond).toBeGreaterThan(MOUNT_TUNING.trotSpeedMetersPerSecond);

    expect(donkeyClips.get("walk")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.walkSpeedMetersPerSecond);
    expect(donkeyClips.get("trot")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.trotSpeedMetersPerSecond);
    expect(donkeyClips.get("gallop")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.gallopSpeedMetersPerSecond);
    const playerAsset = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const sourceClips = playerAsset.userData.animationClips as Array<{ name: string; duration: number }>;
    for (const name of ["walk", "run"]) {
      const duration = playerClips.get(name)?.durationSeconds;
      expect(duration).toBeGreaterThan(0);
      expect(sourceClips.find((clip) => clip.name === name)?.duration).toBeCloseTo(duration!, 6);
    }
    expect(playerClips.get("mounted_walk")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.walkSpeedMetersPerSecond);
    expect(playerClips.get("mounted_trot")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.trotSpeedMetersPerSecond);
    expect(playerClips.get("mounted_gallop")?.referenceSpeedMetersPerSecond).toBe(MOUNT_TUNING.gallopSpeedMetersPerSecond);
    expect(playerClips.get("mounted_walk")?.durationSeconds).toBe(donkeyClips.get("walk")?.durationSeconds);
    expect(playerClips.get("mounted_trot")?.durationSeconds).toBe(donkeyClips.get("trot")?.durationSeconds);
    expect(playerClips.get("mounted_gallop")?.durationSeconds).toBe(donkeyClips.get("gallop")?.durationSeconds);

    for (const clip of [donkeyClips.get("walk"), donkeyClips.get("trot"), donkeyClips.get("gallop")]) {
      expect(clip).toBeDefined();
      expect(clip!.durationSeconds * 30).toBeCloseTo(Math.round(clip!.durationSeconds * 30), 4);
      for (const event of clip!.events ?? []) {
        expect(event.timeSeconds * 30).toBeCloseTo(Math.round(event.timeSeconds * 30), 4);
        expect(event.timeSeconds).toBeLessThan(clip!.durationSeconds);
      }
    }
  });

  it("keeps the published donkey GLB mechanically in parity with its catalog contract", () => {
    const manifestAsset = publishedManifest.assets.find((asset) => asset.id === "fauna_donkey_a");
    expect(manifestAsset).toBeDefined();
    expect(manifestAsset).toMatchObject({
      generator: "fauna_donkey",
      collision: "none",
      lod: "hero",
      artContractStatus: "passed",
      qualityStatus: "on_target"
    });
    expect(manifestAsset?.requiredNodes).toEqual(ASSET_BY_ID.get(ASSET_IDS.FAUNA_DONKEY_A)?.requiredNodes);
    expect((manifestAsset?.animationClips as Array<{ name: string }>).map((clip) => clip.name)).toEqual([
      "idle", "graze", "look", "walk", "trot", "gallop", "mount", "dismount"
    ]);
    expect(fs.existsSync(path.join(ROOT, "public/assets/models/fauna_donkey_a.glb"))).toBe(true);
  });

  it("places exactly one state-bound donkey at the stable starter-farm anchor", () => {
    const layout = createWorldEnvironmentLayout(42891);
    const placements = layout.staticPlacements.filter((placement) => placement.assetId === ASSET_IDS.FAUNA_DONKEY_A);
    expect(placements).toHaveLength(1);
    const [placement] = placements;
    expect(placement).toMatchObject({
      id: "authored.fauna.donkey.starter",
      origin: "authored",
      x: STARTER_DONKEY_ANCHOR.x,
      z: STARTER_DONKEY_ANCHOR.z,
      rotationY: STARTER_DONKEY_ANCHOR.rotationY,
      grounding: STARTER_DONKEY_ANCHOR.grounding
    });
    expect(isPlacementFootprintStable(placement, 0.72, 0.78)).toBe(true);
    expect(WorldLayout.isWalkable(placement.x, placement.z)).toBe(true);
    expect(WorldLayout.isWater(placement.x, placement.z)).toBe(false);
    expect(WorldLayout.isInterior(placement.x, placement.z)).toBe(false);
    expect(WorldLayout.terrainNormal(placement.x, placement.z).y).toBeGreaterThan(0.72);

    const local = worldToFarmLocal(STARTER_FARM_LAYOUT.farmId, placement);
    expect(local.x).toBeCloseTo(STARTER_DONKEY_LOCAL_ANCHOR.x, 6);
    expect(local.z).toBeCloseTo(STARTER_DONKEY_LOCAL_ANCHOR.z, 6);
    expect(local.x).toBeGreaterThan(STARTER_FARM_LAYOUT.plantableAreas[0]!.maxX);
    expect(local.z).toBeLessThan(STARTER_FARM_LAYOUT.plantableAreas[0]!.minZ);

    for (const nearbyId of [
      "authored.farm.wheelbarrow",
      "authored.fauna.chicken.farm-a",
      "authored.fauna.chicken.farm-b",
      "authored.fauna.cow.farm-meadow"
    ]) {
      const nearby = layout.staticPlacements.find((candidate) => candidate.id === nearbyId);
      expect(nearby, nearbyId).toBeDefined();
      expect(Math.hypot(nearby!.x - placement.x, nearby!.z - placement.z))
        .toBeGreaterThan(STARTER_DONKEY_ANCHOR.clearanceRadius);
    }
  }, 60000);
});

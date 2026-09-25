import { describe, it, expect } from "vitest";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { PLAYER_TRAVERSAL_TUNING, CARRIED_LOAD_SPEED_SCALE } from "../../src/simulation/navigation/PlayerTraversal";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

/**
 * Locomotion playback is `resolvedSpeed / clip.referenceSpeed`, deliberately
 * unbounded: the clip advancing at exactly ground speed is what keeps feet
 * planted, and clamping it would introduce the very sliding a clamp is usually
 * reached for. The cost is that raising gameplay speed pushes the authored
 * cadence, so these bounds are pinned here to keep that cost visible.
 */
const SLOPE_GAIT_BOUNDS = { minimum: 0.78, maximum: 1.14 };
/**
 * On flat ground — where the player spends nearly all of their time — the
 * player's gaits play at exactly their authored cadence: the walk and run are
 * authored on the player's own 0.87 m legs at the shipped 2.0 and 5.2 m/s
 * (frozen in the published char_player_a derivative), so their catalog reference speeds
 * are the tuning speeds. A speed change must re-author the stride.
 */
const MAX_FLAT_PLAYBACK = 1;
/**
 * The absolute worst case, sprinting down a steep bank at the 1.14x slope
 * ceiling. Pinned so a further speed increase has to be a deliberate decision.
 */
const MAX_DOWNHILL_PLAYBACK = 1.14;
/**
 * Below this the clip reads as a laboured trudge. The heaviest load up the
 * steepest bank walks at 0.47x: about 70 steps a minute on the body's short
 * 1.6 m stride, a slow but still walking cadence.
 */
const MIN_ACCEPTABLE_PLAYBACK = 0.45;

function clipReferenceSpeed(assetId: string, name: string): number {
  const spec = ASSET_BY_ID.get(assetId as never)!;
  const clip = [
    ...(spec.animationClips ?? []),
    ...(spec.additionalAnimationClips ?? [])
  ].find((entry) => entry.name === name);
  expect(clip, `${assetId} is missing clip ${name}`).toBeDefined();
  expect(clip!.referenceSpeedMetersPerSecond).toBeGreaterThan(0);
  return clip!.referenceSpeedMetersPerSecond!;
}

const heaviestCargoScale = Math.min(...Object.values(CARRIED_LOAD_SPEED_SCALE));

describe("locomotion playback rate at the shipped tuning", () => {
  it.each([
    ["walk", PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond],
    ["run", PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond],
    ["carry_walk", PLAYER_TRAVERSAL_TUNING.walkSpeedMetersPerSecond],
    ["carry_run", PLAYER_TRAVERSAL_TUNING.sprintSpeedMetersPerSecond]
  ])("keeps %s inside a readable range across slope and cargo", (clip, gaitSpeed) => {
    const reference = clipReferenceSpeed(ASSET_IDS.CHAR_PLAYER_A, clip);
    const cargoScale = clip.startsWith("carry_") ? heaviestCargoScale : 1;

    const flat = gaitSpeed / reference;
    const slowest = (gaitSpeed * SLOPE_GAIT_BOUNDS.minimum * cargoScale) / reference;
    const fastest = (gaitSpeed * SLOPE_GAIT_BOUNDS.maximum) / reference;

    expect(flat).toBeLessThanOrEqual(MAX_FLAT_PLAYBACK);
    expect(slowest).toBeGreaterThanOrEqual(MIN_ACCEPTABLE_PLAYBACK);
    expect(fastest).toBeLessThanOrEqual(MAX_DOWNHILL_PLAYBACK);
  });

  it("plays every mounted gait at authored cadence", () => {
    // Rider and donkey clips are baked at the mount tuning, so mounted
    // playback is exactly 1.0 and hooves stay planted.
    const exact: Array<[string, string, number]> = [
      ["mounted_walk", "walk", MOUNT_TUNING.walkSpeedMetersPerSecond],
      ["mounted_trot", "trot", MOUNT_TUNING.trotSpeedMetersPerSecond],
      ["mounted_gallop", "gallop", MOUNT_TUNING.gallopSpeedMetersPerSecond]
    ];
    for (const [riderClip, donkeyClip, speed] of exact) {
      expect(clipReferenceSpeed(ASSET_IDS.CHAR_PLAYER_A, riderClip)).toBe(speed);
      expect(clipReferenceSpeed(ASSET_IDS.FAUNA_DONKEY_A, donkeyClip)).toBe(speed);
    }
  });
});

import { describe, expect, it } from "vitest";
import { resolveMountPresentationPose } from "../../src/render/presentation/MountPresentation";
import {
  PlayerPresentationBuffer,
  stationaryPlayerMotion,
  type PresentedPlayerFrame
} from "../../src/render/presentation/PlayerPresentationBuffer";
import type { MountState } from "../../src/simulation/core/types";
import { MOUNT_TUNING } from "../../src/simulation/mounts/Mounts";

function presentedPlayer(overrides: Partial<PresentedPlayerFrame> = {}): PresentedPlayerFrame {
  const pose = {
    x: 12.35,
    y: 4.8,
    z: -7.65,
    rotationY: 0.42,
    traversal: {
      sprintStamina: 100,
      sprintRecoveryDelaySeconds: 0,
      sprintExhausted: false,
      isGrounded: true
    }
  };
  return {
    ...pose,
    motion: stationaryPlayerMotion(pose),
    discontinuityReason: "none",
    discontinuitySequence: 0,
    ...overrides
  };
}

describe("mount presentation", () => {
  const canonicalMount: MountState = {
    id: "mount.donkey_starter",
    mountTypeId: "mount.donkey",
    x: 12,
    y: 4.2,
    z: -8,
    rotationY: 0.3,
    gallopStamina: MOUNT_TUNING.maximumGallopStamina,
    gallopRecoveryDelaySeconds: 0,
    gallopExhausted: false
  };

  it("renders a mounted donkey from the interpolated player frame", () => {
    const player = presentedPlayer();
    expect(resolveMountPresentationPose(canonicalMount, player, true)).toEqual({
      x: player.x,
      y: player.y - MOUNT_TUNING.playerPoseGroundOffsetMeters,
      z: player.z,
      rotationY: player.rotationY
    });
  });

  it("keeps canonical mount presentation while unmounted", () => {
    expect(resolveMountPresentationPose(canonicalMount, presentedPlayer(), false)).toEqual(canonicalMount);
  });

  it("snaps the interpolation buffer to a dismounting discontinuity", () => {
    const buffer = new PlayerPresentationBuffer();
    const mounted = presentedPlayer();
    buffer.reset(mounted, mounted.motion);
    const dismounted = {
      ...mounted,
      x: mounted.x - MOUNT_TUNING.dismountClearanceMeters
    };
    buffer.pushCanonicalPose(dismounted, { discontinuity: "dismounting" });

    expect(buffer.sample(0.2)).toMatchObject({
      x: dismounted.x,
      y: dismounted.y,
      z: dismounted.z,
      discontinuityReason: "dismounting",
      discontinuitySequence: 1
    });
  });
});

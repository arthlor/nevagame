import type { MountState } from "../../simulation/core/types";
import { MOUNT_TUNING } from "../../simulation/mounts/Mounts";
import type { PresentedPlayerFrame } from "./PlayerPresentationBuffer";

export interface PresentedMountPose {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export function resolveMountPresentationPose(
  mount: Readonly<MountState>,
  player: PresentedPlayerFrame,
  isMounted: boolean
): PresentedMountPose {
  if (!isMounted) return mount;
  return {
    x: player.x,
    y: player.y - MOUNT_TUNING.playerPoseGroundOffsetMeters,
    z: player.z,
    rotationY: player.rotationY
  };
}

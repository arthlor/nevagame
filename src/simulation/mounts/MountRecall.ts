import type { MountState, PlayerState } from "../core/types";
import { WorldLayout } from "../../world/WorldLayout";
import { MOUNT_TUNING, isMountableTraversalPoint, isValidMountPose } from "./Mounts";

/**
 * Calling the donkey places it straight beside the player. The spot is chosen
 * from a fixed ring of candidates and must be ground the donkey could stand on,
 * level with the player and, when physics is attached, reachable without a
 * wall between them and roomy enough for its body.
 */
export const MOUNT_RECALL_TUNING = Object.freeze({
  /** Rings tried nearest first: close enough to board, never overlapping the player. */
  candidateRadiiMeters: [2.2, 2.8, 3.4] as const,
  /** Headings relative to the player's facing: flanks first, then behind, then ahead. */
  candidateOffsetsRadians: [
    Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI,
    Math.PI / 4, -Math.PI / 4, 0
  ] as const,
  /** Already this close, the call leaves the donkey where it stands. */
  nearbyDistanceMeters: 3,
  /** The spot must sit within this height of the player's feet (no ledge or other floor). */
  maximumHeightStepMeters: 0.6,
  /** Half the body length swept along the donkey's heading at the spot. */
  bodyHalfLengthMeters: 0.75
});

export type MountRecallRefusal = "no-mount" | "riding" | "nearby" | "unreachable" | "no-safe-spot";

/** Static obstruction between two ground points at the donkey's body height; true when clear. */
export type MountPathQuery = (
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number }
) => boolean;

export type MountRecallPose = Pick<MountState, "x" | "y" | "z" | "rotationY">;

export type MountRecallResult =
  | { ok: true; pose: MountRecallPose }
  | { ok: false; refusal: MountRecallRefusal };

/**
 * Picks the donkey's new pose, or says why it cannot come. Pure: the caller
 * commits the pose, so a refusal never moves anything.
 */
export function resolveMountRecall(
  mount: Readonly<MountState> | undefined,
  player: Pick<PlayerState, "x" | "y" | "z" | "rotationY" | "activeMountId" | "activeBoatId">,
  pathClear?: MountPathQuery
): MountRecallResult {
  if (!mount) return { ok: false, refusal: "no-mount" };
  if (player.activeMountId === mount.id) return { ok: false, refusal: "riding" };
  if (Math.hypot(mount.x - player.x, mount.z - player.z) <= MOUNT_RECALL_TUNING.nearbyDistanceMeters) {
    return { ok: false, refusal: "nearby" };
  }
  if (player.activeMountId || player.activeBoatId || !isMountableTraversalPoint(player.x, player.z)) {
    return { ok: false, refusal: "unreachable" };
  }
  const feet = { x: player.x, y: player.y - MOUNT_TUNING.playerPoseGroundOffsetMeters, z: player.z };
  for (const radius of MOUNT_RECALL_TUNING.candidateRadiiMeters) {
    for (const offset of MOUNT_RECALL_TUNING.candidateOffsetsRadians) {
      const heading = player.rotationY + offset;
      const x = player.x + Math.sin(heading) * radius;
      const z = player.z + Math.cos(heading) * radius;
      if (!isMountableTraversalPoint(x, z)) continue;
      const y = WorldLayout.traversalSurfaceHeight(x, z);
      if (Math.abs(y - feet.y) > MOUNT_RECALL_TUNING.maximumHeightStepMeters) continue;
      // Stand parallel to the player, ready to board.
      const pose: MountRecallPose = { x, y, z, rotationY: player.rotationY };
      if (!isValidMountPose({ ...mount, ...pose })) continue;
      if (pathClear) {
        const reach = MOUNT_RECALL_TUNING.bodyHalfLengthMeters;
        const alongX = Math.sin(pose.rotationY) * reach;
        const alongZ = Math.cos(pose.rotationY) * reach;
        if (!pathClear(feet, pose)) continue;
        if (!pathClear({ x: x - alongX, y, z: z - alongZ }, { x: x + alongX, y, z: z + alongZ })) continue;
      }
      return { ok: true, pose };
    }
  }
  return { ok: false, refusal: "no-safe-spot" };
}

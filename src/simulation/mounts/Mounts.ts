import type { MountState, PlayerState } from "../core/types";
import { STARTER_DONKEY_ANCHOR } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";

export const STARTER_DONKEY_ID = "mount.donkey_starter" as const;
export const STARTER_DONKEY_TYPE_ID = "mount.donkey" as const;

/** Canonical authored offsets shared by boarding, physics, saves, and presentation. */
export const MOUNT_TUNING = Object.freeze({
  walkSpeedMetersPerSecond: 5.5,
  trotSpeedMetersPerSecond: 8.5,
  accelerationMetersPerSecondSquared: 18,
  decelerationMetersPerSecondSquared: 24,
  playerPoseGroundOffsetMeters: 0.5,
  dismountClearanceMeters: 1.25,
  boardRadiusMeters: 2.75,
  terrainHeightToleranceMeters: 0.32,
  maximumSlopeNormalY: Math.cos((46 * Math.PI) / 180)
});

function hasMountableGroundNormal(x: number, z: number): boolean {
  return WorldLayout.traversalSurfaceSample(x, z).normal.y >= MOUNT_TUNING.maximumSlopeNormalY;
}

export function createStarterDonkeyState(): MountState {
  return {
    id: STARTER_DONKEY_ID,
    mountTypeId: STARTER_DONKEY_TYPE_ID,
    x: STARTER_DONKEY_ANCHOR.x,
    y: WorldLayout.traversalSurfaceHeight(STARTER_DONKEY_ANCHOR.x, STARTER_DONKEY_ANCHOR.z),
    z: STARTER_DONKEY_ANCHOR.z,
    rotationY: STARTER_DONKEY_ANCHOR.rotationY
  };
}

export function isValidMountPose(mount: Readonly<MountState>): boolean {
  if (
    mount.id !== STARTER_DONKEY_ID ||
    mount.mountTypeId !== STARTER_DONKEY_TYPE_ID ||
    ![mount.x, mount.y, mount.z, mount.rotationY].every(Number.isFinite)
  ) return false;
  if (
    !WorldLayout.isWalkable(mount.x, mount.z) ||
    WorldLayout.isWater(mount.x, mount.z) ||
    WorldLayout.isInterior(mount.x, mount.z) ||
    WorldLayout.isPierDeck(mount.x, mount.z)
  ) return false;
  if (!hasMountableGroundNormal(mount.x, mount.z)) return false;
  return Math.abs(mount.y - WorldLayout.traversalSurfaceHeight(mount.x, mount.z)) <= MOUNT_TUNING.terrainHeightToleranceMeters;
}

export function mountPoseFromPlayer(player: Pick<PlayerState, "x" | "y" | "z" | "rotationY">): Pick<MountState, "x" | "y" | "z" | "rotationY"> {
  return {
    x: player.x,
    y: player.y - MOUNT_TUNING.playerPoseGroundOffsetMeters,
    z: player.z,
    rotationY: player.rotationY
  };
}

export function playerPoseFromMount(mount: Readonly<MountState>): Pick<PlayerState, "x" | "y" | "z" | "rotationY"> {
  return {
    x: mount.x,
    y: mount.y + MOUNT_TUNING.playerPoseGroundOffsetMeters,
    z: mount.z,
    rotationY: mount.rotationY
  };
}

export function isPlayerAtMountPose(
  player: Pick<PlayerState, "x" | "y" | "z">,
  mount: Readonly<MountState>,
  toleranceMeters: number = 0.2
): boolean {
  const expected = playerPoseFromMount(mount);
  return Math.hypot(player.x - expected.x, player.z - expected.z) <= toleranceMeters &&
    Math.abs(player.y - expected.y) <= toleranceMeters;
}

export function isValidPlayerMountGround(player: Pick<PlayerState, "x" | "y" | "z">): boolean {
  if (
    ![player.x, player.y, player.z].every(Number.isFinite) ||
    !WorldLayout.isWalkable(player.x, player.z) ||
    WorldLayout.isWater(player.x, player.z) ||
    WorldLayout.isInterior(player.x, player.z) ||
    WorldLayout.isPierDeck(player.x, player.z)
  ) return false;
  if (!hasMountableGroundNormal(player.x, player.z)) return false;
  return Math.abs(player.y - (WorldLayout.traversalSurfaceHeight(player.x, player.z) + MOUNT_TUNING.playerPoseGroundOffsetMeters)) <=
    MOUNT_TUNING.terrainHeightToleranceMeters;
}

export function mountDismountPoseCandidates(
  player: Pick<PlayerState, "x" | "y" | "z" | "rotationY">
): readonly [
  Pick<PlayerState, "x" | "y" | "z" | "rotationY">,
  Pick<PlayerState, "x" | "y" | "z" | "rotationY">
] {
  const lateralX = Math.cos(player.rotationY) * MOUNT_TUNING.dismountClearanceMeters;
  const lateralZ = -Math.sin(player.rotationY) * MOUNT_TUNING.dismountClearanceMeters;
  const poseAt = (x: number, z: number) => ({
    x,
    y: WorldLayout.traversalSurfaceHeight(x, z) + MOUNT_TUNING.playerPoseGroundOffsetMeters,
    z,
    rotationY: player.rotationY
  });
  return [
    poseAt(player.x - lateralX, player.z - lateralZ),
    poseAt(player.x + lateralX, player.z + lateralZ)
  ];
}

export function resolveMountDismountPose(
  player: Pick<PlayerState, "x" | "y" | "z" | "rotationY">
): Pick<PlayerState, "x" | "y" | "z" | "rotationY"> | null {
  const [left, right] = mountDismountPoseCandidates(player);
  if (isValidPlayerMountGround(left)) return left;
  if (isValidPlayerMountGround(right)) return right;
  return null;
}

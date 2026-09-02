import type { MountState, PlayerState } from "../core/types";
import { STARTER_DONKEY_ANCHOR } from "../../world/FarmLayout";
import { WorldLayout } from "../../world/WorldLayout";

export const STARTER_DONKEY_ID = "mount.donkey_starter" as const;
export const STARTER_DONKEY_TYPE_ID = "mount.donkey" as const;

/** Canonical authored offsets shared by boarding, physics, saves, and presentation. */
export const MOUNT_TUNING = Object.freeze({
  // Every gait clears the rider's equivalent on foot. A trot that lost to a
  // sprint (3.7 against 3.8) made the donkey a downgrade; the trot is now the
  // free cruise and the gallop is the quota-gated burst.
  walkSpeedMetersPerSecond: 1.7,
  trotSpeedMetersPerSecond: 4.9,
  gallopSpeedMetersPerSecond: 7.2,
  maximumGallopStamina: 100,
  // Roughly seven seconds of gallop, against the player's four and a half, so
  // the mount reads as a genuine advantage rather than a reskinned sprint.
  gallopDrainPerSecond: 14,
  gallopRecoveryPerSecond: 18,
  gallopRecoveryDelaySeconds: 1,
  gallopResumeThreshold: 25,
  accelerationMetersPerSecondSquared: 4.5,
  decelerationMetersPerSecondSquared: 7.5,
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
    rotationY: STARTER_DONKEY_ANCHOR.rotationY,
    gallopStamina: MOUNT_TUNING.maximumGallopStamina,
    gallopRecoveryDelaySeconds: 0,
    gallopExhausted: false
  };
}

export interface MountGaitStepInput {
  wantsGallop: boolean;
  isMoving: boolean;
}

export interface MountGaitStepResult {
  gallopStamina: number;
  gallopRecoveryDelaySeconds: number;
  gallopExhausted: boolean;
  isGalloping: boolean;
}

/**
 * Advances the mount's gallop budget once per fixed simulation step.
 *
 * Deliberately mirrors `advancePlayerTraversal` so the two budgets behave
 * identically from the player's point of view and only differ in their numbers.
 */
export function advanceMountGait(
  current: Readonly<Pick<MountState, "gallopStamina" | "gallopRecoveryDelaySeconds" | "gallopExhausted">>,
  input: Readonly<MountGaitStepInput>,
  fixedDeltaSeconds: number
): MountGaitStepResult {
  const dt = Math.max(0, fixedDeltaSeconds);
  const maximum = MOUNT_TUNING.maximumGallopStamina;
  const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
  let stamina = Math.min(maximum, Math.max(0, finiteOr(current.gallopStamina, maximum)));
  let recoveryDelay = Math.max(0, finiteOr(current.gallopRecoveryDelaySeconds, 0));
  let exhausted = current.gallopExhausted === true;

  if (exhausted && stamina >= MOUNT_TUNING.gallopResumeThreshold) exhausted = false;

  const isGalloping = input.wantsGallop && input.isMoving && !exhausted && stamina > 0;
  if (isGalloping) {
    stamina = Math.max(0, stamina - MOUNT_TUNING.gallopDrainPerSecond * dt);
    recoveryDelay = MOUNT_TUNING.gallopRecoveryDelaySeconds;
    if (stamina <= 0) exhausted = true;
  } else {
    recoveryDelay = Math.max(0, recoveryDelay - dt);
    if (recoveryDelay <= 0 && stamina < maximum) {
      stamina = Math.min(maximum, stamina + MOUNT_TUNING.gallopRecoveryPerSecond * dt);
    }
    if (exhausted && stamina >= MOUNT_TUNING.gallopResumeThreshold) exhausted = false;
  }

  return {
    gallopStamina: stamina,
    gallopRecoveryDelaySeconds: recoveryDelay,
    gallopExhausted: exhausted,
    isGalloping
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

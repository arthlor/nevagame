import type { GameState, MountState } from '../core/types';
import { WorldLayout } from '../../world/WorldLayout';
import { STARTER_CARRIAGE_ANCHOR } from '../../world/FarmLayout';
import { staticPoseIsClear, type StaticCollisionProxy } from '../../physics/StaticCollision';

export const STARTER_CARRIAGE_ID = 'mount.horse_carriage_starter' as const;
export const CARRIAGE_TYPE_ID = 'mount.horse_carriage' as const;
export const CARRIAGE_TUNING = Object.freeze({
  cargoSlots: 2,
  maximumCargoClass: 'medium' as const,
  walkSpeed: 1.6,
  trotSpeed: 3.2,
  acceleration: 1.5,
  braking: 3,
  wheelbase: 1.976,
  rearAxleOffset: -0.962,
  frontAxleOffset: 1.014,
  maximumSteerAngle: 0.42,
  steeringResponse: 6,
  /** Trot (Shift) budget: roughly ten seconds of trot; walk stays free. */
  staminaMaximum: 100,
  trotDrainPerSecond: 10,
  trotRecoveryPerSecond: 20,
  trotRecoveryDelaySeconds: 1,
  trotResumeThreshold: 25,
  interactionReach: 2.2,
  horseOffset: 3.5,
  rearOffset: -1.65,
  boardOffset: 1.04,
  dismountOffset: 1.8,
  maximumSlopeNormalY: Math.cos(Math.PI / 6)
});

export const isCarriage = (mount: Pick<MountState, 'mountTypeId'> | null | undefined): boolean =>
  mount?.mountTypeId === CARRIAGE_TYPE_ID;

export function carriagePoint(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, lateral: number, forward: number) {
  const c = Math.cos(pose.rotationY), s = Math.sin(pose.rotationY);
  return { x: pose.x + c * lateral + s * forward, z: pose.z - s * lateral + c * forward };
}

/** Overlapping circles cover the bed, shafts and horse, including turning sweep. */
export function carriageFootprint(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, steering = 0) {
  return [[-0.65, 1.05], [0.65, 1.05], [1.8, 0.6], [2.9, 0.55], [4.0, 0.55], [4.8, 0.35]].map(([z, radius]) => {
    const ahead = z > CARRIAGE_TUNING.frontAxleOffset ? z - CARRIAGE_TUNING.frontAxleOffset : 0;
    return { ...carriagePoint(pose, Math.sin(steering) * ahead,
      ahead ? CARRIAGE_TUNING.frontAxleOffset + Math.cos(steering) * ahead : z), radius };
  });
}

export function isCarriageGround(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, steering = 0): boolean {
  return carriageFootprint(pose, steering).every(p => {
    if (WorldLayout.traversalSurfaceSample(p.x, p.z).normal.y < CARRIAGE_TUNING.maximumSlopeNormalY) return false;
    return [[0, 0], [-p.radius, 0], [p.radius, 0], [0, -p.radius], [0, p.radius]].every(([dx, dz]) => {
      const x = p.x + dx, z = p.z + dz;
      return WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && !WorldLayout.isInterior(x, z)
        && !WorldLayout.isPierDeck(x, z) && !WorldLayout.isPierStairs(x, z);
    });
  });
}

export function carriagePoseIsClear(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, boxes: readonly StaticCollisionProxy[], steering = 0): boolean {
  return isCarriageGround(pose, steering) && carriageFootprint(pose, steering).every(p =>
    staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), p.radius));
}

/** Rear wheels roll along their tangent; the kingpin turns the front axle/horse. */
export function advanceCarriagePose(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, speed: number, steering: number, dt: number) {
  const yawRate = speed * Math.tan(steering) / CARRIAGE_TUNING.wheelbase;
  const rotationY = pose.rotationY + yawRate * dt;
  const rear = carriagePoint(pose, 0, CARRIAGE_TUNING.rearAxleOffset);
  const middleYaw = (pose.rotationY + rotationY) / 2;
  return {
    x: rear.x + Math.sin(middleYaw) * speed * dt - Math.sin(rotationY) * CARRIAGE_TUNING.rearAxleOffset,
    z: rear.z + Math.cos(middleYaw) * speed * dt - Math.cos(rotationY) * CARRIAGE_TUNING.rearAxleOffset,
    rotationY
  };
}

export function createStarterCarriageState(): MountState {
  const { x, z, rotationY } = STARTER_CARRIAGE_ANCHOR;
  return { id: STARTER_CARRIAGE_ID, mountTypeId: CARRIAGE_TYPE_ID, x, z, rotationY,
    y: WorldLayout.traversalSurfaceHeight(x, z), gallopStamina: 100,
    gallopRecoveryDelaySeconds: 0, gallopExhausted: false, fishCargoSlotIds: [null, null] };
}

export function canReachCarriageRear(state: Readonly<GameState>, mount: MountState | undefined): boolean {
  const p = state.player;
  if (!isCarriage(mount) || !mount || p.activeMountId || p.activeBoatId || state.basicFishing || state.sportFishing
    || !p.traversal.isGrounded) return false;
  const rear = carriagePoint(mount, 0, CARRIAGE_TUNING.rearOffset);
  return Math.hypot(p.x - rear.x, p.z - rear.z) <= CARRIAGE_TUNING.interactionReach
    && Math.abs(p.y - mount.y - 0.5) < 1.5;
}

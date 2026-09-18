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
  turnRate: 0.6,
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
export function carriageFootprint(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>) {
  return [[-0.65, 1.05], [0.65, 1.05], [1.8, 0.6], [2.9, 0.55], [4.0, 0.55]].map(([z, radius]) => ({
    ...carriagePoint(pose, 0, z), radius
  }));
}

export function isCarriageGround(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>): boolean {
  return carriageFootprint(pose).every(p => {
    if (WorldLayout.traversalSurfaceSample(p.x, p.z).normal.y < CARRIAGE_TUNING.maximumSlopeNormalY) return false;
    return [[0, 0], [-p.radius, 0], [p.radius, 0], [0, -p.radius], [0, p.radius]].every(([dx, dz]) => {
      const x = p.x + dx, z = p.z + dz;
      return WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && !WorldLayout.isInterior(x, z)
        && !WorldLayout.isPierDeck(x, z) && !WorldLayout.isPierStairs(x, z);
    });
  });
}

export function carriagePoseIsClear(pose: Pick<MountState, 'x' | 'z' | 'rotationY'>, boxes: readonly StaticCollisionProxy[]): boolean {
  return isCarriageGround(pose) && carriageFootprint(pose).every(p =>
    staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), p.radius));
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

import { TRADE_VEHICLES, isTradeCarriageType } from "../../content/villageTrade";
import { CART_WORKSHOP } from "../../world/VillageTradeLayout";
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
  /** Trot (Shift) budget. Displayed pool stays 100; drain is half the previous 10/s, so a trot lasts about twenty seconds. Walk stays free. */
  staminaMaximum: 100,
  trotDrainPerSecond: 5,
  trotRecoveryPerSecond: 20,
  trotRecoveryDelaySeconds: 1,
  trotResumeThreshold: 25,
  interactionReach: 2.2,
  horseOffset: 3.5,
  rearOffset: -1.65,
  boardOffset: 1.04,
  dismountOffset: 1.8,
  maximumSlopeNormalY: Math.cos(Math.PI / 6),
  groundResponse: Object.freeze({
    roadSpeedScale: Object.freeze({ arterial: 1, lane: 0.96, trail: 0.88 }),
    shoulderSpeedScale: 0.83,
    firmGroundSpeedScale: 0.78,
    softGroundSpeedScale: 0.7,
    offRoadAccelerationScale: 0.8,
    packedCoreFullWeight: 0.75,
    shoulderFullWeight: 0.4,
    uphillSpeedCost: 0.2,
    downhillSpeedGain: 0.06
  })
});

type CarriagePose = Pick<MountState, 'x' | 'z' | 'rotationY'> & Partial<Pick<MountState, 'mountTypeId'>>;
export function carriageTuning(mount: Partial<Pick<MountState, 'mountTypeId'>>) {
  const definition = isTradeCarriageType(mount.mountTypeId) ? TRADE_VEHICLES[mount.mountTypeId] : null;
  const length = definition?.bedLength ?? 2.6, width = definition?.bedWidth ?? 1.4;
  return { ...CARRIAGE_TUNING, cargoSlots: definition?.cargoSlots ?? 2, bedWidth: width, bedLength: length,
    assetId: definition?.assetId ?? 'prop_merchant_carriage_a',
    wheelbase: length * .76, rearAxleOffset: -length * .37, frontAxleOffset: length * .39,
    horseOffset: length * .5 + 2.2, rearOffset: -length * .5 - .35,
    boardOffset: length * .4, dismountOffset: width * .5 + 1.1 };
}

/** Display poses are presentation/layout data until an atomic purchase grants ownership. */
export function workshopCarriagePoses(): MountState[] {
  return CART_WORKSHOP.displays.map(display => ({ id: display.mountId, mountTypeId: display.mountTypeId,
    x: display.x, z: display.z, y: WorldLayout.traversalSurfaceHeight(display.x, display.z), rotationY: display.rotationY,
    gallopStamina: 100, gallopRecoveryDelaySeconds: 0, gallopExhausted: false,
    fishCargoSlotIds: Array(TRADE_VEHICLES[display.mountTypeId].cargoSlots).fill(null) }));
}

/** Road, shoulder, and ground response from the same fields that shape the world. */
export function carriageGroundResponseAt(
  x: number,
  z: number,
  headingRadians: number,
  travelSign: number = 1
): { speedScale: number; accelerationScale: number } {
  const support = WorldLayout.traversalSurfaceSample(x, z);
  if (support.source === 'bridge') return { speedScale: 1, accelerationScale: 1 };

  const tuning = CARRIAGE_TUNING.groundResponse;
  const weights = WorldLayout.terrainSurfaceWeights(x, z, support.normal.y);
  const route = WorldLayout.nearestRouteDistance(x, z);
  const core = Math.min(1, Math.max(0, weights.path / tuning.packedCoreFullWeight));
  const shoulder = Math.min(1, Math.max(0, weights.shoulder / tuning.shoulderFullWeight)) * (1 - core);
  const softGround = Math.max(weights.dampSoil, weights.wetShoreline, weights.beach, weights.riverbed);
  const natural = tuning.firmGroundSpeedScale
    + (tuning.softGroundSpeedScale - tuning.firmGroundSpeedScale) * softGround;
  const shoulderBlend = natural + (tuning.shoulderSpeedScale - natural) * shoulder;
  const road = tuning.roadSpeedScale[route.route.kind];
  const groundSpeedScale = shoulderBlend + (road - shoulderBlend) * core;
  const downhill = (support.normal.x * Math.sin(headingRadians)
    + support.normal.z * Math.cos(headingRadians)) * (travelSign < 0 ? -1 : 1);
  const gradeScale = downhill < 0
    ? 1 + downhill * tuning.uphillSpeedCost
    : 1 + downhill * tuning.downhillSpeedGain;
  return {
    speedScale: groundSpeedScale * gradeScale,
    accelerationScale: tuning.offRoadAccelerationScale
      + (1 - tuning.offRoadAccelerationScale) * Math.min(1, core + shoulder * 0.55)
  };
}

export const isCarriage = (mount: Pick<MountState, 'mountTypeId'> | null | undefined): boolean =>
  mount?.mountTypeId === CARRIAGE_TYPE_ID || isTradeCarriageType(mount?.mountTypeId);

export function carriagePoint(pose: CarriagePose, lateral: number, forward: number) {
  const c = Math.cos(pose.rotationY), s = Math.sin(pose.rotationY);
  return { x: pose.x + c * lateral + s * forward, z: pose.z - s * lateral + c * forward };
}

/** Overlapping circles cover the bed, shafts and horse, including turning sweep. */
export function carriageFootprint(pose: CarriagePose, steering = 0) {
  const tuning = carriageTuning(pose), halfLength = tuning.bedLength / 2, halfWidth = tuning.bedWidth / 2 + .35;
  return [[-halfLength * .5, halfWidth], [halfLength * .5, halfWidth], [halfLength + .5, .6],
    [tuning.horseOffset - .6, .55], [tuning.horseOffset + .5, .55], [tuning.horseOffset + 1.3, .35]].map(([z, radius]) => {
    const ahead = z > tuning.frontAxleOffset ? z - tuning.frontAxleOffset : 0;
    return { ...carriagePoint(pose, Math.sin(steering) * ahead,
      ahead ? tuning.frontAxleOffset + Math.cos(steering) * ahead : z), radius };
  });
}

export function isCarriageGround(pose: CarriagePose, steering = 0): boolean {
  return carriageFootprint(pose, steering).every(p => {
    if (WorldLayout.traversalSurfaceSample(p.x, p.z).normal.y < CARRIAGE_TUNING.maximumSlopeNormalY) return false;
    return [[0, 0], [-p.radius, 0], [p.radius, 0], [0, -p.radius], [0, p.radius]].every(([dx, dz]) => {
      const x = p.x + dx, z = p.z + dz;
      return WorldLayout.isWalkable(x, z) && !WorldLayout.isWater(x, z) && !WorldLayout.isInterior(x, z)
        && !WorldLayout.isPierDeck(x, z) && !WorldLayout.isPierStairs(x, z);
    });
  });
}

export function carriagePoseIsClear(pose: CarriagePose, boxes: readonly StaticCollisionProxy[], steering = 0): boolean {
  return isCarriageGround(pose, steering) && carriageFootprint(pose, steering).every(p =>
    staticPoseIsClear(boxes, p, WorldLayout.traversalSurfaceHeight(p.x, p.z), p.radius));
}

/** Rear wheels roll along their tangent; the kingpin turns the front axle/horse. */
export function advanceCarriagePose(pose: CarriagePose, speed: number, steering: number, dt: number) {
  const tuning = carriageTuning(pose);
  const yawRate = speed * Math.tan(steering) / tuning.wheelbase;
  const rotationY = pose.rotationY + yawRate * dt;
  const rear = carriagePoint(pose, 0, tuning.rearAxleOffset);
  const middleYaw = (pose.rotationY + rotationY) / 2;
  return {
    x: rear.x + Math.sin(middleYaw) * speed * dt - Math.sin(rotationY) * tuning.rearAxleOffset,
    z: rear.z + Math.cos(middleYaw) * speed * dt - Math.cos(rotationY) * tuning.rearAxleOffset,
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
  const rear = carriagePoint(mount, 0, carriageTuning(mount).rearOffset);
  return Math.hypot(p.x - rear.x, p.z - rear.z) <= CARRIAGE_TUNING.interactionReach
    && Math.abs(p.y - mount.y - 0.5) < 1.5;
}

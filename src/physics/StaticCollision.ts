export interface StaticBoxCollisionProxy {
  kind: "box";
  id: string;
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

/** Immutable authored collision geometry handed to the canonical physics world at startup. */
export type StaticCollisionProxy = StaticBoxCollisionProxy;

/** Actor band: below this a box is a step to walk over, above it the actor passes underneath. */
const ACTOR_STEP_OVER_METERS = 0.3;
const ACTOR_HEAD_METERS = 1.9;
/** A pure-yaw quaternion has zero x and z; anything larger carries pitch or roll. */
const YAW_ONLY_TOLERANCE = 1e-6;

/**
 * Capsule footprint against the projected boxes Rapier receives; low steps remain traversable.
 *
 * The actor is modelled as a flat-capped vertical cylinder rather than a true
 * capsule: a box wholly below the step-over height is walked over, not collided
 * with, and the crisp threshold is what keeps kerbs, thresholds and dock treads
 * traversable during save recovery.
 *
 * Every proxy the terrain migrations hand this function is authored with a pure
 * yaw, for which the closed-form footprint below is exact. A pitched or rolled
 * box has no exact answer in this form, so rather than silently misreport one it
 * is widened to its world-axis-aligned bounds, which can only over-block.
 */
export function staticPoseIsClear(
  boxes: readonly StaticCollisionProxy[], point: { x: number; z: number }, ground: number, radius: number
): boolean {
  return boxes.every((box) => {
    const tilted = Math.abs(box.rotation.x) > YAW_ONLY_TOLERANCE || Math.abs(box.rotation.z) > YAW_ONLY_TOLERANCE;
    const extents = tilted ? worldAlignedExtents(box) : box.halfExtents;
    if (box.center.y + extents.y <= ground + ACTOR_STEP_OVER_METERS) return true;
    if (box.center.y - extents.y >= ground + ACTOR_HEAD_METERS) return true;
    const dx = point.x - box.center.x, dz = point.z - box.center.z;
    let x = dx, z = dz;
    if (!tilted) {
      const yaw = 2 * Math.atan2(box.rotation.y, box.rotation.w);
      x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    }
    const ox = Math.max(0, Math.abs(x) - extents.x);
    const oz = Math.max(0, Math.abs(z) - extents.z);
    return ox * ox + oz * oz > radius * radius;
  });
}

/** Half extents of the world-axis-aligned box enclosing a rotated proxy. */
function worldAlignedExtents(
  box: StaticCollisionProxy
): { x: number; y: number; z: number } {
  const { x: qx, y: qy, z: qz, w: qw } = box.rotation;
  // Columns of the rotation matrix, in absolute value: the enclosing extent along
  // a world axis is the box extents projected onto that row.
  const m = [
    Math.abs(1 - 2 * (qy * qy + qz * qz)), Math.abs(2 * (qx * qy - qz * qw)), Math.abs(2 * (qx * qz + qy * qw)),
    Math.abs(2 * (qx * qy + qz * qw)), Math.abs(1 - 2 * (qx * qx + qz * qz)), Math.abs(2 * (qy * qz - qx * qw)),
    Math.abs(2 * (qx * qz - qy * qw)), Math.abs(2 * (qy * qz + qx * qw)), Math.abs(1 - 2 * (qx * qx + qy * qy))
  ];
  const h = box.halfExtents;
  return {
    x: m[0] * h.x + m[1] * h.y + m[2] * h.z,
    y: m[3] * h.x + m[4] * h.y + m[5] * h.z,
    z: m[6] * h.x + m[7] * h.y + m[8] * h.z
  };
}

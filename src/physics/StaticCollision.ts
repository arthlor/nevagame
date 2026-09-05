export interface StaticBoxCollisionProxy {
  kind: "box";
  id: string;
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

/** Immutable authored collision geometry handed to the canonical physics world at startup. */
export type StaticCollisionProxy = StaticBoxCollisionProxy;

/** Capsule footprint against the projected boxes Rapier receives; low steps remain traversable. */
export function staticPoseIsClear(
  boxes: readonly StaticCollisionProxy[], point: { x: number; z: number }, ground: number, radius: number
): boolean {
  return boxes.every((box) => {
    if (box.center.y + box.halfExtents.y <= ground + 0.3 || box.center.y - box.halfExtents.y >= ground + 1.9) return true;
    const yaw = 2 * Math.atan2(box.rotation.y, box.rotation.w);
    const dx = point.x - box.center.x, dz = point.z - box.center.z;
    const x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
    const z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const ox = Math.max(0, Math.abs(x) - box.halfExtents.x);
    const oz = Math.max(0, Math.abs(z) - box.halfExtents.z);
    return ox * ox + oz * oz > radius * radius;
  });
}

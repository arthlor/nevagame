export interface StaticBoxCollisionProxy {
  kind: "box";
  id: string;
  center: { x: number; y: number; z: number };
  halfExtents: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

/** Immutable authored collision geometry handed to the canonical physics world at startup. */
export type StaticCollisionProxy = StaticBoxCollisionProxy;

type Point = { x: number; y: number; z: number };

export interface DebugCollider {
  handle: number;
  id: string;
  position: Point;
  rotation: Point & { w: number };
  shape: { kind: "box"; halfExtents: Point } | { kind: "capsule"; radius: number; halfHeight: number };
  distance: number;
}

export interface CollisionDebugSnapshot {
  colliders: DebugCollider[];
  contacts: Array<{ handle: number; id: string; point: Point; normal: Point; lateral: boolean }>;
  walking: boolean;
  blocked: boolean;
  walkabilityLimited: boolean;
}

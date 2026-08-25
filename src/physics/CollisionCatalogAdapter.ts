import * as THREE from "three";
import {
  ASSET_BY_ID,
  type AssetId,
  type RuntimeCollisionPrimitive
} from "../render/assets/AssetCatalog";
import type { StaticCollisionProxy } from "./StaticCollision";

export function collisionPrimitivesForAsset(
  assetId: AssetId
): readonly RuntimeCollisionPrimitive[] {
  const spec = ASSET_BY_ID.get(assetId);
  if (!spec) throw new Error(`[CollisionCatalogAdapter] Unknown asset ${assetId}`);
  const primitives = spec.collisionPrimitives ?? [];
  if (spec.collision === "none") {
    if (primitives.length) {
      throw new Error(`[CollisionCatalogAdapter] ${assetId} is nonblocking but defines collision primitives`);
    }
    return primitives;
  }
  if (spec.collision === "box" && primitives.length !== 1) {
    throw new Error(`[CollisionCatalogAdapter] ${assetId} box collision requires exactly one primitive`);
  }
  if (spec.collision === "compound" && primitives.length < 2) {
    throw new Error(`[CollisionCatalogAdapter] ${assetId} compound collision requires multiple primitives`);
  }
  return primitives;
}

/** Projects canonical asset-local Y-up boxes through the placed root transform. */
export function projectAssetCollision(
  assetId: AssetId,
  root: THREE.Object3D,
  instanceId: string
): StaticCollisionProxy[] {
  const primitives = collisionPrimitivesForAsset(assetId);
  if (primitives.length === 0) return [];
  root.updateMatrixWorld(true);
  const rootRotation = root.getWorldQuaternion(new THREE.Quaternion());
  const rootScale = root.getWorldScale(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0);

  return primitives.map((primitive) => {
    const worldCenter = new THREE.Vector3(...primitive.center).applyMatrix4(root.matrixWorld);
    const yawDeg = Number.isFinite(primitive.yawDegrees) ? (primitive.yawDegrees ?? 0) : 0;
    const localRotation = new THREE.Quaternion().setFromAxisAngle(
      up,
      THREE.MathUtils.degToRad(yawDeg)
    );
    const worldRotation = rootRotation.clone().multiply(localRotation).normalize();
    return {
      kind: "box",
      id: `${instanceId}:${primitive.id}`,
      center: {
        x: Number.isFinite(worldCenter.x) ? worldCenter.x : 0,
        y: Number.isFinite(worldCenter.y) ? worldCenter.y : 0,
        z: Number.isFinite(worldCenter.z) ? worldCenter.z : 0
      },
      halfExtents: {
        x: Math.max(0.02, Math.abs(primitive.halfExtents[0]) * Math.abs(rootScale.x)),
        y: Math.max(0.02, Math.abs(primitive.halfExtents[1]) * Math.abs(rootScale.y)),
        z: Math.max(0.02, Math.abs(primitive.halfExtents[2]) * Math.abs(rootScale.z))
      },
      rotation: {
        x: worldRotation.x,
        y: worldRotation.y,
        z: worldRotation.z,
        w: worldRotation.w
      }
    };
  });
}

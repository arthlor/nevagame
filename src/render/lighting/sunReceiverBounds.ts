import * as THREE from "three";
import type { SunLight } from "three/addons/lights/SunLight.js";

const viewFrustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const oldProjectionInverse = new THREE.Matrix4();
const bias = new THREE.Matrix4();
const lowPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0));
const highPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0));
const crossBC = new THREE.Vector3(), crossCA = new THREE.Vector3(), crossAB = new THREE.Vector3();
const point = new THREE.Vector3();

/**
 * Fit native cascade XY to the convex intersection of its own volume, the
 * committed view and the world's receiver-height slab. A caster projects to
 * the same light-space XY as its receiver, so the native depth/caster ceiling
 * remains intact. This never shortens the cascade's view-depth range.
 */
export function fitSunReceiverBounds(
  light: SunLight,
  view: THREE.Camera,
  minY: number,
  maxY: number
): number {
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY >= maxY) return 0;
  viewProjection.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
  viewFrustum.setFromProjectionMatrix(viewProjection, view.coordinateSystem, view.reversedDepth);
  lowPlane.constant = -minY;
  highPlane.constant = maxY;
  let fitted = 0;
  const shadow = light.shadow;
  for (let cascade = 0; cascade < shadow.getViewportCount(); cascade++) {
    const camera = shadow.getCamera(cascade);
    const frustum = shadow.getFrustum(cascade);
    const planes = [...viewFrustum.planes, ...frustum.planes, lowPlane, highPlane];
    let minX = Infinity, maxX = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let a = 0; a < planes.length - 2; a++) {
      for (let b = a + 1; b < planes.length - 1; b++) {
        for (let c = b + 1; c < planes.length; c++) {
          const pa = planes[a], pb = planes[b], pc = planes[c];
          crossBC.crossVectors(pb.normal, pc.normal);
          const denominator = pa.normal.dot(crossBC);
          if (Math.abs(denominator) < 1e-8) continue;
          crossCA.crossVectors(pc.normal, pa.normal);
          crossAB.crossVectors(pa.normal, pb.normal);
          point.copy(crossBC).multiplyScalar(-pa.constant)
            .addScaledVector(crossCA, -pb.constant).addScaledVector(crossAB, -pc.constant)
            .multiplyScalar(1 / denominator);
          if (planes.some(plane => plane.distanceToPoint(point) < -0.001)) continue;
          point.applyMatrix4(camera.matrixWorldInverse);
          minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
          minV = Math.min(minV, point.y); maxV = Math.max(maxV, point.y);
        }
      }
    }
    if (![minX, maxX, minV, maxV].every(Number.isFinite)) continue;
    const viewport = shadow.getViewport(cascade);
    const texelX = (camera.right - camera.left) / (shadow.mapSize.x * viewport.z);
    const texelY = (camera.top - camera.bottom) / (shadow.mapSize.y * viewport.w);
    const filterPadding = Math.ceil(shadow.radius) + 1;
    const left = Math.max(camera.left, Math.floor(minX / texelX - filterPadding) * texelX);
    const right = Math.min(camera.right, Math.ceil(maxX / texelX + filterPadding) * texelX);
    const bottom = Math.max(camera.bottom, Math.floor(minV / texelY - filterPadding) * texelY);
    const top = Math.min(camera.top, Math.ceil(maxV / texelY + filterPadding) * texelY);
    if (right - left < 0.001 || top - bottom < 0.001) continue;
    // Recover the native bias transform rather than assuming a depth convention.
    oldProjectionInverse.copy(camera.projectionMatrix).invert();
    bias.copy(shadow.getMatrix(cascade)).multiply(camera.matrixWorld).multiply(oldProjectionInverse);
    camera.left = left; camera.right = right; camera.bottom = bottom; camera.top = top;
    camera.updateProjectionMatrix();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    shadow.getMatrix(cascade).copy(bias).multiply(viewProjection);
    frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem, camera.reversedDepth);
    fitted++;
  }
  return fitted;
}

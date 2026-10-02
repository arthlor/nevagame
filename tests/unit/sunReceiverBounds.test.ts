import * as THREE from "three";
import { SunLight } from "three/addons/lights/SunLight.js";
import { describe, expect, it } from "vitest";
import { fitSunReceiverBounds } from "../../src/render/lighting/sunReceiverBounds";

describe("native sunlight receiver fitting", () => {
  it.each([[0.5, 1, 0.3], [0.2, 0.1, 1], [0, 1, 0]])(
    "retains visible receiver and off-view caster coverage for direction %j",
    (x, y, z) => {
      const view = new THREE.PerspectiveCamera(50, 1.5, 0.1, 330);
      view.position.set(0, 18, 28);
      view.lookAt(0, 0, -20);
      view.updateMatrixWorld(true);
      const viewFrustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse)
      );
      const light = new SunLight();
      light.position.set(x, y, z).normalize();
      light.updateMatrixWorld(true);
      light.shadow.camera.far = 168;
      light.shadow.mapSize.set(1440, 1440);
      light.shadow.updateMatrices(light, view);
      const original = [0, 1].map(index => ({
        frustum: light.shadow.getFrustum(index).clone(),
        matrix: light.shadow.getMatrix(index).clone(),
        camera: light.shadow.getCamera(index).clone()
      }));
      expect(fitSunReceiverBounds(light, view, -4, 25)).toBe(2);
      let receiverChecks = 0, casterChecks = 0;
      for (let px = -100; px <= 100; px += 10) {
        for (let pz = -160; pz <= 30; pz += 10) {
          for (let py = -4; py <= 25; py += 7.25) {
            const receiver = new THREE.Vector3(px, py, pz);
            if (!viewFrustum.containsPoint(receiver)) continue;
            original.forEach((before, cascade) => {
              if (!before.frustum.containsPoint(receiver)) return;
              expect(light.shadow.getFrustum(cascade).containsPoint(receiver)).toBe(true);
              const oldSample = receiver.clone().applyMatrix4(before.matrix);
              const newSample = receiver.clone().applyMatrix4(light.shadow.getMatrix(cascade));
              expect(newSample.z).toBeCloseTo(oldSample.z, 10);
              receiverChecks++;
              const caster = receiver.clone().addScaledVector(light.position, 50);
              if (before.frustum.containsPoint(caster)) {
                expect(light.shadow.getFrustum(cascade).containsPoint(caster)).toBe(true);
                casterChecks++;
              }
            });
          }
        }
      }
      expect(receiverChecks).toBeGreaterThan(100);
      expect(casterChecks).toBeGreaterThan(100);
      original.forEach((before, index) => {
        const camera = light.shadow.getCamera(index);
        expect(camera.near).toBe(before.camera.near);
        expect(camera.far).toBe(before.camera.far);
        expect(camera.matrixWorld.equals(before.camera.matrixWorld)).toBe(true);
        expect(camera.left).toBeGreaterThanOrEqual(before.camera.left);
        expect(camera.right).toBeLessThanOrEqual(before.camera.right);
        expect(camera.bottom).toBeGreaterThanOrEqual(before.camera.bottom);
        expect(camera.top).toBeLessThanOrEqual(before.camera.top);
      });
      const fitted = light.shadow.getCamera(0);
      expect((fitted.right - fitted.left) * (fitted.top - fitted.bottom))
        .toBeLessThan((original[0].camera.right - original[0].camera.left)
          * (original[0].camera.top - original[0].camera.bottom));
      light.dispose();
    }
  );

  it("leaves native coverage intact when bounds are missing or do not intersect the view", () => {
    const view = new THREE.PerspectiveCamera(50, 1.5, 0.1, 100);
    view.position.set(0, 10, 20);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld(true);
    const light = new SunLight();
    light.updateMatrixWorld(true);
    light.shadow.updateMatrices(light, view);
    const matrix = light.shadow.getMatrix(0).clone();
    for (const [min, max] of [[-Infinity, Infinity], [4, 4], [2000, 3000]]) {
      expect(fitSunReceiverBounds(light, view, min, max)).toBe(0);
      expect(light.shadow.getMatrix(0).equals(matrix)).toBe(true);
    }
    light.dispose();
  });
});

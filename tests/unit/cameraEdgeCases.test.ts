import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA_PROFILES, GameCamera } from "../../src/render/camera/GameCamera";

describe("GameCamera Edge Cases", () => {
  it("maintains numerical stability across rapid mode transitions", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(10, 2, -15);
    const modes = ["on-foot", "farm-placement", "boat-driving", "sport-fishing", "basic-fishing"] as const;

    for (let index = 0; index < 200; index++) {
      const mode = modes[index % modes.length];
      camera.update(target, mode, 1 / 60);

      expect(Number.isFinite(camera.camera.position.x)).toBe(true);
      expect(Number.isFinite(camera.camera.position.y)).toBe(true);
      expect(Number.isFinite(camera.camera.position.z)).toBe(true);
      expect(Number.isFinite(camera.camera.fov)).toBe(true);
      expect(camera.camera.fov).toBeGreaterThanOrEqual(40);
      expect(camera.camera.fov).toBeLessThanOrEqual(60);
    }
  });

  it("handles large deltaSeconds lag spikes without exploding or oscillating wildly", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 1, 0);

    // Initial warm up
    camera.update(target, "on-foot", 1 / 60);

    // Simulate 2.5 second browser tab pause / lag spike
    camera.update(target, "on-foot", 2.5, {
      orbitDeltaX: 200,
      orbitDeltaY: 100,
      zoomDelta: 500,
      isOrbiting: true
    });

    expect(Number.isFinite(camera.camera.position.x)).toBe(true);
    expect(Number.isFinite(camera.camera.position.y)).toBe(true);
    expect(Number.isFinite(camera.camera.position.z)).toBe(true);
    expect(camera.camera.position.distanceTo(target)).toBeLessThanOrEqual(CAMERA_PROFILES["on-foot"].maxDistance + 1);
  });

  it("clamps massive zoom wheel deltas to mode distance bounds", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 1, 0);
    const profile = CAMERA_PROFILES["on-foot"];
    const lookAtCenter = new THREE.Vector3(0, target.y + profile.focusHeight, target.z + profile.lookAhead);

    // Massive zoom in
    camera.update(target, "on-foot", 1 / 60, {
      orbitDeltaX: 0,
      orbitDeltaY: 0,
      zoomDelta: -100_000,
      isOrbiting: false
    });
    for (let index = 0; index < 60; index++) {
      camera.update(target, "on-foot", 1 / 60);
    }
    expect(camera.camera.position.distanceTo(lookAtCenter)).toBeGreaterThanOrEqual(profile.minDistance - 0.5);

    // Massive zoom out
    camera.update(target, "on-foot", 1 / 60, {
      orbitDeltaX: 0,
      orbitDeltaY: 0,
      zoomDelta: 100_000,
      isOrbiting: false
    });
    for (let index = 0; index < 60; index++) {
      camera.update(target, "on-foot", 1 / 60);
    }
    expect(camera.camera.position.distanceTo(lookAtCenter)).toBeLessThanOrEqual(profile.maxDistance + 0.5);
  });

  it("never derives camera orientation from character movement or inactivity", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 1, 0);
    // Manually orbit, then release the mouse.
    for (let index = 0; index < 30; index++) {
      camera.update(target, "on-foot", 1 / 60, {
        orbitDeltaX: 10,
        orbitDeltaY: 0,
        zoomDelta: 0,
        isOrbiting: true
      });
    }
    for (let index = 0; index < 30; index++) {
      camera.update(target, "on-foot", 1 / 60, {
        orbitDeltaX: 0,
        orbitDeltaY: 0,
        zoomDelta: 0,
        isOrbiting: true
      });
    }
    for (let index = 0; index < 120; index++) camera.update(target, "on-foot", 1 / 60);
    const yawAfterManual = camera.framingState().yawRadians;

    // Character translation and long inactivity may move the chase boom, but never its yaw.
    for (let index = 0; index < 240; index++) {
      target.x += 0.01;
      target.z -= 0.02;
      camera.update(target, "on-foot", 1 / 60);
    }
    expect(camera.framingState().yawRadians).toBeCloseTo(yawAfterManual, 6);
  });

  it("applies reduced motion settings cleanly without oscillation", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    const target = new THREE.Vector3(5, 1, 5);

    camera.update(target, "boat-driving", 1 / 60);
    expect(camera.camera.fov).toBe(CAMERA_PROFILES["boat-driving"].fovDegrees);
    expect(Number.isFinite(camera.camera.position.x)).toBe(true);
  });
});

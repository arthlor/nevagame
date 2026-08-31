import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CAMERA_PROFILES,
  GameCamera,
  INTERIOR_CAMERA_PROFILE,
  SPORT_TUNA_CAMERA_PROFILE
} from "../../src/render/camera/GameCamera";
import { FARMHOUSE_INTERIOR_ORIGIN, FARMHOUSE_INTERIOR_BOUNDS } from "../../src/world/FarmhouseInterior";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";

function stillPlayerMotion(): PlayerMotionSample {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
    turnRateRadiansPerSecond: 0,
    isGrounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    airbornePhase: "grounded",
    contactEvent: "none",
    landingImpactStrength: 0,
    contactSurface: "unknown",
    isCollisionBlocked: false,
    requestedGait: "idle"
  };
}

describe("GameCamera", () => {
  it("maps on-foot movement to the horizontal camera basis", () => {
    const camera = new GameCamera();
    expect(camera.cameraRelativeMovement({ x: 0, z: -1 }, { x: 0, z: 0 })).toMatchObject({
      x: expect.closeTo(0, 6),
      z: expect.closeTo(1, 6)
    });
    expect(camera.cameraRelativeMovement({ x: 1, z: 0 }, { x: 0, z: 0 })).toMatchObject({
      x: expect.closeTo(-1, 6),
      z: expect.closeTo(0, 6)
    });
    expect(camera.cameraRelativeMovement({ x: -1, z: 0 }, { x: 0, z: 0 })).toMatchObject({
      x: expect.closeTo(1, 6),
      z: expect.closeTo(0, 6)
    });

    camera.update(new THREE.Vector3(0, 0.5, 0), "on-foot", 1 / 60, {
      orbitDeltaX: 120,
      orbitDeltaY: 0,
      zoomDelta: 0,
      isOrbiting: true
    });
    const movementRight = camera.cameraRelativeMovement({ x: 1, z: 0 }, { x: 0, z: 0 });
    const visibleRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.camera.quaternion);
    visibleRight.y = 0;
    visibleRight.normalize();
    expect(movementRight.x * visibleRight.x + movementRight.z * visibleRight.z).toBeCloseTo(1, 6);
  });

  it("turns the view left when the right-button drag moves left", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    const before = camera.framingState();
    camera.update(target, "on-foot", 1 / 60, {
      orbitDeltaX: -80,
      orbitDeltaY: 0,
      zoomDelta: 0,
      isOrbiting: true
    });
    const after = camera.framingState();
    const horizontalDelta = Math.atan2(
      Math.sin(after.yawRadians - before.yawRadians),
      Math.cos(after.yawRadians - before.yawRadians)
    );
    expect(horizontalDelta).toBeGreaterThan(0);
    expect(camera.camera.getWorldDirection(new THREE.Vector3()).x).toBeGreaterThan(0);
  });

  it("keeps vertical mouse orbit aligned with the drag direction", () => {
    const camera = new GameCamera();
    const before = camera.framingState();
    camera.update(new THREE.Vector3(0, 0.5, 0), "on-foot", 1 / 60, {
      orbitDeltaX: 0,
      orbitDeltaY: 40,
      zoomDelta: 0,
      isOrbiting: true
    });
    expect(camera.framingState().pitchRadians).toBeGreaterThan(before.pitchRadians);
  });

  it("applies an exact fixed art-direction view without gameplay smoothing", () => {
    const camera = new GameCamera();
    camera.setFixedView({ x: 12, y: 9, z: -7 }, { x: 2, y: 1, z: 4 }, 51);
    expect(camera.camera.position.toArray()).toEqual([12, 9, -7]);
    expect(camera.camera.fov).toBe(51);
    expect(camera.camera.getWorldDirection(new THREE.Vector3()).dot(
      new THREE.Vector3(-10, -8, 11).normalize()
    )).toBeCloseTo(1, 6);
  });

  it("sweeps from the player anchor and uses the collision-safe boom immediately", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    let collisionFocus: { x: number; y: number; z: number } | null = null;
    let collisionRadius = 0;
    camera.update(
      target,
      "on-foot",
      1 / 60,
      { orbitDeltaX: 0, orbitDeltaY: 0, zoomDelta: 0, isOrbiting: false },
      {
        resolveCameraPosition(focus, desired, radius) {
          collisionFocus = { ...focus };
          collisionRadius = radius ?? 0;
          return {
            position: {
              x: focus.x + (desired.x - focus.x) * 0.2,
              y: focus.y + (desired.y - focus.y) * 0.2,
              z: focus.z + (desired.z - focus.z) * 0.2
            },
            obstructed: true
          };
        }
      }
    );
    expect(collisionFocus).toMatchObject({ x: target.x, z: target.z });
    expect(collisionRadius).toBeCloseTo(0.32, 6);
    expect(camera.framingState().obstructionFraction).toBeCloseTo(0.2, 6);
    expect(camera.framingState().obstructed).toBe(true);
  });

  it("smoothly adopts the wider boat profile", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    for (let index = 0; index < 180; index++) {
      camera.update(target, "boat-driving", 1 / 60);
    }
    expect(camera.camera.fov).toBeCloseTo(CAMERA_PROFILES["boat-driving"].fovDegrees, 1);
    expect(camera.framingState().pitchRadians).toBeCloseTo(
      CAMERA_PROFILES["boat-driving"].pitchRadians,
      3
    );
    expect(camera.camera.position.distanceTo(target)).toBeGreaterThan(12);
  });

  it("clamps orbit pitch and wheel zoom to the active mode profile", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    for (let index = 0; index < 180; index++) {
      camera.update(target, "on-foot", 1 / 60, {
        orbitDeltaX: index === 0 ? 10_000 : 0,
        orbitDeltaY: index === 0 ? -10_000 : 0,
        zoomDelta: index === 0 ? 10_000 : 0,
        isOrbiting: index < 2
      });
    }
    const framing = camera.framingState();
    expect(framing.pitchRadians).toBeLessThanOrEqual(CAMERA_PROFILES["on-foot"].maxPitchRadians);
    expect(framing.pitchRadians).toBeGreaterThanOrEqual(CAMERA_PROFILES["on-foot"].minPitchRadians);
    expect(framing.distance).toBeCloseTo(CAMERA_PROFILES["on-foot"].maxDistance, 2);
    expect(Math.abs(framing.yawRadians)).toBeLessThanOrEqual(Math.PI);
  });

  it("pulls in immediately but recovers gently after an obstruction clears", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    camera.update(target, "on-foot", 1 / 60, undefined, {
      resolveCameraPosition(focus, desired) {
        return {
          position: {
            x: focus.x + (desired.x - focus.x) * 0.2,
            y: focus.y + (desired.y - focus.y) * 0.2,
            z: focus.z + (desired.z - focus.z) * 0.2
          },
          obstructed: true
        };
      }
    });
    const pulledInDistance = camera.framingState().resolvedDistance;
    camera.update(target, "on-foot", 1 / 60);
    const firstRecovery = camera.framingState();
    expect(firstRecovery.resolvedDistance).toBeGreaterThan(pulledInDistance);
    expect(firstRecovery.obstructionFraction).toBeGreaterThan(0.2);
    expect(firstRecovery.obstructionFraction).toBeLessThan(1);
    for (let index = 0; index < 120; index++) camera.update(target, "on-foot", 1 / 60);
    expect(camera.framingState().obstructionFraction).toBe(1);
    expect(camera.framingState().obstructed).toBe(false);
  });

  it("snaps authored profile framing for reduced motion without changing composition", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    camera.update(new THREE.Vector3(0, 0.5, 0), "boat-driving", 1 / 60);
    expect(camera.camera.fov).toBe(CAMERA_PROFILES["boat-driving"].fovDegrees);
    expect(camera.framingState().distance).toBe(CAMERA_PROFILES["boat-driving"].distance);
    expect(camera.framingState().pitchRadians).toBeCloseTo(
      CAMERA_PROFILES["boat-driving"].pitchRadians,
      12
    );
  });

  it("tracks the presentation fish target and selects the longer tuna boom", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    const target = new THREE.Vector3(0, 0.5, 0);
    const lookHint = new THREE.Vector3(18, 0.25, 24);
    camera.update(target, "sport-fishing", 1 / 60, undefined, undefined, {
      player: stillPlayerMotion(),
      lookHint,
      fightReachMeters: 45,
      lineTension: 62,
      snapTimerSeconds: 0,
      fightBehavior: "run-right"
    });

    const toFish = lookHint.clone().sub(camera.camera.position).normalize();
    expect(camera.camera.getWorldDirection(new THREE.Vector3()).dot(toFish)).toBeGreaterThan(0.92);
    expect(Number.isFinite(camera.framingState().distance)).toBe(true);
    expect(camera.framingState().distance).toBeGreaterThanOrEqual(SPORT_TUNA_CAMERA_PROFILE.distance);
    expect(camera.framingState().fovDegrees).toBe(SPORT_TUNA_CAMERA_PROFILE.fovDegrees);
  });

  it("preserves normalized zoom preference across mode changes and holds it while paused", () => {
    const camera = new GameCamera();
    const target = new THREE.Vector3(0, 0.5, 0);
    camera.setReducedMotion(true);
    camera.update(target, "on-foot", 1 / 60, {
      orbitDeltaX: 0,
      orbitDeltaY: 0,
      zoomDelta: 250,
      isOrbiting: false
    });
    const onFoot = camera.framingState();
    const onFootRatio = (onFoot.distance - CAMERA_PROFILES["on-foot"].distance) /
      (CAMERA_PROFILES["on-foot"].maxDistance - CAMERA_PROFILES["on-foot"].distance);

    camera.update(target, "boat-driving", 1 / 60);
    const boat = camera.framingState();
    const boatRatio = (boat.distance - CAMERA_PROFILES["boat-driving"].distance) /
      (CAMERA_PROFILES["boat-driving"].maxDistance - CAMERA_PROFILES["boat-driving"].distance);
    expect(boatRatio).toBeCloseTo(onFootRatio, 6);
    expect(boat.pitchRadians).toBeCloseTo(CAMERA_PROFILES["boat-driving"].pitchRadians, 12);

    camera.update(target, "paused", 1 / 60);
    expect(camera.framingState()).toMatchObject({
      distance: boat.distance,
      pitchRadians: boat.pitchRadians,
      fovDegrees: boat.fovDegrees
    });
  });

  it("snaps target follow after a teleport and widens narrow-window framing", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    camera.update(new THREE.Vector3(0, 0.5, 0), "on-foot", 1 / 60);
    camera.update(new THREE.Vector3(30, 0.5, 0), "on-foot", 1 / 60);
    expect(camera.camera.position.x).toBeCloseTo(30, 5);

    camera.handleResize(720, 960);
    camera.update(new THREE.Vector3(30, 0.5, 0), "on-foot", 1 / 60);
    expect(camera.camera.fov).toBeGreaterThan(CAMERA_PROFILES["on-foot"].fovDegrees);
    expect(camera.camera.fov).toBeLessThanOrEqual(CAMERA_PROFILES["on-foot"].fovDegrees + 9);
  });

  it("preserves zoom preference while entering and leaving the farmhouse interior", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    const outside = new THREE.Vector3(8, 0.5, 0);
    camera.update(outside, "on-foot", 1 / 60, {
      orbitDeltaX: 0,
      orbitDeltaY: 0,
      zoomDelta: 250,
      isOrbiting: false
    });
    const outsideDistance = camera.framingState().distance;
    const outsideRatio = (outsideDistance - CAMERA_PROFILES["on-foot"].distance) /
      (CAMERA_PROFILES["on-foot"].maxDistance - CAMERA_PROFILES["on-foot"].distance);

    camera.update(
      new THREE.Vector3(FARMHOUSE_INTERIOR_ORIGIN.x, 0.17, FARMHOUSE_INTERIOR_ORIGIN.z),
      "on-foot",
      1 / 60
    );
    const interior = camera.framingState();
    const interiorRatio = (interior.distance - INTERIOR_CAMERA_PROFILE.distance) /
      (INTERIOR_CAMERA_PROFILE.maxDistance - INTERIOR_CAMERA_PROFILE.distance);
    expect(interiorRatio).toBeCloseTo(outsideRatio, 6);
    expect(interior.pitchRadians).toBeCloseTo(INTERIOR_CAMERA_PROFILE.pitchRadians, 12);
    expect(camera.camera.position.y).toBeLessThan(FARMHOUSE_INTERIOR_BOUNDS.ceilingY);

    camera.update(outside, "on-foot", 1 / 60);
    const returned = camera.framingState();
    expect(returned.distance).toBeCloseTo(outsideDistance, 6);
    expect(returned.pitchRadians).toBeCloseTo(CAMERA_PROFILES["on-foot"].pitchRadians, 12);
  });
});

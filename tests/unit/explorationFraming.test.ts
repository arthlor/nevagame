import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ExplorationFraming, explorationFramingAt } from "../../src/render/camera/ExplorationFraming";
import { CAMERA_PROFILES, CAMERA_TUNING, GameCamera } from "../../src/render/camera/GameCamera";
import { WorldLayout } from "../../src/world/WorldLayout";
import type { PlayerMotionSample } from "../../src/simulation/core/PhysicsAdapter";

const target = new THREE.Vector3(-84, 3, -86);
const player: PlayerMotionSample = {
  velocity: { x: 0, y: 0, z: 0 }, speedMetersPerSecond: 0,
  accelerationMetersPerSecondSquared: 0, turnRateRadiansPerSecond: 0,
  isGrounded: true, groundNormal: { x: 0, y: 1, z: 0 }, slopeRadians: 0,
  airbornePhase: "grounded", contactEvent: "none", landingImpactStrength: 0,
  contactSurface: "grass", isCollisionBlocked: false, requestedGait: "idle"
};
function settle(camera: GameCamera, weight: number, mode: "on-foot" | "farm-placement" = "on-foot"): void {
  for (let i = 0; i < 180; i++) camera.update(target, mode, 1 / 60, undefined, undefined, { player, explorationWeight: weight });
}

describe("exploration framing", () => {
  it("protects work and interior framing and opens both islands' unworked country", () => {
    expect(explorationFramingAt(42, -65, -55, "farm-placement")).toBe(0);
    expect(explorationFramingAt(42, 455 + 800, 5, "on-foot")).toBe(0);
    const house = WorldLayout.landmark("farmhouse");
    expect(explorationFramingAt(42, house.x, house.z, "on-foot")).toBe(0);
    expect(explorationFramingAt(42, -115, -80, "on-foot")).toBeGreaterThan(0.2);
    expect(explorationFramingAt(42, 565 + 800, 60, "on-foot")).toBeGreaterThan(0.2);
    expect(explorationFramingAt(42, 455 + 800, 5, "basic-fishing")).toBe(0);
  });

  it("suppresses landscape context during an actual task without losing its cached geography", () => {
    const context = new ExplorationFraming();
    const open = context.sample(42, -115, -80, "on-foot", false);
    expect(open).toBeGreaterThan(0);
    expect(context.sample(42, -115, -80, "on-foot", true)).toBe(0);
    expect(context.sample(42, -115, -80, "on-foot", false)).toBe(open);
  });

  it("reveals the horizon gradually while preserving yaw and returns to task framing", () => {
    const camera = new GameCamera();
    const initial = camera.framingState();
    camera.update(target, "on-foot", 1 / 60, undefined, undefined, { player, explorationWeight: 1 });
    expect(camera.framingState().pitchRadians).toBeLessThan(initial.pitchRadians);
    expect(camera.framingState().pitchRadians).toBeGreaterThan(initial.pitchRadians + CAMERA_TUNING.explorationPitchOffsetRadians);
    settle(camera, 1);
    expect(camera.camera.fov).toBeCloseTo(CAMERA_PROFILES["on-foot"].fovDegrees + CAMERA_TUNING.explorationFovOffsetDegrees, 4);
    expect(camera.framingState().yawRadians).toBe(initial.yawRadians);
    settle(camera, 0);
    expect(camera.framingState().pitchRadians).toBeCloseTo(initial.pitchRadians, 4);
    settle(camera, 1, "farm-placement");
    expect(camera.camera.fov).toBeCloseTo(CAMERA_PROFILES["farm-placement"].fovDegrees, 4);
  });

  it("continues a manual orbit from the visible pitch and never recenters it with geography", () => {
    const camera = new GameCamera();
    settle(camera, 1);
    const before = camera.framingState();
    camera.applyInput("on-foot", { orbitDeltaX: 40, orbitDeltaY: 12, zoomDelta: 0, isOrbiting: true });
    expect(camera.framingState().pitchRadians).toBeCloseTo(before.pitchRadians + 12 * CAMERA_TUNING.verticalOrbitRadiansPerPixel, 6);
    const after = camera.framingState();
    settle(camera, 0);
    expect(camera.framingState().pitchRadians).toBeCloseTo(after.pitchRadians, 6);
    expect(camera.framingState().yawRadians).toBeCloseTo(after.yawRadians, 6);
    expect(camera.camera.fov).toBeCloseTo(before.fovDegrees, 4);
  });

  it("omits automatic landscape reframing with reduced motion", () => {
    const camera = new GameCamera();
    camera.setReducedMotion(true);
    settle(camera, 1);
    expect(camera.camera.fov).toBe(CAMERA_PROFILES["on-foot"].fovDegrees);
    expect(camera.framingState().pitchRadians).toBe(CAMERA_PROFILES["on-foot"].pitchRadians);
  });

  it("retains the visible lens on a narrower viewport when a manual orbit starts mid-transition", () => {
    const camera = new GameCamera();
    camera.camera.aspect = 1.6;
    for (let i = 0; i < 8; i++) camera.update(target, "on-foot", 1 / 60, undefined, undefined, { player, explorationWeight: 0.7 });
    const visible = camera.camera.fov;
    camera.applyInput("on-foot", { orbitDeltaX: 20, orbitDeltaY: 0, zoomDelta: 0, isOrbiting: true });
    settle(camera, 0);
    expect(camera.camera.fov).toBeCloseTo(visible, 6);
  });
});

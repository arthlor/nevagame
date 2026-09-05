import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FishingRodBend } from "../../src/render/fishing/FishingRodBend";

function rodFixture(): THREE.Group {
  const rod = new THREE.Group();
  for (const [name, x, y, z] of [["rod_primary_grip", 0.024, 0.2, 0], ["rod_line_exit", 0, 1.5, 0], ["rod_reel_spool", 0, 0.1, 0.05], ["rod_secondary_grip", 0.1, 0.1, 0.1]] as const) {
    const marker = new THREE.Object3D(); marker.name = name; marker.position.set(x, y, z); rod.add(marker);
  }
  return rod;
}

describe("held rod aiming", () => {
  it("rotates about the authored primary grip across repeated frames and parent transforms", () => {
    const parent = new THREE.Group(); parent.position.set(4, 0.8, -2); parent.rotation.set(0.1, 1, 0.2); parent.scale.setScalar(0.85);
    const rod = rodFixture(); parent.add(rod); const bend = new FishingRodBend(rod);
    const grip = rod.getObjectByName("rod_primary_grip")!;
    const anchored = grip.getWorldPosition(new THREE.Vector3());
    const endpoint = new THREE.Vector3(10, -1, 4);
    for (let frame = 0; frame < 180; frame++) {
      bend.aimToward(endpoint, 1 / 60);
      expect(grip.getWorldPosition(new THREE.Vector3()).distanceTo(anchored)).toBeLessThan(1e-6);
    }
    const first = rod.quaternion.clone(); const position = rod.position.clone();
    bend.aimToward(endpoint, 0.4);
    expect(rod.quaternion.angleTo(first)).toBeLessThan(1e-6);
    expect(rod.position.distanceTo(position)).toBeLessThan(1e-6);
    bend.dispose();
  });
  it("moves the secondary palm frame with the rigid reel even without blank bend and resets it", () => {
    const rod = rodFixture(); const marker = rod.getObjectByName("rod_secondary_grip")!;
    const spool = rod.getObjectByName("rod_reel_spool")!;
    const reel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.1)); reel.name = "rod_reel_crank_arm"; spool.add(reel);
    const originalGrip = marker.position.clone(); const originalRotation = marker.quaternion.clone();
    const bend = new FishingRodBend(rod);
    const originalVertices = Array.from(reel.geometry.getAttribute("position").array);
    bend.update(0, new THREE.Vector3(4, -1, 2), 0.6, 0.1);
    expect(marker.getWorldPosition(new THREE.Vector3()).distanceTo(bend.getGripWorld(new THREE.Vector3()))).toBeLessThan(1e-7);
    expect(marker.position.distanceTo(originalGrip)).toBeGreaterThan(0.005);
    expect(marker.quaternion.angleTo(originalRotation)).toBeGreaterThan(0.1);
    expect(Array.from(reel.geometry.getAttribute("position").array)).not.toEqual(originalVertices);
    bend.resetDynamics();
    expect(marker.position.distanceTo(originalGrip)).toBeLessThan(1e-7);
    expect(marker.quaternion.angleTo(originalRotation)).toBeLessThan(1e-7);
    Array.from(reel.geometry.getAttribute("position").array).forEach((value, index) => expect(value).toBeCloseTo(originalVertices[index]!, 7));
    bend.dispose();
  });

  it("keeps reel and spring phase equal across full-rate, throttled and paused samples", () => {
    const fast = new FishingRodBend(rodFixture());
    const throttled = new FishingRodBend(rodFixture());
    const endpoint = new THREE.Vector3(4, -1, 2);
    for (let frame = 1; frame <= 48; frame++) fast.update(0.9, endpoint, 0.7, frame / 60);
    throttled.update(0.9, endpoint, 0.7, 0.4);
    throttled.update(0.9, endpoint, 0.7, 0.8);
    expect(fast.getTipWorld(new THREE.Vector3()).distanceTo(throttled.getTipWorld(new THREE.Vector3()))).toBeLessThan(1e-6);
    expect(fast.getGripWorld(new THREE.Vector3()).distanceTo(throttled.getGripWorld(new THREE.Vector3()))).toBeLessThan(1e-6);
    const pausedTip = throttled.getTipWorld(new THREE.Vector3());
    throttled.update(0.9, endpoint, 0.7, 0.8);
    expect(throttled.getTipWorld(new THREE.Vector3()).distanceTo(pausedTip)).toBeLessThan(1e-9);
    fast.dispose(); throttled.dispose();
  });

});

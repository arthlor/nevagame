import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyEquipmentSocketPose, createCarryCradle, fishingClipUsesRod, PALM_GRIP_FRAME, rowboatOarRotation } from "../../src/render/animation/CharacterEquipment";
import { socketAttachFor } from "../../src/render/assets/ToolSocketAttach";

describe("character equipment presentation", () => {
  it("keeps the rod through hookset and every fishing hold", () => {
    for (const name of ["cast", "hookset", "reel", "slack", "brace", "fishing_idle", "skiff_fishing"]) {
      expect(fishingClipUsesRod(name), name).toBe(true);
    }
    expect(fishingClipUsesRod("harvest")).toBe(false);
  });

  it("centers a source fish across the body with contacts derived from visible geometry", () => {
    const payload = new THREE.Group();
    const geometry = new THREE.BoxGeometry(0.2, 0.3, 1.4);
    const mesh = new THREE.Mesh(geometry);
    mesh.position.set(0, 0.15, 0.4);
    payload.add(mesh);
    const collision = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20));
    collision.name = "COL_fish";
    payload.add(collision);
    const cradle = createCarryCradle(payload, true);
    cradle.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(bounds.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(1.4);
    expect(cradle.getObjectByName("carry_grip_left")!.position.x).toBeCloseTo(0.3);
    expect(cradle.getObjectByName("carry_grip_right")!.position.y).toBeCloseTo(-0.084);
    expect(mesh.geometry).toBe(geometry);
    expect(socketAttachFor("fish_trout_a").scale).toBe(1);
  });

  it("has matching cycle endpoints and a stable parked oar pose", () => {
    expect(rowboatOarRotation(0, true, "left", new THREE.Euler()).toArray())
      .toEqual(rowboatOarRotation(1, true, "left", new THREE.Euler()).toArray().map(value => typeof value === "number" && Math.abs(value) < 1e-10 ? 0 : value));
    const parked = rowboatOarRotation(0.3, false, "right", new THREE.Euler());
    for (const angle of [parked.x, parked.y, parked.z]) expect(angle).toBeCloseTo(0, 10);
  });

  it("rejects missing or unframed required tool grips instead of inventing a socket rotation", () => {
    const prop = new THREE.Group();
    expect(() => applyEquipmentSocketPose(prop, "tool_sickle_a")).toThrow("missing tool_primary_grip");
    const grip = new THREE.Object3D(); grip.name = "tool_primary_grip"; prop.add(grip);
    expect(() => applyEquipmentSocketPose(prop, "tool_sickle_a")).toThrow("no authored palm frame");
  });

  it("docks the authored primary grip to the socket without a source-axis offset", () => {
    const prop = new THREE.Group();
    const grip = new THREE.Object3D();
    grip.name = "tool_primary_grip";
    grip.position.set(0.05, 0.12, -0.03);
    grip.rotation.set(0.4, 0.8, -0.3);
    grip.userData.neva_grip_frame = PALM_GRIP_FRAME;
    prop.add(grip);
    applyEquipmentSocketPose(prop, "tool_sickle_a");
    prop.updateMatrixWorld(true);
    expect(grip.getWorldPosition(new THREE.Vector3()).length()).toBeLessThan(1e-7);
    expect(grip.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion())).toBeLessThan(1e-7);
  });
});

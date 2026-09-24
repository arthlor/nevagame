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
    const cradle = createCarryCradle(payload, "fish");
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

  it("lays released oars along the gunwales without changing the ready pose", () => {
    for (const side of ["left", "right"] as const) {
      const stowed = rowboatOarRotation(0.3, false, side, new THREE.Euler(), true);
      const span = new THREE.Vector3(1, 0, 0).applyEuler(stowed);
      expect(Math.abs(span.x)).toBeLessThan(1e-7);
      expect(Math.abs(span.z)).toBeCloseTo(1);
      expect(rowboatOarRotation(0.3, false, side, new THREE.Euler()).y).toBe(0);
    }
  });

  it("cradles a tall crop bundle horizontally below the face", () => {
    const payload = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.25));
    mesh.position.y = 0.4;
    payload.add(mesh);
    const cradle = createCarryCradle(payload, "bundle");
    cradle.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.8);
    expect(size.y).toBeCloseTo(0.2);
    expect(bounds.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-7);
    expect(cradle.getObjectByName("carry_grip_left")!.position.y).toBeLessThan(0);
  });

  it("pulls both handles together and lifts both blades for recovery", () => {
    const positions = (phase: number) => ([1, -1] as const).map(sign => {
      const rotation = rowboatOarRotation(phase, true, sign === 1 ? "left" : "right", new THREE.Euler());
      return {
        handle: new THREE.Vector3(-sign * 0.54, 0.14, 0.02).applyEuler(rotation),
        blade: new THREE.Vector3(sign * 1.3, -0.34, -0.05).applyEuler(rotation)
      };
    });
    for (const phase of [0, 0.125, 0.25, 0.5, 0.75]) {
      const [left, right] = positions(phase);
      expect(left.handle.z).toBeCloseTo(right.handle.z, 8);
      expect(left.blade.y).toBeCloseTo(right.blade.y, 8);
      expect(left.blade.x).toBeCloseTo(-right.blade.x, 8);
    }
    expect(positions(0.25)[0].blade.y).toBeLessThan(positions(0.75)[0].blade.y);
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

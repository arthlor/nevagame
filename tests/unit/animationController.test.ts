import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AnimationController } from "../../src/render/animation/AnimationController";

function makeCharacter(): THREE.Group {
  const root = new THREE.Group();
  const parts: Array<[string, [number, number, number]]> = [
    ["character_upper_arm_left", [-0.4, 1.19, 0]],
    ["character_upper_arm_right", [0.4, 1.19, 0]],
    ["character_forearm_left", [-0.4, 0.9, 0.02]],
    ["character_forearm_right", [0.4, 0.9, 0.02]],
    ["character_thigh_left", [-0.17, 0.55, 0]],
    ["character_thigh_right", [0.17, 0.55, 0]],
    ["character_shin_left", [-0.17, 0.23, 0.02]],
    ["character_shin_right", [0.17, 0.23, 0.02]]
  ];
  for (const [name, position] of parts) {
    const part = new THREE.Object3D();
    part.name = name;
    part.position.set(...position);
    root.add(part);
  }
  return root;
}

describe("AnimationController", () => {
  it("animates the actual shipped semantic node vocabulary without clips", () => {
    const character = makeCharacter();
    const controller = new AnimationController(character);
    for (let index = 0; index < 6; index++) controller.update(1 / 60, "on-foot", 4.3);
    expect(character.getObjectByName("character_upper_arm_left")?.rotation.x).not.toBe(0);

    controller.play("plant");
    const actionFrame = controller.update(0.2, "on-foot", 0);
    expect(actionFrame.leanX).toBeLessThan(0);
  });
});

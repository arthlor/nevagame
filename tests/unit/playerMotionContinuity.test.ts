import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { characterBones, characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

const walk = characterContext({ requestedGait: "walk", speedMetersPerSecond: 2, velocity: { x: 0, y: 0, z: 2 } });
const run = characterContext({ requestedGait: "run", speedMetersPerSecond: 5.2, velocity: { x: 0, y: 0, z: 5.2 } });

describe("player motion continuity", () => {
  it.each(["walk", "run"] as const)("keeps %s knee recovery continuous through toe-off at 60 Hz", async gait => {
    const root = await loadHumanoidAsset("char_player_a");
    const animator = new HumanoidAnimator(root);
    const context = gait === "walk" ? walk : run;
    const rig = resolveHumanoidRig(root);
    const knees = [rig.legs.left!.shin, rig.legs.right!.shin];
    const positions = knees.map(() => new THREE.Vector3());
    const previousSteps = knees.map(() => new THREE.Vector3());
    let worstSecondDifference = 0;
    for (let frame = 0; frame < 180; frame++) {
      animator.update(1 / 60, context);
      root.position.z = frame * context.motion.speedMetersPerSecond / 60;
      root.updateMatrixWorld(true);
      animator.resolveGroundContacts(context, () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } }), 1 / 60);
      knees.forEach((knee, index) => {
        const position = root.worldToLocal(knee.getWorldPosition(new THREE.Vector3()));
        const step = position.clone().sub(positions[index]);
        if (frame > 60) worstSecondDifference = Math.max(worstSecondDifference, step.distanceTo(previousSteps[index]));
        positions[index].copy(position);
        previousSteps[index].copy(step);
      });
    }
    // The former flattened roll/reach reversal produced 10–14 cm frame-to-frame
    // changes in knee displacement; preserve a useful margin around the repair.
    expect(worstSecondDifference).toBeLessThan(gait === "walk" ? 0.06 : 0.07);
    animator.dispose();
  });

  it("keeps the authored heel/toe roll when the terrain is flat", async () => {
    const root = await loadHumanoidAsset("char_player_a");
    const animator = new HumanoidAnimator(root);
    animator.setPreviewClip("walk");
    animator.setPreviewPhase(0.02);
    animator.update(0, walk);
    const solver = new HumanoidFootSupportSolver(root);
    const foot = resolveHumanoidRig(root).legs.left!.foot;
    const rotation = foot.getWorldQuaternion(new THREE.Quaternion());
    const target = new THREE.Vector3();
    solver.soleWorldPosition("left", target);
    solver.alignSole("left", target, THREE.Object3D.DEFAULT_UP, 1, true);
    expect(foot.getWorldQuaternion(new THREE.Quaternion()).angleTo(rotation)).toBeLessThan(1e-5);
    animator.dispose();
  });

  it("does not turn a one-frame ground contact loss into a landing flinch", async () => {
    const animator = new HumanoidAnimator(await loadHumanoidAsset("char_player_a"));
    animator.update(0.8, walk);
    animator.update(1 / 60, { ...walk, motion: { ...walk.motion, isGrounded: false, airbornePhase: "falling" } });
    animator.update(1 / 60, { ...walk, motion: { ...walk.motion, contactEvent: "land-soft", landingImpactStrength: 0 } });
    expect(animator.currentClip()).toBe("walk");
    animator.dispose();
  });

  it.each(["locomotion", "interaction"])("preserves the displayed pose when an unfinished %s blend is interrupted", async kind => {
    const root = await loadHumanoidAsset("char_player_a");
    const animator = new HumanoidAnimator(root);
    animator.update(0.8, walk);
    if (kind === "interaction") animator.play("water");
    animator.update(0.04, kind === "locomotion" ? run : walk);
    const before = characterBones(root).map(bone => ({ bone, position: bone.position.clone(), rotation: bone.quaternion.clone().normalize() }));
    if (kind === "interaction") animator.cancelAction();
    animator.update(0, walk);
    for (const { bone, position, rotation } of before) {
      expect(bone.position.distanceTo(position), bone.name).toBeLessThan(1e-5);
      expect(bone.quaternion.clone().normalize().angleTo(rotation), bone.name).toBeLessThan(1e-5);
    }
    animator.dispose();
  });
});

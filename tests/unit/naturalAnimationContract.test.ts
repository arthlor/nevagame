import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { characterBones, characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

function pose(root: THREE.Object3D, clip: THREE.AnimationClip, time: number): Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion }> {
  const mixer = new THREE.AnimationMixer(root); const action = mixer.clipAction(clip).play();
  action.paused = true; action.time = time; mixer.update(0);
  const result = new Map(characterBones(root).map((bone) => [bone.name, { position: bone.position.clone(), quaternion: bone.quaternion.clone() }]));
  mixer.stopAllAction(); return result;
}

describe("source animation continuity", () => {
  it("hands each authored start to the exact first pose of its source gait", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const clips = root.userData.animationClips as THREE.AnimationClip[];
    for (const name of ["walk", "run"]) {
      const start = clips.find((clip) => clip.name === `${name}_start`)!;
      const loop = clips.find((clip) => clip.name === name)!;
      const terminal = pose(root, start, start.duration); const first = pose(root, loop, 0);
      for (const [name, value] of terminal) {
        expect(value.position.distanceTo(first.get(name)!.position), `${start.name}:${name} translation seam`).toBeLessThan(0.002);
        expect(value.quaternion.angleTo(first.get(name)!.quaternion), `${start.name}:${name} rotation seam`).toBeLessThan(0.01);
      }
    }
  });

  it("keeps neutral idle support unchanged by terrain contacts", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A); const rig = resolveHumanoidRig(root);
    const animator = new HumanoidAnimator(root); const context = characterContext();
    animator.update(0.3, context); root.updateMatrixWorld(true);
    const feet = [rig.bones.foot_left!, rig.bones.foot_right!];
    const before = feet.map((foot) => foot.matrixWorld.clone());
    animator.resolveGroundContacts(context, () => ({ height: 0.2, normal: { x: 0.3, y: 0.953939, z: 0 } }));
    root.updateMatrixWorld(true);
    feet.forEach((foot, index) => expect(foot.matrixWorld.elements).toEqual(before[index]!.elements));
  });

  it("preserves a moving base when water interrupts carrying and resumes carry afterwards", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A); const animator = new HumanoidAnimator(root);
    const speed = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!.animationClips!.find((clip) => clip.name === "walk")!.referenceSpeedMetersPerSecond!;
    const context = { ...characterContext({ requestedGait: "walk", speedMetersPerSecond: speed }), carrying: true };
    animator.update(1, context); expect(animator.playbackState().upperClip).toBe("carry_walk");
    animator.play("water"); animator.update(0.1, context);
    expect(animator.playbackState()).toMatchObject({ baseClip: "walk", upperClip: "water" });
    animator.update(animator.actionDurationSeconds("water"), context);
    expect(animator.playbackState()).toMatchObject({ baseClip: "walk", upperClip: "carry_walk" });
  });
});

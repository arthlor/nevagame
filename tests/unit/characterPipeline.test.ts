import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { HumanoidAnimator, type PlayerAnimation } from "../../src/render/animation/AnimationController";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";
import { CHARACTER_ASSET_IDS, characterBones, characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

const finiteTransforms = (root: THREE.Object3D) => {
  root.updateMatrixWorld(true);
  let valid = true;
  root.traverse((node) => { valid &&= node.matrixWorld.elements.every(Number.isFinite); });
  return valid;
};

// These cases deliberately use shipped geometry and source bones. Empty animation
// tracks and a hand-built donor rig cannot expose import or masking regressions.
describe("published humanoid controller contract", () => {
  it.each(CHARACTER_ASSET_IDS)("%s binds anatomical sides relative to its declared forward axis", async (id) => {
    const root = await loadHumanoidAsset(id);
    const rig = resolveHumanoidRig(root);
    root.updateMatrixWorld(true);
    // In a +Z-facing, Y-up body, anatomical left is up cross forward (+X).
    // Camera-facing conventions must not swap source hands, feet or sockets.
    const leftAxis = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(0, 0, 1));
    for (const pair of [[rig.legs.left!.thigh, rig.legs.right!.thigh],
      [rig.bones.hand_left!, rig.bones.hand_right!]] as const) {
      const left = root.worldToLocal(pair[0].getWorldPosition(new THREE.Vector3()));
      const right = root.worldToLocal(pair[1].getWorldPosition(new THREE.Vector3()));
      expect(left.sub(right).dot(leftAxis), `${id}: anatomical left/right`).toBeGreaterThan(0.1);
    }
  });

  it.each(CHARACTER_ASSET_IDS)("%s starts its authored idle and restarts it after reset", async (id) => {
    const root = await loadHumanoidAsset(id);
    const animator = new HumanoidAnimator(root);
    const bones = characterBones(root);
    animator.update(0.1, characterContext());
    const before = bones.map((bone) => bone.quaternion.clone().normalize());
    animator.update(0.7, characterContext());
    expect(animator.currentClip()).toBe("idle");
    expect(bones.some((bone, index) => bone.quaternion.clone().normalize().angleTo(before[index]!) > 1e-4)).toBe(true);
    animator.resetTransientState();
    animator.update(0.2, characterContext());
    expect(animator.playbackState().basePhase).toBeGreaterThan(0);
    expect(finiteTransforms(root)).toBe(true);
    animator.dispose();
  });

  it.each(CHARACTER_ASSET_IDS)("%s samples every catalog action with its declared loop behavior", async (id) => {
    const root = await loadHumanoidAsset(id);
    const spec = ASSET_BY_ID.get(id)!;
    const clips = [...spec.animationClips!, ...(spec.additionalAnimationClips ?? [])];
    const animator = new HumanoidAnimator(root);
    for (const clip of clips) {
      animator.setPreviewClip(clip.name as PlayerAnimation);
      const context = characterContext({
        speedMetersPerSecond: clip.referenceSpeedMetersPerSecond ?? 0,
        requestedGait: /run/.test(clip.name) ? "run" : /walk/.test(clip.name) ? "walk" : "idle"
      });
      for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
        animator.setPreviewPhase(fraction);
        animator.update(0, context);
        expect(finiteTransforms(root), `${id}/${clip.name}@${fraction}`).toBe(true);
      }
      animator.setPreviewPhase(0);
      animator.update(clip.durationSeconds * 1.25, context);
      expect(animator.currentClip()).toBe(clip.name);
      expect(animator.previewPhase(), `${id}/${clip.name} loop=${clip.loop}`).toBeCloseTo(clip.loop ? 0.25 : 1, 3);
    }
    animator.dispose();
  });

  it("uses the same sampled phase at 30, 60, 120 Hz and during throttled updates", async () => {
    const samples: Array<{ phase: number; pose: THREE.Quaternion[]; components: number[] }> = [];
    for (const hz of [30, 60, 120, 2.5]) {
      const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
      const animator = new HumanoidAnimator(root);
      animator.setPreviewClip("walk");
      const speed = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!.animationClips!.find((clip) => clip.name === "walk")!.referenceSpeedMetersPerSecond!;
      const context = characterContext({ speedMetersPerSecond: speed, velocity: { x: 0, y: 0, z: speed }, requestedGait: "walk" });
      const duration = 4;
      for (let step = 0; step < duration * hz; step++) animator.update(1 / hz, context);
      const bones = characterBones(root);
      samples.push({ phase: animator.previewPhase(), pose: bones.map((bone) => bone.quaternion.clone().normalize()), components: bones.flatMap((bone) => bone.quaternion.toArray()) });
      animator.dispose();
    }
    for (const sample of samples.slice(1)) {
      expect(sample.phase).toBeCloseTo(samples[0]!.phase, 5);
      expect(Math.max(...sample.components.map((value, index) => Math.abs(value - samples[0]!.components[index]!)))).toBeLessThan(1e-5);
      expect(Math.max(...sample.pose.map((pose, index) => pose.angleTo(samples[0]!.pose[index]!)))).toBeLessThan(0.003);
    }
  });

  it.each(CHARACTER_ASSET_IDS)("%s solves reachable independent feet without moving its root or stretching bones", async (id) => {
    const root = await loadHumanoidAsset(id);
    const binding = resolveHumanoidRig(root);
    const solver = new HumanoidFootSupportSolver(root);
    const rootTransform = root.matrix.clone();
    for (const side of ["left", "right"] as const) {
      const leg = binding.legs[side]!;
      expect(leg.detachedFoot).toBe(true);
      const localKnee = leg.shin.position.clone();
      const scale = [leg.thigh.scale.clone(), leg.shin.scale.clone(), leg.foot.scale.clone()];
      const target = new THREE.Vector3();
      solver.soleWorldPosition(side, target);
      target.add(new THREE.Vector3(0, 0.05, 0.03));
      solver.alignSole(side, target, { x: 0, y: 1, z: 0 });
      const actual = new THREE.Vector3();
      solver.soleWorldPosition(side, actual);
      expect(actual.distanceTo(target), `${id}/${side} sole error`).toBeLessThan(0.02);
      expect(leg.shin.position.distanceTo(localKnee)).toBeLessThan(1e-7);
      for (const [index, bone] of [leg.thigh, leg.shin, leg.foot].entries()) expect(bone.scale.distanceTo(scale[index]!)).toBeLessThan(1e-7);
      const ankle = leg.shinTip.clone().applyMatrix4(leg.shin.matrixWorld);
      expect(ankle.distanceTo(leg.foot.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-6);
      const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
      const reach = hip.distanceTo(leg.shin.getWorldPosition(new THREE.Vector3())) + leg.shinTip.length() * leg.shin.getWorldScale(new THREE.Vector3()).x;
      solver.alignFeet(hip.clone().add(new THREE.Vector3(0, -100, 0)), hip.clone().add(new THREE.Vector3(0, -100, 0)));
      expect(leg.foot.getWorldPosition(new THREE.Vector3()).distanceTo(hip)).toBeLessThanOrEqual(reach + 0.002);
    }
    expect(root.matrix.elements).toEqual(rootTransform.elements);
    expect(finiteTransforms(root)).toBe(true);
  });
});

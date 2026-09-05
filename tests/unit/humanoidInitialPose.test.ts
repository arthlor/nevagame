import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HumanoidAnimator, type CharacterAnimationContext } from "../../src/render/animation/AnimationController";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { CHARACTER_ASSET_IDS, characterBones, characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

function sourceMixer(root: THREE.Object3D, clipName: string): THREE.AnimationMixer {
  const mixer = new THREE.AnimationMixer(root);
  const clip = (root.userData.animationClips as THREE.AnimationClip[]).find(entry => entry.name === clipName)!;
  expect(clip).toBeDefined();
  mixer.clipAction(clip).play();
  mixer.update(0);
  return mixer;
}

function expectPose(actual: THREE.Object3D, expected: THREE.Object3D): void {
  expect(actual.position.distanceTo(expected.position), actual.name).toBeLessThan(1e-6);
  expect(actual.quaternion.clone().normalize().angleTo(expected.quaternion.clone().normalize()), actual.name).toBeLessThan(1e-6);
  expect(actual.scale.distanceTo(expected.scale), actual.name).toBeLessThan(1e-6);
}

describe("zero-time humanoid initialization", () => {
  it.each(CHARACTER_ASSET_IDS)("evaluates %s authored idle immediately on load and reset without advancing its clock", async assetId => {
    const root = await loadHumanoidAsset(assetId);
    const expected = await loadHumanoidAsset(assetId);
    const animator = new HumanoidAnimator(root);
    const reference = sourceMixer(expected, "idle");
    try {
      for (let reset = 0; reset < 2; reset++) {
        for (let frame = 0; frame < 4; frame++) {
          expect(animator.update(0, characterContext()).events).toEqual([]);
          expect(animator.normalizedBasePhase()).toBe(0);
          for (const bone of characterBones(root)) expectPose(bone, expected.getObjectByName(bone.name)!);
        }
        animator.update(0.3, characterContext());
        animator.resetTransientState();
      }
    } finally {
      animator.dispose();
      reference.stopAllAction();
      reference.uncacheRoot(expected);
    }
  });

  const modes: { name: string; base: string; upper?: string; context: CharacterAnimationContext }[] = [
    { name: "mounted", base: "mounted_idle", context: { ...characterContext(), mode: "mounted" } },
    { name: "rowboat", base: "rowboat_idle", context: { ...characterContext(), mode: "boat-driving", boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 } } },
    { name: "skiff", base: "skiff_idle", context: { ...characterContext(), mode: "boat-driving", boatInput: { boatTypeId: "boat.skiff", throttle: 0, steering: 0 } } },
    { name: "cargo", base: "idle", upper: "carry_idle", context: { ...characterContext(), carrying: true } },
    { name: "bank fishing", base: "idle", upper: "fishing_idle", context: { ...characterContext(), mode: "basic-fishing" } },
    { name: "boat fishing", base: "rowboat_idle", upper: "fishing_idle", context: { ...characterContext(), mode: "sport-fishing", boatInput: { boatTypeId: "boat.rowboat", throttle: 0, steering: 0 } } }
  ];
  it.each(modes)("evaluates both source layers immediately for $name", async ({ base, upper, context }) => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const expectedBase = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const expectedUpper = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const animator = new HumanoidAnimator(root);
    const baseMixer = sourceMixer(expectedBase, base);
    const upperMixer = sourceMixer(expectedUpper, upper ?? base);
    const binding = resolveHumanoidRig(root);
    try {
      for (let reset = 0; reset < 2; reset++) {
        const frame = animator.update(0, context);
        expect(frame.events).toEqual([]);
        expect(animator.playbackState()).toMatchObject({ baseClip: base, upperClip: upper ?? null, basePhase: 0 });
        for (const side of ["left", "right"] as const) {
          const arm = binding.arms[side]!;
          const leg = binding.legs[side]!;
          for (const bone of [arm.upper, arm.lower, arm.hand]) expectPose(bone, expectedUpper.getObjectByName(bone.name)!);
          for (const bone of [leg.thigh, leg.shin, leg.foot]) expectPose(bone, expectedBase.getObjectByName(bone.name)!);
        }
        animator.update(0.3, context);
        animator.resetTransientState();
      }
    } finally {
      animator.dispose();
      baseMixer.stopAllAction();
      baseMixer.uncacheRoot(expectedBase);
      upperMixer.stopAllAction();
      upperMixer.uncacheRoot(expectedUpper);
    }
  });

  it("retains the evaluated pose while a subsequent zero-time landing transition begins", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const animator = new HumanoidAnimator(root);
    try {
      animator.update(0.3, characterContext());
      const pose = characterBones(root).map(bone => ({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone() }));
      animator.update(0, characterContext({ contactEvent: "land-hard", landingImpactStrength: 0.9 }));
      expect(animator.currentClip()).toBe("land_hard");
      for (const { bone, position, quaternion } of pose) {
        expect(bone.position.distanceTo(position), bone.name).toBeLessThan(1e-6);
        expect(bone.quaternion.clone().normalize().angleTo(quaternion.normalize()), bone.name).toBeLessThan(1e-6);
      }
    } finally {
      animator.dispose();
    }
  });
});

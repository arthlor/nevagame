import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { applyEquipmentSocketPose, fishingClipUsesRod, PALM_GRIP_FRAME } from "../../src/render/animation/CharacterEquipment";
import { isDescendantOf, resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { socketAttachFor } from "../../src/render/assets/ToolSocketAttach";
import { CHARACTER_ASSET_IDS, characterBones, characterContext, loadHumanoidAsset } from "../helpers/humanoidAssets";

function expectMatchingBones(actual: THREE.Object3D, expected: THREE.Object3D): void {
  const bones = characterBones(actual);
  expect(bones.length).toBeGreaterThan(0);
  for (const bone of bones) {
    const reference = expected.getObjectByName(bone.name)!;
    expect(bone.position.distanceTo(reference.position), bone.name).toBeLessThan(1e-5);
    expect(bone.quaternion.clone().normalize().angleTo(reference.quaternion.clone().normalize()), bone.name).toBeLessThan(1e-5);
    expect(bone.scale.distanceTo(reference.scale), bone.name).toBeLessThan(1e-5);
  }
}

describe("published source animation and equipment contracts", () => {
  it.each([120, 60, 30, 15])("matches the source walk pose at %s Hz, through a hitch, pause, reduced motion and reset", async (frameRate) => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const reference = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const animator = new HumanoidAnimator(root);
    const sourceMixer = new THREE.AnimationMixer(reference);
    const sourceClip = (reference.userData.animationClips as THREE.AnimationClip[]).find((clip) => clip.name === "walk")!;
    const speed = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!.animationClips!
      .find((clip) => clip.name === "walk")!.referenceSpeedMetersPerSecond!;
    const context = characterContext({ requestedGait: "walk", speedMetersPerSecond: speed, velocity: { x: 0, y: 0, z: speed } });
    sourceMixer.clipAction(sourceClip).play();
    animator.setPreviewClip("walk");
    try {
      for (let frame = 0; frame < frameRate; frame++) animator.update(1 / frameRate, context);
      sourceMixer.update(1);
      expect(animator.normalizedBasePhase()).toBeCloseTo((1 % sourceClip.duration) / sourceClip.duration, 7);
      expectMatchingBones(root, reference);
      animator.update(5, context);
      sourceMixer.update(5);
      expect(animator.normalizedBasePhase()).toBeCloseTo((6 % sourceClip.duration) / sourceClip.duration, 7);
      expectMatchingBones(root, reference);
      expect(animator.update(0, context).events).toEqual([]);
      expectMatchingBones(root, reference);
      const reducedFrame = animator.update(1 / frameRate, context, true);
      sourceMixer.update(1 / frameRate);
      expect(reducedFrame).toMatchObject({ bobY: 0, leanX: 0, leanZ: 0 });
      expectMatchingBones(root, reference);
      animator.resetTransientState();
      sourceMixer.stopAllAction();
      expectMatchingBones(root, reference);
    } finally {
      animator.dispose();
      sourceMixer.stopAllAction();
      sourceMixer.uncacheRoot(reference);
    }
  });

  it.each(CHARACTER_ASSET_IDS)("binds %s to exported semantic bones and anatomical palm sockets", async (assetId) => {
    const root = await loadHumanoidAsset(assetId);
    const binding = resolveHumanoidRig(root);
    expect(binding.production).toBe(true);
    for (const side of ["left", "right"] as const) {
      const arm = binding.arms[side]!;
      expect(arm.grip).toBeDefined();
      expect(isDescendantOf(arm.grip!, arm.hand)).toBe(true);
      expect(arm.grip!.name).toBe(THREE.PropertyBinding.sanitizeNodeName(ASSET_BY_ID.get(assetId)!.humanoidRig!.grips![side]));
      expect(arm.lowerTip.length()).toBeGreaterThan(0);
      expect(binding.legs[side]!.shinTip.length()).toBeGreaterThan(0);
    }
  });

  it.each([ASSET_IDS.TOOL_SICKLE_A, ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, ASSET_IDS.TOOL_FISHING_ROD_A, ASSET_IDS.TOOL_WATERING_CAN_A])(
    "docks published %s to a moving source palm without legacy Euler offsets", async (assetId) => {
      const character = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
      const equipment = await loadHumanoidAsset(assetId);
      const palm = resolveHumanoidRig(character).arms.right!.grip!;
      const primary = equipment.getObjectByName("rod_primary_grip") ?? equipment.getObjectByName("tool_primary_grip");
      expect(primary).toBeDefined();
      expect(primary!.userData.neva_grip_frame).toBe(PALM_GRIP_FRAME);
      character.position.set(7, 2, -4);
      character.rotation.set(0.1, 0.8, -0.2);
      palm.add(equipment);
      equipment.position.set(2, -3, 4);
      equipment.rotation.set(0.4, -0.2, 0.8);
      equipment.scale.setScalar(2);
      const animator = new HumanoidAnimator(character);
      animator.setPreviewClip("walk");
      try {
        for (const phase of [0.1, 0.45, 0.8]) {
          animator.setPreviewPhase(phase);
          animator.update(0, characterContext());
          applyEquipmentSocketPose(equipment, assetId);
          character.updateMatrixWorld(true);
          expect(primary!.getWorldPosition(new THREE.Vector3()).distanceTo(palm.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-5);
          const orientation = primary!.getWorldQuaternion(new THREE.Quaternion()).normalize();
          expect(orientation.angleTo(palm.getWorldQuaternion(new THREE.Quaternion()).normalize())).toBeLessThan(1e-5);
          expect(equipment.scale.toArray()).toEqual(Array(3).fill(socketAttachFor(assetId).scale));
        }
      } finally {
        animator.dispose();
      }
    }
  );

  it("retains the fallback scale and orientation contract without overriding primary palm frames", () => {
    for (const [assetId, scale, angle] of [
      [ASSET_IDS.TOOL_SICKLE_A, 0.82, Math.PI],
      [ASSET_IDS.TOOL_WORKSTATION_SCOOP_A, 0.78, Math.PI],
      [ASSET_IDS.TOOL_FISHING_ROD_A, 0.85, Math.PI],
      [ASSET_IDS.TOOL_WATERING_CAN_A, 0.72, 0],
      [ASSET_IDS.TOOL_SEED_POUCH_A, 0.72, 0],
      [ASSET_IDS.PROP_CROP_BUNDLE_A, 0.76, 0],
      [ASSET_IDS.PROP_HARVEST_BASKET_A, 0.68, 0]
    ] as const) {
      expect(socketAttachFor(assetId)).toEqual({ position: [0, 0, 0], rotation: [angle, 0, 0], scale });
    }
    const accessory = new THREE.Group();
    accessory.position.set(1, 2, 3);
    accessory.rotation.set(0.2, 0.3, 0.4);
    applyEquipmentSocketPose(accessory, ASSET_IDS.TOOL_SEED_POUCH_A);
    expect(accessory.position.toArray()).toEqual([0, 0, 0]);
    expect(accessory.quaternion.angleTo(new THREE.Quaternion())).toBe(0);
    expect(accessory.scale.toArray()).toEqual([0.72, 0.72, 0.72]);
    applyEquipmentSocketPose(accessory, "non_existent_tool_id");
    expect(accessory.scale.toArray()).toEqual([0.85, 0.85, 0.85]);
  });

  it("uses the shared rod selector including hook-set and boat fishing", () => {
    for (const clip of ["cast", "hookset", "fishing_idle", "reel", "slack", "brace", "skiff_fishing"]) {
      expect(fishingClipUsesRod(clip), clip).toBe(true);
    }
    for (const clip of ["idle", "water", "plant", "harvest", "carry_walk", "row", "unknown"]) {
      expect(fishingClipUsesRod(clip), clip).toBe(false);
    }
  });
});

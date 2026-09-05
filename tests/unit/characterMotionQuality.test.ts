import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ASSET_BY_ID, ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { characterBones, loadHumanoidAsset } from "../helpers/humanoidAssets";

/** Inspect real exported poses; source joints are never judged by foreign Euler axes. */
describe("published humanoid motion quality", () => {
  it("samples every player action without collapsed scales or detached lower-leg endpoints", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const rig = resolveHumanoidRig(root);
    const bones = characterBones(root);
    const mixer = new THREE.AnimationMixer(root);
    for (const clip of root.userData.animationClips as THREE.AnimationClip[]) {
      const action = mixer.clipAction(clip).play(); action.paused = true;
      for (let frame = 0; frame <= Math.ceil(clip.duration * 30); frame++) {
        action.time = Math.min(clip.duration, frame / 30); mixer.update(0); root.updateMatrixWorld(true);
        for (const bone of bones) {
          expect(bone.matrixWorld.elements.every(Number.isFinite), `${clip.name}:${bone.name} finite pose`).toBe(true);
          expect(Math.abs(bone.matrixWorld.determinant()), `${clip.name}:${bone.name} collapsed scale`).toBeGreaterThan(1e-12);
        }
        for (const side of ["left", "right"] as const) {
          const leg = rig.legs[side]!;
          const shinEnd = leg.shin.localToWorld(leg.shinTip.clone());
          const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
          expect(ankle.distanceTo(shinEnd), `${clip.name}:${side} ankle separates from shin`).toBeLessThan(0.035);
        }
      }
      mixer.stopAllAction();
    }
  });

  it("has explicit bounded source contact windows and finite reference speeds", () => {
    const spec = ASSET_BY_ID.get(ASSET_IDS.CHAR_PLAYER_A)!;
    for (const name of ["walk", "run", "carry_walk", "carry_run"]) {
      const clip = spec.animationClips!.find((entry) => entry.name === name)!;
      expect(clip.referenceSpeedMetersPerSecond, name).toBeGreaterThan(0);
      for (const side of ["left", "right"] as const) {
        expect(clip.contacts?.[side]?.length, `${name}:${side}`).toBeGreaterThan(0);
        for (const interval of clip.contacts![side]!) {
          expect(interval.start).toBeGreaterThanOrEqual(0);
          expect(interval.end).toBeLessThanOrEqual(clip.durationSeconds + 0.000001);
          expect(interval.end).toBeGreaterThan(interval.start);
        }
      }
    }
  });

  it("preserves distinct forward and backward foot excursions in both gaits", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const rig = resolveHumanoidRig(root); const mixer = new THREE.AnimationMixer(root);
    for (const name of ["walk", "run"]) {
      const clip = (root.userData.animationClips as THREE.AnimationClip[]).find((entry) => entry.name === name)!;
      const action = mixer.clipAction(clip).play(); action.paused = true;
      const excursions: Record<string, number[]> = { left: [], right: [] };
      for (let frame = 0; frame <= Math.ceil(clip.duration * 60); frame++) {
        action.time = Math.min(clip.duration, frame / 60); mixer.update(0); root.updateMatrixWorld(true);
        for (const side of ["left", "right"] as const) {
          const leg = rig.legs[side]!;
          const foot = root.worldToLocal(leg.foot.getWorldPosition(new THREE.Vector3()));
          const hip = root.worldToLocal(leg.thigh.getWorldPosition(new THREE.Vector3()));
          excursions[side]!.push(foot.z - hip.z);
        }
      }
      for (const side of ["left", "right"] as const) {
        expect(Math.max(...excursions[side]!), `${name}:${side} swing forward`).toBeGreaterThan(0.05);
        expect(Math.min(...excursions[side]!), `${name}:${side} stance backward`).toBeLessThan(-0.05);
      }
      mixer.stopAllAction();
    }
  });
  it("turns authored left and right shoulders with the corresponding world heading sign", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.CHAR_PLAYER_A);
    const chest = resolveHumanoidRig(root).bones.chest!;
    const mixer = new THREE.AnimationMixer(root);
    for (const name of ["turn_left", "turn_right"]) {
      const clip = (root.userData.animationClips as THREE.AnimationClip[]).find((entry) => entry.name === name)!;
      const action = mixer.clipAction(clip).play(); action.paused = true;
      action.time = 0; mixer.update(0); const first = chest.getWorldQuaternion(new THREE.Quaternion()).normalize();
      action.time = clip.duration * 0.5; mixer.update(0);
      const relative = chest.getWorldQuaternion(new THREE.Quaternion()).normalize().multiply(first.invert());
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(relative);
      const yaw = Math.atan2(forward.x, forward.z);
      expect(yaw * (name === "turn_left" ? 1 : -1), `${name} actual world heading`).toBeGreaterThan(0.05);
      mixer.stopAllAction();
    }
  });

});

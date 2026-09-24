import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loadHumanoidAsset } from "../helpers/humanoidAssets";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";

/** Measure the visible sole, whose axis differs from the source foot bone. */
function soleAxis(root: THREE.Group, sign: number): THREE.Vector3 {
  const points: THREE.Vector3[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    const positions = node.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const point = root.worldToLocal(node.localToWorld(node.getVertexPosition(i, new THREE.Vector3())));
      if (point.y < 0.06 && point.x * sign > 0.04) points.push(point);
    }
  });
  expect(points.length).toBeGreaterThan(10);
  const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
  let xx = 0, zz = 0, xz = 0;
  for (const point of points) {
    const x = point.x - center.x, z = point.z - center.z;
    xx += x * x; zz += z * z; xz += x * z;
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  return axis.z < 0 ? axis.negate() : axis;
}

describe("player gait silhouette", () => {
  it.each(["walk", "run", "carry_walk", "carry_run"])("%s keeps the visible boots forward on narrow parallel paths", async name => {
    const root = await loadHumanoidAsset("char_player_a");
    const rig = resolveHumanoidRig(root);
    const feet = (["left", "right"] as const).map((side, index) => {
      const bone = rig.legs[side]!.foot;
      const sign = index === 0 ? 1 : -1;
      const axis = soleAxis(root, sign)
        .applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()))
        .applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { bone, sign, axis };
    });
    const mixer = new THREE.AnimationMixer(root);
    const clip = (root.userData.animationClips as THREE.AnimationClip[]).find(value => value.name === name)!;
    const action = mixer.clipAction(clip).play(); action.paused = true;
    let highestAnkle = 0;
    for (let frame = 0; frame <= 48; frame++) {
      action.time = clip.duration * frame / 48; mixer.update(0); root.updateMatrixWorld(true);
      for (const { bone, sign, axis } of feet) {
        const direction = axis.clone().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
        expect(Math.abs(Math.atan2(direction.x, direction.z)), `${name}:${frame} visible toe splay`).toBeLessThan(THREE.MathUtils.degToRad(10));
        const ankle = root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
        expect(ankle.x * sign, `${name}:${frame} feet do not cross`).toBeGreaterThan(0.035);
        expect(ankle.x * sign, `${name}:${frame} narrow foot path`).toBeLessThan(0.105);
        highestAnkle = Math.max(highestAnkle, ankle.y);
      }
    }
    if (name.includes("run")) expect(highestAnkle, "compact recovery without high stepping").toBeLessThan(0.39);
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
});

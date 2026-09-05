import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { HumanoidAnimator } from "../../src/render/animation/AnimationController";
import { characterContext } from "../helpers/humanoidAssets";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";
import { resolveHumanoidRig } from "../../src/render/animation/HumanoidRig";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function loadGlb(assetId: string): Promise<GLTF> {
  await MeshoptDecoder.ready;
  const modelDirectory = (assetId.startsWith("char_")
    ? process.env.NEVA_HUMANOID_CANDIDATE_DIR : process.env.NEVA_EQUIPMENT_CANDIDATE_DIR) || "public/assets/models";
  const bytes = await fs.readFile(path.join(ROOT, modelDirectory, `${assetId}.glb`));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((resolve, reject) => loader.parse(buffer, "", resolve, reject));
}

interface TestLeg {
  thigh: THREE.Bone;
  shin: THREE.Bone;
  foot: THREE.Bone;
}

function addLeg(root: THREE.Group, side: "left" | "right"): TestLeg {
  const sign = side === "left" ? 1 : -1;
  const thigh = new THREE.Bone();
  const shin = new THREE.Bone();
  const foot = new THREE.Bone();
  thigh.name = `rig_thigh_${side}`;
  shin.name = `rig_shin_${side}`;
  foot.name = `rig_foot_${side}`;
  thigh.position.set(sign * 0.12, 0.72, 0);
  shin.position.set(0, -0.40, 0);
  foot.position.set(0, -0.35, 0);
  thigh.add(shin);
  shin.add(foot);
  root.add(thigh);
  return { thigh, shin, foot };
}

describe("HumanoidFootSupportSolver", () => {
  it("locks both feet while keeping both knee poles forward", () => {
    const root = new THREE.Group();
    const left = addLeg(root, "left");
    const right = addLeg(root, "right");
    const leftTarget = new THREE.Vector3(0.18, 0.10, 0.34);
    const rightTarget = new THREE.Vector3(-0.18, 0.10, 0.34);
    root.userData.humanoidRig = {
      forwardAxis: "+Z", bones: { thigh_left: left.thigh.name, shin_left: left.shin.name, foot_left: left.foot.name, thigh_right: right.thigh.name, shin_right: right.shin.name, foot_right: right.foot.name },
      legs: Object.fromEntries(["left", "right"].map((side) => [side, { shinTip: [0, -0.35, 0], soleOffset: [0, 0, 0], soleNormal: [0, 1, 0], bendDirection: [0, 0, 1] }]))
    };
    const solver = new HumanoidFootSupportSolver(root);

    solver.alignFeet(leftTarget, rightTarget);

    const point = new THREE.Vector3();
    left.foot.getWorldPosition(point);
    expect(point.distanceTo(leftTarget)).toBeLessThan(0.001);
    right.foot.getWorldPosition(point);
    expect(point.distanceTo(rightTarget)).toBeLessThan(0.001);
    left.shin.getWorldPosition(point);
    expect(point.z, "left knee projects in local forward +Z").toBeGreaterThan(0.05);
    right.shin.getWorldPosition(point);
    expect(point.z, "right knee projects in local forward +Z").toBeGreaterThan(0.05);
  });

  it("locks the published mounted rig to the donkey stirrup sockets", async () => {
    const [playerGltf, donkeyGltf] = await Promise.all([
      loadGlb("char_player_a"),
      loadGlb("fauna_donkey_a")
    ]);
    const player = playerGltf.scene;
    player.userData.assetId = ASSET_IDS.CHAR_PLAYER_A;
    const bones = resolveHumanoidRig(player).bones;
    const donkey = donkeyGltf.scene;
    const rider = donkey.getObjectByName("fauna_donkey_a_rider_socket")!;
    const leftStirrup = donkey.getObjectByName("fauna_donkey_a_stirrup_left_socket")!;
    const rightStirrup = donkey.getObjectByName("fauna_donkey_a_stirrup_right_socket")!;
    const context = new THREE.Group();
    context.add(donkey, player);
    rider.add(player);
    player.userData.animationClips = playerGltf.animations;
    const animator = new HumanoidAnimator(player);
    animator.setPreviewClip("mounted_idle");
    const solver = new HumanoidFootSupportSolver(player);
    const leftTarget = leftStirrup.getWorldPosition(new THREE.Vector3());
    const rightTarget = rightStirrup.getWorldPosition(new THREE.Vector3());
    const leftNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(leftStirrup.getWorldQuaternion(new THREE.Quaternion()));
    const rightNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rightStirrup.getWorldQuaternion(new THREE.Quaternion()));
    let referenceKnees: [THREE.Vector3, THREE.Vector3] | null = null;
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      animator.setPreviewPhase(phase);
      animator.update(0, characterContext());
      animator.alignPelvisSupport(rider.getWorldPosition(new THREE.Vector3()));
      solver.alignFeet(leftTarget, rightTarget, leftNormal, rightNormal);
      expect(bones.pelvis!.getWorldPosition(new THREE.Vector3()).distanceTo(rider.getWorldPosition(new THREE.Vector3()))).toBeLessThan(0.001);

      const leftFoot = new THREE.Vector3(); const rightFoot = new THREE.Vector3();
      solver.soleWorldPosition("left", leftFoot); solver.soleWorldPosition("right", rightFoot);
      expect(leftFoot.distanceTo(leftTarget)).toBeLessThan(0.01);
      expect(rightFoot.distanceTo(rightTarget)).toBeLessThan(0.01);
      const leftHip = bones.thigh_left!.getWorldPosition(new THREE.Vector3());
      const rightHip = bones.thigh_right!.getWorldPosition(new THREE.Vector3());
      const leftKnee = bones.shin_left!.getWorldPosition(new THREE.Vector3());
      const rightKnee = bones.shin_right!.getWorldPosition(new THREE.Vector3());
      expect(leftKnee.z).toBeGreaterThan(leftHip.z + 0.08);
      expect(rightKnee.z).toBeGreaterThan(rightHip.z + 0.08);
      if (referenceKnees) {
        // mounted_idle now breathes and shifts weight rather than holding a
        // frozen pose, so with the feet locked in the stirrups the knee tracks
        // the pelvis by a few millimetres. It must stay put, not be immobile.
        expect(leftKnee.distanceTo(referenceKnees[0])).toBeLessThan(0.008);
        expect(rightKnee.distanceTo(referenceKnees[1])).toBeLessThan(0.008);
      } else {
        referenceKnees = [leftKnee.clone(), rightKnee.clone()];
      }
    }
    animator.dispose();
  });

  it("seats the published rowboat rig and braces both feet on the stretcher", async () => {
    const [playerGltf, rowboatGltf] = await Promise.all([
      loadGlb("char_player_a"),
      loadGlb("boat_rowboat_a")
    ]);
    const player = playerGltf.scene;
    player.userData.assetId = ASSET_IDS.CHAR_PLAYER_A;
    const bones = resolveHumanoidRig(player).bones;
    const rowboat = rowboatGltf.scene;
    const pelvis = bones.pelvis!;
    const seat = rowboat.getObjectByName("boat_rowboat_rower_seat")!;
    const leftSupport = rowboat.getObjectByName("boat_rowboat_foot_left_socket")!;
    const rightSupport = rowboat.getObjectByName("boat_rowboat_foot_right_socket")!;
    const context = new THREE.Group();
    context.add(rowboat, player);
    seat.add(player);

    player.userData.animationClips = playerGltf.animations;
    const animator = new HumanoidAnimator(player);
    animator.setPreviewClip("rowboat_idle");
    animator.setPreviewPhase(0.5);
    animator.update(0, characterContext());
    animator.alignPelvisSupport(seat.getWorldPosition(new THREE.Vector3()));
    const leftTarget = leftSupport.getWorldPosition(new THREE.Vector3());
    const rightTarget = rightSupport.getWorldPosition(new THREE.Vector3());
    const leftNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(leftSupport.getWorldQuaternion(new THREE.Quaternion()));
    const rightNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(rightSupport.getWorldQuaternion(new THREE.Quaternion()));
    const support = new HumanoidFootSupportSolver(player);
    support.alignFeet(leftTarget, rightTarget, leftNormal, rightNormal);

    expect(pelvis.getWorldPosition(new THREE.Vector3()).distanceTo(
      seat.getWorldPosition(new THREE.Vector3())
    )).toBeLessThan(0.001);
    const sole = new THREE.Vector3();
    support.soleWorldPosition("left", sole); expect(sole.distanceTo(leftTarget)).toBeLessThan(0.01);
    support.soleWorldPosition("right", sole); expect(sole.distanceTo(rightTarget)).toBeLessThan(0.01);
    for (const side of ["left", "right"] as const) {
      const leg = resolveHumanoidRig(player).legs[side]!;
      const normal = leg.soleNormal.clone().applyQuaternion(leg.foot.getWorldQuaternion(new THREE.Quaternion()));
      expect(normal.angleTo(side === "left" ? leftNormal : rightNormal)).toBeLessThan(0.0001);
    }
    animator.dispose();
  });
});

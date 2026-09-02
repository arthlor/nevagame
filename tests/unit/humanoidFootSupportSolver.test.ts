import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import { HumanoidFootSupportSolver } from "../../src/render/animation/HumanoidFootSupportSolver";

const ROOT = path.resolve(import.meta.dirname, "../..");

async function loadGlb(assetId: string): Promise<GLTF> {
  await MeshoptDecoder.ready;
  const bytes = await fs.readFile(path.join(ROOT, "public/assets/models", `${assetId}.glb`));
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
  const sign = side === "left" ? -1 : 1;
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
    const leftTarget = new THREE.Vector3(-0.18, 0.10, 0.34);
    const rightTarget = new THREE.Vector3(0.18, 0.10, 0.34);
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
    const donkey = donkeyGltf.scene;
    const pelvis = player.getObjectByName("rig_pelvis")!;
    const rider = donkey.getObjectByName("fauna_donkey_a_rider_socket")!;
    const leftStirrup = donkey.getObjectByName("fauna_donkey_a_stirrup_left_socket")!;
    const rightStirrup = donkey.getObjectByName("fauna_donkey_a_stirrup_right_socket")!;
    const context = new THREE.Group();
    context.add(donkey, player);
    player.updateMatrixWorld(true);
    const pelvisRest = pelvis.getWorldPosition(new THREE.Vector3());
    player.worldToLocal(pelvisRest);
    rider.add(player);
    player.position.set(0, -pelvisRest.y, 0);

    const mountedIdle = playerGltf.animations.find((clip) => clip.name === "mounted_idle")!;
    const mixer = new THREE.AnimationMixer(player);
    const action = mixer.clipAction(mountedIdle).play();
    action.paused = true;
    const solver = new HumanoidFootSupportSolver(player);
    const leftTarget = leftStirrup.getWorldPosition(new THREE.Vector3());
    const rightTarget = rightStirrup.getWorldPosition(new THREE.Vector3());
    let referenceKnees: [THREE.Vector3, THREE.Vector3] | null = null;
    for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
      action.time = phase * mountedIdle.duration;
      mixer.update(0);
      solver.alignFeet(leftTarget, rightTarget);

      const leftFoot = player.getObjectByName("rig_foot_left")!.getWorldPosition(new THREE.Vector3());
      const rightFoot = player.getObjectByName("rig_foot_right")!.getWorldPosition(new THREE.Vector3());
      expect(leftFoot.distanceTo(leftTarget)).toBeLessThan(0.01);
      expect(rightFoot.distanceTo(rightTarget)).toBeLessThan(0.01);
      const leftHip = player.getObjectByName("rig_thigh_left")!.getWorldPosition(new THREE.Vector3());
      const rightHip = player.getObjectByName("rig_thigh_right")!.getWorldPosition(new THREE.Vector3());
      const leftKnee = player.getObjectByName("rig_shin_left")!.getWorldPosition(new THREE.Vector3());
      const rightKnee = player.getObjectByName("rig_shin_right")!.getWorldPosition(new THREE.Vector3());
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
  });

  it("seats the published rowboat rig and braces both feet on the stretcher", async () => {
    const [playerGltf, rowboatGltf] = await Promise.all([
      loadGlb("char_player_a"),
      loadGlb("boat_rowboat_a")
    ]);
    const player = playerGltf.scene;
    const rowboat = rowboatGltf.scene;
    const pelvis = player.getObjectByName("rig_pelvis")!;
    const seat = rowboat.getObjectByName("boat_rowboat_rower_seat")!;
    const leftSupport = rowboat.getObjectByName("boat_rowboat_foot_left_socket")!;
    const rightSupport = rowboat.getObjectByName("boat_rowboat_foot_right_socket")!;
    const context = new THREE.Group();
    context.add(rowboat, player);
    player.updateMatrixWorld(true);
    const pelvisRest = pelvis.getWorldPosition(new THREE.Vector3());
    player.worldToLocal(pelvisRest);
    seat.add(player);
    player.position.set(0, -pelvisRest.y, 0);

    const rowboatIdle = playerGltf.animations.find((clip) => clip.name === "rowboat_idle")!;
    const mixer = new THREE.AnimationMixer(player);
    const action = mixer.clipAction(rowboatIdle).play();
    action.time = rowboatIdle.duration * 0.5;
    mixer.update(0);
    const leftTarget = leftSupport.getWorldPosition(new THREE.Vector3());
    const rightTarget = rightSupport.getWorldPosition(new THREE.Vector3());
    new HumanoidFootSupportSolver(player).alignFeet(leftTarget, rightTarget);

    expect(pelvis.getWorldPosition(new THREE.Vector3()).distanceTo(
      seat.getWorldPosition(new THREE.Vector3())
    )).toBeLessThan(0.001);
    expect(player.getObjectByName("rig_foot_left")!.getWorldPosition(new THREE.Vector3())
      .distanceTo(leftTarget)).toBeLessThan(0.01);
    expect(player.getObjectByName("rig_foot_right")!.getWorldPosition(new THREE.Vector3())
      .distanceTo(rightTarget)).toBeLessThan(0.01);
  });
});

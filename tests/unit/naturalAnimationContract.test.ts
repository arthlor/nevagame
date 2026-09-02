import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { NodeIO, type Animation, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOT = path.resolve(import.meta.dirname, "../..");
const documents = new Map<string, Document>();
const gltfs = new Map<string, GLTF>();

function animation(document: Document, name: string): Animation {
  const result = document.getRoot().listAnimations().find((candidate) => candidate.getName() === name);
  if (!result) throw new Error(`Missing animation ${name}`);
  return result;
}

function rotationSeries(document: Document, clipName: string, nodeName: string): THREE.Quaternion[] {
  const channel = animation(document, clipName).listChannels().find(
    (candidate) => candidate.getTargetNode()?.getName() === nodeName && candidate.getTargetPath() === "rotation"
  );
  if (!channel) throw new Error(`Missing ${clipName}:${nodeName} rotation`);
  const values = channel.getSampler()!.getOutput()!.getArray()!;
  const result: THREE.Quaternion[] = [];
  for (let index = 0; index < values.length; index += 4) {
    result.push(new THREE.Quaternion(values[index], values[index + 1], values[index + 2], values[index + 3]));
  }
  return result;
}

function expectLoopClosed(series: readonly THREE.Quaternion[]): void {
  expect(Math.abs(series[0]!.dot(series.at(-1)!))).toBeCloseTo(1, 6);
}

function sampleLeg(
  gltf: GLTF,
  clipName: string,
  normalizedTime: number,
  side: "left" | "right"
): { hip: THREE.Vector3; knee: THREE.Vector3; ankle: THREE.Vector3 } {
  const clip = gltf.animations.find((candidate) => candidate.name === clipName);
  if (!clip) throw new Error(`Missing animation ${clipName}`);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip).play();
  action.time = clip.duration * normalizedTime;
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  const result = {
    hip: gltf.scene.getObjectByName(`rig_thigh_${side}`)!.getWorldPosition(new THREE.Vector3()),
    knee: gltf.scene.getObjectByName(`rig_shin_${side}`)!.getWorldPosition(new THREE.Vector3()),
    ankle: gltf.scene.getObjectByName(`rig_foot_${side}`)!.getWorldPosition(new THREE.Vector3())
  };
  mixer.stopAllAction();
  return result;
}

function expectStartMatchesLoop(document: Document, startName: string, loopName: string): void {
  const loopChannels = new Map(
    animation(document, loopName).listChannels().map((channel) => [
      `${channel.getTargetNode()?.getName()}:${channel.getTargetPath()}`,
      channel
    ])
  );
  for (const startChannel of animation(document, startName).listChannels()) {
    const key = `${startChannel.getTargetNode()?.getName()}:${startChannel.getTargetPath()}`;
    const loopChannel = loopChannels.get(key);
    expect(loopChannel, `Missing loop channel ${key}`).toBeDefined();
    const startOutput = startChannel.getSampler()!.getOutput()!;
    const loopOutput = loopChannel!.getSampler()!.getOutput()!;
    const startValues = startOutput.getArray()!;
    const loopValues = loopOutput.getArray()!;
    const elementSize = startOutput.getElementSize();
    const startLast = Array.from(startValues.slice(startValues.length - elementSize), Number);
    const loopFirst = Array.from(loopValues.slice(0, elementSize), Number);
    if (startChannel.getTargetPath() === "rotation") {
      const a = new THREE.Quaternion(startLast[0], startLast[1], startLast[2], startLast[3]);
      const b = new THREE.Quaternion(loopFirst[0], loopFirst[1], loopFirst[2], loopFirst[3]);
      expect(Math.abs(a.dot(b)), `${startName} seam ${key}`).toBeCloseTo(1, 5);
    } else {
      for (let index = 0; index < elementSize; index += 1) {
        expect(startLast[index], `${startName} seam ${key}[${index}]`).toBeCloseTo(loopFirst[index]!, 5);
      }
    }
  }
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder
    });
  for (const id of ["char_player_a", "fauna_donkey_a", "boat_rowboat_a", "boat_skiff_a"]) {
    const file = path.join(ROOT, "public/assets/models", `${id}.glb`);
    documents.set(id, await io.read(file));
    const bytes = await fs.readFile(file);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    gltfs.set(id, await new Promise<GLTF>((resolve, reject) => {
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(buffer, "", resolve, reject);
    }));
  }
});

describe("natural animation generated contracts", () => {
  it("plants the forward foot, carries it backward through support, and recovers the swing foot forward", () => {
    const player = gltfs.get("char_player_a")!;
    for (const clipName of ["walk", "run"]) {
      const contact = sampleLeg(player, clipName, 0, "left");
      const lateSupport = sampleLeg(player, clipName, 0.375, "left");
      const trailing = sampleLeg(player, clipName, 0, "right");
      const recovery = sampleLeg(player, clipName, 0.375, "right");
      expect(contact.ankle.z - contact.hip.z, `${clipName} forward +Z contact`).toBeGreaterThan(0.18);
      expect(lateSupport.ankle.z - lateSupport.hip.z, `${clipName} stance travels behind pelvis`).toBeLessThan(-0.06);
      expect(trailing.ankle.z - trailing.hip.z, `${clipName} trailing foot starts behind`).toBeLessThan(-0.06);
      expect(recovery.ankle.z - recovery.hip.z, `${clipName} swing recovers forward`).toBeGreaterThan(0.18);
    }
  });

  it("closes both locomotion loops and makes each start end on loop phase zero", () => {
    const player = documents.get("char_player_a")!;
    expectStartMatchesLoop(player, "walk_start", "walk");
    expectStartMatchesLoop(player, "run_start", "run");
    for (const clipName of ["walk", "run"]) {
      for (const nodeName of ["rig_thigh_left", "rig_shin_left", "rig_foot_left", "rig_thigh_right", "rig_shin_right", "rig_foot_right"]) {
        expectLoopClosed(rotationSeries(player, clipName, nodeName));
      }
    }
  });

  it("keeps reel lower-body tracks neutral and mounted supports bounded", () => {
    const player = documents.get("char_player_a")!;
    for (const nodeName of ["rig_pelvis", "rig_thigh_left", "rig_shin_left", "rig_foot_left", "rig_thigh_right", "rig_shin_right", "rig_foot_right"]) {
      const reel = rotationSeries(player, "reel", nodeName);
      for (const sample of reel) expect(Math.abs(reel[0]!.dot(sample))).toBeCloseTo(1, 6);
    }
    for (const clipName of ["mounted_walk", "mounted_trot"]) {
      for (const nodeName of ["rig_thigh_left", "rig_thigh_right", "rig_foot_left", "rig_foot_right"]) {
        const series = rotationSeries(player, clipName, nodeName);
        const angles = series.map((sample) => THREE.MathUtils.radToDeg(new THREE.Euler().setFromQuaternion(sample, "XYZ").x));
        expect(Math.max(...angles) - Math.min(...angles), `${clipName}:${nodeName}`).toBeLessThan(0.75);
        expectLoopClosed(series);
      }
    }
  });

  it("authors forward-folded knees for saddle and fixed-seat support poses", () => {
    const player = gltfs.get("char_player_a")!;
    for (const side of ["left", "right"] as const) {
      const mounted = sampleLeg(player, "mounted_idle", 0, side);
      expect(mounted.knee.z - mounted.hip.z, `mounted ${side} knee advances in +Z`).toBeGreaterThan(0.22);
      expect(mounted.ankle.z - mounted.hip.z, `mounted ${side} ankle remains forward`).toBeGreaterThan(0.14);
      expect(mounted.knee.z - mounted.ankle.z, `mounted ${side} shin folds back`).toBeGreaterThan(0.05);

      const rowboat = sampleLeg(player, "rowboat_idle", 0, side);
      expect(rowboat.knee.z - rowboat.hip.z, `rowboat ${side} knee advances in +Z`).toBeGreaterThan(0.28);
      expect(rowboat.ankle.z - rowboat.knee.z, `rowboat ${side} ankle reaches the forward stretcher`).toBeGreaterThan(0.10);
    }
  });

  it("publishes mirrored actions and physical support markers for donkey, rowboat, and standing skiff", () => {
    const playerClips = documents.get("char_player_a")!.getRoot().listAnimations().map((clip) => clip.getName());
    expect(playerClips).toEqual(expect.arrayContaining([
      "board", "board_skiff", "dock", "dock_skiff", "mount", "mount_right", "dismount", "dismount_right"
    ]));

    const donkeyNodes = new Map(documents.get("fauna_donkey_a")!.getRoot().listNodes().map((node) => [node.getName(), node]));
    const leftStirrup = donkeyNodes.get("fauna_donkey_a_stirrup_left_socket")!.getTranslation();
    const rightStirrup = donkeyNodes.get("fauna_donkey_a_stirrup_right_socket")!.getTranslation();
    const rider = donkeyNodes.get("fauna_donkey_a_rider_socket")!.getTranslation();
    expect(Math.abs(rightStirrup[0] - leftStirrup[0])).toBeCloseTo(0.76, 3);
    expect(rider[1] - leftStirrup[1]).toBeGreaterThan(0.35);
    expect(rider[1] - leftStirrup[1]).toBeLessThan(0.5);
    expect(leftStirrup[2], "stirrups sit forward of the saddle in runtime +Z").toBeGreaterThan(rider[2]);

    const rowboatNodes = new Map(documents.get("boat_rowboat_a")!.getRoot().listNodes()
      .map((node) => [node.getName(), node]));
    const rowerSeat = rowboatNodes.get("boat_rowboat_rower_seat")!;
    const rowboatLeftFoot = rowboatNodes.get("boat_rowboat_foot_left_socket")!;
    const rowboatRightFoot = rowboatNodes.get("boat_rowboat_foot_right_socket")!;
    expect(rowerSeat.getTranslation()[1]).toBeCloseTo(0.42, 3);
    expect(Math.abs(rowboatRightFoot.getTranslation()[0] - rowboatLeftFoot.getTranslation()[0]))
      .toBeCloseTo(0.32, 3);
    expect(rowboatLeftFoot.getTranslation()[1]).toBeLessThan(rowerSeat.getTranslation()[1]);
    expect(rowboatRightFoot.getTranslation()[1]).toBeLessThan(rowerSeat.getTranslation()[1]);
    expect(rowboatLeftFoot.getTranslation()[2] - rowerSeat.getTranslation()[2])
      .toBeGreaterThan(0.3);
    const skiffStation = documents.get("boat_skiff_a")!.getRoot().listNodes()
      .find((node) => node.getName() === "boat_skiff_driver_station")!;
    expect(skiffStation.getTranslation()[1]).toBeCloseTo(0.86, 3);
  });
});
